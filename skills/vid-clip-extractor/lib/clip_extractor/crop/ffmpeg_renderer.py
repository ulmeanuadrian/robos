"""FFmpeg-native renderers — pure filter-chain replacements for Python frame loops.

Instead of reading every frame with OpenCV, cropping in Python, and piping back,
these renderers build FFmpeg filter graphs (sendcmd + crop + scale) that run at
native decode speed.  Typical speedup: 10-30x over the Python pipeline.
"""

import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from .crop_path_io import CropPath


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_unlink(path: str) -> None:
    """Remove file, ignoring errors."""
    try:
        os.unlink(path)
    except (PermissionError, FileNotFoundError):
        pass


def _detect_videotoolbox() -> bool:
    """Check if h264_videotoolbox encoder is available (macOS HW accel)."""
    try:
        result = subprocess.run(
            ["ffmpeg", "-hide_banner", "-encoders"],
            capture_output=True, text=True, timeout=10,
        )
        return "h264_videotoolbox" in result.stdout
    except Exception:
        return False


def _build_encode_args(config: dict) -> list[str]:
    """Build encoder arguments, preferring VideoToolbox on macOS."""
    use_hw = config.get("use_videotoolbox", "auto")

    if use_hw == "auto":
        has_vtb = sys.platform == "darwin" and _detect_videotoolbox()
    elif use_hw == "force":
        has_vtb = True
    else:
        has_vtb = False

    if has_vtb:
        return [
            "-c:v", "h264_videotoolbox",
            "-b:v", "5M",
            "-realtime", "0",
            "-pix_fmt", "yuv420p",
        ]

    return [
        "-c:v", "libx264",
        "-preset", config.get("preset", "veryfast"),
        "-crf", str(config.get("crf", 23)),
        "-pix_fmt", "yuv420p",
    ]


def _build_hwaccel_args() -> list[str]:
    """Build hardware-accelerated decode arguments for macOS."""
    if sys.platform == "darwin" and _detect_videotoolbox():
        return ["-hwaccel", "videotoolbox"]
    return []


def _interpolate_crop_x(keyframes, frame_idx: int) -> int:
    """Interpolate crop_x for a given frame index from keyframes."""
    if frame_idx <= keyframes[0].frame:
        return keyframes[0].crop_x
    if frame_idx >= keyframes[-1].frame:
        return keyframes[-1].crop_x
    for i in range(len(keyframes) - 1):
        if keyframes[i].frame <= frame_idx < keyframes[i + 1].frame:
            kf_a = keyframes[i]
            kf_b = keyframes[i + 1]
            t = (frame_idx - kf_a.frame) / (kf_b.frame - kf_a.frame)
            return int(kf_a.crop_x + t * (kf_b.crop_x - kf_a.crop_x))
    return keyframes[-1].crop_x


def _generate_sendcmd_file(
    crop_path: CropPath,
    fps: float,
    total_frames: int,
    label: str = "face",
    min_delta: int = 1,
) -> str:
    """Generate a sendcmd script with threshold-based deduplication.

    Only emits an entry when crop_x changes by >= min_delta pixels from
    the last emitted value. Always emits first and last frame.

    Returns the path to a temp file containing sendcmd lines.
    """
    keyframes = crop_path.keyframes
    if not keyframes:
        raise ValueError("CropPath has no keyframes")

    lines: list[str] = []
    last_emitted_x: int | None = None

    for frame_idx in range(total_frames):
        crop_x = _interpolate_crop_x(keyframes, frame_idx)

        is_first = frame_idx == 0
        is_last = frame_idx == total_frames - 1
        changed = last_emitted_x is None or abs(crop_x - last_emitted_x) >= min_delta

        if is_first or is_last or changed:
            time_sec = frame_idx / fps
            lines.append(f"{time_sec:.6f} [enter] crop@{label} x {crop_x};")
            last_emitted_x = crop_x

    reduction = ((total_frames - len(lines)) / total_frames * 100) if total_frames > 0 else 0
    print(f"  Sendcmd: {len(lines)}/{total_frames} entries ({reduction:.0f}% reduced)", flush=True)

    fd, path = tempfile.mkstemp(suffix=".sendcmd", prefix="crop_")
    with os.fdopen(fd, "w") as f:
        f.write("\n".join(lines))

    return path


def _run_ffmpeg(cmd: list[str], label: str = "FFmpeg") -> None:
    """Run an FFmpeg command, print timing, raise on failure."""
    t0 = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True)
    elapsed = time.time() - t0

    if result.returncode != 0:
        stderr_tail = result.stderr[-1000:] if result.stderr else "(no stderr)"
        raise RuntimeError(
            f"{label} failed (code {result.returncode}):\n{stderr_tail}"
        )

    print(f"  {label} completed in {elapsed:.1f}s", flush=True)


# ---------------------------------------------------------------------------
# 1. Face-track renderer (sendcmd-driven crop)
# ---------------------------------------------------------------------------

def render_face_track_ffmpeg(
    video_path: str,
    crop_path: CropPath,
    output_path: str,
    config: dict,
) -> None:
    """Render face-tracked 9:16 crop using a single FFmpeg command.

    Uses sendcmd to update the crop x position every frame, achieving
    the same smooth pan as the Python renderer but at native speed.

    Static crop fast path: when the face barely moves (crop_x range < threshold),
    uses a single static crop filter instead of sendcmd for much faster rendering.
    """
    fps = crop_path.source_fps
    total = crop_path.source_total_frames
    crop_w = crop_path.output_crop_w
    crop_h = crop_path.output_crop_h
    scale_flags = config.get("scale_flags", "bilinear")
    static_threshold = config.get("static_crop_threshold", 20)

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    # Check if static crop is possible (face barely moves)
    all_crop_x = [_interpolate_crop_x(crop_path.keyframes, f) for f in range(0, total, max(1, total // 100))]
    crop_range = max(all_crop_x) - min(all_crop_x) if all_crop_x else 0

    hwaccel = _build_hwaccel_args()

    if crop_range < static_threshold:
        # Static crop fast path — no sendcmd needed
        median_x = sorted(all_crop_x)[len(all_crop_x) // 2]
        filter_complex = (
            f"crop={crop_w}:{crop_h}:{median_x}:0,"
            f"scale=1080:1920:flags={scale_flags}"
        )

        cmd = [
            "ffmpeg", "-y",
            *hwaccel,
            "-i", video_path,
            "-filter_complex", filter_complex,
            *_build_encode_args(config),
            "-c:a", "copy",
            "-movflags", "+faststart",
            output_path,
        ]

        print(f"  Face-track FFmpeg render: {crop_w}x{crop_h} -> 1080x1920", flush=True)
        print(f"  Static crop applied (range: {crop_range}px < {static_threshold}px threshold)", flush=True)

        _run_ffmpeg(cmd, label="Face-track render (static)")
    else:
        # Dynamic crop with sendcmd
        sendcmd_file = _generate_sendcmd_file(crop_path, fps, total, label="face")

        try:
            filter_complex = (
                f"sendcmd=f='{sendcmd_file}',"
                f"crop@face=w={crop_w}:h={crop_h}:x=0:y=0,"
                f"scale=1080:1920:flags={scale_flags}"
            )

            cmd = [
                "ffmpeg", "-y",
                *hwaccel,
                "-i", video_path,
                "-filter_complex", filter_complex,
                *_build_encode_args(config),
                "-c:a", "copy",
                "-movflags", "+faststart",
                output_path,
            ]

            print(f"  Face-track FFmpeg render: {crop_w}x{crop_h} -> 1080x1920", flush=True)
            print(f"  Dynamic crop (range: {crop_range}px)", flush=True)

            _run_ffmpeg(cmd, label="Face-track render")
        finally:
            _safe_unlink(sendcmd_file)

    print(f"  Output: {output_path}")


# ---------------------------------------------------------------------------
# 2. Segment detection (face vs screen classification)
# ---------------------------------------------------------------------------

def detect_segments(crop_path: CropPath) -> list[dict]:
    """Classify keyframes into face vs screen segments.

    Face segments: talking head fills the frame (face bbox width > 20% of source).
    Screen segments: small webcam overlay or no face (bbox width < 12%).

    Uses 2-second hysteresis and minimum segment duration to avoid flicker.

    Returns:
        List of dicts with keys: type, start_frame, end_frame, start_sec, end_sec.
    """
    fps = crop_path.source_fps
    hysteresis_frames = int(fps * 2)  # 2 seconds
    min_segment_frames = int(fps * 2)  # 2 seconds minimum

    # Classify each keyframe
    kf_types: list[tuple[int, str]] = []

    for kf in crop_path.keyframes:
        seg_type = "unknown"

        # Try all_faces JSON first
        if kf.all_faces:
            try:
                faces = json.loads(kf.all_faces)
                if faces:
                    max_w = max(f.get("w", 0) for f in faces)
                    if max_w > 0.20:
                        seg_type = "face"
                    elif max_w < 0.12:
                        seg_type = "screen"
                    else:
                        seg_type = "face"  # ambiguous range defaults to face
            except (json.JSONDecodeError, TypeError):
                pass

        # Fallback to face_detected + face_confidence
        if seg_type == "unknown":
            if kf.face_detected and kf.face_confidence > 0.5:
                seg_type = "face"
            else:
                seg_type = "screen"

        kf_types.append((kf.frame, seg_type))

    if not kf_types:
        return []

    # Expand keyframe classifications to per-frame (nearest keyframe)
    total = crop_path.source_total_frames
    frame_types = ["screen"] * total

    for i, (kf_frame, kf_type) in enumerate(kf_types):
        # This keyframe covers from its frame to the next keyframe's frame
        end = kf_types[i + 1][0] if i + 1 < len(kf_types) else total
        for f in range(kf_frame, min(end, total)):
            frame_types[f] = kf_type

    # Apply hysteresis: require N consecutive same-type frames before switching
    smoothed = list(frame_types)
    current_type = frame_types[0]
    run_start = 0

    for f in range(1, total):
        if frame_types[f] != current_type:
            run_len = f - run_start
            if run_len < hysteresis_frames:
                # Too short — revert to previous type
                for r in range(run_start, f):
                    smoothed[r] = current_type if run_start > 0 else frame_types[f]
            current_type = frame_types[f]
            run_start = f

    # Build segments from smoothed classifications
    segments: list[dict] = []
    seg_start = 0
    seg_type = smoothed[0]

    for f in range(1, total):
        if smoothed[f] != seg_type:
            segments.append({
                "type": seg_type,
                "start_frame": seg_start,
                "end_frame": f - 1,
                "start_sec": seg_start / fps,
                "end_sec": (f - 1) / fps,
            })
            seg_start = f
            seg_type = smoothed[f]

    # Final segment
    segments.append({
        "type": seg_type,
        "start_frame": seg_start,
        "end_frame": total - 1,
        "start_sec": seg_start / fps,
        "end_sec": (total - 1) / fps,
    })

    # Merge segments shorter than minimum duration into neighbors
    merged: list[dict] = []
    for seg in segments:
        seg_frames = seg["end_frame"] - seg["start_frame"] + 1
        if merged and seg_frames < min_segment_frames:
            # Absorb into previous segment
            merged[-1]["end_frame"] = seg["end_frame"]
            merged[-1]["end_sec"] = seg["end_sec"]
        else:
            merged.append(seg)

    return merged


# ---------------------------------------------------------------------------
# 3. Split-screen renderer
# ---------------------------------------------------------------------------

def _compute_face_crop_dims(
    crop_path: CropPath,
) -> tuple[int, int]:
    """Compute face close-up crop dimensions for the bottom half.

    Returns (w, h) in source pixels — sized for the bottom half of a
    1080x960 split. The crop aspect ratio is 1080:960 (= 9:8).

    Uses 25% of source width for a tight face-dominant crop.
    """
    src_w = crop_path.source_width
    src_h = crop_path.source_height

    crop_w = int(src_w * 0.25)
    crop_h = int(crop_w * 960 / 1080)  # 9:8 aspect
    crop_h = min(crop_h, src_h)

    return crop_w, crop_h


def _interpolate_face_crop_xy(
    keyframes, frame_idx: int, src_w: int, src_h: int,
    crop_w: int, crop_h: int,
) -> tuple[int, int]:
    """Interpolate face crop x,y for a given frame from keyframes.

    Uses the smoothed crop center (same data face-track uses) for x,
    and face_center_y for vertical positioning.
    """
    # Find bracketing keyframes
    if frame_idx <= keyframes[0].frame:
        kf = keyframes[0]
    elif frame_idx >= keyframes[-1].frame:
        kf = keyframes[-1]
    else:
        kf = keyframes[0]
        for i in range(len(keyframes) - 1):
            if keyframes[i].frame <= frame_idx < keyframes[i + 1].frame:
                kf_a = keyframes[i]
                kf_b = keyframes[i + 1]
                t = (frame_idx - kf_a.frame) / (kf_b.frame - kf_a.frame)
                # Interpolate crop center x
                cx_a = (kf_a.crop_x + kf_a.crop_w / 2) / src_w
                cx_b = (kf_b.crop_x + kf_b.crop_w / 2) / src_w
                cx = cx_a + t * (cx_b - cx_a)
                # Interpolate face_center_y (use crop center fallback if no face)
                cy_a = kf_a.face_center_y if kf_a.face_detected else (kf_a.crop_y + kf_a.crop_h / 2) / src_h
                cy_b = kf_b.face_center_y if kf_b.face_detected else (kf_b.crop_y + kf_b.crop_h / 2) / src_h
                cy = cy_a + t * (cy_b - cy_a)
                x = max(0, min(int(cx * src_w) - crop_w // 2, src_w - crop_w))
                y = max(0, min(int(cy * src_h) - int(crop_h * 0.40), src_h - crop_h))
                return x, y
        kf = keyframes[-1]

    # Single keyframe case
    cx = (kf.crop_x + kf.crop_w / 2) / src_w
    cy = kf.face_center_y if kf.face_detected else (kf.crop_y + kf.crop_h / 2) / src_h
    x = max(0, min(int(cx * src_w) - crop_w // 2, src_w - crop_w))
    y = max(0, min(int(cy * src_h) - int(crop_h * 0.40), src_h - crop_h))
    return x, y


def _generate_face_crop_sendcmd(
    crop_path: CropPath,
    fps: float,
    total_frames: int,
    crop_w: int,
    crop_h: int,
    ema_alpha: float = 0.02,
    min_delta: int = 15,
) -> str:
    """Generate sendcmd script for the bottom-half face crop.

    Applies heavy EMA smoothing to eliminate jitter, then only emits
    updates when the position changes by >= min_delta pixels.

    Args:
        ema_alpha: Smoothing factor (lower = smoother). 0.02 gives very
            smooth, slow-following movement over ~50 frames (~1.7s at 30fps).
        min_delta: Minimum pixel change before emitting an update.
    """
    src_w = crop_path.source_width
    src_h = crop_path.source_height
    keyframes = crop_path.keyframes
    if not keyframes:
        raise ValueError("CropPath has no keyframes")

    # First pass: compute raw interpolated positions for every frame
    raw_x = []
    raw_y = []
    for frame_idx in range(total_frames):
        x, y = _interpolate_face_crop_xy(
            keyframes, frame_idx, src_w, src_h, crop_w, crop_h,
        )
        raw_x.append(float(x))
        raw_y.append(float(y))

    # Second pass: EMA smoothing
    smooth_x = [raw_x[0]]
    smooth_y = [raw_y[0]]
    for i in range(1, total_frames):
        smooth_x.append(smooth_x[-1] + ema_alpha * (raw_x[i] - smooth_x[-1]))
        smooth_y.append(smooth_y[-1] + ema_alpha * (raw_y[i] - smooth_y[-1]))

    # Third pass: emit sendcmd entries with dead zone
    lines: list[str] = []
    last_x: int | None = None
    last_y: int | None = None

    for frame_idx in range(total_frames):
        x = int(round(smooth_x[frame_idx]))
        y = int(round(smooth_y[frame_idx]))
        # Clamp
        x = max(0, min(x, src_w - crop_w))
        y = max(0, min(y, src_h - crop_h))

        is_first = frame_idx == 0
        is_last = frame_idx == total_frames - 1
        changed = (
            last_x is None
            or abs(x - last_x) >= min_delta
            or abs(y - last_y) >= min_delta
        )

        if is_first or is_last or changed:
            t = frame_idx / fps
            lines.append(f"{t:.6f} [enter] crop@face x {x};")
            lines.append(f"{t:.6f} [enter] crop@face y {y};")
            last_x, last_y = x, y

    reduction = ((total_frames - len(lines) // 2) / total_frames * 100) if total_frames > 0 else 0
    print(f"  Face crop sendcmd: {len(lines) // 2}/{total_frames} updates ({reduction:.0f}% reduced)", flush=True)

    fd, path = tempfile.mkstemp(suffix=".sendcmd", prefix="face_crop_")
    with os.fdopen(fd, "w") as f:
        f.write("\n".join(lines))

    return path


def _compute_mask_region(
    webcam_region: dict | None,
    face_region: dict | None,
    src_w: int,
    src_h: int,
    is_talking_head: bool,
) -> tuple[int, int, int, int] | None:
    """Compute the drawbox mask region for the top half (screen content).

    For talking-head: mask a generous region around the person so the
    top half shows only screen content.
    For webcam PiP: mask just the webcam overlay.
    Returns (x, y, w, h) in pixels or None if no masking needed.
    """
    region = webcam_region or face_region
    if not region:
        return None

    cx = region["x"]
    cy = region["y"]

    if is_talking_head:
        # Large mask to cover the full person (head+shoulders+upper body)
        mask_w = max(region.get("w", 0.06), 0.35)
        mask_h = max(region.get("h", 0.12), 0.75)
    else:
        # Webcam PiP: mask just the overlay with margin
        mask_w = region.get("w", 0.10) + 0.04
        mask_h = region.get("h", 0.15) + 0.04

    x1 = int(max(0, (cx - mask_w / 2)) * src_w)
    y1 = int(max(0, (cy - mask_h / 2)) * src_h)
    x2 = int(min(1, (cx + mask_w / 2)) * src_w)
    y2 = int(min(1, (cy + mask_h / 2)) * src_h)

    return x1, y1, x2 - x1, y2 - y1


def render_split_screen_ffmpeg(
    video_path: str,
    crop_path: CropPath,
    output_path: str,
    config: dict,
    face_region: dict | None = None,
    webcam_region: dict | None = None,
    track_face_per_frame: bool = False,
) -> None:
    """Render split-screen layout: top=screen content, bottom=face close-up.

    Top half: full 16:9 source scaled to 1080px wide, cropped to 960px tall,
    with face/webcam region masked via drawbox blur-fill.
    Bottom half: stable face close-up crop scaled to 1080x960.

    Args:
        video_path: Input video path.
        crop_path: CropPath with keyframes.
        output_path: Output video path.
        config: Encoder config.
        face_region: Dict with normalized keys x, y, w, h (center-based).
        webcam_region: Dict with normalized keys x, y, w, h (center-based).
        track_face_per_frame: If True, this is a talking-head video.
    """
    src_w = crop_path.source_width
    src_h = crop_path.source_height

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    is_talking_head = track_face_per_frame
    fps = crop_path.source_fps
    total = crop_path.source_total_frames

    # Bottom half: dynamic face crop dimensions (9:8 aspect)
    fc_w, fc_h = _compute_face_crop_dims(crop_path)

    # Top half: compute mask region for drawbox
    mask = _compute_mask_region(
        webcam_region, face_region, src_w, src_h, is_talking_head,
    )

    # Generate sendcmd for dynamic bottom-half face crop
    sendcmd_file = _generate_face_crop_sendcmd(
        crop_path, fps, total, fc_w, fc_h,
    )

    try:
        # Top half: 1.15x center zoom then scale to 1080x960
        zoom = 1.15
        zoom_w = int(src_w / zoom)
        zoom_h = int(src_h / zoom)
        zoom_x = (src_w - zoom_w) // 2
        zoom_y = (src_h - zoom_h) // 2
        zoom_crop = f"crop={zoom_w}:{zoom_h}:{zoom_x}:{zoom_y}"

        # Build top-half filter chain
        # With mask: blur the webcam/face region (coords adjusted for zoom)
        # Without mask: just zoom + scale
        if mask:
            mx, my, mw, mh = mask
            # Offset mask coords into the zoomed frame
            zmx = max(0, mx - zoom_x)
            zmy = max(0, my - zoom_y)
            zmw = min(mw, zoom_w - zmx)
            zmh = min(mh, zoom_h - zmy)
            top_chain = (
                f"[top]{zoom_crop},"
                f"split=2[_tbase][_tblur];"
                f"[_tblur]crop={zmw}:{zmh}:{zmx}:{zmy},"
                f"boxblur=30:30[_bpatch];"
                f"[_tbase][_bpatch]overlay={zmx}:{zmy},"
                f"scale=1080:960:flags=bilinear[screen]"
            )
        else:
            top_chain = f"[top]{zoom_crop},scale=1080:960:flags=bilinear[screen]"

        # sendcmd goes before split so it can target crop@face in the bot branch
        filter_complex = (
            f"[0:v]sendcmd=f='{sendcmd_file}',"
            f"split=2[top][bot];"
            f"{top_chain};"
            f"[bot]crop@face=w={fc_w}:h={fc_h}:x=0:y=0,"
            f"scale=1080:960:flags=bilinear[face];"
            f"[screen][face]vstack[out]"
        )

        # Skip hwaccel for split-screen — complex filter chains with split/vstack
        # are incompatible with videotoolbox hwaccel on some codecs (e.g. AV1)
        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-filter_complex", filter_complex,
            "-map", "[out]",
            "-map", "0:a?",
            *_build_encode_args(config),
            "-c:a", "copy",
            "-movflags", "+faststart",
            output_path,
        ]

        mode = "talking-head" if is_talking_head else "webcam-pip"
        print(f"  Split-screen FFmpeg render ({mode}): 1080x1920", flush=True)
        print(f"    Top: {src_w}x{src_h} -> 1080x960 (mask: {mask is not None})", flush=True)
        print(f"    Bottom: dynamic crop {fc_w}x{fc_h} -> 1080x960", flush=True)

        _run_ffmpeg(cmd, label="Split-screen render")
    finally:
        _safe_unlink(sendcmd_file)

    print(f"  Output: {output_path}")


# ---------------------------------------------------------------------------
# 4. Cursor-track renderer (segment-based concat)
# ---------------------------------------------------------------------------

def render_cursor_track_ffmpeg(
    video_path: str,
    crop_path: CropPath,
    output_path: str,
    config: dict,
    segments: list[dict],
    face_region: dict | None = None,
    webcam_region: dict | None = None,
) -> None:
    """Render cursor-track video by rendering each segment separately and concatenating.

    Each segment is rendered with the appropriate renderer (face-track for face
    segments, split-screen for screen segments), then concatenated with FFmpeg.

    Args:
        video_path: Input video path.
        crop_path: CropPath with keyframes.
        output_path: Output video path.
        config: Encoder config.
        segments: List from detect_segments().
        face_region: Normalized face region dict for split-screen bottom half.
        webcam_region: Normalized webcam region dict for split-screen masking.
    """
    if not segments:
        raise ValueError("No segments provided for cursor-track render")

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    tmp_dir = tempfile.mkdtemp(prefix="cursor_track_")
    tmp_files: list[str] = []

    try:
        fps = crop_path.source_fps

        for i, seg in enumerate(segments):
            start_sec = seg["start_sec"]
            end_sec = seg["end_sec"]
            duration = end_sec - start_sec
            seg_type = seg["type"]
            tmp_out = os.path.join(tmp_dir, f"seg_{i:04d}.mp4")
            tmp_files.append(tmp_out)

            print(f"  Segment {i + 1}/{len(segments)}: {seg_type} "
                  f"({start_sec:.1f}s - {end_sec:.1f}s, {duration:.1f}s)", flush=True)

            if seg_type == "face":
                # Extract segment, then render face-track
                tmp_extracted = os.path.join(tmp_dir, f"extract_{i:04d}.mp4")

                extract_cmd = [
                    "ffmpeg", "-y",
                    "-ss", str(start_sec),
                    "-i", video_path,
                    "-t", str(duration),
                    "-c", "copy",
                    "-movflags", "+faststart",
                    tmp_extracted,
                ]
                _run_ffmpeg(extract_cmd, label=f"Extract segment {i + 1}")

                # Build a sub-CropPath for this segment's frame range
                seg_keyframes = [
                    kf for kf in crop_path.keyframes
                    if seg["start_frame"] <= kf.frame <= seg["end_frame"]
                ]

                # Offset keyframes to start at frame 0 for the segment
                from copy import deepcopy
                offset_kfs = []
                for kf in seg_keyframes:
                    new_kf = deepcopy(kf)
                    new_kf.frame = kf.frame - seg["start_frame"]
                    new_kf.time_sec = new_kf.frame / fps
                    offset_kfs.append(new_kf)

                if not offset_kfs:
                    # No keyframes in range — use nearest keyframe
                    nearest = min(
                        crop_path.keyframes,
                        key=lambda k: abs(k.frame - seg["start_frame"]),
                    )
                    from copy import deepcopy as dc
                    fallback = dc(nearest)
                    fallback.frame = 0
                    fallback.time_sec = 0.0
                    offset_kfs = [fallback]

                from .crop_path_io import CropPath as CP, DetectionStats
                seg_total = seg["end_frame"] - seg["start_frame"] + 1
                sub_crop = CP(
                    version=crop_path.version,
                    source_file=tmp_extracted,
                    source_width=crop_path.source_width,
                    source_height=crop_path.source_height,
                    source_fps=fps,
                    source_total_frames=seg_total,
                    output_format=crop_path.output_format,
                    output_crop_w=crop_path.output_crop_w,
                    output_crop_h=crop_path.output_crop_h,
                    config_used=crop_path.config_used,
                    detection_stats=DetectionStats(
                        frames_sampled=0, faces_detected=0,
                        face_detected_pct=0, avg_confidence=0,
                        sampling_rate=1, interpolated_frames=0,
                    ),
                    keyframes=offset_kfs,
                )

                render_face_track_ffmpeg(tmp_extracted, sub_crop, tmp_out, config)
                _safe_unlink(tmp_extracted)

            else:
                # Screen segment — split-screen render via trim
                crop_w = crop_path.output_crop_w
                crop_h = crop_path.output_crop_h

                # Build split-screen filter with trim
                if face_region:
                    fx = int(face_region["x"] * crop_path.source_width)
                    fy = int(face_region["y"] * crop_path.source_height)
                    fw = int(face_region["w"] * crop_path.source_width)
                    fh = int(face_region["h"] * crop_path.source_height)
                else:
                    fw = int(crop_path.source_width * 0.3)
                    fh = int(crop_path.source_height * 0.6)
                    fx = (crop_path.source_width - fw) // 2
                    fy = (crop_path.source_height - fh) // 2

                if webcam_region:
                    wx = int(webcam_region["x"] * crop_path.source_width)
                    wy = int(webcam_region["y"] * crop_path.source_height)
                    ww = int(webcam_region["w"] * crop_path.source_width)
                    wh = int(webcam_region["h"] * crop_path.source_height)
                    filter_complex = (
                        f"[0:v]split=2[top][bot];"
                        f"[top]drawbox=x={wx}:y={wy}:w={ww}:h={wh}:"
                        f"color=black:t=fill,"
                        f"scale=1080:960:flags=bilinear[screen];"
                        f"[bot]crop={fw}:{fh}:{fx}:{fy},"
                        f"scale=1080:960:flags=bilinear[face];"
                        f"[screen][face]vstack[out]"
                    )
                else:
                    filter_complex = (
                        f"[0:v]split=2[top][bot];"
                        f"[top]scale=1080:960:flags=bilinear[screen];"
                        f"[bot]crop={fw}:{fh}:{fx}:{fy},"
                        f"scale=1080:960:flags=bilinear[face];"
                        f"[screen][face]vstack[out]"
                    )

                cmd = [
                    "ffmpeg", "-y",
                    *_build_hwaccel_args(),
                    "-ss", str(start_sec),
                    "-i", video_path,
                    "-t", str(duration),
                    "-filter_complex", filter_complex,
                    "-map", "[out]",
                    "-map", "0:a?",
                    *_build_encode_args(config),
                    "-c:a", "copy",
                    "-movflags", "+faststart",
                    tmp_out,
                ]

                _run_ffmpeg(cmd, label=f"Split-screen segment {i + 1}")

        # Concatenate all segments
        concat_file = os.path.join(tmp_dir, "concat.txt")
        with open(concat_file, "w") as f:
            for tmp in tmp_files:
                f.write(f"file '{tmp}'\n")

        concat_cmd = [
            "ffmpeg", "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", concat_file,
            "-c", "copy",
            "-movflags", "+faststart",
            output_path,
        ]

        print(f"  Concatenating {len(tmp_files)} segments...", flush=True)
        _run_ffmpeg(concat_cmd, label="Concat segments")

    finally:
        # Clean up all temp files
        for tmp in tmp_files:
            _safe_unlink(tmp)
        concat_path = os.path.join(tmp_dir, "concat.txt")
        _safe_unlink(concat_path)
        # Clean any leftover extract files
        for f in Path(tmp_dir).glob("extract_*.mp4"):
            _safe_unlink(str(f))
        try:
            os.rmdir(tmp_dir)
        except OSError:
            pass

    print(f"  Output: {output_path}")
