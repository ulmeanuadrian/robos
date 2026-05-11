#!/usr/bin/env python3
"""Convert carousel slide images to a single PDF for LinkedIn publishing."""
import sys
import argparse
from pathlib import Path


def slides_to_pdf(slug_dir: str, output: str) -> None:
    try:
        from PIL import Image
    except ImportError:
        print("ERROR: Pillow not installed. Run: pip install Pillow")
        sys.exit(1)

    slug_path = Path(slug_dir)
    slides = sorted(
        slug_path.glob("slide-*.png"),
        key=lambda p: int(p.stem.split("-")[1])
    )

    if not slides:
        print(f"ERROR: No slide-N.png files found in {slug_dir}")
        sys.exit(1)

    images = [Image.open(s).convert("RGB") for s in slides]
    first, rest = images[0], images[1:]
    first.save(output, save_all=True, append_images=rest)
    print(f"PDF created: {output} ({len(images)} pages)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Convert carousel slides to PDF"
    )
    parser.add_argument("slug_dir", help="Directory containing slide-N.png files")
    parser.add_argument("--output", required=True, help="Output PDF path")
    args = parser.parse_args()
    slides_to_pdf(args.slug_dir, args.output)
