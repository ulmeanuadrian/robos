---
name: viz-image-gen
version: 1.0.0
category: viz
description: "Direction vizuala interactiva + image generation via GPT Image 2 sau Gemini 3 Pro Image. 6-Element Framework (Subject, Framing, Lighting, Mood, Medium, Style). 10 style presets, reference analysis, multi-gen comparison sets, model recommendation."
triggers:
  - "genereaza imagine"
  - "creeaza infografic"
  - "image gen"
  - "sketchnote"
  - "comic strip"
  - "diagrama hand-drawn"
  - "visual pentru"
  - "fa o imagine"
  - "ilustreaza"
  - "draw me"
  - "generate an image"
  - "create an infographic"
  - "make an image of"
  - "GPT image"
  - "Gemini image"
negative_triggers:
  - "excalidraw"
  - "creeaza chart"
  - "bar chart"
  - "pie chart"
  - "slide deck"
  - "text-only"
context_loads:
  - context/learnings.md (section viz-image-gen)
  - skills/viz-image-gen/references/ (style presets, framework guide)
inputs:
  - intent (required: descrierea continutului vizual)
  - style (optional: preset name sau description)
  - reference (optional: imagine de inspiratie)
  - model (optional: gpt | gemini | auto)
outputs:
  - projects/viz-image-gen/{date}/{slug}/image-{N}.png
  - manifest.json (prompt folosit, model, framework decisions)
secrets_required:
  - OPENAI_API_KEY
secrets_optional:
  - GEMINI_API_KEY
runtime_dependencies:
  - python: ">=3.11"
tier: content-creator
---

# Image Generation — Interactive Visual Direction

Genereaza imagini cu GPT Image 2 sau Gemini 3 Pro Image. Valoarea skill-ului = **experienta visual direction** — ghideaza user prin 6-Element Framework sa faca decizii creative intentionate inainte sa construiesti prompt-uri model-specific.

# Dependencies

| Skill | Required? | Ce ofera | Fara |
|-------|-----------|-----------------|------------|
| `research-trending` | Optional | Cercetare technique-uri prompt, stiluri necunoscute | Fallback la references built-in |
| `tool-web-screenshot` | Optional | Captura pagina ca source pentru annotation | User furnizeaza screenshot |
| `tool-video-screenshots` | Optional | Extract frames ca source | User furnizeaza imagine |
| `tool-screenshot-annotator` | Optional | Annotations pixel-perfect | Fallback la GPT/Gemini image editing |
| `viz-excalidraw-diagram` | Optional | Excalidraw JSON → PNG | Fallback la AI diagram gen |

# Step 0: Check API Keys

- **GPT**: `OPENAI_API_KEY` in `.env` — https://platform.openai.com/
- **Gemini**: `GEMINI_API_KEY` in `.env` — gratis la https://ai.google.dev/

Cel putin unul trebuie setat. Daca ambele disponibile, recomanda per Step 4. Daca doar unul, foloseste-l + noteaza limitation.

# Step 1: Read learnings

Read `context/learnings.md` → `## viz-image-gen` pentru feedback anterior.

# Step 2: 6-Element Framework

Ghideaza user prin 6 decizii inainte de prompt:

1. **Subject** — Ce e in imagine? (persoana, obiect, scena, concept)
2. **Framing** — Cum e compus? (close-up, medium, wide, top-down, overhead)
3. **Lighting** — Ce lumina? (natural, studio, dramatic, soft, golden hour, neon)
4. **Mood** — Ce emotie? (calm, energic, mister, optimist, intimate)
5. **Medium** — Ce tehnica? (photo, illustration, 3D, sketch, watercolor, oil)
6. **Style** — Ce estetica? (minimal, retro, futuristic, brand-matched, hand-drawn)

Daca user da un preset (din 10 disponibile in `references/style-presets.md`), umple framework-ul auto + arata pentru confirm.

# Step 3: Build prompt

Construct prompt model-specific:
- **GPT Image 2**: structured natural language, max 4000 chars
- **Gemini 3 Pro Image**: similar dar acepta references mai bine

Read `references/prompt-templates.md` pentru template-uri.

# Step 4: Model Selection

| Use case | Model recomandat |
|----------|------------------|
| Fotorealism, detail uman | GPT Image 2 |
| Concept art, illustration | Gemini 3 Pro Image |
| Cu reference imagine | Gemini (better reference handling) |
| Speed prioritar | Gemini (gratis tier) |
| Production quality, brand | GPT Image 2 |

User poate override mereu.

# Step 5: Generate

```bash
python skills/viz-image-gen/lib/generate_image_gpt.py \
  --prompt "{constructed_prompt}" \
  --output projects/viz-image-gen/{date}/{slug}/image-1.png
```

Sau pentru Gemini:
```bash
python skills/viz-image-gen/lib/generate_image_gemini.py \
  --prompt "{constructed_prompt}" \
  --output projects/viz-image-gen/{date}/{slug}/image-1.png
```

# Step 6: Multi-Generation (optional)

Daca user vrea comparison, genereaza 3-4 variante:
- Variant A: prompt exact ca specified
- Variant B: lighting variation
- Variant C: framing variation
- Variant D: style variation

Salveaza fiecare la `image-{N}.png` + manifest.json cu prompt-ul per variant.

# Step 7: Save manifest

```json
{
  "prompt_final": "...",
  "model": "gpt-image-2",
  "framework_decisions": {
    "subject": "...",
    "framing": "...",
    "lighting": "...",
    "mood": "...",
    "medium": "...",
    "style": "..."
  },
  "variants": ["image-1.png", "image-2.png"],
  "preset_used": "...",
  "timestamp": "..."
}
```

# Rules

- **Mereu 6-Element Framework** inainte de prompt — NU sari peste decizii vizuale
- **Mereu confirma cu user** dupa framework decisions inainte de generare
- **Multi-gen NU default** — doar la cerere explicita
- **Reference image**: NICIODATA copia 1:1, foloseste ca inspiratie

# Self-Update

Daca user-ul flag-eaza issue — model gresit ales, prompt prost, framework skipped — actualizeaza `# Rules`.
