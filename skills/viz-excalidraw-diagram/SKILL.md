---
name: viz-excalidraw-diagram
version: 1.0.1
category: viz
description: "Genereaza Excalidraw diagram JSON care fac argument vizual — nu doar box-uri label-ate. Workflows, arhitecturi, concepte, protocoale, system designs. Section-by-section build pentru large diagrams, render PNG via Playwright, loop validare pana clean output."
triggers:
  - "excalidraw"
  - "deseneaza diagrama"
  - "vizualizeaza workflow"
  - "arhitectura diagrama"
  - "system diagram"
  - "diagrama"
  - "excalidraw diagram"
  - "draw a diagram"
  - "architecture diagram"
  - "create a diagram of"
negative_triggers:
  - "inline SVG"
  - "chart"
  - "graph"
  - "slide deck"
context_loads:
  - context/learnings.md (section viz-excalidraw-diagram)
  - skills/viz-excalidraw-diagram/references/color-palette.md (brand colors)
  - skills/viz-excalidraw-diagram/references/visual-patterns.md (structural patterns)
  - skills/viz-excalidraw-diagram/references/element-templates.md (templates)
inputs:
  - concept (required: ce diagrama vrei sa argumentezi vizual)
  - style (optional: rough | clean — default rough)
  - colors (optional: override din color-palette.md)
outputs:
  - projects/viz-excalidraw-diagram/{date}/{name}/diagram.excalidraw
  - projects/viz-excalidraw-diagram/{date}/{name}/diagram.png
runtime_dependencies:
  - python: ">=3.11"
  - uv
  - "Playwright Chromium (auto-install setup.sh)"
tier: content-creator
---

# Excalidraw Diagrams

O diagrama trebuie sa argumenteze, nu sa decoreze. Fiecare forma reflecta comportamentul conceptului pe care il reprezinta — fan-out pentru one-to-many, timelines pentru secvente, convergenta pentru aggregation. Daca stergi textul si structura tot comunica ideea, diagrama isi face treaba.

# Step 0: Setup renderer

Verifica daca render pipeline e gata:

```bash
cd skills/viz-excalidraw-diagram/lib && test -d .venv && uv run python -c "from playwright.sync_api import sync_playwright; print('ready')" 2>/dev/null
```

Daca nu printeaza "ready", ruleaza setup silent:

```bash
cd skills/viz-excalidraw-diagram/lib && uv sync && uv run playwright install chromium
```

# Step 1: Read learnings + colors

Citeste `context/learnings.md` → `## viz-excalidraw-diagram` pentru feedback anterior.
Citeste `references/color-palette.md` pentru brand colors (editabil per brand).

# Step 2: Understand concept

Intreaba user-ul sa articulate ce ARGUMENT vizual vrei. NU "deseneaza X procesul Y". Vrem "vreau sa arat ca [insight specific]".

Citeste `references/visual-patterns.md` pentru pattern-uri structurale comune:
- **Fan-out** (1→N: broadcast, dispatch)
- **Convergence** (N→1: aggregation, voting)
- **Timeline** (secventa temporala)
- **Pipeline** (transformare data)
- **Hub-spoke** (centralizat)
- **Tree** (ierarhie)
- **Network** (interconectat)

# Step 3: Build section-by-section

Pentru diagrame mari, sparge in sectiuni logice. Build fiecare sectiune ca JSON Excalidraw separat:

1. Layout principal (boxes + arrows core)
2. Labels primary
3. Decorations secundare
4. Annotations / legend

Read `references/element-templates.md` pentru template-uri JSON gata pe forme.

# Step 4: Validate via render

Dupa fiecare sectiune, render la PNG:

```bash
uv run skills/viz-excalidraw-diagram/lib/render_excalidraw.py \
  --input diagram.excalidraw \
  --output diagram.png
```

View PNG-ul. Check:
- Toate labels readable
- Arrows pointeaza corect
- Spatial layout face sens
- Argument vizual ramane clear

Daca probleme, iterate JSON-ul si re-render. Cap la 3 iteratii.

# Step 5: Save

Salveaza la `projects/viz-excalidraw-diagram/{date}/{name}/`:
- `diagram.excalidraw` (JSON source, editabil)
- `diagram.png` (rendered output)

# Rules

- **Argumenteaza, nu decoreaza** — strip text test: structura singura comunica?
- **Section-by-section** pentru large diagrams
- **Validate prin render** la fiecare sectiune, NU astepta final
- **Brand colors** din `color-palette.md` — NU hardcode

# Self-Update

Daca user-ul flag-eaza issue — argument unclear, layout prost, colors gresite — actualizeaza `# Rules`.

# Troubleshooting

- **Playwright Chromium lipsa**: `uv run playwright install chromium`
- **Render produces blank PNG**: Excalidraw JSON malformed; valideaza la excalidraw.com manually
- **Brand colors not applied**: verifica `color-palette.md` schema
