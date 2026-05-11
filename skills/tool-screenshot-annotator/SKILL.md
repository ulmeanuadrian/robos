---
name: tool-screenshot-annotator
version: 1.0.0
category: tool
description: "Adnoteaza screenshot-uri cu cercuri numerotate + highlight boxes. Coordonate manuale, elemente din tool-web-screenshot, sau manifest pipeline. Percentage-based positioning + edge clamping. RGBA overlay pe PNG sursa. Auto-pull accent color din brand/design-tokens.md."
triggers:
  - "adnoteaza screenshot"
  - "adauga cercuri numerotate"
  - "marcheaza zona"
  - "highlight pe imagine"
  - "callout-uri pe screenshot"
  - "label screenshot"
  - "annotate this screenshot"
  - "add numbered circles"
  - "highlight this area"
  - "mark up this image"
  - "add callouts to"
negative_triggers:
  - "captureaza"
  - "fa screenshot"
  - "generare imagine"
  - "edit imagine cu AI"
  - "capture screenshot"
  - "generate image"
context_loads:
  - context/learnings.md (section tool-screenshot-annotator)
  - brand/design-tokens.md (pentru accent color "auto")
  - skills/tool-screenshot-annotator/references/default-config.json (style defaults)
inputs:
  - spec (required: path la JSON spec sau JSON inline cu annotations)
  - output (optional: path la annotated.png)
outputs:
  - projects/tool-screenshot-annotator/{date}/{name}/annotated.png
  - manifest.json (cu config_used)
runtime_dependencies:
  - python: ">=3.11"
  - uv
tier: content-creator
---

# Screenshot Annotator

Adauga cercuri numerotate si highlight boxes pe screenshot-uri.

# Setup

```bash
bash skills/tool-screenshot-annotator/scripts/setup.sh
```

# First-Run Onboarding

Verifica `references/default-config.json` pentru `"onboarded": false`. Daca false:

1. **Detect brand context**. Verifica `brand/design-tokens.md` pentru Accent color.
   - Daca exista: spune user-ului accent gasit + hex. Intreaba use sau alt.
   - Daca nu: arata default palette (warm orange #D97757, blue #4A90D9, green #4CAF50, red #E53935) si intreaba pick.

2. **Detail level**. Intreaba: "Cat detaliu vrei la annotation default?"
   - **Minimal** — doar cercuri numerotate, no highlight boxes, no legend.
   - **Standard** — cercuri + highlight boxes + legend strip. Bun pentru tutorial.
   - **Detailed** — toate, plus auto-annotate elemente interactive.

3. **Label style**. Intreaba: "Cum apar labels?"
   - **Legend** — strip numerotat sub imagine.
   - **Inline** — pill-shaped labels langa fiecare cerc direct pe imagine.

4. **Legend**. Doar daca legend style: "Arata legend key sub imaginile adnotate?" (yes/no).

5. **Circle size**. Intreaba: "Marime cerc — standard (44px) sau compact (32px)?"

6. **Save**. Scrie alegerile in `references/default-config.json`, set `"onboarded": true`. Confirm o linie.

7. **Continue** cu task-ul curent cu config nou.

Pe call-uri ulterioare, skip onboarding.

# Usage

```bash
uv run skills/tool-screenshot-annotator/lib/annotate.py \
  --spec spec.json \
  --output annotated.png
```

# Annotation Spec Format

```json
{
  "source": "/path/to/screenshot.png",
  "annotations": [
    {"type": "circle_number", "number": 1, "x_pct": 45.2, "y_pct": 30.1, "label": "Settings button"},
    {"type": "highlight_box", "x_pct": 10, "y_pct": 20, "width_pct": 30, "height_pct": 5}
  ]
}
```

Omite `accent_color` ca sa folosesti config default (auto brand color).

# Annotation Types

| Type | Z-order | Fields | Visual |
|------|---------|--------|--------|
| `circle_number` | 10 (top) | `number`, `x_pct`, `y_pct`, `label` | Accent circle, white number, drop shadow, legend entry |
| `highlight_box` | 5 (behind) | `x_pct`, `y_pct`, `width_pct`, `height_pct` | Accent border, rounded, semi-transparent fill |

**Overlap avoidance**: cercurile auto-nudge departe de alte annotations. Spec orice `accent_color`, `diameter`, `border_width`, `radius` per-annotation pentru override.

# Coordinate System

Toate pozitiile sunt percentage-based (0-100% din image dimensions). Circle numbers clamped la 5%-95% pentru edge cropping prevention.

# Input Modes

| Input | Mode |
|-------|------|
| Path imagine + coordonate Claude | Manual — Claude citeste image si determina positions |
| Path imagine + elements.json din tool-web-screenshot | Auto-target — match annotations la elemente |
| Manifest path din pipeline | Pipeline — auto-load image si elemente |

# Output

```
projects/tool-screenshot-annotator/{date}/{name}/
  annotated.png
  manifest.json    # include config_used cu resolved accent + detail level
```

# Style Config

Editeaza `references/default-config.json` pentru install-wide defaults. Fiecare spec poate override.

| Setting | Default | Values |
|---------|---------|--------|
| `accent_color` | `"auto"` | `"auto"` (pulls din brand/design-tokens.md) sau hex |
| `detail_level` | `"standard"` | `minimal` / `standard` / `detailed` |
| `circle_diameter` | 44 | Base px (auto-scale cu rezolutie) |
| `border_width` | 3 | Highlight box border thickness |
| `border_radius` | 12 | Highlight box corner rounding |
| `label_style` | `"legend"` | `legend` sau `inline` |
| `legend` | true | Show/hide legend strip |

**Priority cascade**: default-config.json < brand design tokens (pentru "auto") < spec-level values.

Mereu adauga `label` field la `circle_number` — populates legend sau inline pill.

# Dependencies

| Skill | Required? | Ce ofera |
|-------|-----------|------------------|
| `tool-web-screenshot` | Optional | Source screenshots cu element enumeration |

# Rules

- **First run**: ruleaza onboarding inainte de prima adnotare
- **Labels mereu** pentru `circle_number` (legend depinde)
- **Accent default**: "auto" — pulls din brand
- **Edge clamp**: 5-95% pentru a preveni cropping

# Self-Update

Daca user-ul flag-eaza issue — pozitionare proasta, label suprapus, accent gresit — actualizeaza `# Rules`.
