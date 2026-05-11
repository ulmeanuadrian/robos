---
name: mkt-youtube-content-package
version: 1.0.0
category: content
description: "Creeaza package complet YouTube: title, description, keywords, timestamps, thumbnail concepts, posting via Zernio MCP. Pentru publish video, YouTube SEO, complete content optimization. 10-step workflow cu user approval gate."
triggers:
  - "package YouTube complet"
  - "publica video YouTube"
  - "creeaza continut youtube"
  - "youtube SEO"
  - "title description youtube"
  - "publish video"
  - "create YouTube content"
  - "youtube content package"
negative_triggers:
  - "shorts"
  - "reels"
  - "short-form"
context_loads:
  - brand/voice.md (tone only)
  - context/learnings.md (section mkt-youtube-content-package)
inputs:
  - video_path (required: path video original sau Zernio URL daca deja uploaded)
  - title_hint (optional: subiect principal)
  - target_audience (optional: override din brand/audience.md)
outputs:
  - Video publicat pe YouTube via Zernio
  - Log in projects/mkt-youtube-content-package/{date}/
secrets_required:
  - ZERNIO_API_KEY
runtime_dependencies:
  - "WhisperX via tool-transcription"
  - "HandBrake sau ffmpeg via tool-video-upload"
tier: social-publisher
---

# YouTube Content Package

Creeaza package complet YouTube: titles optimizate, descriptions, keywords, timestamps, thumbnail concepts.

# Workflow Overview

```
0. Check & compress video (sub 500MB, HandBrake daca needed)
1. Upload la Zernio storage (presigned URL)
2. Extract transcript (WhisperX via tool-transcription)
3. Create title (5 optiuni pattern-uri verificate, 60 chars max)
4. Research tags (psychologically aligned, vezi references)
5. Create description (lead magnet CTA + overview + social links + timestamps + hashtags)
6. Create first comment CTA (engagement-formatted)
7. ASK USER PENTRU THUMBNAIL (required)
8. Get user approval (show complete package)
9. Post via Zernio API
10. Log local + Supabase pentru analytics
```

# CRITICAL: Pre-Post Requirements

**NICIODATA post fara:**
1. Cere user-ului thumbnail image
2. Confirm title cu user
3. Show complete content package pentru review
4. Explicit approval pentru post

# Step 0: Check & Compress

Daca video > 500MB:
```bash
# Cheama tool-video-upload sa comprime
bash skills/tool-video-upload/lib/ -i "{video}" -o "{compressed}"
```

# Step 1: Upload la Zernio Storage

Daca video nu e deja uploaded (URL Zernio existent), cheama tool-video-upload:
```bash
# tool-video-upload returneaza publicUrl
```

# Step 2: Extract Transcript

```bash
uv run skills/tool-transcription/lib/transcribe.py --file "{video}" --output markdown
```

Output → `transcript.md`. Foloseste pentru:
- Title hints (topics cheie)
- Description summary
- Keyword extraction
- Timestamp generation pentru sections

# Step 3: Title Generation

5 optiuni, fiecare cu pattern diferit:

1. **Promise + Specific** — "Cum sa X in N minute (fara Y)"
2. **Question hook** — "De ce X nu functioneaza (si ce face)"
3. **Curiosity gap** — "Lucrul pe care toata lumea face gresit in X"
4. **Number list** — "N moduri sa X (la #N am ramas surprins)"
5. **Personal narrative** — "Am incercat X timp de N luni. Iata ce am invatat"

Max 60 chars. NO clickbait promise pe care videoul NU il livreaza.

# Step 4: Tags / Keywords

10-15 tags, format: `"AI marketing, sales automation, lead generation, ..."`

Strategie:
- 3-5 broad keywords (high search volume)
- 4-6 specific (long-tail, mai usor de ranked)
- 2-3 branded (channel name, series)

NU stuffed cu keywords irelevante.

# Step 5: Description

Structura:
```
{Hook line — 1-2 propozitii, vizibile pre-truncate}

{Lead magnet CTA — daca exista: "Download free guide at..."}

{Video overview — 2-3 paragrafe ce acopera}

{Timestamps:
0:00 - Intro
1:23 - Topic 1
...
}

{Social links}

{Hashtags — 3-5 maximum, NU spam}
```

# Step 6: First Comment CTA

Engagement-formatted:
```
👇 Quick question: {related question}

Drop your answer in replies — vreau sa stiu ce gandeste comunitatea.
```

(Comentariul auto-postat de Zernio dupa publish — boosts engagement signal.)

# Step 7: ASK USER FOR THUMBNAIL

```
Aproape gata. Pentru a posta:
1. Trimite-mi thumbnail image (1280x720, sub 2MB)
2. SAU descrie-l verbal si genereaza via viz-image-gen

Path la thumbnail? (sau "generate")
```

Daca user zice "generate", cheama `viz-image-gen` cu prompt derived din title + transcript key visuals.

# Step 8: Show package complete

```
YOUTUBE PACKAGE COMPLETE

Title: {selected}
Description preview: {first 200 chars}...
Tags: {tags}
Timestamps: {N timestamps}
First comment: {preview}
Thumbnail: {path or "generated"}

Publica acum? (yes/edit/cancel)
```

# Step 9: Post via Zernio API

```
mcp__zernio__posts_create cu:
  platforms: ["youtube"]
  content: {description}
  media_url: {publicUrl from Step 1}
  thumbnail_url: {uploaded thumbnail URL}
  platformSpecificData:
    title: {final}
    tags: {comma-separated}
    firstComment: {comment}
    visibility: "public"
  publishNow: true
```

# Step 10: Log

```yaml
# projects/mkt-youtube-content-package/{date}/{slug}/log.yaml
video_path: ...
zernio_post_id: ...
youtube_url: ...
title: ...
published_at: ...
thumbnail_source: user|generated
```

Optional Supabase log pentru analytics cross-reference (vezi `mkt-content-analytics`).

# Rules

- **NICIODATA publish fara user approval explicit la Step 8**
- **5 title options minim** — user picks (sau spune "combine 2+4")
- **Thumbnail OBLIGATORIU** — request explicit la Step 7
- **First comment** = optional dar boost engagement — recomanda mereu
- **Timestamps**: extract din transcript pe schimbari de topic majore

# Self-Update

Daca user-ul flag-eaza issue — title gresit, tags spammy, thumbnail prost, lipsa first comment — actualizeaza `# Rules`.
