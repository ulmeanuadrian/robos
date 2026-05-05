---
name: content-repurpose
version: 2.0.0
category: content
description: "Turn one piece of content into platform-native posts for LinkedIn, Twitter/X, Instagram, TikTok, YouTube, Threads, Bluesky, Reddit. Multi-Asset: 1 agent per platform writes in parallel; hard-fail if any platform fails."
triggers:
  - "transforma in social"
  - "fa posturi din asta"
  - "calendar content"
  - "fa un thread"
  - "post LinkedIn din"
  - "adapteaza pentru"
  - "repurpose this"
  - "turn this into social posts"
  - "social posts from"
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
  - context/learnings.md (synthesizer appends)
inputs:
  - source (required: URL, file path, or pasted text)
  - platforms (optional: comma-separated list, defaults to all 8)
  - angle (optional: specific angle or hook to emphasize)
outputs:
  - Per-platform files in projects/content-repurpose/{slug}/
  - data/skill-telemetry.ndjson (appended)
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

Daca lungimea < 100 cuvinte: "Sursa e scurta ({N} cuvinte). Continui asa sau ai o versiune mai lunga?" — asteapta.

Confirma scurt user-ului: "Citit: {tip}, ~{N} cuvinte."

---

# Step 1: Extract atoms (main thread, interactive)

Spargere in 3-5 atoms:
1. **Key insight** — singurul lucru de retinut
2. **Data point** — numar / stat / rezultat specific
3. **Quotable line** — propozitie standalone
4. **Story beat** — mini-narativ (before/after sau challenge/solution)
5. **Contrarian take** — opinie impotriva consensus

Listeaza atoms-urile, intreaba "Confirmi sau ajustam?". Asteapta confirmarea.

Acest pas e interactiv prin natura (user verifica relevanta) — NU e candidat de paralelism.

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

Salveaza per platforma in `projects/content-repurpose/{slug}/`:
- `linkedin.md`, `twitter.md`, `instagram.md`, `tiktok.md`, `youtube.md`, `threads.md`, `bluesky.md`, `reddit.md` (doar cele generate)
- `_source.md` — original content reference
- `_atoms.md` — atoms confirmati la Step 1

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
