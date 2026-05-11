# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "requests",
#   "playwright",
#   "Pillow",
# ]
# ///
"""Web screenshot capture with multi-backend routing."""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from datetime import datetime
from urllib.parse import urlparse, urlencode

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

COOKIE_CSS_PATH = Path(__file__).parent.parent / "references" / "cookie-selectors.md"
DEFAULT_VIEWPORT = (1920, 1080)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def slugify(text: str, max_len: int = 40) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:max_len].rstrip("-")


def extract_youtube_id(url: str) -> str | None:
    patterns = [
        r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([a-zA-Z0-9_-]{11})",
        r"youtube\.com/shorts/([a-zA-Z0-9_-]{11})",
    ]
    for p in patterns:
        m = re.search(p, url)
        if m:
            return m.group(1)
    return None


def load_cookie_css() -> str:
    if not COOKIE_CSS_PATH.exists():
        return ""
    text = COOKIE_CSS_PATH.read_text()
    m = re.search(r"```css\s*(.*?)```", text, re.DOTALL)
    return m.group(1).strip() if m else ""


def normalize_url(url: str) -> str:
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    return url


# ---------------------------------------------------------------------------
# YouTube thumbnail (no browser needed)
# ---------------------------------------------------------------------------


def capture_youtube_thumbnail(video_id: str, output_dir: Path) -> dict:
    import requests

    resolutions = ["maxresdefault", "sddefault", "hqdefault"]
    for res in resolutions:
        thumb_url = f"https://img.youtube.com/vi/{video_id}/{res}.jpg"
        resp = requests.get(thumb_url, timeout=15)
        if resp.status_code == 200 and len(resp.content) > 1000:
            out_path = output_dir / "screenshot.png"
            # Convert JPEG to PNG for consistency
            from PIL import Image
            from io import BytesIO

            img = Image.open(BytesIO(resp.content))
            img.save(str(out_path), "PNG")
            return {
                "url": f"https://youtube.com/watch?v={video_id}",
                "screenshot_path": str(out_path),
                "width": img.width,
                "height": img.height,
                "backend": "youtube_thumbnail",
                "timestamp": datetime.now().isoformat(),
            }
    raise RuntimeError(f"Could not fetch YouTube thumbnail for {video_id}")


# ---------------------------------------------------------------------------
# ScreenshotOne backend
# ---------------------------------------------------------------------------


def capture_screenshotone(
    url: str,
    output_dir: Path,
    api_key: str,
    viewport: tuple[int, int],
    block_cookies: bool,
    full_page: bool,
    click_selector: str | None,
) -> dict:
    import requests

    params: dict = {
        "url": url,
        "access_key": api_key,
        "format": "png",
        "viewport_width": viewport[0],
        "viewport_height": viewport[1],
        "block_ads": "true",
        "delay": "2",
    }
    if block_cookies:
        params["block_cookie_banners"] = "true"
    if full_page:
        params["full_page"] = "true"
    if click_selector:
        params["click"] = click_selector

    api_url = f"https://api.screenshotone.com/take?{urlencode(params)}"
    resp = requests.get(api_url, timeout=60)
    if resp.status_code != 200:
        raise RuntimeError(
            f"ScreenshotOne API error {resp.status_code}: {resp.text[:200]}"
        )

    out_path = output_dir / "screenshot.png"
    out_path.write_bytes(resp.content)

    from PIL import Image

    img = Image.open(str(out_path))
    return {
        "url": url,
        "screenshot_path": str(out_path),
        "width": img.width,
        "height": img.height,
        "backend": "screenshotone",
        "timestamp": datetime.now().isoformat(),
    }


# ---------------------------------------------------------------------------
# Playwright backend
# ---------------------------------------------------------------------------


def capture_playwright(
    url: str,
    output_dir: Path,
    viewport: tuple[int, int],
    actions: list[dict] | None,
    enumerate_elements: bool,
    block_cookies: bool,
    full_page: bool,
) -> dict:
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": viewport[0], "height": viewport[1]},
            device_scale_factor=2,
        )
        page = context.new_page()

        # Navigate
        page.goto(url, wait_until="networkidle", timeout=30000)

        # Block cookie banners
        if block_cookies:
            css = load_cookie_css()
            if css:
                page.add_style_tag(content=css)
                page.wait_for_timeout(500)

        # Execute interaction actions
        if actions:
            for action in actions:
                act_type = action.get("type", "")
                selector = action.get("selector", "")
                value = action.get("value", "")
                delay = action.get("delay", 1000)

                if act_type == "click" and selector:
                    page.click(selector, timeout=10000)
                elif act_type == "type" and selector and value:
                    page.fill(selector, value, timeout=10000)
                elif act_type == "scroll":
                    amount = action.get("amount", 500)
                    page.evaluate(f"window.scrollBy(0, {amount})")
                elif act_type == "hover" and selector:
                    page.hover(selector, timeout=10000)
                elif act_type == "wait":
                    page.wait_for_timeout(delay)
                elif act_type == "wait_for" and selector:
                    page.wait_for_selector(selector, timeout=10000)

                page.wait_for_timeout(delay)

        # Take screenshot
        out_path = output_dir / "screenshot.png"
        page.screenshot(path=str(out_path), full_page=full_page)

        width = page.viewport_size["width"]
        height = page.viewport_size["height"]

        # Element enumeration
        elements = None
        if enumerate_elements:
            elements = page.evaluate("""() => {
                const selectors = 'a, button, input, textarea, select, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [onclick]';
                const els = document.querySelectorAll(selectors);
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const results = [];
                els.forEach((el, i) => {
                    const rect = el.getBoundingClientRect();
                    if (rect.width === 0 || rect.height === 0) return;
                    const text = (el.textContent || '').trim().slice(0, 80);
                    const tag = el.tagName.toLowerCase();
                    const type = el.getAttribute('type') || '';
                    const placeholder = el.getAttribute('placeholder') || '';
                    const ariaLabel = el.getAttribute('aria-label') || '';

                    // Build a reliable CSS selector
                    let sel = '';
                    if (el.id) sel = '#' + el.id;
                    else if (el.name) sel = tag + '[name="' + el.name + '"]';
                    else sel = tag + ':nth-of-type(' + (i + 1) + ')';

                    results.push({
                        index: results.length,
                        tag,
                        type,
                        text: text || placeholder || ariaLabel || '',
                        selector: sel,
                        rect: {
                            x_pct: +(rect.left / vw * 100).toFixed(2),
                            y_pct: +(rect.top / vh * 100).toFixed(2),
                            width_pct: +(rect.width / vw * 100).toFixed(2),
                            height_pct: +(rect.height / vh * 100).toFixed(2),
                            center_x_pct: +((rect.left + rect.width / 2) / vw * 100).toFixed(2),
                            center_y_pct: +((rect.top + rect.height / 2) / vh * 100).toFixed(2),
                        }
                    });
                });
                return results;
            }""")

            elements_path = output_dir / "elements.json"
            elements_path.write_text(json.dumps(elements, indent=2))

        browser.close()

    from PIL import Image

    img = Image.open(str(out_path))
    manifest = {
        "url": url,
        "screenshot_path": str(out_path),
        "width": img.width,
        "height": img.height,
        "backend": "playwright",
        "timestamp": datetime.now().isoformat(),
    }
    if elements is not None:
        manifest["elements_path"] = str(output_dir / "elements.json")
        manifest["element_count"] = len(elements)

    return manifest


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description="Capture web page screenshots")
    parser.add_argument("--url", required=True, help="URL to capture")
    parser.add_argument("--output-dir", help="Output directory (auto-generated if omitted)")
    parser.add_argument(
        "--backend",
        choices=["screenshotone", "playwright", "auto"],
        default="auto",
        help="Screenshot backend",
    )
    parser.add_argument("--viewport", default="1920x1080", help="Viewport WxH")
    parser.add_argument("--actions", help="JSON array of interaction actions")
    parser.add_argument("--enumerate-elements", action="store_true", help="List interactive elements")
    parser.add_argument("--block-cookie-banners", action="store_true", help="Hide cookie banners")
    parser.add_argument("--full-page", action="store_true", help="Capture full page scroll")

    args = parser.parse_args()

    url = normalize_url(args.url)
    vw, vh = (int(x) for x in args.viewport.split("x"))
    actions = json.loads(args.actions) if args.actions else None

    # Output directory
    if args.output_dir:
        output_dir = Path(args.output_dir)
    else:
        date = datetime.now().strftime("%Y-%m-%d")
        slug = slugify(urlparse(url).netloc + "-" + urlparse(url).path)
        output_dir = Path("projects/tool-web-screenshot") / f"{date}_{slug}"

    output_dir.mkdir(parents=True, exist_ok=True)

    # --- YouTube shortcut ---
    yt_id = extract_youtube_id(url)
    if yt_id:
        manifest = capture_youtube_thumbnail(yt_id, output_dir)
        manifest_path = output_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2))
        print(json.dumps(manifest, indent=2))
        return

    # --- Backend selection ---
    api_key = os.environ.get("SCREENSHOTONE_API_KEY", "").strip()
    has_actions = bool(actions)
    needs_enumerate = args.enumerate_elements
    needs_interactive = has_actions and any(
        a.get("type") in ("type",) for a in (actions or [])
    )

    backend = args.backend
    if backend == "auto":
        if needs_interactive or needs_enumerate:
            backend = "playwright"
        elif api_key:
            backend = "screenshotone"
        else:
            backend = "playwright"

    # --- Capture ---
    if backend == "screenshotone":
        if not api_key:
            print("No SCREENSHOTONE_API_KEY set, falling back to Playwright", file=sys.stderr)
            backend = "playwright"
        else:
            click_sel = None
            if actions:
                clicks = [a["selector"] for a in actions if a.get("type") == "click" and a.get("selector")]
                click_sel = clicks[0] if clicks else None
            try:
                manifest = capture_screenshotone(
                    url, output_dir, api_key, (vw, vh),
                    args.block_cookie_banners, args.full_page, click_sel,
                )
            except Exception as e:
                print(f"ScreenshotOne failed ({e}), falling back to Playwright", file=sys.stderr)
                backend = "playwright"

    if backend == "playwright":
        manifest = capture_playwright(
            url, output_dir, (vw, vh), actions,
            args.enumerate_elements, args.block_cookie_banners, args.full_page,
        )

    # Write manifest
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
