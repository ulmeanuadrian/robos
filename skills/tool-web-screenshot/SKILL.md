---
name: tool-web-screenshot
version: 1.0.0
category: tool
description: "Capture screenshot-uri web cu multi-backend routing. YouTube URLs → thumbnails direct. Pagini simple → ScreenshotOne API (daca cheia exista) cu Playwright fallback. Capturi interactive → Playwright. Suport cookie banner removal, full-page scroll, viewport, enumerate elements."
triggers:
  - "screenshot site"
  - "captureaza pagina"
  - "fa screenshot la"
  - "web screenshot"
  - "screenshot URL"
  - "screenshot acesta"
  - "screenshot this website"
  - "capture this page"
  - "take a screenshot of"
  - "grab a screenshot"
negative_triggers:
  - "screenshot din video"
  - "video screenshot"
  - "extract frames"
  - "youtube"
context_loads:
  - context/learnings.md (section tool-web-screenshot)
  - skills/tool-web-screenshot/references/ (interaction patterns)
inputs:
  - url (required: URL de capturat)
  - output-dir (optional: auto in projects/tool-web-screenshot/{date}/{slug}/)
  - backend (optional: screenshotone | playwright | auto, default auto)
  - viewport (optional: dimensions, default 1920x1080)
  - actions (optional: JSON array interactiuni)
  - enumerate-elements (optional: flag — listeaza elemente interactive)
  - block-cookie-banners (optional: flag — inject CSS sa ascunda banners)
  - full-page (optional: flag — capture full scrollable)
outputs:
  - projects/tool-web-screenshot/{date}/{slug}/screenshot.png
  - projects/tool-web-screenshot/{date}/{slug}/manifest.json
  - projects/tool-web-screenshot/{date}/{slug}/elements.json (cu --enumerate-elements)
secrets_optional:
  - SCREENSHOTONE_API_KEY
runtime_dependencies:
  - python: ">=3.11"
  - uv
  - "Playwright Chromium (auto-install la primul run)"
tier: content-creator
---

# Tool Web Screenshot

Capture pagini web cu backend routing inteligent.

# Setup

```bash
bash skills/tool-web-screenshot/scripts/setup.sh
```

Instaleaza uv + Playwright Chromium (~150MB).

# Usage

```bash
uv run skills/tool-web-screenshot/lib/capture.py \
  --url "https://example.com" \
  --block-cookie-banners \
  --enumerate-elements
```

# CLI Arguments

| Arg | Default | Descriere |
|-----|---------|-------------|
| `--url` | required | URL de capturat |
| `--output-dir` | auto | Output directory |
| `--backend` | `auto` | `screenshotone`, `playwright`, sau `auto` |
| `--viewport` | `1920x1080` | Dimensiuni viewport |
| `--actions` | none | JSON array interactiuni |
| `--enumerate-elements` | false | Listeaza elemente interactive cu bounding rects |
| `--block-cookie-banners` | false | Inject CSS sa ascunda banners |
| `--full-page` | false | Capture full scrollable page |

# Backend Routing (auto mode)

| Signal | Backend |
|--------|---------|
| YouTube URL | Direct thumbnail fetch (NO browser) |
| Simple capture, no typing | ScreenshotOne API (daca cheia setata) → Playwright fallback |
| Interactive (typing, enumerate) | Playwright only |
| No API key | Mereu Playwright |

# Interaction Actions

Pass ca `--actions '[{"type":"click","selector":"#btn"},{"type":"type","selector":"input","value":"hello"}]'`

| Type | Fields | Note |
|------|--------|-------|
| `click` | `selector` | Click pe element |
| `type` | `selector`, `value` | Type intr-un field |
| `scroll` | `amount` (px) | Scroll in jos |
| `hover` | `selector` | Hover pe element |
| `wait` | `delay` (ms) | Asteapta N ms |
| `wait_for` | `selector` | Asteapta element sa apara |

# Output Format

```
projects/tool-web-screenshot/{date}/{slug}/
  screenshot.png
  manifest.json       # {url, screenshot_path, width, height, backend, timestamp}
  elements.json       # optional, cu --enumerate-elements
```

# Dependencies

| Skill | Required? | Ce ofera | Fara |
|-------|-----------|------------------|------------|
| `tool-screenshot-annotator` | Optional | Adnotare screenshot-uri cu cercuri/highlights | Screenshot-urile sunt utilizabile |

# External Services

| Service | Key | Ce activeaza | Fara |
|---------|-----|-----------------|------------|
| ScreenshotOne | `SCREENSHOTONE_API_KEY` | Screenshots cloud rapide, bot bypass, cookie/ad blocking | Fallback la Playwright local (gratis) |

# Rules

- **Default backend**: `auto` — alege optim pe baza de URL si actiuni
- **Cookie banners**: activate flag-ul pentru capturi clean de productie
- **Full page**: doar cand userul cere explicit (overhead)
- **YouTube**: NICIODATA Playwright pentru thumbnails — direct fetch e mai rapid

# Self-Update

Daca user-ul flag-eaza issue — backend prost ales, action format gresit, cookie banner persist — actualizeaza `# Rules`.

# Troubleshooting

- **Playwright Chromium missing**: `playwright install chromium` (auto-rulat de setup.sh)
- **JS-heavy page renders gol**: Adauga action `wait_for` cu selector
- **Bot protection blocks**: Setup `SCREENSHOTONE_API_KEY` (bypass)
- **Cookie banner inca apare**: Adauga `--block-cookie-banners`, sau action `click` pe accept-button
