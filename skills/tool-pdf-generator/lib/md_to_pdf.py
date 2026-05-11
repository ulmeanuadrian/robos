#!/usr/bin/env python3
"""Convert markdown to a clean, minimal PDF.

Usage:
    python3 md_to_pdf.py input.md output.pdf [--css style.css]
    python3 md_to_pdf.py input.md output.pdf --theme branded --tokens design-tokens.md
    python3 md_to_pdf.py input.md output.pdf --theme branded --tokens design-tokens.md \
        --intensity heavy --logo logo.png --links "YouTube=https://...,LinkedIn=https://..."
"""

import argparse
import os
import sys

try:
    import markdown
except ImportError:
    print("ERROR: 'markdown' package not installed. Run: pip3 install markdown")
    sys.exit(1)

try:
    import weasyprint
except ImportError:
    print("ERROR: 'weasyprint' package not installed. Run: pip3 install weasyprint")
    sys.exit(1)


DEFAULT_CSS = """
@page {
    size: A4;
    margin: 2.5cm 2.5cm 3cm 2.5cm;
}

body {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #1a1a1a;
    max-width: 42em;
    margin: 0 auto;
}

h1 {
    font-size: 24pt;
    font-weight: 700;
    margin-top: 0;
    margin-bottom: 0.8em;
    line-height: 1.2;
    color: #000;
}

h2 {
    font-size: 16pt;
    font-weight: 600;
    margin-top: 2em;
    margin-bottom: 0.6em;
    line-height: 1.3;
    color: #111;
}

h3 {
    font-size: 13pt;
    font-weight: 600;
    margin-top: 1.5em;
    margin-bottom: 0.4em;
    color: #222;
}

p {
    margin-bottom: 0.8em;
    text-align: left;
    orphans: 3;
    widows: 3;
}

blockquote {
    margin: 1.5em 0;
    padding: 0.5em 1.5em;
    border-left: 3px solid #ccc;
    color: #444;
    font-style: italic;
}

code {
    font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
    font-size: 0.9em;
    background: #f5f5f5;
    padding: 0.15em 0.3em;
    border-radius: 3px;
}

pre {
    background: #f5f5f5;
    padding: 1em;
    border-radius: 4px;
    overflow-x: auto;
    font-size: 0.85em;
    line-height: 1.4;
}

pre code {
    background: none;
    padding: 0;
}

table {
    width: 100%;
    border-collapse: collapse;
    margin: 1.5em 0;
    font-size: 0.95em;
}

th, td {
    padding: 0.5em 0.8em;
    border-bottom: 1px solid #ddd;
    text-align: left;
}

th {
    font-weight: 600;
    border-bottom: 2px solid #999;
}

hr {
    border: none;
    border-top: 1px solid #ddd;
    margin: 2em 0;
}

a {
    color: #1a1a1a;
    text-decoration: underline;
}

img {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 1.5em auto;
    border-radius: 4px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.1);
}

figure {
    margin: 1.5em 0;
    text-align: center;
}

figcaption {
    font-size: 0.85em;
    color: #666;
    margin-top: 0.5em;
    font-style: italic;
}

ul, ol {
    margin-bottom: 0.8em;
    padding-left: 1.5em;
}

li {
    margin-bottom: 0.3em;
}
"""


def _build_header_html(logo_path: str | None = None, links: str | None = None) -> str:
    """Build the branded header HTML block with logo and/or links.

    links format: "Label=url,Label=url" or "Label:DisplayText=url" for custom display text.
    Examples:
        "YouTube=https://youtube.com/@foo"           -> displays "YouTube"
        "YouTube:@simonscrapes=https://youtube.com/"  -> displays "@simonscrapes"
    """
    if not logo_path and not links:
        return ""

    # Logo cell
    if logo_path:
        src = logo_path if logo_path.startswith("http") else os.path.abspath(logo_path)
        logo_cell = f'<td class="pdf-header-left"><img class="pdf-logo" src="{src}" alt="Logo"></td>'
    else:
        logo_cell = '<td class="pdf-header-left"></td>'

    # Links cell
    links_cell = '<td class="pdf-header-right"></td>'
    if links:
        link_items = []
        for pair in links.split(","):
            pair = pair.strip()
            if "=" not in pair:
                continue
            label_part, url = pair.split("=", 1)
            # Support "Label:DisplayText" syntax
            if ":" in label_part:
                _, display = label_part.split(":", 1)
            else:
                display = label_part
            link_items.append(f'<a href="{url.strip()}">{display.strip()}</a>')
        if link_items:
            links_cell = f'<td class="pdf-header-right"><span class="pdf-links">{" ".join(link_items)}</span></td>'

    return f"""<div class="pdf-header">
<table class="pdf-header-row"><tr>
{logo_cell}
{links_cell}
</tr></table>
</div>
"""


def md_to_pdf(
    input_path: str,
    output_path: str,
    css_path: str | None = None,
    theme: str = "minimal",
    tokens_path: str | None = None,
    intensity: str = "subtle",
    logo_path: str | None = None,
    links: str | None = None,
):
    """Convert a markdown file to PDF."""
    with open(input_path, "r", encoding="utf-8") as f:
        md_content = f.read()

    # Convert markdown to HTML
    html_body = markdown.markdown(
        md_content,
        extensions=["tables", "fenced_code", "smarty", "meta"],
    )

    # Load CSS — priority: explicit css file > branded theme > default minimal
    if css_path and os.path.exists(css_path):
        with open(css_path, "r", encoding="utf-8") as f:
            css = f.read()
    elif theme == "branded" and tokens_path and os.path.exists(tokens_path):
        from pdf_theme_from_tokens import generate_css
        css = generate_css(tokens_path, intensity)
    else:
        css = DEFAULT_CSS

    # Build header (only for branded theme)
    header_html = ""
    if theme == "branded":
        header_html = _build_header_html(logo_path, links)

    # Wrap in full HTML document
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <style>{css}</style>
</head>
<body>
{header_html}{html_body}
</body>
</html>"""

    # Render PDF — use input file's directory as base_url so images resolve
    input_dir = os.path.dirname(os.path.abspath(input_path))
    doc = weasyprint.HTML(string=html, base_url=input_dir)
    doc.write_pdf(output_path)
    print(f"PDF saved to: {output_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert markdown to PDF")
    parser.add_argument("input", help="Input markdown file path")
    parser.add_argument("output", help="Output PDF file path")
    parser.add_argument("--css", help="Custom CSS file path", default=None)
    parser.add_argument(
        "--theme",
        choices=["minimal", "branded"],
        default="minimal",
        help="PDF theme: minimal (default serif) or branded (from design tokens)",
    )
    parser.add_argument(
        "--tokens",
        help="Path to design-tokens.md (required when --theme branded)",
        default=None,
    )
    parser.add_argument(
        "--intensity",
        choices=["subtle", "heavy"],
        default="subtle",
        help="Branding intensity: subtle (fonts/colours only) or heavy (accent decorations)",
    )
    parser.add_argument(
        "--logo",
        help="Path or URL to logo image for the header",
        default=None,
    )
    parser.add_argument(
        "--links",
        help='Comma-separated label=url pairs, e.g. "YouTube=https://...,LinkedIn=https://..."',
        default=None,
    )
    args = parser.parse_args()

    if args.theme == "branded" and not args.tokens:
        print("ERROR: --theme branded requires --tokens <path-to-design-tokens.md>")
        sys.exit(1)

    if not os.path.exists(args.input):
        print(f"ERROR: Input file not found: {args.input}")
        sys.exit(1)

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    md_to_pdf(
        args.input, args.output, args.css,
        args.theme, args.tokens, args.intensity,
        args.logo, args.links,
    )
