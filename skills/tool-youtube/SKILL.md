---
name: tool-youtube
version: 1.0.1
category: tool
description: "Fetch videos YouTube, extract transcripts cu timestamps, metadata + thumbnails. 3 moduri: channel (necesita YOUTUBE_API_KEY), transcript (gratuit via yt-dlp), metadata (yt-dlp). Folosit ca content source de alte skill-uri."
triggers:
  - "ultimul video youtube"
  - "transcript de pe youtube"
  - "youtube transcript"
  - "ce a postat"
  - "fetch youtube"
  - "ultimele video-uri canal"
  - "metadata video"
  - "info video"
  - "thumbnail youtube"
  - "detalii video"
  - "latest youtube video"
  - "get transcript"
  - "video metadata"
  - "youtube thumbnail"
negative_triggers:
  - "scrie continut"
  - "repurpose"
  - "editeaza video"
  - "video editing"
context_loads:
  - context/learnings.md (section tool-youtube)
inputs:
  - mode (optional: channel | transcript | metadata — auto-detectat din input)
  - url (transcript / metadata mode)
  - channels (channel mode: comma-separated @handles sau lista din config/sources.md)
  - hours (channel mode: cat de departe in trecut, default 48)
outputs:
  - projects/tool-youtube/{date}/{video-title-slug}.md (transcript clean)
  - metadata.json / thumbnail.png in output-dir specificat
secrets_optional:
  - YOUTUBE_API_KEY
runtime_dependencies:
  - python: ">=3.11"
  - yt-dlp
  - uv
tier: content-creator
---

# YouTube Tool

Utility skill pentru a scoate continut din YouTube. 3 scripturi, 3 job-uri:

- **Channel mode** — afla ce a postat cineva recent, lista video-urile lui
- **Transcript mode** — extrage textul complet dintr-un video specific
- **Metadata mode** — info video (title, durata, stats, tags) si/sau download thumbnail

Lant-uieste-le: gaseste ultimul video de pe canal, apoi extrage transcript-ul. Alte skill-uri (ca `content-repurpose`) folosesc asta ca content source.

# Step 0: Auto-Setup (ruleaza o data)

Inainte de orice, verifica daca binarele necesare exista. Daca lipseste oricare, ruleaza setup-ul — detecteaza ce lipseste si instaleaza automat.

```bash
bash skills/tool-youtube/scripts/setup.sh
```

Asta instaleaza `uv` (pentru dependencies inline ale digest.py) si `yt-dlp` (pentru transcript extraction). Foloseste `brew` pe macOS, fallback la `curl`/`pip`. Doar o data per masina — sari peste pe call-uri ulterioare daca ambele binare exista.

# Step 1: Determina tipul cererii

| Cerere | Ce fac |
|---------|------------|
| "Ultimele video-uri de la [canal]" | Channel mode — Step 2 |
| "Metadata pentru [URL]", "info video", "stats" | Metadata mode — Step 3 |
| "Thumbnail de la [URL]" | Metadata mode cu `--thumbnail` — Step 3 |
| "Transcript de la [URL]" | Transcript mode — Step 4 |
| "Ultimul transcript de la [canal]" | Lant: Step 2 apoi Step 4 |
| Alt skill cere continut | Ofera output-ul scriptului potrivit |

# Step 2: Channel Mode

```bash
uv run skills/tool-youtube/lib/digest.py --channels "@handle" --hours 48 --max-videos 5
```

Listeaza upload-uri recente cu titluri, date, URL-uri. Adauga `--transcript` pentru summary basic.

**Necesita:** `YOUTUBE_API_KEY` in `.env`. Daca lipseste, spune ce face si cum sa-l obtii. NU bloca — cere user-ului URL direct ca fallback.

**Optiuni script:**

| Optiune | Default | Ce face |
|--------|---------|-------------|
| `--channels` | — | Comma-separated @handles |
| `--search` | — | Comma-separated search queries |
| `--hours` | 48 | Cat departe in trecut |
| `--max-videos` | 10 | Cap pe video-uri |
| `--transcript` | off | Include transcript summaries |
| `--output` | markdown | `markdown` sau `json` |
| `--seen-file` | — | Track video-uri deja procesate |
| `--api-key` | env var | Override YOUTUBE_API_KEY |

**Channel sources file** (skip `--channels` cand setat):

Populeaza `skills/tool-youtube/config/sources.md` o data. Format:
```markdown
# YouTube Channels
- @fireship
- @lexfridman
- UCxxxxxxxxxxxxxxxxxxxxxxxx
```

# Step 3: Metadata Mode

```bash
python skills/tool-youtube/lib/metadata.py "https://youtube.com/watch?v=VIDEO_ID" --output-dir /tmp
```

Adauga `--thumbnail` pentru download PNG. `--thumbnail --no-metadata` = thumbnail-only.

**Output**: `metadata.json` (title, channel, durata, stats, tags, rezolutie) + `thumbnail.png` cu flag. **No API key** — yt-dlp handles.

# Step 4: Transcript Mode

```bash
python skills/tool-youtube/lib/transcript.py "https://youtube.com/watch?v=VIDEO_ID" --output-dir /tmp
```

Apoi citeste fisierul output. **No API key** — yt-dlp handles.

**Optiuni:**

| Optiune | Default | Ce face |
|--------|---------|-------------|
| `--lang` | en | Cod limba |
| `--format` | md | `md` (timestamped) sau `vtt` |
| `--output-dir` | . | Unde salveaza |
| `--auto-only` | off | Doar subs auto-generate |
| `--list` | — | Lista track-uri subtitle disponibile |

# Step 5: Save output curat

**Mereu salveaza transcript-ul in projects.** Dupa extract, creeaza versiunea curata la `projects/tool-youtube/{date}/{video-title-slug}.md`:

```markdown
# {Video Title}

Source: {YouTube URL}
Channel: {channel name daca stim}
Date extracted: {YYYY-MM-DD}

## Key Points

- {3-5 puncte importante din video}

## Transcript

{Text complet — timestamp-urile sterse — paragrafe readable}
```

Sterge toate `**[HH:MM:SS]**` din transcriptul raw inainte sa salvezi. Fisierul salvat trebuie sa se citeasca ca document, nu ca subtitle track.

# Step 6: Colecteaza feedback

Daca standalone, intreaba: "Am transcriptul. Mai ai nevoie de ceva din video sau canal?"

Log feedback in `context/learnings.md` → `## tool-youtube`.

# Rules

*Actualizat automat cand user flag-eaza issues.*

# Self-Update

Daca user-ul flag-eaza issue — canal gresit, transcript prost, date lipsa — actualizeaza `# Rules` cu corectia si data de azi.

# Troubleshooting

- **Setup script fail**: Daca `brew` nu e disponibil, scriptul cade pe `curl` (uv) si `pip` (yt-dlp). Daca ambele fail, install manual.
- **No API key**: Channel listing nu merge. Transcript mode merge cu URL direct. Spune user-ului cum sa obtina cheia si ofera URL fallback.
- **yt-dlp not installed**: Ruleaza `bash skills/tool-youtube/scripts/setup.sh` — auto-install. Daca fail, `brew install yt-dlp` manual.
- **No transcripts**: Unele video-uri n-au captions. Sugereaza paste manual.
- **Channel not found**: @handle gresit, sau canal foarte nou. Incearca search dupa nume.
