---
name: mkt-short-form-posting
version: 1.0.0
category: content
description: "Posteaza video short-form (Shorts/Reels/TikTok) cu content packages platform-specific. Transcribe video, creeaza titles/descriptions/hashtags tailored per platforma, handle thumbnails, publica via Zernio API. Suport multi-platform single-request."
triggers:
  - "posteaza short"
  - "posteaza reel"
  - "post shorts"
  - "upload short"
  - "short-form"
  - "reels"
  - "post pe youtube instagram tiktok"
  - "post short"
  - "post reel"
  - "upload reel"
negative_triggers:
  - "video long-form"
  - "blog article"
  - "thread"
context_loads:
  - brand/voice.md (tone only)
  - context/learnings.md (section mkt-short-form-posting)
inputs:
  - video_path (required: path local video short-form)
  - platforms (optional: comma-separated, default "shorts,reels,tiktok")
  - title_override (optional: skip auto-generated)
outputs:
  - Posts publicate pe platforme selectate
  - Update logs in projects/00-social-content/
secrets_required:
  - ZERNIO_API_KEY
runtime_dependencies:
  - "WhisperX via tool-transcription"
tier: social-publisher
---

# Short-Form Video Posting

Posteaza continut video short-form (YouTube Shorts, Instagram Reels, TikTok) cu unique transcript-driven content per platforma.

# Workflow Overview

```
1. Transcribe video (WhisperX via tool-transcription)
2. Confirm profile (din pipeline.config.yaml)
3. Create platform-specific content package
4. Show package to user pentru approval
5. Upload video la Zernio storage (tool-video-upload)
6. Post via REST API (single multi-platform request)
7. Verify all posts succeeded
```

# Platform Algorithm Intelligence

Fiecare platforma prioritizeaza signals diferite. Content packages trebuie optimizate pentru ranking factors specifici, NU doar formatted differently.

## YouTube Shorts
- **Title**: 60 chars max, hook-first, NO clickbait verbatim
- **Description**: 200-500 chars, link in bio, hashtags 3-5
- **Tags**: comma-separated, short keywords, psychological alignment
- **Thumbnail**: NU custom (Shorts auto)
- **Ranking**: watch time, retention curve, like-to-view ratio

## Instagram Reels
- **Caption**: 1500-2200 chars, hook in first line (visible pre-truncate)
- **Hashtags**: 10-15 in first comment (NU in caption)
- **Cover**: optional, 9:16 image
- **Ranking**: shares > saves > comments > likes > views

## TikTok
- **Caption**: 150 chars max, vibe-driven, NO formal copy
- **Hashtags**: 4-7 in caption, mix general + niche
- **Sound**: native = boost (TikTok favors original audio)
- **Ranking**: completion rate > rewatches > shares > comments

# Pre-Post Requirements (CRITICAL)

Inainte sa postezi ORICE:
1. Show content package complete
2. User confirms titles per platform
3. User approves hashtag strategy
4. **Get explicit "yes, post" inainte de Zernio API call**

# Steps

## Step 1: Transcribe

```bash
uv run skills/tool-transcription/lib/transcribe.py \
  --file "{video_path}" \
  --output markdown --language ro
```

## Step 2: Generate per-platform content

Pentru fiecare platforma selectata, creeaza package:
- YouTube Shorts title (60 chars), description, tags, first comment
- Instagram caption (2200 chars cu hook in first 125), hashtags first comment
- TikTok caption (150 chars), hashtags in caption

## Step 3: Show user pentru approval

```
SHORT-FORM PACKAGE — {video filename}

[YouTube Shorts]
Title: ...
Description: ...
Tags: ...

[Instagram Reels]
Caption: ...
Hashtags (1st comment): ...

[TikTok]
Caption: ...

Aproba pentru post? (yes/edit/cancel)
```

## Step 4: Upload + post

Cheama `tool-video-upload` pentru compresie + Zernio upload → public URL.

Apoi Zernio API multi-platform:
```
mcp__zernio__posts_create cu:
  platforms: ["youtube", "instagram", "tiktok"]
  per_platform_data: {...}
  publishNow: true
```

## Step 5: Verify

Check fiecare post returneaza success. Daca un platform fail, log + raporteaza la user (NU rolled back, posts independente).

# Rules

- **NICIODATA post fara explicit user approval**
- **Transcribe primul** (driveaza content per platforma)
- **Platform algorithm awareness** — NU paste-replicat acelasi text
- **Hashtags** in locatii diferite per platforma (Reels: 1st comment, TikTok: caption)
- **Verify post-publish**: capture post_id + URL pentru fiecare

# Self-Update

Daca user-ul flag-eaza issue — caption gresit, hashtag count wrong, platform fail — actualizeaza `# Rules`.
