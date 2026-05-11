---
name: mkt-longform-article
version: 1.0.0
category: content
description: "Transforma transcripturi video in articole editoriale long-form magazine-style (2,000-5,000 cuvinte). Writer-ul interpreteaza video pentru cineva care nu l-a vazut: explica jargon inline, adauga editorial framing, conecteaza idei across sections. Triggered de 00-youtube-to-ebook in pipeline mode."
triggers:
  - "scrie articol din transcript"
  - "transforma video in long-form"
  - "editorial din transcript"
  - "articol magazine-style"
  - "articol din video"
  - "feature article"
  - "write an article from this transcript"
  - "turn this video into a long-form piece"
  - "editorial from transcript"
  - "magazine-style article"
negative_triggers:
  - "summarize"
  - "social post"
  - "short-form"
  - "thread"
context_loads:
  - brand/voice.md (tone only)
  - context/learnings.md (section mkt-longform-article)
inputs:
  - transcript (required: full text sau path la fisier)
  - title (optional: video title pentru context)
  - voice_profile_path (optional: brand voice override)
  - mode (optional: standalone | pipeline, auto-detectat)
outputs:
  - projects/mkt-longform-article/{date}/{title}.md (standalone)
  - Markdown content returnat direct (pipeline mode)
tier: content-creator
---

# Long-Form Article Writer

Transforma transcripturi video raw in articole editoriale long-form polished. Writer-ul actioneaza ca **interpret** — NU summarizer — producing magazine-quality prose care sta singura pentru cititori care n-au vazut video-ul sursa.

# Step 1: Analizeaza transcriptul

Citeste transcriptul complet. Inainte sa scrii nimic, identifica:

1. **Core thesis** — Care e argumentul / insight-ul principal al vorbitorului?
2. **Key concepts** — Lista fiecare termen tehnic, acronim, idee domain-specific care necesita explicatie
3. **Narrative arc** — Cum construieste vorbitorul argumentul? Care e flow-ul logic?
4. **Quotable moments** — Citate directe care captureaza vocea lui si trebuie preservate
5. **Structural sections** — Breakpoint-uri naturale unde topic-ul se schimba

# Step 2: Planifica structura articolului

Default structure (poate adapta pe content):
- **Hook opening** — paragraph care prinde un cititor cold (cineva care nu stie de speaker / topic)
- **Context section** — de ce conteaza acest topic, who's involved
- **Body sections** (3-5) — cu headings descriptive, fiecare cu 400-1000 cuvinte
- **Inline jargon explanations** — primul time un term apare, defineste-l in paranteza sau prin restructurare
- **Pull quotes** — 2-3 citate directe, set off vizual
- **Closing reflection** — implications, ce inseamna pentru reader

# Step 3: Write

Target: 2,000-5,000 cuvinte (scale cu source length — 30-min video = 3,000; 1-hour video = 4,500).

**Voice**: Daca `brand/voice.md` exista, match tonul. Altfel, neutral professional editorial.

**NU**:
- "In acest video, [speaker] zice..."
- Recap chronological al video-ului
- Bullet-uri (paragraphs flow)
- Marketing-speak

**Da**:
- Editorial framing ("Aceasta abordare merita scrutinizare pentru ca...")
- Inline jargon explanations
- Conectare cross-section (insight din Section 2 ilustrat de exemplu in Section 4)
- Pull quotes verbatim

# Step 4: Save

**Standalone**: scrie la `projects/mkt-longform-article/{date}/{slugified-title}.md` cu frontmatter:
```yaml
---
title: ...
source_url: ...
source_type: video_transcript
word_count: N
brand_voice_applied: yes|no
date: YYYY-MM-DD
---
```

**Pipeline mode**: returneaza markdown direct la calling skill (00-youtube-to-ebook).

# Step 5: Quality gates

Inainte de save:
- [ ] Length: 2,000-5,000 cuvinte (matches source)
- [ ] Title: H1 prezent
- [ ] Direct quotes: 2-3 minim (verbatim cu attribution)
- [ ] Jargon explained inline la prima aparitie
- [ ] NO chronological recap (citeste-ti ce ai scris — se simte ca rerunning video?)
- [ ] NO bullet walls

# Rules

- **Interpret, NU summarize** — articolul trebuie sa stea singur
- **Match brand voice cand exista** — NU ignore voice.md
- **Pull quotes verbatim** — NU rephrase
- **NO bullet walls** — paragraphs flow

# Self-Update

Daca user-ul flag-eaza issue — chronological recap, lipsa jargon explanation, ton wrong — actualizeaza `# Rules`.
