#!/usr/bin/env python3
"""Generate PDF-ready CSS from a design-tokens.md file.

Parses the markdown tables and CSS custom properties block from a design tokens
file and produces a CSS string suitable for weasyprint PDF rendering.

Usage:
    # As a module (used by md_to_pdf.py):
    from pdf_theme_from_tokens import generate_css
    css = generate_css("brand_context/design-tokens.md", intensity="heavy")

    # Standalone preview:
    python3 tools/pdf_theme_from_tokens.py brand_context/design-tokens.md [subtle|heavy]
"""

import re
import sys


def _parse_css_vars(text: str) -> dict[str, str]:
    """Extract --var: value pairs from a ```css block."""
    variables = {}
    in_block = False
    for line in text.split("\n"):
        if line.strip().startswith("```css"):
            in_block = True
            continue
        if in_block and line.strip().startswith("```"):
            break
        if in_block:
            m = re.match(r"\s*--([\w-]+)\s*:\s*(.+?)\s*;", line)
            if m:
                variables[m.group(1)] = m.group(2)
    return variables


def generate_css(tokens_path: str, intensity: str = "subtle") -> str:
    """Read a design-tokens.md file and return PDF-optimised CSS.

    intensity: "subtle" — branded fonts/colours only, white background, no decorations
               "heavy"  — accent-coloured header bar, tinted blockquotes, coloured
                          horizontal rules, accent drop caps on first paragraph
    """
    with open(tokens_path, "r", encoding="utf-8") as f:
        content = f.read()

    v = _parse_css_vars(content)

    # Fallbacks for missing tokens
    bg = v.get("bg", "#FFFFFF")
    fg = v.get("fg", "#1a1a1a")
    fg_strong = v.get("fg-strong", fg)
    fg_mid = v.get("fg-mid", "#595959")
    fg_muted = v.get("fg-muted", "#8C8C8C")
    accent = v.get("accent", "#0099FF")
    accent_hover = v.get("accent-hover", accent)
    surface = v.get("surface", "#F5F5F5")
    hairline = v.get("hairline", "#E3E3E3")
    dark_surface = v.get("dark-surface", "#262626")

    font_display = v.get("font-display", "Georgia, serif")
    font_body = v.get("font-body", "Georgia, serif")
    font_mono = v.get("font-mono", "'SF Mono', monospace")

    radius = v.get("radius", "4px")

    # --- Heavy-only extras ---
    heavy_blockquote = ""
    heavy_hr = ""
    heavy_first_p = ""
    heavy_header = ""

    if intensity == "heavy":
        heavy_blockquote = f"""
    background: {surface};
    padding: 1em 1.5em;
    border-radius: {radius};"""

        heavy_hr = f"""
    border-top: 2px solid {accent};
    opacity: 0.4;"""

        heavy_first_p = f"""
h1 + p::first-letter {{
    font-family: {font_display};
    font-size: 1.8em;
    color: {accent};
    font-weight: 300;
}}
"""
        heavy_header = f"""
.pdf-header {{
    border-bottom: 2px solid {accent};
    padding-bottom: 12pt;
    margin-bottom: 24pt;
}}
"""
    else:
        heavy_header = f"""
.pdf-header {{
    border-bottom: 1px solid {hairline};
    padding-bottom: 10pt;
    margin-bottom: 20pt;
}}
"""

    return f"""@page {{
    size: A4;
    margin: 2.5cm 2.5cm 3cm 2.5cm;
    background: {bg};
}}

body {{
    font-family: {font_body};
    font-size: 11pt;
    line-height: 1.6;
    color: {fg};
    max-width: 42em;
    margin: 0 auto;
    background: {bg};
}}

h1 {{
    font-family: {font_display};
    font-size: 24pt;
    font-weight: 300;
    margin-top: 0;
    margin-bottom: 0.8em;
    line-height: 1.1;
    letter-spacing: -0.03em;
    color: {fg_strong};
}}

h2 {{
    font-family: {font_display};
    font-size: 16pt;
    font-weight: 300;
    margin-top: 2em;
    margin-bottom: 0.6em;
    line-height: 1.1;
    letter-spacing: -0.03em;
    color: {fg_strong};
}}

h3 {{
    font-family: {font_display};
    font-size: 13pt;
    font-weight: 500;
    margin-top: 1.5em;
    margin-bottom: 0.4em;
    letter-spacing: -0.03em;
    color: {fg};
}}

h4 {{
    font-family: {font_body};
    font-size: 11pt;
    font-weight: 500;
    margin-top: 1.2em;
    margin-bottom: 0.3em;
    color: {fg};
}}

p {{
    margin-bottom: 0.8em;
    text-align: left;
    orphans: 3;
    widows: 3;
}}

{heavy_first_p}

blockquote {{
    margin: 1.5em 0;
    padding: 0.5em 1.5em;
    border-left: 3px solid {accent};
    color: {fg_mid};
    font-style: italic;{heavy_blockquote}
}}

code {{
    font-family: {font_mono};
    font-size: 0.9em;
    background: {surface};
    padding: 0.15em 0.3em;
    border-radius: {radius};
}}

pre {{
    background: {surface};
    padding: 1em;
    border-radius: {radius};
    overflow-x: auto;
    font-size: 0.85em;
    line-height: 1.4;
}}

pre code {{
    background: none;
    padding: 0;
}}

table {{
    width: 100%;
    border-collapse: collapse;
    margin: 1.5em 0;
    font-size: 0.95em;
}}

th, td {{
    padding: 0.5em 0.8em;
    border-bottom: 1px solid {hairline};
    text-align: left;
}}

th {{
    font-weight: 600;
    border-bottom: 2px solid {fg_mid};
}}

hr {{
    border: none;
    border-top: 1px solid {hairline};
    margin: 2em 0;{heavy_hr}
}}

a {{
    color: {accent};
    text-decoration: underline;
}}

img {{
    max-width: 100%;
    height: auto;
    display: block;
    margin: 1.5em auto;
    border-radius: {radius};
    box-shadow: 0 1px 4px rgba(0,0,0,0.08);
}}

figure {{
    margin: 1.5em 0;
    text-align: center;
}}

figcaption {{
    font-size: 0.85em;
    color: {fg_muted};
    margin-top: 0.5em;
    font-style: italic;
}}

ul, ol {{
    margin-bottom: 0.8em;
    padding-left: 1.5em;
}}

li {{
    margin-bottom: 0.3em;
}}

/* --- Header with logo and links --- */

{heavy_header}

.pdf-header-row {{
    width: 100%;
    border-collapse: collapse;
}}

.pdf-header-row td {{
    padding: 0;
    border: none;
    vertical-align: middle;
}}

.pdf-header-left {{
    text-align: left;
}}

.pdf-header-right {{
    text-align: right;
}}

.pdf-logo {{
    height: 28pt;
    width: auto;
    display: inline;
    margin: 0;
    border-radius: 0;
    box-shadow: none;
}}

.pdf-links {{
    font-family: {font_body};
    font-size: 8pt;
    color: {fg_muted};
}}

.pdf-links a {{
    color: {fg_mid};
    text-decoration: none;
    margin-left: 12pt;
}}

.pdf-links a:hover {{
    color: {accent};
}}
"""


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 pdf_theme_from_tokens.py design-tokens.md [subtle|heavy]")
        sys.exit(1)
    intensity = sys.argv[2] if len(sys.argv) > 2 else "subtle"
    print(generate_css(sys.argv[1], intensity))
