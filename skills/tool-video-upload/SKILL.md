---
name: tool-video-upload
version: 1.0.0
category: tool
description: "Compreseaza si upload video-uri pentru publishing YouTube via Zernio. HandBrake CLI + NVENC (rapid pe GPU NVIDIA) sau FFmpeg fallback. Zernio storage limit 500MB. Output: public URL ready pentru mkt-youtube-content-package."
triggers:
  - "upload video"
  - "comprima video"
  - "pregateste video pentru youtube"
  - "trimite video la zernio"
  - "compress video"
  - "upload to zernio"
  - "prep video for youtube"
negative_triggers:
  - "scrie continut video"
  - "edit video"
  - "extract clip"
context_loads:
  - context/learnings.md (section tool-video-upload)
inputs:
  - video_path (required: path local la fisierul video)
outputs:
  - Video URL Zernio (public URL ready pentru posting)
secrets_required:
  - ZERNIO_API_KEY
runtime_dependencies:
  - "HandBrake CLI sau FFmpeg"
tier: social-publisher
---

# Video Upload Helper

Compreseaza si upload video pentru YouTube publishing via Zernio.

# Quick Start

- **User provides**: path local la fisier video
- **Output**: video URL Zernio (sub 500MB)

**Limita Zernio**: 500MB. Toate video-urile trebuie compresate sub asta inainte sa uploadezi.

# Workflow

## Step 1: Check video size

```bash
du -m "PATH_TO_VIDEO" | cut -f1
```

- **Sub 500MB**: Skip la Step 3 (upload direct)
- **Peste 500MB**: Step 2 (comprima)

## Step 2: Comprima cu HandBrake (local)

HandBrake CLI cu NVENC GPU acceleration:

```bash
$(command -v HandBrakeCLI || echo "HandBrakeCLI") \
  -i "INPUT_VIDEO_PATH" \
  -o "OUTPUT_VIDEO_PATH" \
  -e nvenc_h264 \
  -q 26 \
  -B 128 \
  --encoder-preset medium \
  -O
```

**Quality settings (CRF-like):**

| Target Size | Quality (-q) | Use Case |
|-------------|--------------|----------|
| < 200MB | 26-28 | Video scurt (<10 min) |
| 200-400MB | 22-24 | Video mediu (10-30 min) |
| 400-500MB | 20-22 | Video lung (high quality) |

**Verifica output size:**
```bash
du -m "OUTPUT_PATH" | cut -f1
```

Daca tot peste 500MB, mareste quality value (higher = smaller file) si re-comprima.

## Step 3: Get Zernio presigned URL

```bash
curl -s -X POST "https://getlate.dev/api/v1/media/presign" \
  -H "Authorization: Bearer $ZERNIO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"filename": "video-name.mp4", "contentType": "video/mp4"}'
```

Response:
```json
{
  "uploadUrl": "https://late-media.../presigned-url",
  "publicUrl": "https://media.getlate.dev/temp/video-name.mp4"
}
```

## Step 4: Upload la Zernio

```bash
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: video/mp4" \
  --upload-file "COMPRESSED_VIDEO_PATH" \
  --progress-bar
```

`publicUrl` din Step 3 e ready pentru `mkt-youtube-content-package`.

# Tool Discovery

Auto-discover pe PATH:
- HandBrake: `command -v HandBrakeCLI`
- FFmpeg: `command -v ffmpeg`

# FFmpeg Alternative

Daca HandBrake nu e disponibil:

```bash
$(command -v ffmpeg) -i "INPUT" -c:v libx264 -crf 26 -preset medium -c:a aac -b:a 128k "OUTPUT"
```

**Note**: FFmpeg fara GPU mai lent decat HandBrake cu NVENC.

# Compression Time Estimates (NVENC)

| Original Size | Compressed | Time |
|---------------|-----------------|------|
| 500MB | ~200MB | 1-2 min |
| 1GB | ~350MB | 3-4 min |
| 1.5GB+ | ~400MB | 4-6 min |

# Integration cu YouTube Content Package

Dupa upload, public URL ready pentru `mkt-youtube-content-package`:

```
/mkt-youtube-content-package https://media.getlate.dev/temp/your-video.mp4
```

# Rules

- **Mereu sub 500MB** inainte sa uploadezi
- **NVENC preferat** pentru speed (GPU NVIDIA)
- **Presigned URLs expira in 1 ora** — upload imediat dupa get
- **Verifica output size** dupa compresie (uneori ramane peste)

# Self-Update

Daca user-ul flag-eaza issue — compresie proasta, quality drop, upload fail — actualizeaza `# Rules`.

# Troubleshooting

**HandBrake not found:**
- macOS: `brew install handbrake`
- Linux: `apt install handbrake-cli` / `dnf install HandBrake-cli`
- Windows: `winget install HandBrake.HandBrake.CLI`

**NVENC not available**: Requires NVIDIA GPU. Fallback la `-e x264` (mai lent dar merge oriunde).

**Upload fails**:
- Check file size sub 500MB
- Presigned URLs expira in 1 ora
- Verify API key correct
