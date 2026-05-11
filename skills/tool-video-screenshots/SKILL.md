---
name: tool-video-screenshots
version: 1.0.0
category: tool
description: "Extract screenshot-uri inteligente din video-uri YouTube la momente vizuale cheie. 2 moduri: scene-detect (automat via ffmpeg) sau timestamp (lista manuala). Claude review candidates pe baza transcript, alege 2-10 frames + scrie caption-uri."
triggers:
  - "screenshot din video"
  - "extrage frames"
  - "video screenshots"
  - "captureaza slide-uri din video"
  - "key moments din video"
  - "frames din"
  - "screenshot from video"
  - "extract frames"
  - "grab frames from"
negative_triggers:
  - "video editing"
  - "clip extraction"
  - "thumbnail"
  - "web screenshot"
context_loads:
  - context/learnings.md (section tool-video-screenshots)
  - skills/tool-video-screenshots/references/ (frame selection heuristics)
inputs:
  - url (required: YouTube URL)
  - mode (optional: scene-detect | timestamp, default scene-detect)
  - timestamps (timestamp mode: comma-separated "HH:MM:SS")
  - max-frames (scene-detect: cap pe candidate frames, default 15)
  - output-dir (optional: auto)
outputs:
  - projects/tool-video-screenshots/{date}/{video-slug}/frames/*.png
  - manifest.json (timestamp + frame_path + caption per frame selectat)
  - README.md (sumar cu inline frame references)
runtime_dependencies:
  - python: ">=3.11"
  - ffmpeg
  - yt-dlp
tier: content-creator
---

# Video Screenshots Tool

Extract key frames din video-uri YouTube. 2 moduri:
- **Scene-detect** — ffmpeg gaseste tranzitii vizuale automat
- **Timestamp** — specifici timpi exacti

Dupa extract, Claude review candidate frames vs transcript, selecteaza best 2-10, scrie caption per frame.

# Step 0: Setup (rulat o data)

```bash
bash skills/tool-video-screenshots/scripts/setup.sh
```

Verifica ffmpeg + yt-dlp. Skip pe call-uri ulterioare daca ambele exista.

# Step 1: Determina mode

| Cerere | Mode |
|---------|------|
| "Screenshots din [URL]" | Scene-detect (default) |
| "Frames la 2:35, 9:49, 15:00" | Timestamp |
| Alt skill cere frames | Pipeline — returneaza manifest path |

# Step 2: Extract candidate frames

**Scene-detect:**
```bash
python3 skills/tool-video-screenshots/lib/extract_frames.py \
  "<url>" --scene-detect --max-frames 15 --output-dir /tmp/frames
```

**Timestamp:**
```bash
python3 skills/tool-video-screenshots/lib/extract_frames.py \
  "<url>" --timestamps "00:02:35,00:09:49,00:15:00" --output-dir /tmp/frames
```

Script output: `manifest.json` cu candidate frames + timestamp.

# Step 3: AI Selection Pass

Citeste `references/frame-selection-guide.md` pentru heuristics.

**Daca user a specificat topics** (ex: "screenshots despre arhitectura"):
1. Fetch transcript via `tool-youtube` — required pentru topic filtering
2. Scan transcript pentru segmente discutand topics-urile cerute
3. Read manifest si view fiecare candidate frame
4. Keep doar frames a caror timestamp pica in/aproape de segment topic-relevant SI continutul vizual matcheaza topic-ul
5. Daca NICI un candidate match topic, spune explicit — NU force-pick frame neasociat
6. Scrie captions topic-focused

**No topics specified (default):**
1. Read manifest si view fiecare candidate
2. Daca transcript disponibil, cross-reference timestamps cu spoken content
3. Selecteaza best 2-10 frames pe baza distinctness vizual si relevanta
4. Caption per frame ce arata viewer-ul si de ce conteaza

Sterge frames neselectate.

# Step 4: Save output

Copy selected frames la `projects/tool-video-screenshots/{date}/{video-slug}/frames/`.

Manifest final:
```json
[
  {
    "timestamp": "00:02:35",
    "frame_path": "frames/frame_00_02_35.png",
    "caption": "Dashboard cu main analytics view, 3 KPI cards"
  }
]
```

Scrie `README.md` cu sumar video si lista frames + caption.

# Step 5: Feedback

Daca standalone: "Am frame-urile. Vrei sa ajustez selectia sau captions?"

Log in `context/learnings.md` → `## tool-video-screenshots`.

# Rules

- **Default**: scene-detect, max 15 candidates
- **Topic filtering**: REQUIRED fetch transcript inainte
- **Selection**: max 10 frames final
- **Captions topic-focused** cand topic specified

# Self-Update

Daca user-ul flag-eaza issue — frames gresite, selectie proasta — actualizeaza `# Rules`.

# Troubleshooting

- **ffmpeg missing**: `winget install Gyan.FFmpeg` / `brew install ffmpeg`
- **yt-dlp missing**: scripts/setup.sh auto-install
- **Scene-detect prea multe transitii**: Reduce `--scene-threshold` (default 0.4)
- **Video private/age-gated**: yt-dlp poate cere cookies; user provide direct URL
