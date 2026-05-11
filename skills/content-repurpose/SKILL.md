---
name: content-repurpose
version: 3.0.0
category: content
description: "Transforma o piesa de continut in posturi platform-native pentru 8 platforme (LinkedIn, Twitter, Instagram, TikTok, YouTube, Threads, Bluesky, Reddit). Multi-Asset parallel + algorithm check + humanizer gate + optional content calendar."
triggers:
  - "transforma in social"
  - "fa posturi din asta"
  - "calendar content"
  - "calendar saptamanal"
  - "fa un thread"
  - "post LinkedIn din"
  - "adapteaza pentru"
  - "atomizeaza"
  - "repurpose this"
  - "turn this into social posts"
  - "social posts from"
  - "atomize this"
  - "create social content from"
  - "schedule across platforms"
  - "content calendar from this"
negative_triggers:
  - "scrie copy"
  - "landing page"
  - "sales page"
  - "articol"
  - "blog post"
  - "SEO article"
output_discipline: encapsulated
concurrency_pattern: multi-asset-generation
context_loads:
  - brand/voice.md (platform agents read)
  - brand/audience.md (platform agents read summary)
  - brand/samples.md (platform agents read)
  - context/learnings.md (synthesizer appends)
inputs:
  - source (required: URL, file path, or pasted text)
  - platforms (optional: comma-separated list, defaults to all 8)
  - angle (optional: specific angle or hook to emphasize)
  - calendar (optional: yes — genereaza si content calendar saptamanal)
outputs:
  - Per-platform files in projects/content-repurpose/{slug}/
  - calendar.md (optional, daca user-ul cere)
  - data/skill-telemetry.ndjson (appended)
secrets_optional:
  - FIRECRAWL_API_KEY
tier: core
---

# Output Discipline

In transcriptul vizibil userului apare DOAR:
1. (Daca source e URL/file) Confirmare scurta a continutului citit + lungime aproximativa.
2. Lista de atoms extrasi → user confirma / ajusteaza.
3. (Daca user n-a specificat platforms) Lista platforms default → user confirma / restrange.
4. Mesaj final: paths catre fisierele generate + flag pentru platforms esuate (daca exista).

**Reguli stricte:**
- NU folosi TodoWrite.
- NU anunta "Step 1: read source", "Step 2: extract atoms", etc.
- NU rula generare per platforma in main thread — toate platforms primesc agenti dedicati.
- Cele N invocari `Agent` pentru platforms TREBUIE SA FIE INTR-UN SINGUR mesaj de raspuns.

---

# Step 0: Read source (main thread, rapid)

In functie de tip:
- **URL**: WebFetch o singura data, extrage main body (strip nav/footer/sidebar)
- **File path**: Read tool
- **Pasted text**: foloseste as-is

**Daca WebFetch esueaza** (JS-heavy, bot protection, continut gol) si `FIRECRAWL_API_KEY` exista in `.env` → fallback la Firecrawl scrape. Daca nici Firecrawl nu merge, cere user-ului sa pasteze continutul.

Daca lungimea < 100 cuvinte: "Sursa e scurta ({N} cuvinte). Continui asa sau ai o versiune mai lunga?" — asteapta.

Confirma scurt user-ului: "Citit: {tip}, ~{N} cuvinte."

---

# Step 1: Extract atoms (main thread, interactive)

Spargere in 5-7 atoms:
1. **Key insight** — singurul lucru de retinut
2. **Supporting points** — 3-7 idei care construiesc cazul
3. **Story beats** — mini-narative concrete (before/after sau challenge/solution)
4. **Numbers / proof** — date, stats, rezultate
5. **Spicy takes** — opinii contrarian care provoaca consensus
6. **Action steps** — lucruri pe care reader-ul le poate face concret
7. **Quotable lines** — fraze punchy care merg ca standalone post

Listeaza atoms-urile, intreaba "Confirmi sau ajustam?". Asteapta confirmarea.

Acest pas e interactiv prin natura (user verifica relevanta) — NU e candidat de paralelism.

---

# Step 1.5: Algorithm sanity check (rapid)

Pentru platformele selectate, ruleaza un quick WebSearch per platforma:
```
"{platform} algorithm update {current_month} {current_year}"
```

Daca apare o schimbare meaningful (ex: LinkedIn weighting comments more, Reddit penalizing self-promo), flag-o user-ului inainte de generare ca agentii sa stie. Daca WebSearch nu e disponibil sau nimic notabil, continua silent cu default-urile.

Acest pas dureaza ~10 sec, NU paralelizezi cu Step 4 (agentii au nevoie de output-ul de aici).

---

# Step 2: Determine platforms (main thread)

Daca user a specificat `platforms`, foloseste-le. Altfel default = toate 8: linkedin, twitter, instagram, tiktok, youtube, threads, bluesky, reddit.

Daca foloseste default-ul de 8, intreaba scurt: "Generez pentru toate 8 platforms? (linkedin, twitter, instagram, tiktok, youtube, threads, bluesky, reddit) — sau doar cateva?"

Calculeaza slug: `{date}-{topic-slugified-from-source-title}`.

---

# Step 3: Concurrency check

```bash
node scripts/parallel-budget.js check {N_platforms} 20
```

(20s estimat per platforma)

- Returneaza `parallel` daca N >= 3.
- `serial` pentru N < 3 — fa-le secvential intr-un singur agent (sau direct in main daca N=1).

Daca N > 8, AGENTS.md cap-ul intervine: sparge in waves de 8. Practic asta nu se intampla pentru ca avem doar 8 platforms total.

Marcheaza `start_time = Date.now()`.

---

# Step 4: Spawn N platform agents IN PARALLEL

**Critic:** intr-un SINGUR mesaj de raspuns, N invocari `Agent` simultane.

Pentru fiecare platforma selectata, spawn agentul corespunzator. Toate primesc:
- Source text (full sau key sections)
- Atoms list (confirmati la Step 1)
- Brand voice context (citit de fiecare agent din `brand/voice.md`)

## Agent LINKEDIN

```
subagent_type: general-purpose
description: "Repurpose: LinkedIn"
prompt: """
Genereaza un post LinkedIn nativ pe baza atoms-urilor.

Source: {source_text}
Atoms: {atoms_list}
Angle (optional): {angle}
Brand voice: citeste brand/voice.md daca exista; altfel ton authoritative-but-personal default.

Cerinte:
- Format: 1200-1500 caractere
- Hook line (bold sau provocative) la inceput
- 2-3 paragrafe scurte
- Takeaway la final
- Soft CTA (intrebare sau conversation starter)
- Line breaks intre fiecare 1-2 propozitii
- Hashtags: 3-5 la final, NU in body
- Tone: authoritative, first-person experience

Returneaza DOAR JSON:
{
  "platform": "linkedin",
  "status": "ok" | "failed",
  "content": "post text complet",
  "char_count": N,
  "hashtags": ["..."],
  "notes": "scurt"
}
"""
```

## Agent TWITTER

```
subagent_type: general-purpose
description: "Repurpose: Twitter/X"
prompt: """
Genereaza DOUA versiuni Twitter/X pe baza atoms-urilor.

Source: {source_text}
Atoms: {atoms_list}
Brand voice: citeste brand/voice.md.

Versiunea A — single tweet:
- Sub 280 caractere
- Hook + payoff intr-un singur tweet
- Punchy, direct, conversational

Versiunea B — thread:
- 3-7 tweets
- Tweet 1: hook (creates curiosity sau pattern interrupt)
- Tweets 2-N-1: supporting points (one per tweet)
- Tweet N: CTA sau conclusion
- Numere si line breaks pentru scannability

Returneaza DOAR JSON:
{
  "platform": "twitter",
  "status": "ok" | "failed",
  "single": "single tweet text",
  "single_chars": N,
  "thread": ["tweet 1", "tweet 2", ...],
  "thread_count": N,
  "notes": "scurt"
}
"""
```

## Agent INSTAGRAM

```
subagent_type: general-purpose
description: "Repurpose: Instagram"
prompt: """
Genereaza carousel script + caption pentru Instagram.

Source: {source_text}
Atoms: {atoms_list}

Carousel script (7 slides):
- Slide 1: hook puternic, vizual-first
- Slides 2-6: key points (unul per slide, scurt punchy)
- Slide 7: CTA (follow, save, share, comment)

Caption:
- Max 2200 caractere
- Hook in first line
- Body cu valoare reala
- CTA clar
- Hashtags: 20-30 in primul comentariu (NU in caption)

Returneaza DOAR JSON:
{
  "platform": "instagram",
  "status": "ok" | "failed",
  "carousel_slides": ["slide 1 text", ...],
  "caption": "text complet",
  "first_comment_hashtags": ["..."],
  "notes": "scurt"
}
"""
```

## Agent TIKTOK

```
subagent_type: general-purpose
description: "Repurpose: TikTok"
prompt: """
Genereaza script TikTok pe baza atoms-urilor.

Source: {source_text}
Atoms: {atoms_list}

Script structure:
- Hook (first 3 seconds — pattern interrupt sau curiosity)
- Problem (ce problema rezolvam)
- Solution (insight-ul cheie)
- Proof (data point sau example)
- CTA (follow / comment / link)

Constraint: under 60 secunde reading time. Tone: casual, direct, fast-paced.

Returneaza DOAR JSON:
{
  "platform": "tiktok",
  "status": "ok" | "failed",
  "script": {
    "hook": "...",
    "problem": "...",
    "solution": "...",
    "proof": "...",
    "cta": "..."
  },
  "estimated_seconds": N,
  "notes": "scurt"
}
"""
```

## Agent YOUTUBE

```
subagent_type: general-purpose
description: "Repurpose: YouTube"
prompt: """
Genereaza Community post + video description pentru YouTube.

Source: {source_text}
Atoms: {atoms_list}

Community post:
- Max 500 caractere
- Question sau poll format
- Tone: conversational, encourage comments

Video description (optional, daca user are video):
- 150-300 cuvinte
- Hook in primele 100 caractere (vizibil pre-expand)
- Timestamps placeholder
- CTA
- Resources / links section

Returneaza DOAR JSON:
{
  "platform": "youtube",
  "status": "ok" | "failed",
  "community_post": "text",
  "video_description": "text full",
  "notes": "scurt"
}
"""
```

## Agent THREADS

```
subagent_type: general-purpose
description: "Repurpose: Threads"
prompt: """
Genereaza post pentru Threads.

Source: {source_text}
Atoms: {atoms_list}

Format:
- Single post (max 500 caractere) sau mini-thread (2-3 posts)
- Tone: casual, conversational, mai putin polished decat LinkedIn
- Hook clar, payoff rapid

Returneaza DOAR JSON:
{
  "platform": "threads",
  "status": "ok" | "failed",
  "format": "single" | "thread",
  "content": "single text" | ["post 1", "post 2", ...],
  "notes": "scurt"
}
"""
```

## Agent BLUESKY

```
subagent_type: general-purpose
description: "Repurpose: Bluesky"
prompt: """
Genereaza post pentru Bluesky.

Source: {source_text}
Atoms: {atoms_list}

Format:
- Sub 300 caractere, single post
- Tone: tech-savvy, conversational
- Daca referentiezi imagini, include alt-text suggestions

Returneaza DOAR JSON:
{
  "platform": "bluesky",
  "status": "ok" | "failed",
  "content": "post text",
  "char_count": N,
  "alt_text_suggestions": ["..."] sau [],
  "notes": "scurt"
}
"""
```

## Agent REDDIT

```
subagent_type: general-purpose
description: "Repurpose: Reddit"
prompt: """
Genereaza self-post pentru Reddit pe baza atoms-urilor.

Source: {source_text}
Atoms: {atoms_list}

Reguli stricte Reddit:
- Self-post cu valoare genuine, NU promotional
- Lead cu insight-ul, ingroapa orice self-promo (sau scoate-o complet)
- Scrie ca si cum ai raspunde la o intrebare existenta
- Tone: genuine, slightly informal, helpful

Sugereaza si 2-3 subreddits relevante (cu rationament).

Returneaza DOAR JSON:
{
  "platform": "reddit",
  "status": "ok" | "failed",
  "title": "post title",
  "body": "post body markdown",
  "suggested_subreddits": [{"name": "r/...", "why": "..."}, ...],
  "notes": "scurt"
}
"""
```

---

# Step 5: Hard-fail gate + save (main thread)

Dupa ce primesti N JSON-uri:

`wall_clock_ms = Date.now() - start_time`.
`failed = JSON-uri cu status="failed"`.

## Calea A — toate OK (failed.length === 0)

**Humanizer gate** (inainte de save):
Daca skill-ul `tool-humanizer` exista in `skills/`, ruleaza pe fiecare bucata generata in pipeline mode:
- `deep` mode daca `brand/voice.md` a fost incarcat
- `standard` mode altfel
Logheaza scor pre/post per platforma. Daca delta > 2 puncte, mentioneaza in output final.

Salveaza per platforma in `projects/content-repurpose/{slug}/`:
- `linkedin.md`, `twitter.md`, `instagram.md`, `tiktok.md`, `youtube.md`, `threads.md`, `bluesky.md`, `reddit.md` (doar cele generate)
- `_source.md` — original content reference
- `_atoms.md` — atoms confirmati la Step 1

**Daca user a cerut calendar** (input `calendar=yes`), genereaza `calendar.md` cu ritm 5-3-2 saptamanal:
- 5 zile core content (1 platforma/zi din cele selectate)
- 3 zile secondary/repurpose (variante scurtate)
- 2 zile engagement (raspuns la comentarii, polls, story-uri)
Include ore optime postare per platforma (din learnings sau best-practices generice).

Append in `context/learnings.md` sub `## content-repurpose`:
```
### {date}
- Source type: {url|file|pasted}, ~{N} cuvinte
- Platforms: {N joined}
- Atoms: {N atoms}
- Date: {date}
```

Output exact:
```
Content saved: projects/content-repurpose/{slug}/

Files generated:
- linkedin.md ({char_count} chars)
- twitter.md (single + thread of {N})
- ... (lista cu metrici cheie per platform)
```

STOP.

## Calea B — partial fail (failed.length > 0)

**Hard-fail per Pattern 3**: campania e incompleta. NU salvezi in calea principala.

Salveaza ce a reusit in `projects/content-repurpose/{slug}/partial/` cu un fisier `_FAILED.md` care listeaza:
- Platforms esuate
- Comanda exacta de retry: `/repurpose --platforms={failed_list} --source={original-source}`

Output exact:
```
⚠ Partial generation: {N_ok}/{N_total} platforms succeeded.

Saved to: projects/content-repurpose/{slug}/partial/
Failed: {failed_platforms_joined}

Retry just the failed ones with:
/repurpose --platforms={failed_list} --source={source_ref}
```

STOP.

---

# Step 6: Telemetrie

```bash
node scripts/parallel-budget.js log content-repurpose parallel {N} {failed.length} {wall_clock_ms} {fallback_used}
```

- agents = N (fiecare platforma e un agent; nu exista synthesizer la Multi-Asset)
- agents_failed = numarul de platforms cu status="failed"
- fallback_used = true daca am intrat pe Calea B
