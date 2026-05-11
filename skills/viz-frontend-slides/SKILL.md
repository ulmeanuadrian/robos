---
name: viz-frontend-slides
version: 1.0.0
category: viz
description: "Genereaza prezentari HTML production-quality cu 20 principii design (research-backed). Zero dependencies, self-contained, keyboard/touch/wheel nav, viewport-safe, accessibility. Suport style presets, PPT conversion, PDF export."
triggers:
  - "construieste slides"
  - "genereaza deck"
  - "render prezentare"
  - "design slides"
  - "HTML deck"
  - "converteste PPT in HTML"
  - "build slides"
  - "generate the deck"
  - "render presentation"
  - "slide design"
  - "convert PPT to HTML"
negative_triggers:
  - "creeaza prezentare"
  - "structureaza continut"
  - "research"
context_loads:
  - brand/design-tokens.md (full)
  - brand/voice.md (tone only)
  - context/learnings.md (section viz-frontend-slides)
  - skills/viz-frontend-slides/references/ (design principles, style presets)
inputs:
  - outline (required: structured slide-by-slide content)
  - type (optional: pitch | teaching | conference | internal)
  - preset (optional: style preset name sau mood)
  - tokens (optional: brand tokens override path)
outputs:
  - HTML file self-contained (single file, no external deps in afara Google Fonts)
runtime_dependencies:
  - "python: optional, doar pentru PPT conversion (python-pptx)"
tier: content-creator
---

# Frontend Slides

Genereaza prezentari HTML self-contained care trec 20 design checks research-backed.

# Outcome

Un fisier HTML (sau `{topic}-slides.html`) care:
- Ruleaza intreg in browser cu zero dependencies
- Aplica brand design tokens din `brand/design-tokens.md`
- Trece toate 20 design principle checks (vezi `references/design-principles.md`)
- Include keyboard, touch, wheel nav + progress indicator
- Respecta `prefers-reduced-motion` si WCAG contrast
- Fit fiecare slide in un viewport (no scrolling)

# Before Generating

Citeste:
1. `references/design-principles.md` — 20 reguli cu praguri numerice. Non-negotiable.
2. `references/style-presets.md` — viewport-safe CSS base, preset catalog, CSS gotchas.
3. Brand tokens din `brand/design-tokens.md` daca exista.

# Workflow

## 1. Receive content

Skill primeste continut structurat (outline cu slide breakdown) de la orchestrator sau direct user. Inputs:
- Structured outline cu slide-by-slide content
- Presentation type (pitch, teaching, conference, internal)
- Style preset sau mood preference
- Brand tokens (din `brand/design-tokens.md` sau inline)

## 2. Resolve style

Daca user specifica preset, foloseste direct.
Daca mood, mapeaza via tabel din `references/style-presets.md`.
Daca `brand/design-tokens.md` exista, override preset colors si typography cu brand tokens. Preset = layout + animation feel; brand = visual identity.
Default neutral profesional daca nimic specificat.

## 3. Generate deck

Output: un single self-contained HTML. Must include:
- Valid HTML5, NO external JS (Google Fonts CDN OK)
- Brand colors, type, accent din design tokens
- Semantic structure (`main`, `section`, `nav`)
- Viewport-safe CSS base din `references/style-presets.md`
- CSS custom properties pentru toate theme values
- Presentation controller: keyboard, wheel, touch/swipe nav
- Intersection Observer pentru reveal animations
- Progress indicator sau slide index
- `prefers-reduced-motion` support

## 4. Pre-emit checklist (20 principii)

Fiecare slide trebuie sa treaca:

- [ ] **#1** One idea per slide. Max one headline + one supporting block.
- [ ] **#2** Glanceable in 3 secunde sau mai putin.
- [ ] **#3** Max 7 visual chunks; ideal 3-5.
- [ ] **#4** Whitespace minim 40%. Hero slides minim 60%.
- [ ] **#5** 5% safe-zone fiecare margine.
- [ ] **#6** Type pe modular scale (1.25-1.618).
- [ ] **#7** Max 4 type sizes per slide, 6 across deck.
- [ ] **#8** Body minim 24px, title minim 48px.
- [ ] **#9** Line-height 1.4-1.6 body, 1.05-1.2 display.
- [ ] **#10** Line length max 60 caractere.
- [ ] **#11** WCAG contrast minim 4.5:1 body, target 7:1.
- [ ] **#12** 60-30-10 color split.
- [ ] **#13** Un accent per slide.
- [ ] **#14** NICIODATA encode meaning doar prin hue.
- [ ] **#15** 8pt grid pentru toate spacing.
- [ ] **#16** Align toate la un grid.
- [ ] **#17** Proximity: related items in 16px, unrelated min 48px.
- [ ] **#18** Data-ink ratio minim 80% pe charts.
- [ ] **#19** F-pattern: headline + key visual top-left.
- [ ] **#20** Pick un mode (presenter sau document), stai in el.

## 5. Viewport enforcement (HARD GATE)

NU sunt exceptii:
- Fiecare `.slide` foloseste `height: 100vh; height: 100dvh; overflow: hidden;`
- Toate type + spacing scale cu `clamp()`
- Content care nu incape → split in slide-uri multiple
- NICIODATA shrink text sub readable sizes
- NICIODATA scrollbars in slide

## 6. Deliver

1. Salveaza HTML file la `projects/viz-frontend-slides/{date}/{topic}/slides.html`
2. Deschide in browser (cross-platform):
   - macOS: `open file.html`
   - Linux: `xdg-open file.html`
   - Windows: `start "" file.html` sau `Invoke-Item file.html` (PowerShell)
3. Arata path, preset, slide count, theme customization points

# PPT Conversion

Pentru PowerPoint input:
1. Python `python-pptx` extract text, images, notes (auto-detect `python3`/`python`/`py -3`)
2. Daca unavailable, cere install sau fallback manual
3. Preserve slide order, speaker notes, extracted assets
4. Run style workflow normal

# PDF Export

Cand cerut, converteste via browser print-to-PDF sau puppeteer.

# Anti-Patterns

- Hero slides generic purple-gradient
- System fonts in afara cazului cand editorial intentional
- Bullet walls sau scrolling code blocks
- Fixed-height content boxes (break pe short screens)
- Multiple accent colors per slide
- Center totul (F-pattern = top-left focus)
- Ad-hoc spacing (13px, 27px — foloseste 8pt grid)
- Mix presenter + document mode in acelasi deck

# Rules

- Brand tokens override preset colors/typography DAR NU layout principles
- 20 design principles = NON-NEGOTIABLE quality gates
- Viewport fitting = HARD GATE — split slide-uri, NICIODATA scroll
- Un accent color per slide. Un mode per deck.

# Self-Update

Daca user-ul flag-eaza issue — overflow, contrast prost, layout rupt — actualizeaza `# Rules`.
