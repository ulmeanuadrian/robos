---
name: viz-hyperframes
version: 1.0.0
category: viz
description: "Video motion-graphics profesionale via HTML + CSS + GSAP, render MP4 cu HyperFrames. Layout-first: static design intai, apoi choreographed motion. Pentru launch teaser, social reel, animated explainer, product video, title sequence."
triggers:
  - "creeaza video"
  - "video motion graphics"
  - "video produs"
  - "launch teaser"
  - "social reel"
  - "explainer animat"
  - "promo video"
  - "video din asta"
  - "hyperframes"
  - "render video"
  - "video brand"
  - "title sequence"
  - "make a motion graphics video"
  - "product video"
  - "animated explainer"
negative_triggers:
  - "UGC video"
  - "talking head"
  - "edit video"
  - "clip extraction"
context_loads:
  - brand/design-tokens.md (full)
  - brand/voice.md (tone only)
  - context/learnings.md (section viz-hyperframes)
  - skills/viz-hyperframes/references/ (shader catalog, animation patterns)
inputs:
  - direction (required: descriere video, brief, sau outline)
  - source (optional: URL, transcript, changelog din care derive content)
  - duration (optional: secunde, default 15)
  - style (optional: preset sau mood)
outputs:
  - projects/viz-hyperframes/{date}/{name}/ (source HTML + GSAP)
  - {name}.mp4 (final render in projects dir + copie in ~/Downloads/)
runtime_dependencies:
  - "node: >=22"
  - ffmpeg
  - "npx hyperframes (auto-install)"
tier: video-producer
---

# HyperFrames Video Creator

Creeaza video-editor quality motion graphics scriind HTML + CSS + GSAP, rendered pixel-perfect MP4 via HyperFrames. Fiecare compozitie urmeaza layout-first: design static intai, apoi choreographed motion.

# Prerequisites

```bash
node --version    # Trebuie 22+
command -v ffmpeg # Trebuie FFmpeg
command -v npx    # Trebuie npx
```

Daca lipseste, guideaza user-ul prin install. Daca HyperFrames nu e initialized:

```bash
npx hyperframes init {name}
```

# Step 1: Gather direction

Pentru request-uri deschise, aduna context inainte sa commit:
- **Subject**: ce promovezi/explici/anunti
- **Audience**: cine se uita
- **Duration**: cat dureaza (15s, 30s, 60s)
- **Mood**: energetic, calm, profesional, jucaus
- **Brand**: tokens (colors, fonts) din `brand/design-tokens.md` daca exista

# Step 2: Design.md (layout-first)

Scrie `design.md` intai — descrie:
- **Slide-uri / scene-uri** in ordine cronologica
- **Layout per scena** (text positioning, image placement, decoratiuni)
- **Transitions intre scene** (cut, fade, shader transition)
- **Brand application** (cum se folosesc tokens)

Asta e DESIGN-ul static — NU animation inca. Confirm cu user inainte sa scriem cod.

# Step 3: Composition (HTML + CSS + GSAP)

Citeste `references/composition-template.md` pentru baseline:

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family={brand_font}">
  <style>
    /* CSS variables din design tokens */
    :root {
      --brand-primary: {color};
      --brand-accent: {color};
      --duration-scene-1: 3s;
    }
    /* Layout-first CSS */
  </style>
</head>
<body>
  <div class="scene scene-1">...</div>
  <div class="scene scene-2">...</div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
  <script>
    // GSAP timeline — choreographed motion, NU Math.random
    // NU repeat: -1 — fiecare animatie are durata definita
  </script>
</body>
</html>
```

# Step 4: Shader transitions (optional)

14 shader-uri built-in (vezi `references/shader-catalog.md`):
- glitch, chromatic-split, ripple-waves
- dissolve, smoke, melt
- pixelate, blur-zoom, zoom-burst
- spiral, zoom-rotate, displacement
- color-shift, kaleidoscope

Adauga shader intre scene-uri pentru tranzitii visually distinct.

# Step 5: Validate via preview

```bash
npx hyperframes preview projects/viz-hyperframes/{date}/{name}/composition.html
```

Asta deschide browser preview. Verifica:
- Animatie smooth (60fps)
- Brand colors corect
- Text readable
- Transitions match design.md
- Durata totala = target

# Step 6: Render

```bash
npx hyperframes render projects/viz-hyperframes/{date}/{name}/composition.html \
  --duration {seconds} \
  --output projects/viz-hyperframes/{date}/{name}/{name}.mp4
```

Auto-copy la `~/Downloads/{name}.mp4` (via portable-paths helper).

# Anti-Patterns

- `Math.random()` in animatii — non-deterministic, NU se reproduce
- `repeat: -1` (infinite loop) — render-ul are durata finita
- Gradient generic purple — foloseste brand colors
- Text sub 24px in video
- Animatii sub 200ms (prea rapid pentru ochi)
- Transitions de mai mult de 1.5s intre scene (audienta pierde rabdarea)

# Rules

- **Layout-first**: design.md confirmat inainte de cod
- **Brand tokens mereu** cand exista
- **NU Math.random, NU repeat: -1**
- **Durata totala = target exact** (HyperFrames render to spec)
- **Preview obligatoriu** inainte de render final (render dureaza)

# Self-Update

Daca user-ul flag-eaza issue — durata gresita, animatie choppy, brand colors lipsa — actualizeaza `# Rules`.

# Troubleshooting

- **Node < 22**: Upgrade Node (winget install OpenJS.NodeJS / brew upgrade node)
- **HyperFrames init fail**: Check internet, npx cache, sau install global `npm i -g hyperframes`
- **FFmpeg missing**: setup-python.sh il instaleaza, sau `winget install Gyan.FFmpeg`
- **Render slow**: shader-urile sunt expensive — reduce shader complexity sau scene-uri
