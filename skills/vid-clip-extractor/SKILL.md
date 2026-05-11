---
name: vid-clip-extractor
version: 1.0.0
category: vid
description: "Extract si reframe inteligent clipuri din video-uri 16:9 in format 9:16 portrait cu face-aware layouts. FFmpeg pipe rendering + OpenCV DNN face detection (ResNet-10 SSD) + HSV scene detection. 3 layouts (split-screen, cursor-track, face-track). 100% local, zero cost."
triggers:
  - "extrage clipuri"
  - "reframe video"
  - "clip extractor"
  - "portrait crop"
  - "face tracking"
  - "16:9 to 9:16"
  - "smart crop"
  - "fa shorts din video"
  - "auto reframe"
  - "extract clips"
  - "make shorts from video"
negative_triggers:
  - "select clips"
  - "edit subtitles"
  - "transcribe"
context_loads:
  - context/learnings.md (section vid-clip-extractor)
  - skills/vid-clip-extractor/references/ (layout guide, motion classification)
inputs:
  - video (required: path video 16:9 sursa)
  - clip_definitions (required: JSON cu start/end per clip)
  - layout (optional: split-screen | cursor-track | face-track, default split-screen)
  - output_dir (optional: unde salveaza clipurile reframed)
outputs:
  - Clipuri MP4 9:16 in output_dir
runtime_dependencies:
  - python: ">=3.11"
  - ffmpeg
  - ffprobe
  - "OpenCV DNN models (descarcate setup)"
tier: video-producer
---

# Clip Extractor

FFmpeg pipe-based reframing tool: 16:9 landscape → 9:16 portrait cu face-aware layout switching. 3 layout modes pentru tipuri diferite de continut. Complete local, zero cost.

# Arhitectura

Toate layout-urile foloseasc acelasi pipeline:
1. **Face detection** — OpenCV DNN ResNet-10 SSD (fiecare frame via FFmpeg rawvideo pipe)
2. **Scene detection** — HSV histogram difference (fiecare al 10-lea frame)
3. **Per-scene classification** — face_width > 10% din frame = talking-head, altfel screen-share
4. **Motion-classified smoothing** — stationary (snap to mean), panning (linear), tracking (cubic spline + gaussian)
5. **FFmpeg pipe render** — decode raw frames, numpy crop/composite, pipe to libx264

No MediaPipe. No crop_path.json intermediate. No NVENC. Single-pass detect-and-render.

# Layout Modes

| Mode | CLI flag | Best for | Ce face |
|------|----------|----------|--------------|
| **split-screen** | `--layout split-screen` (default) | Tutoriale, demo-uri, screen recordings + webcam | Top 50% = wide screen crop (9:8, opposite side to face). Bottom 50% = tight face zoom. Talking-head scenes → single full-frame 9:16 crop |
| **cursor-track** | `--layout cursor-track` | Screen recordings unde cursor ghideaza viewer | Screen-share scenes = wide 9:8 crop centered vertical. Talking-head = tight 9:16 face crop |
| **face-track** | `--layout face-track` | Talking head, vlog, direct-to-camera | Simple 9:16 crop care urmareste face cu motion-classified smoothing |

# Setup

```bash
# Install deps Python
pip install -r skills/vid-clip-extractor/lib/clip_extractor/requirements.txt

# Download OpenCV DNN models (face detection)
bash skills/vid-clip-extractor/scripts/setup-models.sh
```

Models: `deploy.prototxt` + `res10_300x300_ssd_iter_140000.caffemodel` in `skills/vid-clip-extractor/lib/clip_extractor/models/`.

# Usage

## Pipeline mode (din 00-longform-to-shortform)

```bash
PYTHONPATH="skills/vid-clip-extractor/lib" python -m clip_extractor reframe \
  --video source.mp4 \
  --clips clip_definitions.json \
  --layout split-screen \
  --output-dir output/clips/
```

## Standalone single-clip

```bash
PYTHONPATH="skills/vid-clip-extractor/lib" python -m clip_extractor reframe \
  --video source.mp4 \
  --start 124.5 --end 173.2 \
  --layout face-track \
  --output reframed-clip.mp4
```

# Performance

- ~1-2x realtime pe CPU bun (Intel i7 / Apple M1)
- Single clip 45s → ~30-60s render time
- Batch de 10 clipuri → ~5-10 minute

# Rules

- **Default layout split-screen** — universal pentru tutoriale/demos cu webcam
- **face-track DOAR pentru talking-head pure** — pe screen-share da rezultat slab
- **cursor-track NECESITA mouse vizibil** — verifica inainte de a-l recomanda
- **OpenCV DNN models OBLIGATORII** — fara ele scriptul fail

# Self-Update

Daca user-ul flag-eaza issue — crop offset, face lost, scene jumps — actualizeaza `# Rules`.

# Troubleshooting

- **OpenCV DNN models missing**: ruleaza `bash skills/vid-clip-extractor/scripts/setup-models.sh`
- **Crop offset wrong**: layout-ul probabil gresit. Try `face-track` daca content e talking-head.
- **FFmpeg slow**: presetul `medium` e default. Try `fast` pentru speed la cost de calitate.
- **Scene detection misses cuts**: ajusteaza `--scene-threshold` (default 0.4)
