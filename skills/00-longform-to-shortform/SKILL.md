---
name: 00-longform-to-shortform
version: 1.0.0
category: "00"
description: "Pipeline end-to-end automat: YouTube URL → download → transcribe → select clips → reframe (16:9→9:16) → edit (subtitle + illustrations) → render → post. Zero human-in-the-loop default (cu approve gates optionale)."
triggers:
  - "pipeline complet video"
  - "youtube la shorts"
  - "long to short"
  - "auto pipeline"
  - "creeaza short-form din video"
  - "transforma video lung in shorts"
  - "full pipeline"
  - "process video"
  - "YouTube to shorts"
  - "create short-form content from"
negative_triggers:
  - "blog article"
  - "long-form editorial"
  - "ebook"
context_loads:
  - brand/voice.md (tone pentru titles)
  - brand/design-tokens.md (highlight color subtitle)
  - context/learnings.md (section 00-longform-to-shortform)
inputs:
  - youtube_url (required)
  - clip_count (optional: default 7)
  - duration_range (optional: "45-90" sec default)
  - layout (optional: split-screen | cursor-track | face-track, default split-screen)
  - illustrate (optional: flag, illustrations via viz-image-gen)
  - post_mode (optional: skip | draft | auto-post, default skip)
outputs:
  - projects/00-longform-to-shortform/{date}/runs/{run-id}/clips/*.mp4 (final clipuri editate)
  - projects/00-longform-to-shortform/{date}/runs/{run-id}/pipeline-log.md
  - Posts publicate (daca post_mode=auto-post)
secrets_optional:
  - YOUTUBE_API_KEY
  - GROQ_API_KEY
  - ZERNIO_API_KEY
runtime_dependencies:
  - python: ">=3.11"
  - ffmpeg
  - uv
  - "OpenCV DNN models"
tier: video-producer
---

# Long-form to Short-form Pipeline

End-to-end automated: YouTube URL → 5-10 short-form clipuri 9:16 cu subtitle + (optional) illustrations + (optional) auto-post.

# Dependencies

| Skill | Required? | Faza |
|-------|-----------|--------|
| `tool-youtube` | Required | Download + transcript |
| `tool-transcription` | Required | WhisperX words-json mode |
| `vid-clip-selection` | Required | Score + select clips |
| `vid-clip-extractor` | Required | Reframe 16:9 → 9:16 |
| `vid-ffmpeg-edit` | Required | Burn subtitle + illustrations |
| `mkt-short-form-posting` | Optional | Auto-post (mode=auto-post) |
| `tool-zernio-social` | Optional | Multi-platform publish |
| `viz-image-gen` | Optional | Illustrations (--illustrate) |

# Pipeline Phases

```
1. SETUP    — Create run dir + pipeline log
2. DOWNLOAD — yt-dlp download video + thumbnail
3. TRANSCRIBE — WhisperX words-json mode
4. SELECT    — vid-clip-selection cu scoring framework
5. REFRAME   — vid-clip-extractor batch
6. EDIT      — vid-ffmpeg-edit per clip (subtitle + optional illustrations)
7. POST      — mkt-short-form-posting (daca post_mode != skip)
```

# Step 1: Setup

```
DATE       = {YYYY-MM-DD}
RUN_ID     = {video-slug}
RUN_DIR    = projects/00-longform-to-shortform/{DATE}/runs/{RUN_ID}/
```

Sub-folders:
```
RUN_DIR/
  source.mp4           # video original
  transcript.json      # words-json
  clip_definitions.json
  clips_raw/           # reframed dar fara subtitle
  clips/               # final editate
  pipeline-log.md
```

# Step 2: Download

```bash
yt-dlp -f "best[height<=1080]" -o "{RUN_DIR}/source.mp4" "{youtube_url}"
yt-dlp --skip-download --write-thumbnail -o "{RUN_DIR}/thumbnail.%(ext)s" "{youtube_url}"
```

# Step 3: Transcribe

Cheama `tool-transcription` cu `--output words-json`:
```bash
uv run skills/tool-transcription/lib/transcribe.py \
  --file "{RUN_DIR}/source.mp4" \
  --output words-json \
  --output-dir "{RUN_DIR}" \
  --language ro
```

Output: `{RUN_DIR}/transcript.json` cu `{words: [{word, start, end}, ...]}`.

# Step 4: Select Clips

Cheama `vid-clip-selection`:
- Pass `transcript.json` + `source.mp4`
- Target: `clip_count` clipuri (default 7)
- Duration range: `duration_range` (default 45-90s)

Output: `clip_definitions.json` cu start/end + scoring per clip.

**Approval gate (optional)**: Daca user a specificat interactive mode, prezinta:
```
SELECTED CLIPS (top {N}):
1. {start} - {end} ({duration}s) | score {N}/10 | "{title}"
   Hook: ... | Shareability: ...
2. ...
Continuam reframe (toate) sau adjustam? (proceed/edit)
```

# Step 5: Reframe

Cheama `vid-clip-extractor`:
- Pass `source.mp4` + `clip_definitions.json` + `layout`
- Output: `{RUN_DIR}/clips_raw/clip_01.mp4` ... `clip_N.mp4`

Toate clipurile reframed in batch. ~30-60s per clip pe CPU.

# Step 6: Edit (subtitle + optional illustrations)

Pentru fiecare clip raw, cheama `vid-ffmpeg-edit`:
- Pass `clip_raw.mp4` + portiunea relevanta din `transcript.json`
- Pass `--illustrate` daca flag setat
- Highlight color from `brand/design-tokens.md`
- Output: `{RUN_DIR}/clips/clip_NN.mp4`

Pot fi paralelizate (independent agents per clip — vezi AGENTS.md concurrency Pattern 1).

# Step 7: Post (optional)

Per mode:
- **skip** (default): nu posta, doar genereaza clipurile
- **draft**: cheama `mkt-short-form-posting` cu `--draft-only` (salveaza in Zernio drafts, NO publish)
- **auto-post**: cheama `mkt-short-form-posting` fully (publish acum)

Per clip, generate platform packages:
- YouTube Shorts: title + description + tags + first comment
- Instagram Reels: caption + hashtags first comment
- TikTok: caption + hashtags

# Pipeline Summary

Output user:
```
Long-form → Short-form Complete
-------------------------------
Source: {video title}
Clips generated: {N}/{target}
Total time: M:SS

Phase Breakdown:
  1. Download — M:SS
  2. Transcribe — M:SS
  3. Select Clips — M:SS
  4. Reframe — M:SS
  5. Edit — M:SS
  6. Post — M:SS (sau skipped)

Output dir: {RUN_DIR}/clips/
{N} clipuri ready: clip_01.mp4 ... clip_N.mp4
```

# Rules

- **Zero human-in-the-loop default** — toate fazele automate
- **Approval gate optional la Step 4** — doar daca user cere interactive
- **Pipeline log per phase** — timing + decisions
- **Layout default split-screen** — universal pentru tutorial/demo
- **Auto-post DOAR cu explicit `post_mode=auto-post`** — niciodata default

# Self-Update

Daca user-ul flag-eaza issue — clipuri proaste, reframe offset, subtitle position, post fail — actualizeaza `# Rules`.

# Troubleshooting

- **yt-dlp slow**: large videos download long; consider yt-dlp `--format-sort` pentru smaller variants
- **Transcription slow**: switch la `--model base` pe video lungi
- **Reframe slow**: OpenCV DNN single-pass — pe CPU low, considera reducere `--frame-skip`
- **Subtitle font lipsa**: instalare fonts-liberation (Linux/macOS)
- **OpenCV DNN models missing**: `bash skills/vid-clip-extractor/scripts/setup-models.sh`
