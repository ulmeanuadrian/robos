---
name: 00-social-content
version: 1.0.1
category: "00"
description: "Parent orchestrator pentru social content pipeline. 7 scenarii: (A) text → imagine doar; (B) YouTube URL → post + imagini; (C) topic → trending research → post; (D) no input → scrape LinkedIn + YouTube; (E) existing post → repurpose; (F) article/blog URL → screenshot + extract; (G) video/audio local → transcribe → post."
triggers:
  - "ruleaza social content"
  - "genereaza post"
  - "creeaza post"
  - "genereaza continut"
  - "post linkedin"
  - "post instagram"
  - "doar imaginile"
  - "genereaza imagine pentru post"
  - "foloseste sursele mele"
  - "din sursele mele"
  - "genereaza continut linkedin"
  - "run social content"
  - "generate post"
  - "create post"
  - "generate content"
  - "use my sources"
  - "from my sources"
negative_triggers:
  - "blog post"
  - "long-form article"
  - "video editing"
context_loads:
  - brand/voice.md (full)
  - brand/audience.md (full)
  - brand/positioning.md (summary)
  - context/learnings.md (section 00-social-content)
inputs:
  - input (optional: topic / URL / local file path / nothing)
  - platform (optional: linkedin | instagram | twitter | tiktok | etc, auto-detected)
  - publish (optional: flag → publica imediat dupa generare)
outputs:
  - projects/00-social-content/{date}/{slug}/post.yaml
  - projects/00-social-content/{date}/{slug}/caption.md
  - projects/00-social-content/{date}/{slug}/image.png sau slide-N.png
  - projects/00-social-content/{date}/logs/pipeline-log.md
  - projects/00-social-content/publish-log.md (aggregat)
tier: content-creator
---

# Social Content Pipeline Orchestrator

Detecteaza scenariu din trigger, routeaza prin gather phase corect, draft post in brand voice, run humanizer, genereaza imagini via sub-agent, scrie per-run folder cu `post.yaml` + `caption.md` + image(s). Publishing = one command (`tool-publisher`).

# Dependencies

| Skill | Required? | Cand |
|-------|-----------|--------|
| `brand-voice` | Highly recommended | Cand exista voice.md |
| `content-repurpose` | Required | Scenariu E |
| `research-trending` | Required | Scenariu C |
| `tool-humanizer` | Required | Always (final gate) |
| `tool-linkedin-scraper` | Optional | Scenariu D |
| `tool-publisher` | Required pentru publish | Daca user cere publish |
| `tool-transcription` | Required | Scenarii B, G |
| `tool-web-screenshot` | Required | Scenariu F |
| `tool-youtube` | Required | Scenariu B |
| `viz-image-gen` | Required | Scenarii A-G (images) |

# Input Scenarios

```
/00-social-content                                    # D — auto-scrape
/00-social-content "topic or idea"                    # C — trending research
/00-social-content https://youtube.com/watch?v=...    # B — YouTube
/00-social-content https://example.com/article        # F — web page
/00-social-content /path/to/video.mp4                 # G — local file
/00-social-content "Generate image for this post: …"  # A — image only
/00-social-content "Adapt this post for instagram: …" # E — repurpose
```

# Workflow

## Phase 1: Detect scenario

Clasifica input:
- URL → check tip: YouTube vs web article
- File path → check tip: video/audio vs text
- Text instruction → check keywords ("adapt", "repurpose" = E; "generate image" = A; else C)
- Nothing → D (auto-scrape sources)

## Phase 2: Gather

Per scenariu:

**A** — Skip gather (input already finished text)
**B** — `tool-youtube` extract transcript + metadata
**C** — `research-trending` cu topic-ul
**D** — `tool-linkedin-scraper` + `tool-youtube` channel mode din `sources.md`
**E** — Skip gather (input already existing post)
**F** — `tool-web-screenshot` + extract text content
**G** — `tool-transcription` pe local file

## Phase 3: Draft

Pentru scenarii care produc text post (B, C, D, F, G):
- Read `brand/voice.md` pentru tone
- Read `brand/audience.md` pentru audience targeting
- Construct draft (300-1500 chars depending pe platform)

Pentru scenariu E (repurpose):
- Cheama `content-repurpose` cu source post

Pentru scenariu A (image only):
- Skip text draft, mers direct la Phase 5

## Phase 4: Humanize

Cheama `tool-humanizer` pe draft:
- `deep` mode daca voice.md exista
- `standard` altfel

Save humanized version.

## Phase 5: Generate images

Spawn sub-agent `ssc-image-generator` (sau direct `viz-image-gen`):
- Pentru single image post: 1 image
- Pentru carousel: 3-8 slides

Pass:
- post text complet
- slug + platform + format
- aspect_ratio (1:1, 4:5, 9:16 per platform)
- style preset (din brand sau platform default)

Salveaza la `image.png` (single) sau `slide-N.png` (carousel).

## Phase 6: Write run folder

```yaml
# post.yaml
slug: {date}-{topic-slug}
platform: linkedin
format: carousel  # sau single
slides: 4         # only daca carousel
status: draft
draft_at: {ISO timestamp}
scenario: B       # tracking
source:
  type: youtube
  url: ...
  title: ...
publish: {}       # populated de tool-publisher
```

Plus:
- `caption.md` (humanized final text)
- `image.png` / `slide-1.png`...`slide-N.png`
- `logs/pipeline-log.md` (phase timings + decisions)

## Phase 7: Optional publish

Daca `publish=yes` flag, cheama `tool-publisher` cu slug.

Altfel, prezinta user:
```
Post ready! Saved at: projects/00-social-content/{date}/{slug}/
- caption.md (humanized)
- image.png ({N} images)
- post.yaml (status: draft)

Pentru publish: /tool-publisher {slug}
```

# Rules

- **Mereu humanizer Phase 4** — quality gate inainte de image gen
- **Sub-agent pentru image gen** (NU main thread) — long running, paralelizabil
- **Pipeline log mereu** — tracking decisions cross-phase
- **NU publish fara user confirm explicit** — exceptie: `publish=yes` flag
- **Brand voice cand exista** — NU fallback la generic

# Self-Update

Daca user-ul flag-eaza issue — scenario detection gresit, content off-brand, images bad — actualizeaza `# Rules`.
