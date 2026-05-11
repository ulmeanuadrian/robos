"""CLI for the FFmpeg reframe tool.

Usage:
    python -m reframe --video INPUT --output OUTPUT [--layout split-screen|cursor-track|face-track]
    python -m reframe --video INPUT --output OUTPUT --start 10.5 --end 75.0 --layout split-screen
"""

import argparse
import subprocess
import sys
import time
from pathlib import Path


def extract_clip(source_video, output_path, start_sec, end_sec):
    """Stream-copy extract a segment from the source video."""
    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start_sec),
        "-i", str(source_video),
        "-t", str(end_sec - start_sec),
        "-c", "copy",
        "-movflags", "+faststart",
        "-v", "quiet",
        str(output_path),
    ]
    subprocess.run(cmd, check=True)
    print(f"  Extracted clip: {start_sec:.1f}s-{end_sec:.1f}s -> {output_path}")


def main():
    parser = argparse.ArgumentParser(description="FFmpeg-based video reframing (16:9 -> 9:16)")
    parser.add_argument("--video", required=True, help="Input video path")
    parser.add_argument("--output", required=True, help="Output video path")
    parser.add_argument("--layout", default="split-screen",
                        choices=["split-screen", "cursor-track", "face-track"],
                        help="Reframe layout mode (default: split-screen)")
    parser.add_argument("--start", type=float, default=None, help="Clip start time in seconds")
    parser.add_argument("--end", type=float, default=None, help="Clip end time in seconds")
    args = parser.parse_args()

    video_path = args.video
    output_path = args.output

    # If start/end provided, extract clip first
    if args.start is not None and args.end is not None:
        clip_path = str(Path(output_path).parent / "raw.mp4")
        extract_clip(video_path, clip_path, args.start, args.end)
        video_path = clip_path

    # Import and run the appropriate layout
    t0 = time.time()

    if args.layout == "split-screen":
        from .split_screen import reframe
    elif args.layout == "cursor-track":
        from .cursor_track import reframe
    elif args.layout == "face-track":
        from .face_track import reframe

    reframe(video_path, output_path)
    elapsed = time.time() - t0
    print(f"  Total reframe time: {elapsed:.1f}s")


if __name__ == "__main__":
    main()
