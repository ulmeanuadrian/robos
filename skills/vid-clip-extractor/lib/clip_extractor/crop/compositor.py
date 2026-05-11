"""Transcript-driven compositor — renders 9:16 video from explicit layout segments.

Instead of detecting layouts from frame analysis, this compositor takes segment
instructions (from Claude transcript analysis) and renders each segment with
the appropriate FFmpeg filter chain, then concatenates.

Layout types:
  - head:   face-track 9:16 crop following the speaker
  - split:  top=screen content, bottom=face close-up
  - screen: full screen content scaled to 9:16 (no face)
"""

import json
import os
import tempfile
from copy import deepcopy
from pathlib import Path

from .crop_path_io import CropPath, CropKeyframe, DetectionStats
from .ffmpeg_renderer import (
    render_face_track_ffmpeg,
    render_split_screen_ffmpeg,
    _build_hwaccel_args,
    _build_encode_args,
    _run_ffmpeg,
    _safe_unlink,
)


def _extract_segment(
    video_path: str,
    start_sec: float,
    duration: float,
    output_path: str,
) -> None:
    """Extract a time range from a video using stream copy."""
    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start_sec),
        "-i", video_path,
        "-t", str(duration),
        "-c", "copy",
        "-movflags", "+faststart",
        output_path,
    ]
    _run_ffmpeg(cmd, label="Extract segment")


def _build_sub_crop_path(
    crop_path: CropPath,
    start_sec: float,
    end_sec: float,
    segment_video: str,
) -> CropPath:
    """Build a CropPath subset for a time range, with frames offset to 0."""
    fps = crop_path.source_fps
    start_frame = int(start_sec * fps)
    end_frame = int(end_sec * fps)

    seg_keyframes = [
        kf for kf in crop_path.keyframes
        if start_frame <= kf.frame <= end_frame
    ]

    offset_kfs = []
    for kf in seg_keyframes:
        new_kf = deepcopy(kf)
        new_kf.frame = kf.frame - start_frame
        new_kf.time_sec = new_kf.frame / fps
        offset_kfs.append(new_kf)

    if not offset_kfs:
        nearest = min(
            crop_path.keyframes,
            key=lambda k: abs(k.frame - start_frame),
        )
        fallback = deepcopy(nearest)
        fallback.frame = 0
        fallback.time_sec = 0.0
        offset_kfs = [fallback]

    seg_total = end_frame - start_frame + 1

    return CropPath(
        version=crop_path.version,
        source_file=segment_video,
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


def _render_screen_segment(
    video_path: str,
    output_path: str,
    config: dict,
) -> None:
    """Render a pure screen segment — scale source to fit 1080x1920."""
    filter_complex = (
        "scale=1080:1920:force_original_aspect_ratio=decrease,"
        "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black"
    )

    cmd = [
        "ffmpeg", "-y",
        *_build_hwaccel_args(),
        "-i", video_path,
        "-filter_complex", filter_complex,
        "-map", "0:a?",
        *_build_encode_args(config),
        "-c:a", "copy",
        "-movflags", "+faststart",
        output_path,
    ]

    _run_ffmpeg(cmd, label="Screen segment render")


def composite_from_segments(
    video_path: str,
    crop_path: CropPath,
    segments: list[dict],
    output_path: str,
    config: dict,
) -> None:
    """Render 9:16 video from transcript-driven layout segments.

    Each segment specifies a layout type and time range. The compositor
    renders each segment with the appropriate FFmpeg filter chain, then
    concatenates all segments into the final output.

    Args:
        video_path: Input video path.
        crop_path: CropPath with keyframes from analysis.
        segments: List of dicts with keys: layout, start, end.
        output_path: Output video path.
        config: Encoder config dict.
    """
    if not segments:
        raise ValueError("No segments provided for compositor")

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    tmp_dir = tempfile.mkdtemp(prefix="compositor_")
    tmp_files: list[str] = []

    try:
        print(f"  Compositor: {len(segments)} segments", flush=True)

        for i, seg in enumerate(segments):
            layout = seg["layout"]
            start = seg["start"]
            end = seg["end"]
            duration = end - start
            tmp_out = os.path.join(tmp_dir, f"seg_{i:04d}.mp4")
            tmp_files.append(tmp_out)

            print(f"  [{i + 1}/{len(segments)}] {layout}: "
                  f"{start:.1f}s - {end:.1f}s ({duration:.1f}s)", flush=True)

            # Extract the segment
            tmp_extracted = os.path.join(tmp_dir, f"extract_{i:04d}.mp4")
            _extract_segment(video_path, start, duration, tmp_extracted)

            sub_crop = _build_sub_crop_path(crop_path, start, end, tmp_extracted)

            if layout == "head":
                render_face_track_ffmpeg(
                    video_path=tmp_extracted,
                    crop_path=sub_crop,
                    output_path=tmp_out,
                    config=config,
                )

            elif layout == "split":
                render_split_screen_ffmpeg(
                    video_path=tmp_extracted,
                    crop_path=sub_crop,
                    output_path=tmp_out,
                    config=config,
                    track_face_per_frame=True,
                )

            elif layout == "screen":
                _render_screen_segment(
                    video_path=tmp_extracted,
                    output_path=tmp_out,
                    config=config,
                )

            else:
                raise ValueError(f"Unknown layout type: {layout}")

            _safe_unlink(tmp_extracted)

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
        _run_ffmpeg(concat_cmd, label="Compositor concat")

    finally:
        for tmp in tmp_files:
            _safe_unlink(tmp)
        _safe_unlink(os.path.join(tmp_dir, "concat.txt"))
        for f in Path(tmp_dir).glob("extract_*.mp4"):
            _safe_unlink(str(f))
        try:
            os.rmdir(tmp_dir)
        except OSError:
            pass

    print(f"  Output: {output_path}")
