---
name: 00-slides
version: 1.0.0
category: "00"
description: "Orchestrator end-to-end pentru prezentari: input detection, research, structurare continut, outline approval, render production-quality HTML slides + optional PDF export."
triggers:
  - "creeaza prezentare"
  - "creeaza slides"
  - "fa un deck"
  - "prezentare despre"
  - "slides pentru"
  - "slide deck"
  - "construieste prezentare"
  - "create a presentation"
  - "create slides"
  - "make a deck"
  - "presentation about"
  - "slides for"
  - "build a presentation"
negative_triggers:
  - "design slides only"
  - "render existing deck"
  - "research only"
context_loads:
  - brand/design-tokens.md (full)
  - brand/voice.md (tone only)
  - context/learnings.md (section 00-slides)
inputs:
  - input (required: topic, outline, transcript, sau path la fisier)
  - style (optional: preset sau mood)
  - max_slides (optional: cap, default 20)
  - pdf (optional: flag pentru PDF export)
outputs:
  - projects/00-slides/{date}/{slug}/slides.html
  - projects/00-slides/{date}/{slug}/outline.md
  - projects/00-slides/{date}/{slug}/slides.pdf (optional)
  - projects/00-slides/{date}/logs/pipeline-log.md
tier: content-creator
---

# Slides Orchestrator

End-to-end presentation creation: input detection, content structuring, outline approval, rendering, delivery.

# Workflow

## Phase 1: Input Detection

Clasifica ce a oferit user-ul:

| Input Type | Detectare | Next Step |
|------------|-----------|-----------|
| **Topic only** | Fraza scurta, no structure, no body | Phase 2a (Research) |
| **Rough outline** | Bullet-uri, section headers, notes | Phase 3 (Structure) |
| **Transcript** | Long-form text, conversational, timestamps | Phase 2b (Extract) |
| **Existing outline** | Numbered slides cu content per slide | Phase 4 (Approve) |

## Phase 2a: Research (topic only)

Cheama `research-trending` cu topic-ul. Foloseste research brief ca input pentru Phase 3.

Daca research-trending nu disponibil sau fail, cere user mai mult content sau outline.

## Phase 2b: Extract (transcript)

Pentru transcripturi peste 30 min:
- Cere user sa aleaga focus area sau key theme
- Sugereaza 2-3 angles posibile bazate pe scan rapid

Pentru transcripturi sub 30 min, extract teme principale automat.

## Phase 3: Structure Content

Construieste outline:
- **Hook slide** (1) — opening compelling
- **Context slides** (1-3) — de ce conteaza
- **Body slides** (5-15) — main argument cu support
- **Closing slides** (1-2) — implications + CTA

Per slide:
- Headline (5-9 cuvinte)
- Supporting block (1-2 propozitii)
- Optional: visual cue (diagram, chart, image suggestion)

Respect cap `max_slides` (default 20).

## Phase 4: Outline Approval

Prezinta outline-ul cu un singur AskUserQuestion:
```
OUTLINE GENERAT — {N} slides
{slide titles enumerate}
Continuam render-ul, ajustam, sau restartez? (proceed/edit/restart)
```

Daca user cere edit, aplicate modificarile + re-confirm.

## Phase 5: Render

Cheama `viz-frontend-slides` cu:
- Outline structured (din Phase 3-4)
- Style preset (din input sau mood preference)
- Brand tokens (din `brand/design-tokens.md` daca exista)
- Type detection (pitch, teaching, conference, internal)

`viz-frontend-slides` produce HTML self-contained care trece toate 20 design principle checks.

## Phase 6: PDF (optional)

Daca user a specificat `pdf=yes` sau cere explicit, converteste via:
- Browser print-to-PDF (recomandat — slide-uri preserve fidelitate)
- Sau puppeteer daca disponibil

## Phase 7: Deliver

1. Save HTML + outline la `projects/00-slides/{date}/{slug}/`
2. Save pipeline log la `projects/00-slides/{date}/logs/pipeline-log.md`
3. Auto-open in browser (`open` / `xdg-open` / `start`)
4. Arata path absolut + slide count + style preset folosit

# Dependencies

| Skill | Required? | Ce ofera | Fara |
|-------|-----------|------------------|------------|
| `viz-frontend-slides` | Required | Render HTML deck cu 20 design principles | NO fallback — fail pipeline |
| `research-trending` | Optional | Research topic pentru content | Cere user provide content/outline |

# Rules

- **Outline approval OBLIGATORIU** la Phase 4 — NICIODATA render fara confirm
- **Max slides cap respectat** — daca content > cap, split sau condense
- **Brand tokens cand exista** — NU ignore
- **Pipeline log mereu** la fiecare phase

# Self-Update

Daca user-ul flag-eaza issue — outline gresit, slides overflow, brand colors lipsa — actualizeaza `# Rules`.
