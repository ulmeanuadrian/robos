---
name: vid-ffmpeg-edit
version: 1.0.0
category: vid
description: "Wrap FFmpeg sa burn ASS subtitles + overlay illustration PNGs pe clip 9:16 reframed. Word-level transcript (JSON/SRT/TS) → ASS captions stilizate (phrase grouping, highlight color din design-tokens), optional ilustratii via viz-image-gen, totul burn intr-un singur pass FFmpeg. ~55s per clip."
triggers:
  - "edit clip"
  - "adauga subtitrari"
  - "burn captions"
  - "ilustreaza clip"
  - "edit short-form"
  - "adauga subtitrari la clip"
  - "edit acest clip"
  - "add subtitles"
  - "add subtitles to clip"
  - "edit this clip"
negative_triggers:
  - "full pipeline"
  - "clip selection"
  - "reframe"
  - "transcribe"
  - "upload"
context_loads:
  - context/learnings.md (section vid-ffmpeg-edit)
  - brand/design-tokens.md (highlight color)
  - skills/vid-ffmpeg-edit/references/ (ffmpeg workflow, illustration overlay)
inputs:
  - clip_path (required: reframed 9:16 MP4)
  - transcript (required: JSON / SRT / TS word file)
  - illustrate (optional: flag, genereaza 4-8 illustration PNGs via viz-image-gen)
  - highlight_color (optional: override din design-tokens)
  - output (optional: path final MP4)
outputs:
  - Final MP4 cu subtitrari + (optional) illustration overlays
runtime_dependencies:
  - python: ">=3.11"
  - ffmpeg
tier: video-producer
---

# vid-ffmpeg-edit

Burn subtitrari si illustration overlays pe clip 9:16 reframed cu FFmpeg.

# Inputs

- `clip_path` — reframed 9:16 MP4 (required)
- **Transcript data** — unul din:
  - Word-level JSON (preferat): `{words: [{word, start, end}]}`
  - SRT file: converted via `srt_to_words.py`
  - TS word data file din pipeline

# Workflow

## Step 1: Convert transcript la word data

Daca input SRT:
```bash
python skills/vid-ffmpeg-edit/lib/srt_to_words.py input.srt output.json
```

Daca input JSON, skip.

## Step 2: Generate ASS subtitles

Read `references/ffmpeg-workflow.md` pentru words_to_ass logic.

ASS format:
- **Phrase grouping** — grupeaza cuvinte in fraze 3-5 cuvinte
- **Highlight color** — extras din `brand/design-tokens.md` (key `--accent` sau `--highlight`). Default daca lipsa: `#FFD700`.
- **Font size** — 80px (scalabil cu rezolutie)
- **Position** — bottom-center, safe-zone 10%

## Step 3: Generate illustrations (optional)

Daca `--illustrate` flag:
1. Analizeaza transcript pentru 4-8 momente "key visual" (concepte concrete: produse, locatii, persoane, numere)
2. Genereaza prompt per moment
3. Cheama `viz-image-gen` skill pentru fiecare → 4-8 PNGs
4. Pozitioneaza overlay-uri la top 30% din frame, fade in/out
5. Save illustration PNGs in `{output_dir}/illustrations/`

## Step 4: FFmpeg burn single-pass

Read `references/ffmpeg-workflow.md` pentru filter complex exact.

```bash
ffmpeg -i clip.mp4 -i illustration_1.png -i illustration_2.png ... \
  -filter_complex "
    [0:v]subtitles=captions.ass[base];
    [base][1:v]overlay=enable='between(t,2.5,4.5)':x=...:y=...[v1];
    [v1][2:v]overlay=enable='between(t,8.0,10.5)':x=...:y=...[vout]
  " \
  -map "[vout]" -map 0:a \
  -c:v libx264 -preset medium -crf 18 \
  -c:a copy \
  output.mp4
```

Performance: ~55s per clip (cu illustrations); ~25s fara.

## Step 5: Save output

Final MP4 la `output_path` (default: `{clip_path}_edited.mp4` adjacent).

# Rules

- **Single-pass FFmpeg** — NICIODATA cascade de FFmpeg calls (calitate degradata)
- **Highlight color din brand** — auto-pull, NU hardcode
- **Phrase grouping 3-5 cuvinte** — peste 5 hard to read la 60fps
- **Safe-zone respectat** — bottom 10% pentru subtitle, top 10% pentru illustrations
- **Illustrations OPT-IN** — default off (cost: viz-image-gen ~4-8 calls per clip)

# Self-Update

Daca user-ul flag-eaza issue — subtitle position prost, highlight color gresit, illustration timing off — actualizeaza `# Rules`.

# Troubleshooting

- **FFmpeg subtitle font lipsa**: `apt install fonts-liberation` / `brew install --cask font-liberation`
- **ASS subtitles invisible**: verifica `Style:` line in ASS file (font size, color)
- **Illustration overlay greseste timing**: verifica `enable='between(t,X,Y)'` corespunde cu transcript timestamp
- **Render slow**: reduce illustration count sau switch preset la `fast` (crf 18 → 23)
