---
name: tool-publisher
version: 1.0.1
category: tool
description: "Publica un post social media generat via Zernio MCP. Citeste din projects/00-social-content/{date}/{slug}/, upload imagini via Zernio browser flow, posts_publish_now, update post.yaml + publish-log.md."
triggers:
  - "publica post"
  - "publica acum"
  - "vreau sa public"
  - "publica asta"
  - "post acum"
  - "publica draft"
  - "post"
  - "publish"
  - "post now"
  - "publish post"
  - "publish this"
negative_triggers:
  - "scrie post"
  - "creeaza post"
  - "draft post"
context_loads:
  - context/learnings.md (section tool-publisher)
inputs:
  - slug (optional: match across dates)
  - date (optional: combined cu slug pentru exact match)
outputs:
  - Update projects/00-social-content/{date}/{slug}/post.yaml (status)
  - Append projects/00-social-content/publish-log.md
secrets_required:
  - ZERNIO_API_KEY
tier: social-publisher
---

# Tool Publisher

Publica un draft post din `projects/00-social-content/` via Zernio MCP.

# Prerequisites

Inainte sa rulezi, verifica:
1. Zernio MCP server e configurat in `.mcp.json` la repo root
2. `ZERNIO_API_KEY` setat in `.env`
3. Cont social tinta connected la https://zernio.com/dashboard

**Daca Zernio MCP tools NU sunt disponibile in sesiune curenta, stop imediat:**
```
Zernio MCP NU e disponibil in aceasta sesiune.
Verifica: ZERNIO_API_KEY in .env si restart Claude Code.
Connect accounts la: https://zernio.com/dashboard
```

# Invocare

```
/tool-publisher                             ← listeaza draft posts, user picks
/tool-publisher karpathy-quote              ← match by slug across dates
/tool-publisher 2026-05-02 karpathy-quote   ← exact date + slug
```

# Step 1: Identifica post-ul

**Cu slug argument:** Search `projects/00-social-content/*/{slug}/post.yaml`. Daca multiple date match, prefer most recent. Daca nu gasit, spune user-ului si stop.

**Fara argument:** Find toate `post.yaml` sub `projects/00-social-content/` cu `status: draft` sau `failed`. Sort by date desc, limit 30 zile. Listeaza marcand failed:

```
Posts disponibile pentru publicare:
1. 2026-05-02-autoresearch-karpathy  —  linkedin · carousel · 4 slides
2. 2026-05-02-brucer-esa-arena-top1  —  linkedin · single image  [failed]
Care vrei sa public? (number sau slug)
```

# Step 2: Load si Preview

Read:
- `projects/00-social-content/{date}/{slug}/post.yaml` → `platform`, `format`, `slides`
- `caption.md` → post text
- Detect images: `image.png` (single) sau `slide-1.png`, `slide-2.png` (carousel)

Check `status`:
- `published`: warn "Acest post a fost deja publicat. Republicare?" — require confirm
- `failed`: continua normal (retry)

Preview:
```
{slug}
Platform: {platform} · Format: {single image | carousel — N slides}
Images: {count}
{first 150 chars caption}...
Publica acum? (yes/no)
```

User no → stop.

# Step 3: Upload images

## LinkedIn Carousel → PDF option

Daca `platform=linkedin` SI `format=carousel`:

Intreaba: "LinkedIn carousels publish best ca PDF (swipeable document post). Cum upload?
1. PDF (recomandat — engagement mai bun)
2. Imagini individuale (mai rapid, merge oriunde)"

**Daca PDF:**
```bash
python skills/tool-publisher/lib/slides_to_pdf.py "projects/00-social-content/{date}/{slug}" \
  --output "projects/00-social-content/{date}/{slug}/carousel.pdf"
```

Daca script fail (Pillow lipsa), fallback la individual + warn.

## Upload Zernio

1. `media_generate_upload_link` → receive `upload_url` + `token`
2. Spune user-ului:
```
Deschide link-ul in browser sa uploadezi:
{upload_url}
Files (in ordine): {filenames}
Locatia: projects/00-social-content/{date}/{slug}/
Confirma cand gata.
```
3. Asteapta confirmare ("done", "gata")
4. `media_check_upload_status` cu token → extract `media_urls`

# Step 4: Publish

Call `posts_publish_now` cu:
- `content`: text complet din caption.md (verbatim, no truncation)
- `platform`: din post.yaml
- `media_urls`: din Step 3 (sau "" daca no images)

Fallback: `posts_create` cu `publish_now=true` daca `posts_publish_now` nu e disponibil.

Capture `post_id` + `post_url`.

# Step 5: Update post.yaml

**Success:**
```yaml
status: published
publish:
  status: published
  published_at: {ISO timestamp}
  platform_post_id: {post_id}
  post_url: {url}
  error: ~
```

**Failure:**
```yaml
status: failed
publish:
  status: failed
  error: "{mesaj eroare}"
```

# Step 6: Log

Append in `projects/00-social-content/publish-log.md`:
```
| {timestamp} | {platform} | {slug} | {published|failed} | {url sau error} |
```

# Step 7: Report

**Success:**
```
Publicat pe {platform}!
Post ID: {platform_post_id}
{post_url}
```

**Failure:**
```
Publicare esuata: {eroare}
post.yaml updated cu status: failed.
```

# Common Errors

- `401 / Invalid API key` → verifica ZERNIO_API_KEY
- `No account connected` → connect la zernio.com/dashboard
- `Media upload failed` → retry upload
- `Rate limit` → asteapta cateva minute

# Rules

- **Mereu confirma cu user inainte sa publici** (Step 2 preview)
- **Re-publicare requires explicit confirm**
- **Status update mereu** dupa publish (success sau fail)
- **Log append mereu** pentru audit trail

# Self-Update

Daca user flag-eaza issue — publish gresit, status nu se update, log lipsa — actualizeaza `# Rules`.
