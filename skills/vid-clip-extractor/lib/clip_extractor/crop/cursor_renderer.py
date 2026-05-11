"""Cursor-tracking crop renderer.

Two modes that switch based on face visibility:
- Face visible: 9:16 crop centered on face (same as face-track layout)
- Screen/cursor: split-screen — top half shows screen content (webcam painted
  out), bottom half shows the webcam region zoomed in on the face.

Webcam region is auto-detected from face keyframe positions.
"""

import subprocess
import tempfile
from pathlib import Path

import cv2
import numpy as np

from ..detection.cursor_detector import CursorPosition
from .crop_renderer import _build_ffmpeg_cmd, _safe_unlink, _interpolate_crop_x
from .crop_path_io import CropPath


def _detect_webcam_region(
    crop_path: CropPath,
    video_path: str | None = None,
) -> tuple[int, int, int, int] | None:
    """Detect webcam overlay region from video content analysis.

    Samples frames and detects the webcam overlay by finding a region
    on the right side of the frame that differs significantly from the
    app UI background. Falls back to face keyframe positions if content
    analysis fails.

    Args:
        crop_path: CropPath with face detection keyframes.
        video_path: Path to video for content-based detection.

    Returns:
        (x, y, w, h) in source pixels, or None if no webcam detected.
    """
    src_w = crop_path.source_width
    src_h = crop_path.source_height

    # Content-based detection: find the webcam overlay by looking for a
    # region with high color variance (real camera footage vs flat UI).
    # Search the right 60% of the frame and pick the region closest to
    # the face keyframe cluster.
    face_kfs = [kf for kf in crop_path.keyframes if kf.face_detected]

    if video_path and len(face_kfs) >= 3:
        face_cx = np.median([kf.face_center_x for kf in face_kfs])
        face_cy = np.median([kf.face_center_y for kf in face_kfs])

        cap = cv2.VideoCapture(video_path)
        if cap.isOpened():
            total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            sample_frames = [int(total * p) for p in [0.2, 0.4, 0.6]]
            all_boxes = []

            for fidx in sample_frames:
                cap.set(cv2.CAP_PROP_POS_FRAMES, fidx)
                ret, frame = cap.read()
                if not ret:
                    continue

                # Background color from frame borders
                border = np.concatenate([
                    frame[0:15, :, :].reshape(-1, 3),
                    frame[-15:, :, :].reshape(-1, 3),
                    frame[:, 0:15, :].reshape(-1, 3),
                ])
                bg_color = np.median(border, axis=0)

                # Find all non-background regions in the full frame
                diff = np.linalg.norm(
                    frame.astype(float) - bg_color, axis=2,
                )
                mask = (diff > 80).astype(np.uint8) * 255

                kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (20, 20))
                mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

                contours, _ = cv2.findContours(
                    mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE,
                )

                # Score each contour: prefer the one closest to face center
                # with reasonable webcam-like aspect ratio
                face_px = int(face_cx * src_w)
                face_py = int(face_cy * src_h)
                best = None
                best_dist = float("inf")

                for c in contours:
                    area = cv2.contourArea(c)
                    # Webcam overlay: 1-15% of frame area
                    frame_area = src_w * src_h
                    if area < frame_area * 0.01 or area > frame_area * 0.15:
                        continue

                    x, y, cw, ch = cv2.boundingRect(c)
                    aspect = ch / cw if cw > 0 else 0
                    # Webcam overlays are roughly portrait or square: 0.6-2.0
                    if aspect < 0.5 or aspect > 2.5:
                        continue

                    # Distance from face center to contour center
                    ccx = x + cw // 2
                    ccy = y + ch // 2
                    dist = np.sqrt((ccx - face_px) ** 2 + (ccy - face_py) ** 2)

                    if dist < best_dist:
                        best_dist = dist
                        best = (x, y, cw, ch)

                if best:
                    all_boxes.append(best)

            cap.release()

            if all_boxes:
                x = int(np.median([b[0] for b in all_boxes]))
                y = int(np.median([b[1] for b in all_boxes]))
                w = int(np.percentile([b[2] for b in all_boxes], 90))
                h = int(np.percentile([b[3] for b in all_boxes], 90))

                margin = 15
                x = max(0, x - margin)
                y = max(0, y - margin)
                w = min(w + margin * 2, src_w - x)
                h = min(h + margin * 2, src_h - y)

                return x, y, w, h

    # Fallback: estimate from face keyframe positions
    face_kfs = [kf for kf in crop_path.keyframes if kf.face_detected]
    if len(face_kfs) < 5:
        return None

    xs = [kf.face_center_x * src_w for kf in face_kfs]
    ys = [kf.face_center_y * src_h for kf in face_kfs]

    center_x = np.median(xs)
    center_y = np.median(ys)

    # Generous estimate: webcam is ~3x the face cluster in each direction
    region_w = max(int(src_w * 0.20), int(np.std(xs) * 8))
    region_h = max(int(src_h * 0.40), int(np.std(ys) * 8))

    x = int(center_x - region_w / 2)
    y = int(center_y - region_h / 2)

    # Snap to edges
    if x + region_w > src_w - src_w * 0.05:
        x = src_w - region_w
    if y + region_h > src_h - src_h * 0.05:
        y = src_h - region_h

    x = max(0, x)
    y = max(0, y)

    return x, y, region_w, region_h


def _inpaint_webcam_region(
    frame: np.ndarray,
    wx: int, wy: int, ww: int, wh: int,
) -> np.ndarray:
    """Paint over the webcam region with surrounding content.

    Uses OpenCV inpainting for a clean removal. Falls back to blurred
    fill if inpainting is too slow.
    """
    result = frame.copy()
    # Sample the dominant color from a strip just outside the webcam region
    # to create a clean fill
    margin = 5

    # Try to use content from the left side of the webcam for fill
    if wx > margin * 2:
        fill_strip = frame[wy:wy + wh, max(0, wx - margin * 3):wx - margin]
        if fill_strip.size > 0:
            fill_color = np.median(fill_strip.reshape(-1, 3), axis=0).astype(np.uint8)
            result[wy:wy + wh, wx:wx + ww] = fill_color
            return result

    # Fallback: blur the region heavily
    region = result[wy:wy + wh, wx:wx + ww]
    blurred = cv2.GaussianBlur(region, (99, 99), 0)
    result[wy:wy + wh, wx:wx + ww] = blurred
    return result


def render_cursor_track(
    video_path: str,
    cursor_positions: list[CursorPosition],
    output_path: str,
    config: dict,
    crop_path: CropPath | None = None,
    out_w: int = 1080,
    out_h: int = 1920,
    **_kwargs,
) -> None:
    """Render portrait video switching between face-track and split-screen.

    Face visible frames: 9:16 crop centered on face.

    Screen frames: split-screen layout —
        Top half: full screen content with webcam overlay removed
        Bottom half: webcam region zoomed in (face close-up)

    Args:
        video_path: Path to the input video.
        cursor_positions: Per-frame cursor positions with face_visible flags.
        output_path: Path for the output video.
        config: Output config section from config.yaml.
        crop_path: CropPath with face-tracking keyframes.
        out_w: Output width (default 1080).
        out_h: Output height (default 1920).
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    src_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    src_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    # Face-track crop dimensions (9:16 from full source height)
    face_crop_w = crop_path.output_crop_w if crop_path else int(src_h * 9 / 16)
    face_crop_h = crop_path.output_crop_h if crop_path else src_h
    if face_crop_w > src_w:
        face_crop_w = src_w
        face_crop_h = int(face_crop_w * 16 / 9)

    # Detect webcam overlay region for split-screen
    webcam_region = _detect_webcam_region(crop_path, video_path) if crop_path else None

    # Split-screen layout: top half = screen, bottom half = face
    half_h = out_h // 2  # 960px each

    if webcam_region:
        wx, wy, ww, wh = webcam_region
        print(f"  Webcam overlay detected: ({wx}, {wy}) {ww}x{wh}")
    else:
        print(f"  No webcam overlay detected — screen segments will use letterbox")

    # Pre-compute face crop position for face-track segments
    face_crop_x = 0
    face_crop_y = 0
    if crop_path:
        face_kfs_detected = [kf for kf in crop_path.keyframes if kf.face_detected]
        if face_kfs_detected and webcam_region:
            # Center crop on webcam overlay
            wcam_cx = wx + ww // 2
            face_crop_x = max(0, min(wcam_cx - face_crop_w // 2,
                                     src_w - face_crop_w))
            # Vertical: place face in upper third with headroom
            face_cy = int(np.median([kf.face_center_y for kf in face_kfs_detected]) * src_h)
            face_crop_y = max(0, min(face_cy - face_crop_h // 3,
                                     src_h - face_crop_h))
        elif face_kfs_detected:
            face_crop_x = int(np.median([kf.face_center_x for kf in face_kfs_detected]) * src_w) - face_crop_w // 2
            face_crop_x = max(0, min(face_crop_x, src_w - face_crop_w))
            face_cy = int(np.median([kf.face_center_y for kf in face_kfs_detected]) * src_h)
            face_crop_y = max(0, min(face_cy - face_crop_h // 3,
                                     src_h - face_crop_h))

    # Letterbox dimensions for the top half (screen content)
    # Scale full source to fit out_w width
    screen_scale = out_w / src_w
    screen_scaled_w = out_w
    screen_scaled_h = int(src_h * screen_scale)
    # Center vertically in top half
    screen_pad_y = max(0, (half_h - screen_scaled_h) // 2)

    # Count segments
    face_frames = sum(1 for p in cursor_positions if p.face_visible)
    screen_frames = len(cursor_positions) - face_frames

    print(f"  Cursor track: {src_w}x{src_h} -> {out_w}x{out_h}")
    print(f"    Face segments: {face_frames} frames ({face_frames/total*100:.0f}%) "
          f"-> {face_crop_w}x{face_crop_h} face crop")
    print(f"    Screen segments: {screen_frames} frames ({screen_frames/total*100:.0f}%) "
          f"-> split-screen (screen top, face bottom)")

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    ffmpeg_cmd = _build_ffmpeg_cmd(
        output_path=output_path,
        width=out_w,
        height=out_h,
        fps=fps,
        audio_source=video_path,
        config=config,
    )

    stderr_file = tempfile.NamedTemporaryFile(mode="w", suffix=".log", delete=False)

    proc = subprocess.Popen(
        ffmpeg_cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
        stderr=stderr_file,
    )

    try:
        for frame_idx in range(total):
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx < len(cursor_positions):
                is_face = cursor_positions[frame_idx].face_visible
            else:
                is_face = False

            if is_face and crop_path:
                # Face mode: 9:16 crop centered on webcam overlay with headroom
                cropped = frame[face_crop_y:face_crop_y + face_crop_h,
                                face_crop_x:face_crop_x + face_crop_w]
                output = cv2.resize(cropped, (out_w, out_h),
                                    interpolation=cv2.INTER_LANCZOS4)

            elif webcam_region:
                # Split-screen mode: screen on top, face on bottom
                output = np.zeros((out_h, out_w, 3), dtype=np.uint8)

                # --- TOP HALF: screen content with webcam removed ---
                clean_frame = _inpaint_webcam_region(frame, wx, wy, ww, wh)
                screen_scaled = cv2.resize(clean_frame,
                                           (screen_scaled_w, screen_scaled_h),
                                           interpolation=cv2.INTER_LANCZOS4)
                # Place in top half, centered vertically
                y_start = screen_pad_y
                y_end = min(y_start + screen_scaled_h, half_h)
                src_end = y_end - y_start
                output[y_start:y_end, :] = screen_scaled[:src_end, :]

                # --- BOTTOM HALF: webcam region zoomed to fill ---
                face_region = frame[wy:wy + wh, wx:wx + ww]
                # Scale to fill bottom half width, crop to half_h height
                face_scale = out_w / ww
                face_scaled_w = out_w
                face_scaled_h = int(wh * face_scale)
                face_scaled = cv2.resize(face_region,
                                         (face_scaled_w, face_scaled_h),
                                         interpolation=cv2.INTER_LANCZOS4)

                # Center vertically in bottom half, crop if taller
                if face_scaled_h >= half_h:
                    # Crop vertically centered
                    fy = (face_scaled_h - half_h) // 2
                    output[half_h:, :] = face_scaled[fy:fy + half_h, :]
                else:
                    # Pad with black, center
                    fy = (half_h - face_scaled_h) // 2
                    output[half_h + fy:half_h + fy + face_scaled_h, :] = face_scaled

                # Thin divider line between halves
                output[half_h - 1:half_h + 1, :] = (40, 40, 40)

            else:
                # No webcam detected — fallback to letterbox
                bg_scale = max(out_w / src_w, out_h / src_h)
                bg_w = int(src_w * bg_scale)
                bg_h = int(src_h * bg_scale)
                bg = cv2.resize(frame, (bg_w, bg_h),
                                interpolation=cv2.INTER_LINEAR)
                bx = (bg_w - out_w) // 2
                by = (bg_h - out_h) // 2
                output = bg[by:by + out_h, bx:bx + out_w].copy()
                output = cv2.GaussianBlur(output, (51, 51), 0)
                output = (output.astype(np.float32) * 0.3).clip(0, 255).astype(
                    np.uint8)
                lb_scaled = cv2.resize(frame,
                                       (screen_scaled_w, screen_scaled_h),
                                       interpolation=cv2.INTER_LANCZOS4)
                lb_pad = (out_h - screen_scaled_h) // 2
                output[lb_pad:lb_pad + screen_scaled_h, :] = lb_scaled

            proc.stdin.write(output.tobytes())

            if frame_idx % max(1, total // 20) == 0 and frame_idx > 0:
                pct = int(frame_idx / total * 100)
                print(f"  Rendering cursor-track: {pct}% ({frame_idx}/{total})",
                      flush=True)

    finally:
        cap.release()
        if proc.stdin:
            proc.stdin.close()
        proc.wait()
        stderr_file.close()

        if proc.returncode != 0:
            with open(stderr_file.name, "r") as f:
                stderr_content = f.read()
            _safe_unlink(stderr_file.name)
            raise RuntimeError(
                f"FFmpeg failed (code {proc.returncode}): {stderr_content[-500:]}"
            )

        _safe_unlink(stderr_file.name)

    print(f"  Render complete (cursor-track): {output_path}")
