# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "Pillow",
# ]
# ///
"""Annotate screenshots with numbered circles and highlight boxes."""

import argparse
import json
import re
import sys
from pathlib import Path
from datetime import datetime

from PIL import Image, ImageDraw, ImageFont

SKILL_DIR = Path(__file__).parent.parent
DEFAULT_CONFIG_PATH = SKILL_DIR / "references" / "default-config.json"
FALLBACK_ACCENT = "#D97757"


# ---------------------------------------------------------------------------
# Font loading
# ---------------------------------------------------------------------------

def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    font_paths = [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/SFNSText.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
    ]
    for fp in font_paths:
        try:
            return ImageFont.truetype(fp, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


# ---------------------------------------------------------------------------
# Color parsing
# ---------------------------------------------------------------------------

def hex_to_rgba(hex_color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    h = hex_color.lstrip("#")
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return (r, g, b, alpha)


# ---------------------------------------------------------------------------
# Config loading + design token resolution
# ---------------------------------------------------------------------------

def _load_default_config() -> dict:
    """Load default-config.json, stripping documentation keys."""
    if not DEFAULT_CONFIG_PATH.exists():
        return {}
    raw = json.loads(DEFAULT_CONFIG_PATH.read_text())
    return {k: v for k, v in raw.items() if not k.startswith("_")}


def _resolve_accent_from_tokens() -> str | None:
    """Try to read the Accent hex from brand_context/design-tokens.md."""
    # Search upward from skill dir to find brand_context
    for base in [Path.cwd(), SKILL_DIR.parent.parent.parent]:
        tokens_path = base / "brand_context" / "design-tokens.md"
        if tokens_path.exists():
            text = tokens_path.read_text()
            # Match "| Accent | `#XXXXXX` |" in the colour table
            m = re.search(r"\|\s*Accent\s*\|\s*`(#[0-9A-Fa-f]{6})`", text)
            if m:
                return m.group(1)
    return None


def resolve_config(spec: dict) -> dict:
    """Merge default config < spec-level overrides. Resolve 'auto' accent."""
    defaults = _load_default_config()

    # Spec values override defaults
    config = {**defaults}
    for key in ["accent_color", "detail_level", "circle_diameter",
                "border_width", "border_radius", "legend", "label_style"]:
        if key in spec:
            config[key] = spec[key]

    # Resolve "auto" accent color
    accent = config.get("accent_color", FALLBACK_ACCENT)
    if accent == "auto":
        brand_accent = _resolve_accent_from_tokens()
        config["accent_color"] = brand_accent or FALLBACK_ACCENT
    elif not accent.startswith("#"):
        config["accent_color"] = FALLBACK_ACCENT

    return config


# ---------------------------------------------------------------------------
# Scaling + overlap detection
# ---------------------------------------------------------------------------

def _scale(base: int, img_w: int, ref_w: int = 1920) -> int:
    """Scale a pixel value proportionally to image width."""
    return max(1, int(base * img_w / ref_w))


def _circle_rect(cx: int, cy: int, r: int) -> tuple[int, int, int, int]:
    """Return (x1, y1, x2, y2) bounding box for a circle."""
    return (cx - r, cy - r, cx + r, cy + r)


def _rects_overlap(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> bool:
    """Check if two (x1, y1, x2, y2) rectangles overlap."""
    return a[0] < b[2] and a[2] > b[0] and a[1] < b[3] and a[3] > b[1]


def _nudge_circle(
    cx: int, cy: int, r: int,
    placed: list[tuple[int, int, int, int]],
    img_w: int, img_h: int,
    max_attempts: int = 8,
) -> tuple[int, int]:
    """Try to nudge a circle so it doesn't overlap already-placed annotations.
    Tries 8 compass directions at increasing distances."""
    rect = _circle_rect(cx, cy, r)
    if not any(_rects_overlap(rect, p) for p in placed):
        return cx, cy

    step = r  # nudge by one radius at a time
    directions = [
        (1, 0), (-1, 0), (0, 1), (0, -1),
        (1, -1), (-1, -1), (1, 1), (-1, 1),
    ]
    for mult in range(1, max_attempts + 1):
        for dx, dy in directions:
            nx = cx + dx * step * mult
            ny = cy + dy * step * mult
            # Keep within image bounds (with margin)
            margin = r + 4
            nx = max(margin, min(img_w - margin, nx))
            ny = max(margin, min(img_h - margin, ny))
            candidate = _circle_rect(nx, ny, r)
            if not any(_rects_overlap(candidate, p) for p in placed):
                return nx, ny
    # All nudges failed — return original position (better than dropping it)
    return cx, cy


# ---------------------------------------------------------------------------
# Drawing primitives
# ---------------------------------------------------------------------------

def draw_highlight_box(
    draw: ImageDraw.ImageDraw,
    img_w: int,
    img_h: int,
    x_pct: float,
    y_pct: float,
    width_pct: float,
    height_pct: float,
    accent: str,
    border_width: int = 3,
    radius: int = 12,
) -> tuple[int, int, int, int]:
    x = int(x_pct / 100 * img_w)
    y = int(y_pct / 100 * img_h)
    w = int(width_pct / 100 * img_w)
    h = int(height_pct / 100 * img_h)

    border_width = _scale(border_width, img_w)
    radius = _scale(radius, img_w)

    fill_color = hex_to_rgba(accent, alpha=25)
    border_color = hex_to_rgba(accent)

    draw.rounded_rectangle(
        [x, y, x + w, y + h],
        radius=radius,
        fill=fill_color,
    )
    draw.rounded_rectangle(
        [x, y, x + w, y + h],
        radius=radius,
        outline=border_color,
        width=border_width,
    )
    return (x, y, x + w, y + h)


def draw_circle_number(
    draw: ImageDraw.ImageDraw,
    img_w: int,
    img_h: int,
    x_pct: float,
    y_pct: float,
    number: int,
    accent: str,
    placed: list[tuple[int, int, int, int]],
    diameter: int = 44,
    label: str = "",
    label_style: str = "legend",
    future_rects: list[tuple[int, int, int, int]] | None = None,
    pill_obstacles: list[tuple[int, int, int, int]] | None = None,
) -> tuple[int, int, int, int]:
    # Clamp to 5%-95%
    x_pct = max(5.0, min(95.0, x_pct))
    y_pct = max(5.0, min(95.0, y_pct))

    cx = int(x_pct / 100 * img_w)
    cy = int(y_pct / 100 * img_h)
    diameter = _scale(diameter, img_w)
    r = diameter // 2
    shadow_offset = _scale(2, img_w)
    border_w = _scale(2, img_w)

    # Nudge away from overlapping annotations
    cx, cy = _nudge_circle(cx, cy, r, placed, img_w, img_h)

    # Drop shadow
    shadow_color = (0, 0, 0, 77)
    draw.ellipse(
        [cx - r + shadow_offset, cy - r + shadow_offset,
         cx + r + shadow_offset, cy + r + shadow_offset],
        fill=shadow_color,
    )

    # Main circle
    fill_color = hex_to_rgba(accent)
    draw.ellipse(
        [cx - r, cy - r, cx + r, cy + r],
        fill=fill_color,
    )

    # White border
    draw.ellipse(
        [cx - r, cy - r, cx + r, cy + r],
        outline=(255, 255, 255, 255),
        width=border_w,
    )

    # Number text
    font = load_font(int(diameter * 0.5))
    text = str(number)
    bbox = font.getbbox(text)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = cx - tw // 2
    ty = cy - th // 2 - bbox[1]
    draw.text((tx, ty), text, fill=(255, 255, 255, 255), font=font)

    # Inline label — draw a pill with text next to the circle
    pill_rect: tuple[int, int, int, int] | None = None
    if label and label_style == "inline":
        label_font = load_font(int(diameter * 0.38))
        lb = label_font.getbbox(label)
        lw = lb[2] - lb[0]
        lh = lb[3] - lb[1]
        pad_x = _scale(8, img_w)
        pad_y = _scale(4, img_w)
        pill_w = lw + pad_x * 2
        pill_h = lh + pad_y * 2
        pill_r = pill_h // 2
        gap = _scale(6, img_w)

        # Build obstacle list from circles/pills only (not highlight boxes) + future circles
        all_obstacles = list(pill_obstacles) if pill_obstacles else []
        if future_rects:
            all_obstacles.extend(future_rects)

        # Try placement positions around the circle, with increasing offsets
        pad = _scale(6, img_w)  # padding between pill rects
        candidates = []
        for y_off in [0, -(pill_h + gap), (pill_h + gap), -(pill_h + gap) * 2, (pill_h + gap) * 2]:
            # Right of circle
            candidates.append((cx + r + gap, cy - pill_h // 2 + y_off))
            # Left of circle
            candidates.append((cx - r - gap - pill_w, cy - pill_h // 2 + y_off))

        best_px, best_py = candidates[0]  # fallback
        found = False
        for cpx, cpy in candidates:
            # Check image bounds
            if cpx < 0 or cpx + pill_w > img_w or cpy < 0 or cpy + pill_h > img_h:
                continue
            # Add padding around candidate for overlap check
            padded = (cpx - pad, cpy - pad, cpx + pill_w + pad, cpy + pill_h + pad)
            if not any(_rects_overlap(padded, p) for p in all_obstacles):
                best_px, best_py = cpx, cpy
                found = True
                break
        if not found:
            # Clamp to image bounds at least
            best_px = max(0, min(img_w - pill_w, best_px))
            best_py = max(0, min(img_h - pill_h, best_py))

        px, py = best_px, best_py
        pill_rect = (px, py, px + pill_w, py + pill_h)

        # Pill background with shadow
        draw.rounded_rectangle(
            [px + 1, py + 1, px + pill_w + 1, py + pill_h + 1],
            radius=pill_r, fill=(0, 0, 0, 50),
        )
        draw.rounded_rectangle(
            [px, py, px + pill_w, py + pill_h],
            radius=pill_r, fill=hex_to_rgba(accent, alpha=220),
        )
        # Label text
        draw.text(
            (px + pad_x, py + pad_y - lb[1]),
            label, fill=(255, 255, 255, 255), font=label_font,
        )

    # Return bounding rect that covers both circle and pill label
    circle = _circle_rect(cx, cy, r)
    if pill_rect:
        return (
            min(circle[0], pill_rect[0]),
            min(circle[1], pill_rect[1]),
            max(circle[2], pill_rect[2]),
            max(circle[3], pill_rect[3]),
        )
    return circle


# ---------------------------------------------------------------------------
# Legend strip
# ---------------------------------------------------------------------------

def draw_legend(
    img: Image.Image,
    annotations: list[dict],
    accent: str,
    img_w: int,
) -> Image.Image:
    """Append a legend strip below the image listing what each number points to."""
    # Collect only circle_number annotations that have a label
    legend_items = [
        a for a in annotations
        if a.get("type") == "circle_number" and a.get("label")
    ]
    if not legend_items:
        return img

    legend_items.sort(key=lambda a: a["number"])

    # Sizing
    padding = _scale(20, img_w)
    circle_d = _scale(28, img_w)
    circle_r = circle_d // 2
    font_size = _scale(16, img_w)
    line_height = max(circle_d, font_size) + _scale(12, img_w)
    top_rule = _scale(2, img_w)

    legend_h = top_rule + padding + line_height * len(legend_items) + padding

    # Create legend canvas
    legend = Image.new("RGBA", (img_w, legend_h), (255, 255, 255, 255))
    draw = ImageDraw.Draw(legend)

    # Top divider line
    rule_color = hex_to_rgba(accent, alpha=60)
    draw.rectangle([0, 0, img_w, top_rule], fill=rule_color)

    font = load_font(font_size)
    y = top_rule + padding

    for item in legend_items:
        num = item["number"]
        label = item["label"]
        item_accent = item.get("accent_color", accent)
        fill = hex_to_rgba(item_accent)

        cx = padding + circle_r
        cy = y + line_height // 2

        # Mini circle
        draw.ellipse(
            [cx - circle_r, cy - circle_r, cx + circle_r, cy + circle_r],
            fill=fill,
        )
        # Number in circle
        num_font = load_font(int(circle_d * 0.5))
        num_text = str(num)
        nb = num_font.getbbox(num_text)
        ntw = nb[2] - nb[0]
        draw.text(
            (cx - ntw // 2, cy - (nb[3] - nb[1]) // 2 - nb[1]),
            num_text,
            fill=(255, 255, 255, 255),
            font=num_font,
        )

        # Label text
        text_x = padding + circle_d + _scale(12, img_w)
        tb = font.getbbox(label)
        text_y = cy - (tb[3] - tb[1]) // 2 - tb[1]
        draw.text((text_x, text_y), label, fill=(50, 50, 50, 255), font=font)

        y += line_height

    # Stitch image + legend vertically
    combined = Image.new("RGBA", (img_w, img.height + legend_h))
    combined.paste(img, (0, 0))
    combined.paste(legend, (0, img.height))
    return combined


# ---------------------------------------------------------------------------
# Main annotation pipeline
# ---------------------------------------------------------------------------

def annotate(spec: dict, output_path: Path) -> dict:
    source_path = spec["source"]
    annotations = spec.get("annotations", [])

    # Resolve config: default-config.json < spec-level overrides < brand tokens
    config = resolve_config(spec)
    accent = config["accent_color"]
    detail = config.get("detail_level", "standard")
    show_legend = config.get("legend", True)
    label_style = config.get("label_style", "legend")
    default_diameter = config.get("circle_diameter", 44)
    default_border_w = config.get("border_width", 3)
    default_radius = config.get("border_radius", 12)

    # Filter annotations based on detail level
    if detail == "minimal":
        # Circles only, no highlight boxes, no legend
        annotations = [a for a in annotations if a.get("type") == "circle_number"]
        show_legend = False
    # "standard" and "detailed" keep everything as-is

    # Load source image
    img = Image.open(source_path).convert("RGBA")
    img_w, img_h = img.size

    # Create transparent overlay
    overlay = Image.new("RGBA", (img_w, img_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # Sort by z-order: highlight_box (5) first, circle_number (10) on top
    z_order = {"highlight_box": 5, "circle_number": 10}
    sorted_annotations = sorted(
        annotations,
        key=lambda a: z_order.get(a.get("type", ""), 10),
    )

    # Track placed rects separately: boxes for circle nudging, circles for pill avoidance
    placed: list[tuple[int, int, int, int]] = []
    circle_placed: list[tuple[int, int, int, int]] = []

    # Pre-compute circle center positions so pill placement can avoid future circles
    future_circles: list[tuple[int, int, int, int]] = []
    for ann in sorted_annotations:
        if ann.get("type") == "circle_number":
            d = _scale(ann.get("diameter", default_diameter), img_w)
            fcr = d // 2
            fcx = int(max(5.0, min(95.0, ann["x_pct"])) / 100 * img_w)
            fcy = int(max(5.0, min(95.0, ann["y_pct"])) / 100 * img_h)
            future_circles.append(_circle_rect(fcx, fcy, fcr))

    for ann in sorted_annotations:
        ann_type = ann.get("type", "")
        if ann_type == "highlight_box":
            rect = draw_highlight_box(
                draw, img_w, img_h,
                ann["x_pct"], ann["y_pct"],
                ann["width_pct"], ann["height_pct"],
                ann.get("accent_color", accent),
                ann.get("border_width", default_border_w),
                ann.get("radius", default_radius),
            )
            placed.append(rect)
        elif ann_type == "circle_number":
            rect = draw_circle_number(
                draw, img_w, img_h,
                ann["x_pct"], ann["y_pct"],
                ann["number"],
                ann.get("accent_color", accent),
                placed,
                ann.get("diameter", default_diameter),
                label=ann.get("label", ""),
                label_style=label_style,
                future_rects=future_circles,
                pill_obstacles=circle_placed,
            )
            placed.append(rect)
            circle_placed.append(rect)

    # Composite overlay onto source
    result = Image.alpha_composite(img, overlay)

    # Append legend strip if enabled and label_style is "legend" (inline labels are on-image)
    if show_legend and label_style == "legend":
        result = draw_legend(result, annotations, accent, img_w)

    result = result.convert("RGB")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    result.save(str(output_path), "PNG")

    return {
        "source": source_path,
        "annotated_path": str(output_path),
        "width": img_w,
        "height": result.height,
        "annotation_count": len(annotations),
        "legend_items": len([a for a in annotations if a.get("type") == "circle_number" and a.get("label")]),
        "config_used": {
            "accent_color": accent,
            "detail_level": detail,
            "legend": show_legend,
        },
        "timestamp": datetime.now().isoformat(),
    }


def main():
    parser = argparse.ArgumentParser(description="Annotate screenshots")
    parser.add_argument("--spec", required=True, help="JSON spec file path")
    parser.add_argument("--output", help="Output PNG path (default: auto)")

    args = parser.parse_args()

    spec = json.loads(Path(args.spec).read_text())

    if args.output:
        output_path = Path(args.output)
    else:
        date = datetime.now().strftime("%Y-%m-%d")
        source_stem = Path(spec["source"]).stem
        output_dir = Path("projects/tool-screenshot-annotator") / f"{date}_{source_stem}"
        output_path = output_dir / "annotated.png"

    manifest = annotate(spec, output_path)

    # Write manifest
    manifest_path = output_path.parent / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))

    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
