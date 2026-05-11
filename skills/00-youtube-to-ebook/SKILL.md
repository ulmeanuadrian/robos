---
name: 00-youtube-to-ebook
version: 1.0.0
category: "00"
description: "Pipeline end-to-end: YouTube URL → PDF editorial long-form fact-checked. Fetch transcript, transforma in articol magazine-style, fact-check claims, pauseaza pentru human review, humanize writing, render PDF clean. 7 faze, 1 human checkpoint."
triggers:
  - "transforma video in ebook"
  - "youtube la articol"
  - "video la PDF"
  - "youtube la ebook"
  - "converteste video in long-form"
  - "articol din youtube"
  - "turn this video into an ebook"
  - "youtube to article"
  - "video to PDF"
  - "make an ebook from this video"
  - "youtube to ebook"
  - "convert video to long-form"
  - "article from youtube"
negative_triggers:
  - "short-form"
  - "social post"
  - "video editing"
context_loads:
  - brand/voice.md (tone only)
  - brand/design-tokens.md (branded PDF mode)
  - brand/assets.md (logo + business links, daca branded)
  - context/learnings.md (section 00-youtube-to-ebook)
inputs:
  - youtube_url (required)
  - design (optional: minimal | branded, default minimal)
  - screenshots (optional: flag pentru extragere frames vizuale, default on)
outputs:
  - projects/00-youtube-to-ebook/{date}/{slug}/{slug}.pdf (final)
  - projects/00-youtube-to-ebook/{date}/logs/ (transcript, draft, fact-check, pipeline log)
  - Copy PDF la ~/Downloads/{slug}.pdf
runtime_dependencies:
  - python: ">=3.11"
tier: content-creator
---

# YouTube to Ebook

Transforma un YouTube video in PDF editorial fact-checked + humanized. 7 faze, 1 human checkpoint.

# Outcome

PDF polished in `projects/00-youtube-to-ebook/{date}/{slug}/` plus markdown draft + fact-check report in `projects/00-youtube-to-ebook/{date}/logs/`.

# Dependencies

| Skill | Required? | Ce ofera | Fara |
|-------|-----------|------------------|------------|
| `tool-youtube` | Required | YouTube transcript fetching | NO fallback — transcript = input |
| `tool-video-screenshots` | Optional | Extragere frames vizuale | Articol render fara imagini |
| `mkt-longform-article` | Required | Transcript → articol editorial | NO fallback |
| `tool-fact-checker` | Required | Verificare claims | NO fallback |
| `tool-humanizer` | Required | Sterge AI patterns | Fallback: skip humanization |
| `tool-pdf-generator` | Required | Markdown → PDF | NO fallback |

# Step 1: Setup Run Directory

```
DATE       = {YYYY-MM-DD}
SLUG       = {sanitized-video-title}
LOG_DIR    = projects/00-youtube-to-ebook/{DATE}/logs/
OUTPUT_DIR = projects/00-youtube-to-ebook/{DATE}/{SLUG}/
```

Creeaza directoare. Start `pipeline-log.md` in `LOG_DIR`.

# Step 2: Fetch Transcript

Cheama `tool-youtube` transcript mode:
- Pass URL
- Save la `{LOG_DIR}/transcript.txt`
- Log timing

**Daca NU exista captions:** "Acest video nu are captions disponibile. Pipeline-ul nu poate continua." STOP.

# Step 3: Write Article (text-first, no images)

Cheama `mkt-longform-article` in pipeline mode:
- Pass transcript
- Pass brand/voice.md daca exista
- NU pass screenshots — articolul scris doar din text
- Receive markdown
- Save la `{LOG_DIR}/draft-article.md`
- Log timing

# Step 3.5: Extract & Embed Screenshots (Optional)

Daca `tool-video-screenshots` instalat si `screenshots=on`:

1. **Identifica visual moments** — scan draft pentru 4-8 passages descriind ceva vizual (UI, diagrama, demo, on-screen content). Pentru fiecare, gaseste closest transcript timestamp.

2. **Extract frames la timestamps** — cheama `tool-video-screenshots` timestamp mode.

3. **Verify fiecare frame** — drop talking heads sau frames care nu match passage-ul.

4. **Caption-uri contextuale** — connect imaginea cu passage-ul, NU descriere generica.

5. **Embed in articol** — insert `![caption](absolute_path)` direct dupa passage. Save updated `draft-article.md`.

6. **Save manifest** — `{LOG_DIR}/screenshots/manifest.json` cu absolute paths.

**Daca tool-video-screenshots NOT installed sau fail**: skip silent.

# Step 4: Fact-Check Claims

Cheama `tool-fact-checker` pipeline mode:
- Extract claim-uri factuale din draft
- Pass la fact-checker
- Receive verdict structurat
- Save raport la `{LOG_DIR}/fact-check-report.md`
- Log timing

Format report: claim + verdict + corections suggested.

# Step 5: Human Review (CHECKPOINT — OBLIGATORIU)

Prezinta user-ului:
1. **Draft articol** — full text sau summary cu key sections highlighted
2. **Fact-check raport** — claims cu verdicts, flag FALSE/MOSTLY_FALSE/MIXED
3. **Corrections suggested** — din `corrected_text` fact-checker

Intreaba: "Iata draft + fact-check rezultate. Aplicam corections si continuam, fac edit-uri specifice, sau stop?"

**Approve:** Aplica corections acceptate la articol, save ca `{LOG_DIR}/reviewed-article.md`, continua Step 6.

**Edit:** Aplica edit-urile cerute, save, continua.

**Reject:** STOP. Log la pipeline-log.md.

# Step 6: Humanize

Cheama `tool-humanizer` pe reviewed article:
- `deep` mode daca `brand/voice.md` exista
- `standard` mode altfel
- Save ca `{LOG_DIR}/final-article.md`
- Log timing

Daca `tool-humanizer` not available, skip si foloseste reviewed article as-is.

# Step 7: Generate PDF

Determina theme:
- `design=minimal` (default): PDF clean serif
- `design=branded`: foloseste design tokens + optional logo/links

**Minimal:**
```bash
python skills/tool-pdf-generator/lib/md_to_pdf.py \
  "{LOG_DIR}/final-article.md" \
  "{OUTPUT_DIR}/{slug}.pdf"
```

**Branded:**
```bash
python skills/tool-pdf-generator/lib/md_to_pdf.py \
  "{LOG_DIR}/final-article.md" \
  "{OUTPUT_DIR}/{slug}.pdf" \
  --theme branded --tokens brand/design-tokens.md
```

Adauga `--logo` + `--links` daca user a optat.

- Save PDF la `OUTPUT_DIR`
- Copy la `~/Downloads/` (via portable-paths helper)
- Log timing

# Step 8: Pipeline Summary

Print user:
```
Pipeline Complete
-----------------
Source: {video title}
Output: {absolute path PDF}
Total time: M:SS

Phase Breakdown:
  1. Fetch Transcript — M:SS
  2. Write Article — M:SS
  3. Extract Screenshots — M:SS (sau skipped)
  4. Fact-Check — M:SS
  5. Human Review — (user time)
  6. Humanize — M:SS
  7. Generate PDF — M:SS

Files:
  PDF:    {OUTPUT_DIR}/{slug}.pdf
  Draft:  {LOG_DIR}/draft-article.md
  Report: {LOG_DIR}/fact-check-report.md
  Log:    {LOG_DIR}/pipeline-log.md
```

# Rules

- **No transcript = STOP imediat** — NU fallback la audio transcription
- **Human checkpoint OBLIGATORIU** — NICIODATA sari peste Step 5
- **Save intermediate files mereu** chiar daca pipeline fail partway
- **Pipeline log scris** chiar la fail (record care phase + de ce)
- **PDF styling**: clean, minimal, serif typography, no cover page, no headers/footers (mode minimal)

# Self-Update

Daca user-ul flag-eaza issue — wrong phase order, missing files, bad output — actualizeaza `# Rules` imediat.
