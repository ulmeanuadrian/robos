---
name: tool-linkedin-scraper
version: 1.0.1
category: tool
description: "Fetch posts recente din profile LinkedIn via Apify API. Accepta unul sau mai multe URL-uri profil, returneaza fiecare post ca markdown cu frontmatter (author, url, posted_at, likes, text). Seen-file pentru a evita reprocesare cross-run."
triggers:
  - "scrape linkedin"
  - "posts de pe linkedin"
  - "fetch linkedin"
  - "inspiratie linkedin"
  - "profile linkedin"
  - "linkedin posts"
  - "get linkedin content"
  - "fetch linkedin profile"
  - "linkedin inspiration"
negative_triggers:
  - "scrie continut"
  - "repurpose"
  - "publica"
  - "post"
  - "publish"
context_loads:
  - context/learnings.md (section tool-linkedin-scraper)
inputs:
  - profiles (required: comma-separated URL-uri profil LinkedIn)
  - max-posts (optional: per profil, default 5)
  - days (optional: cat de departe in trecut, default 7)
  - seen-file (optional: tracking file pentru deduplicare)
outputs:
  - projects/00-social-content/{date}/logs/inspiration/{slug}.md (per post nou)
secrets_required:
  - APIFY_API_KEY
runtime_dependencies:
  - python: ">=3.11"
  - uv
tier: researcher
---

# LinkedIn Scraper Tool

Utility skill pentru a extrage posts recente din profile LinkedIn. Foloseste Apify `harvestapi~linkedin-profile-posts` actor.

# Setup

```bash
bash skills/tool-linkedin-scraper/scripts/setup.sh
```

# Step 1: Verifica credentials

Daca `APIFY_API_KEY` NU e setat, spune user-ului ce face, unde sa-l obtina (https://apify.com — free tier 2,500 scrapes, cod `25SIMON` pentru 25% off), si ca poate face paste manual ca fallback. **NU continua fara cheie.**

# Step 2: Ruleaza scraper-ul

```bash
uv run --env-file .env skills/tool-linkedin-scraper/lib/scrape.py \
  --profiles "https://linkedin.com/in/profile-1/,https://linkedin.com/in/profile-2/" \
  --max-posts 5 \
  --days 7 \
  --seen-file cron/status/linkedin-inspiration-seen.txt
```

Fiecare post nou se printeaza la stdout ca block markdown cu frontmatter.

**Optiuni script:**

| Optiune | Default | Ce face |
|--------|---------|-------------|
| `--profiles` | — | Comma-separated LinkedIn profile URLs |
| `--max-posts` | 5 | Max posts per profil |
| `--days` | 7 | Cat departe in trecut |
| `--seen-file` | — | Path la file de tracking seen-posts |
| `--api-key` | env var | Override APIFY_API_KEY |

# Step 3: Save output

Script-ul printeaza fiecare post nou la stdout. Salveaza fiecare la `projects/00-social-content/{date}/logs/inspiration/{slug}.md` unde `slug` derivat din author name + post date.

# Step 4: Feedback

Daca standalone: "Am posts. Mai vrei ceva de la aceste profile?"

Daca user flag-eaza issue, actualizeaza direct in acest fisier — edit step-ul sau optiunea care a cauzat problema.

# Rules

- **API key required**: niciodata nu scrape fara cheie
- **Free tier limit**: 2,500 scrapes/luna — monitor la apify.com/billing
- **Per-post cost**: ~1 scrape per post returnat
- **Seen-file**: foloseste obligatoriu cand orchestrator → evita reprocesare

# Self-Update

Daca user-ul flag-eaza issue — profil ratat, post duplicate, format prost — actualizeaza `# Rules` cu corectia.

# Troubleshooting

- **No API key**: Scraping NU merge. Ofera paste manual.
- **Apify timeout (>60s)**: Retry o data. Daca fail, skip profilul si continua.
- **Profile not found**: URL gresit sau profil privat. Log warning, skip.
- **Rate limits**: Free tier 2,500/luna. Monitor billing.
