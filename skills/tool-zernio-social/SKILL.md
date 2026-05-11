---
name: tool-zernio-social
version: 1.0.0
category: tool
description: "Posteaza pe social media via Zernio MCP. 13 platforme: Twitter, Instagram, LinkedIn, TikTok, YouTube, Facebook, Pinterest, Threads, Bluesky, Google Business, Telegram, Snapchat, Reddit. Suport publish now, draft, scheduled."
triggers:
  - "posteaza pe"
  - "scheduleaza post"
  - "social media"
  - "publica pe"
  - "cross-post"
  - "publica pe twitter"
  - "publica pe instagram"
  - "publica pe linkedin"
  - "publica pe youtube"
  - "publica pe tiktok"
  - "publica pe facebook"
  - "publica pe threads"
  - "publica pe bluesky"
  - "post to"
  - "schedule post"
  - "publish to"
  - "upload to"
negative_triggers:
  - "scrie continut"
  - "creeaza post"
  - "draft only"
context_loads:
  - context/learnings.md (section tool-zernio-social)
  - skills/tool-zernio-social/references/api-examples.md (full curl examples)
inputs:
  - content (required: text post)
  - platform (required: twitter | instagram | linkedin | tiktok | youtube | facebook | threads | bluesky | reddit | pinterest | telegram | snapchat | google-business)
  - media_url (optional: imagine sau video)
  - schedule (optional: ISO timestamp pentru scheduled)
  - draft (optional: flag — salveaza ca draft fara publish)
outputs:
  - Post ID + URL (return inline)
  - Status update in calling context
secrets_required:
  - ZERNIO_API_KEY
tier: social-publisher
---

# Zernio Social Media Posting

Posteaza si scheduleaza continut pe platforme social media via Zernio API si MCP tools.

# Configuration

**API Key**: `ZERNIO_API_KEY` in `.env`

**Connected Accounts**: Configureaza la https://zernio.com/dashboard. Foloseste `mcp__zernio__accounts_list` pentru a descoperi connected account IDs.

# CRITICAL: Pre-Post Requirements

Inainte sa postezi ORICE content, MUST:

1. **Ask for thumbnail** (pentru YouTube/video content)
2. **Confirm title** cu user
3. **Show content package** pentru review
4. **Get explicit approval** inainte de post

**NICIODATA nu posta fara confirmarea user-ului.**

# Posting Workflow

## Step 1: Prepare content

Pentru fiecare platforma, prepare fields:

| Platforma | Required | Optional |
|----------|----------|----------|
| YouTube | title, content (description), media_url | tags, firstComment |
| LinkedIn | content | media_urls |
| Twitter | content | media_urls |
| Instagram | content, media_url | — |
| TikTok | content, media_url | — |

## Step 2: Ask user for missing items

**Mereu intreaba:**
- Thumbnail image (YouTube/video posts)
- Confirmare title
- Edits la description/content

Foloseste AskUserQuestion pentru confirm.

## Step 3: Post via Zernio API

Citeste `references/api-examples.md` pentru curl examples complete: YouTube, LinkedIn, threads, cross-posting, media upload.

# YouTube-Specific Fields

Cand postezi YouTube via REST API, foloseste `platformSpecificData`:

| Field | Descriere |
|-------|-------------|
| title | Video title (required) |
| visibility | public, private, unlisted |
| tags | Comma-separated keywords |
| firstComment | Auto-posted comment dupa publish |

**Tags format**: `"AI marketing, sales automation, lead generation"`

# Scheduling

| Mode | Parameter |
|------|-----------|
| Publish now | `"publishNow": true` |
| Draft | `"isDraft": true` |
| Schedule | `"scheduledFor": "2026-01-28T15:00:00Z"` |

# Platforme Suportate

Twitter/X, Instagram, LinkedIn, TikTok, YouTube, Facebook, Pinterest, Reddit, Threads, Bluesky, Google Business, Telegram, Snapchat

# Error Handling

| Error | Solutie |
|-------|----------|
| "Account not found" | Verify account ID match cu connected account |
| "Invalid media" | Check file size (<500MB video) si format |
| "Rate limited" | Wait si retry |

# Checklist Inainte de Post

- [ ] Content prepared si reviewed
- [ ] Title confirmed (YouTube)
- [ ] Tags formatted cu virgule (YouTube)
- [ ] Thumbnail requested/confirmed (YouTube)
- [ ] First comment CTA ready (YouTube)
- [ ] User approved posting

# Rules

- **NICIODATA nu posta fara user confirmation explicit**
- **YouTube videos**: ALWAYS ask thumbnail + title confirm
- **Mereu show content package complete** inainte de post
- **Capture post_id + post_url** dupa publish pentru logging

# Self-Update

Daca user flag-eaza issue — post pe wrong account, format gresit, scheduling broken — actualizeaza `# Rules`.

# References

| File | Continut |
|------|----------|
| `references/api-examples.md` | Curl examples: YouTube, LinkedIn, threads, cross-posting, media upload |
