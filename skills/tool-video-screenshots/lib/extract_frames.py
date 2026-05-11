#!/usr/bin/env python3
"""
Extract frames from YouTube videos using yt-dlp and ffmpeg.

Modes:
  --scene-detect   Auto-detect scene changes via ffmpeg scene filter
  --timestamps     Extract at specific times (comma-separated H:M:S)

Usage:
  extract_frames.py <url> --scene-detect [--max-frames 15] [--output-dir .]
  extract_frames.py <url> --timestamps "00:02:35,00:09:49" [--output-dir .]
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path


def check_binary(name: str) -> bool:
    """Check if a binary is available on PATH (cross-platform)."""
    return shutil.which(name) is not None


def download_video(url: str, output_dir: Path, resolution: str = "1280x720") -> Path:
    """Download video at target resolution via yt-dlp."""
    height = resolution.split("x")[1] if "x" in resolution else "720"
    output_template = str(output_dir / "source_video.%(ext)s")

    cmd = [
        "yt-dlp",
        "-f", f"bestvideo[height<={height}]+bestaudio/best[height<={height}]",
        "--merge-output-format", "mp4",
        "-o", output_template,
        "--no-playlist",
        url,
    ]
    print(f"Downloading video at <={height}p...")
    subprocess.run(cmd, check=True)

    # Find the downloaded file
    for f in output_dir.iterdir():
        if f.name.startswith("source_video") and f.suffix in (".mp4", ".mkv", ".webm"):
            return f

    raise FileNotFoundError("Download completed but video file not found")


def scene_detect(video_path: Path, threshold: float = 0.3) -> list[str]:
    """Detect scene changes using ffmpeg scene filter. Returns timestamps."""
    cmd = [
        "ffmpeg", "-i", str(video_path),
        "-vf", f"select='gt(scene,{threshold})',showinfo",
        "-vsync", "vfr",
        "-f", "null", "-"
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)

    # Parse showinfo output for timestamps (pts_time)
    timestamps = []
    for line in result.stderr.split("\n"):
        match = re.search(r"pts_time:(\d+\.?\d*)", line)
        if match:
            timestamps.append(float(match.group(1)))

    return [format_timestamp(t) for t in sorted(set(timestamps))]


def format_timestamp(seconds: float) -> str:
    """Convert seconds to HH:MM:SS format."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def parse_timestamp(ts: str) -> float:
    """Convert HH:MM:SS or MM:SS to seconds."""
    parts = ts.strip().split(":")
    if len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
    elif len(parts) == 2:
        return int(parts[0]) * 60 + float(parts[1])
    return float(parts[0])


def extract_frame(video_path: Path, timestamp: str, output_path: Path,
                  fmt: str = "png", offset: float = 0.5) -> bool:
    """Extract a single frame at timestamp + offset for stability."""
    seconds = parse_timestamp(timestamp) + offset
    cmd = [
        "ffmpeg", "-ss", str(seconds),
        "-i", str(video_path),
        "-frames:v", "1",
        "-q:v", "2",
        "-y",
        str(output_path)
    ]
    result = subprocess.run(cmd, capture_output=True)
    return result.returncode == 0 and output_path.exists()


def main():
    parser = argparse.ArgumentParser(description="Extract frames from YouTube videos")
    parser.add_argument("url", help="YouTube video URL")
    parser.add_argument("--scene-detect", action="store_true",
                        help="Auto-detect scene changes")
    parser.add_argument("--timestamps", type=str, default=None,
                        help="Comma-separated timestamps (HH:MM:SS)")
    parser.add_argument("--max-frames", type=int, default=15,
                        help="Maximum candidate frames (default: 15)")
    parser.add_argument("--resolution", default="1280x720",
                        help="Download resolution (default: 1280x720)")
    parser.add_argument("--format", choices=["png", "jpg"], default="png",
                        help="Frame image format (default: png)")
    parser.add_argument("--output-dir", default=".",
                        help="Output directory for frames and manifest")
    parser.add_argument("--keep-video", action="store_true",
                        help="Keep downloaded video after extraction")
    parser.add_argument("--threshold", type=float, default=0.3,
                        help="Scene detection threshold (default: 0.3)")

    args = parser.parse_args()

    if not args.scene_detect and not args.timestamps:
        print("Error: specify --scene-detect or --timestamps")
        sys.exit(1)

    # Check dependencies
    for binary in ("yt-dlp", "ffmpeg"):
        if not check_binary(binary):
            print(f"Error: {binary} not found. Run setup.sh first.")
            sys.exit(1)

    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    # Download video
    video_path = download_video(args.url, output_dir, args.resolution)
    print(f"Video saved: {video_path}")

    # Get timestamps
    if args.scene_detect:
        print(f"Running scene detection (threshold={args.threshold})...")
        timestamps = scene_detect(video_path, args.threshold)
        print(f"Detected {len(timestamps)} scene changes")

        # Limit candidates
        if len(timestamps) > args.max_frames:
            # Evenly sample to keep spread across video
            step = len(timestamps) / args.max_frames
            timestamps = [timestamps[int(i * step)] for i in range(args.max_frames)]
            print(f"Sampled down to {len(timestamps)} candidates")
    else:
        timestamps = [t.strip() for t in args.timestamps.split(",")]
        print(f"Using {len(timestamps)} manual timestamps")

    # Extract frames
    manifest = []
    for i, ts in enumerate(timestamps):
        safe_ts = ts.replace(":", "_")
        frame_name = f"frame_{safe_ts}.{args.format}"
        frame_path = output_dir / frame_name
        print(f"  Extracting frame {i+1}/{len(timestamps)} at {ts}...")

        if extract_frame(video_path, ts, frame_path, args.format):
            manifest.append({
                "timestamp": ts,
                "frame_path": str(frame_path),
            })
        else:
            print(f"  Warning: failed to extract frame at {ts}")

    # Write manifest
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"\nManifest: {manifest_path}")
    print(f"Extracted {len(manifest)}/{len(timestamps)} frames")

    # Clean up video
    if not args.keep_video:
        video_path.unlink()
        print("Video deleted (use --keep-video to retain)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
