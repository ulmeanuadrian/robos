---
name: tool-transcription
version: 1.1.0
category: tool
description: "Transcribe fisiere video/audio locale cu WhisperX + word-level alignment. 2 moduri output: markdown clean (content pipelines) sau word-level JSON (subtitling, clip selection). Suport MP4, MOV, WebM, MKV, AVI, MP3, WAV, M4A, FLAC, OGG."
triggers:
  - "transcribe acest video"
  - "transcript video local"
  - "transcript fisier"
  - "din inregistrarea asta"
  - "transcript local"
  - "speech to text"
  - "video la text"
  - "extrage subtitrari"
  - "transcribe this file"
  - "from this recording"
  - "from this file"
  - "transcribe"
  - "extract captions"
negative_triggers:
  - "youtube"
  - "URL"
  - "site web"
context_loads:
  - context/learnings.md (section tool-transcription)
inputs:
  - file (required: path absolut sau relativ la video/audio)
  - output (optional: markdown | words-json, default markdown)
  - model (optional: tiny | base | small | medium | large-v3, default small)
  - language (optional: cod limba, default auto-detect)
  - device (optional: cpu | cuda, default cpu)
  - output-dir (optional: override destinatie)
outputs:
  - markdown mode → projects/00-social-content/{date}/logs/inspiration/{slug}.md
  - words-json mode → projects/00-longform-to-shortform/{date}/transcripts/{slug}.json
runtime_dependencies:
  - python: ">=3.11"
  - uv
  - ffmpeg
  - WhisperX (auto-download ~1.5GB la primul run)
tier: content-creator
---

# Tool Transcription

Transcribe fisiere video/audio locale cu **WhisperX** + word-level alignment. 2 moduri output:

| Mode | Output | Use case |
|---|---|---|
| `markdown` (default) | `.md` cu frontmatter + text curat | Content pipelines (`00-social-content`, `00-youtube-to-ebook`). Doar text. |
| `words-json` | `.json` cu `words: [{start, end, word}, ...]` | Subtitling / clip selection (`00-longform-to-shortform`, `vid-clip-selection`, `vid-ffmpeg-edit`). |

# Setup (rulat o data)

```bash
bash skills/tool-transcription/scripts/setup.sh
```

Instaleaza `uv` si `ffmpeg`. WhisperX + torch (~1.5GB) auto-download via `uv run` la prima transcribere.

# Usage

## Clean markdown (content pipelines)

```bash
uv run skills/tool-transcription/lib/transcribe.py \
  --file "{FILE_PATH}" \
  --language ro
```

Default `--output=markdown`. Scrie `{output_dir}/{slug}.md`:

```yaml
---
source_type: local_video
source_path: /path/to/video.mp4
transcribed_at: 2026-05-11
model: small
language: ro
---

## Transcript

{full transcript text, clean}
```

## Word-level JSON (subtitling / video editing)

```bash
uv run skills/tool-transcription/lib/transcribe.py \
  --file "{FILE_PATH}" \
  --language en \
  --output words-json
```

Scrie `{output_dir}/{slug}.json`:

```json
{
  "words": [
    { "start": 0.0, "end": 0.5, "word": "Hello" }
  ],
  "meta": { "model": "small", "language": "en", ... }
}
```

Pentru a converti JSON in ASS subtitles pentru FFmpeg, foloseste helper-ul `words_to_ass.py` din `skills/vid-ffmpeg-edit/lib/`.

# Optiuni

| Arg | Default | Descriere |
|-----|---------|-------------|
| `--file` | required | Path absolut sau relativ la video/audio |
| `--output` | `markdown` | `markdown` sau `words-json` |
| `--model` | `small` | `tiny` / `base` / `small` / `medium` / `large-v3` |
| `--language` | auto-detect | Cod limba (`ro`, `en`, etc.) — explicit pentru accuracy mai bun |
| `--device` | `cpu` | `cpu` sau `cuda` (GPU — mult mai rapid pe video lungi) |
| `--batch-size` | `16` | Batch size mai mare = mai rapid pe GPU; reduce pe CPU low-memory |
| `--output-dir` | rezolvat pe mode | Override destinatie |

# Model selection

| Model | Viteza | Accuracy | Cand |
|-------|-------|----------|----------|
| `tiny` | Cel mai rapid | Basic | Preview rapid |
| `base` | Rapid | Bun | Clipuri scurte < 5 min |
| `small` | Balanced | Foarte bun | Default — majoritatea cazurilor |
| `medium` | Mai lent | Excelent | Accuracy critica |
| `large-v3` | Cel mai lent | Best | Non-English, productie |

# Formate suportate

Video: MP4, MOV, WebM, MKV, AVI
Audio: MP3, WAV, M4A, FLAC, OGG

# Rules

- **Default output**: markdown clean (pentru content pipelines)
- **Mereu specifica `--language`** cand stii — auto-detect e mai prost decat explicit
- **GPU disponibil**: foloseste `--device cuda` pentru video > 10 min
- **Output-dir explicit din orchestratori**: NU lasa default cand altul orchestreaza pipeline-ul

# Self-Update

Daca user-ul flag-eaza issue — transcript prost, limba detectata gresit, model lent — actualizeaza `# Rules` cu corectia.

# Troubleshooting

- **uv install fail pe Windows**: `irm https://astral.sh/uv/install.ps1 | iex` in PowerShell
- **ffmpeg missing**: `winget install Gyan.FFmpeg` (Windows) / `brew install ffmpeg` (macOS)
- **WhisperX OOM**: Reduce `--batch-size` la 4 sau 8, sau switch la `--model base`
- **Limba detectata gresit**: Specifica `--language` explicit
- **CUDA error**: Pe Windows uneori trebuie torch CUDA build separat; fallback la `--device cpu`
