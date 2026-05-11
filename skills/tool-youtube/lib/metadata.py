#!/usr/bin/env python3
"""
Fetch YouTube video metadata and thumbnail using yt-dlp.

Usage:
    metadata.py <url> [--output-dir DIR] [--thumbnail] [--no-metadata]
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


def is_in_virtualenv() -> bool:
    """Check if running inside a virtual environment."""
    return (
        hasattr(sys, "real_prefix")
        or (hasattr(sys, "base_prefix") and sys.base_prefix != sys.prefix)
        or os.environ.get("VIRTUAL_ENV") is not None
    )


def find_existing_venv() -> str | None:
    """Look for existing venv in common locations."""
    cwd = Path.cwd()
    for name in ["venv", ".venv", "env", ".env"]:
        venv_path = cwd / name
        if venv_path.is_dir() and (venv_path / "pyvenv.cfg").exists():
            return str(venv_path)
    return None


def check_setup() -> bool:
    """Check environment and show setup guidance."""
    print("=" * 50)
    print("ENVIRONMENT CHECK")
    print("=" * 50 + "\n")

    if is_in_virtualenv():
        print(f"  Virtual environment: {os.environ.get('VIRTUAL_ENV', sys.prefix)}")
    else:
        existing = find_existing_venv()
        if existing:
            print(f"  Found venv at: {existing}")
            print(f"   Activate with: source {existing}/bin/activate")
        else:
            print("  No virtual environment detected.")
            print("   Create with: python3 -m venv venv && source venv/bin/activate")
        print()

    try:
        result = subprocess.run(["yt-dlp", "--version"], capture_output=True, check=True)
        print(f"  yt-dlp installed: {result.stdout.decode().strip()}")
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("  yt-dlp not installed.")
        print("\nInstall with:")
        print("   brew install yt-dlp     # macOS")
        print("   pip install yt-dlp      # in venv")
        return False


def fetch_metadata(url: str, output_dir: str = ".",
                   download_thumbnail: bool = False,
                   skip_metadata: bool = False) -> int:
    """Fetch video metadata and optionally download thumbnail."""
    output_path = Path(output_dir).resolve()
    output_path.mkdir(parents=True, exist_ok=True)

    if not skip_metadata:
        print(f"Fetching metadata: {url}\n")
        result = subprocess.run(
            ["yt-dlp", "--dump-json", "--no-download", url],
            capture_output=True, text=True,
        )
        if result.returncode != 0:
            print(f"  yt-dlp failed: {result.stderr.strip()}")
            return result.returncode

        raw = json.loads(result.stdout)

        # Resolve resolution and aspect ratio from format info
        width = raw.get("width") or 0
        height = raw.get("height") or 0
        resolution = f"{width}x{height}" if width and height else None
        aspect_ratio = round(width / height, 2) if width and height else None

        metadata = {
            "title": raw.get("title"),
            "channel": raw.get("channel") or raw.get("uploader"),
            "channel_handle": raw.get("uploader_id"),
            "thumbnail_url": raw.get("thumbnail"),
            "duration": raw.get("duration"),
            "upload_date": raw.get("upload_date"),
            "description": raw.get("description"),
            "view_count": raw.get("view_count"),
            "like_count": raw.get("like_count"),
            "comment_count": raw.get("comment_count"),
            "tags": raw.get("tags") or [],
            "categories": raw.get("categories") or [],
            "channel_url": raw.get("channel_url"),
            "channel_follower_count": raw.get("channel_follower_count"),
            "language": raw.get("language"),
            "resolution": resolution,
            "fps": raw.get("fps"),
            "aspect_ratio": aspect_ratio,
        }

        meta_path = output_path / "metadata.json"
        meta_path.write_text(json.dumps(metadata, indent=2, ensure_ascii=False))
        print(f"  Saved: {meta_path}")

    if download_thumbnail:
        print(f"{'Fetching' if skip_metadata else 'Downloading'} thumbnail...")
        thumb_cmd = [
            "yt-dlp", "--write-thumbnail", "--skip-download",
            "--convert-thumbnails", "png",
            "-o", str(output_path / "thumbnail"),
            url,
        ]
        result = subprocess.run(thumb_cmd, capture_output=True, text=True)

        # yt-dlp may produce thumbnail.png, thumbnail.webp, or thumbnail.jpg
        thumb_file = None
        for ext in ["png", "webp", "jpg", "jpeg"]:
            candidate = output_path / f"thumbnail.{ext}"
            if candidate.exists():
                thumb_file = candidate
                break

        if thumb_file:
            print(f"  Saved: {thumb_file}")
        else:
            print("  Thumbnail download failed — video may not have one")
            if not skip_metadata:
                print("  Use thumbnail_url from metadata.json as fallback")

    return 0


def main():
    parser = argparse.ArgumentParser(description="Fetch YouTube video metadata")
    parser.add_argument("url", nargs="?", help="YouTube URL")
    parser.add_argument("--output-dir", default=".", help="Output directory")
    parser.add_argument("--thumbnail", action="store_true",
                        help="Also download thumbnail PNG")
    parser.add_argument("--no-metadata", action="store_true",
                        help="Skip metadata JSON (use with --thumbnail for thumbnail-only)")
    parser.add_argument("--check-setup", action="store_true", help="Check environment")
    args = parser.parse_args()

    if args.check_setup or args.url is None:
        ok = check_setup()
        print("\n" + "=" * 50)
        print("  Ready!" if ok else "  Complete setup above.")
        print("=" * 50)
        if args.url is None:
            print("\nUsage: python metadata.py <URL> [--thumbnail] [--no-metadata]")
        sys.exit(0 if ok else 1)

    # Check yt-dlp silently
    try:
        subprocess.run(["yt-dlp", "--version"], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("  yt-dlp not installed. Run --check-setup for help.")
        sys.exit(1)

    if args.no_metadata and not args.thumbnail:
        print("  --no-metadata requires --thumbnail (nothing to do otherwise)")
        sys.exit(1)

    sys.exit(fetch_metadata(args.url, args.output_dir, args.thumbnail, args.no_metadata))


if __name__ == "__main__":
    main()
