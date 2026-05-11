---
name: content-blog-post
version: 2.0.0
category: content
description: "Write SEO-optimized blog posts matched to brand voice. Default: single draft. Mode=options: 3 parallel agents craft 3 stylistic angles (punchy / narrative / contrarian) — user picks or blends."
triggers:
  - "scrie un articol"
  - "blog despre"
  - "articol SEO"
  - "draft blog"
  - "write a blog post"
  - "blog post about"
  - "SEO article"
  - "write an article"
negative_triggers:
  - "post social"
  - "landing page"
  - "email"
  - "ad copy"
  - "repurpose"
  - "social post"
multi_angle_triggers:
  - "show me options"
  - "show me angles"
  - "vreau optiuni"
  - "mai multe versiuni"
  - "3 angles"
  - "3 variante"
output_discipline: encapsulated
concurrency_pattern: multi-angle-creativity (opt-in only)
context_loads:
  - brand/voice.md (reads)
  - brand/audience.md (reads)
  - brand/positioning.md (summary)
  - context/learnings.md (section content-blog-post)
inputs:
  - topic (required)
  - keywords (optional: target keywords, auto-researched if not provided)
  - target_length (optional: word count, default 1200)
  - intent (optional: informational | commercial | transactional | navigational)
  - mode (optional: "default" | "options", default "default")
outputs:
  - Blog post draft(s) in projects/content-blog-post/
  - SEO metadata
  - data/skill-telemetry.ndjson (appended in mode=options)
tier: core
---

# Output Discipline

In transcriptul vizibil userului apare:
1. (Ambele moduri) Confirmari interactive necesare: keywords (daca auto-researched), outline (default mode), confirmation pentru multi-angle (~3x cost).
2. (Default mode) Mesaj final cu path + word count + score + headline + meta.
3. (Mode=options) 3 variante prezentate side-by-side cu characteristic + score per variant.

**Reguli stricte:**
- NU folosi TodoWrite.
- NU anunta "Step 1: load brand", "Step 2: keywords", etc.
- NU rula WebSearch direct din main thread — research delegat in sub-agent.
- In multi-angle: cele 3 invocari `Agent` TREBUIE SA FIE INTR-UN SINGUR mesaj.

---

# Mode selection (main thread, first decision)

Verifica daca user a cerut explicit multi-angle:
- Mesajul contine `mode=options`, "show me options", "vreau optiuni", "3 variante", "3 angles" → mode = "options"
- Sau detectezi high-stakes (lansare, pitch, content ce va fi distribuit larg) → propune: "Asta pare important. Vrei 3 variante stilistice paralele (mode=options) sau un singur draft?"
- Altfel → mode = "default"

---

# === Default mode (mode = default) ===

## Step 1: Load brand context

Read `brand/voice.md` si `brand/audience.md`. Internalize tone + audience. Read `context/learnings.md` sectiunea `## content-blog-post`. Nu output catre user.

## Step 2: Topic + keywords

Daca user a dat keywords, foloseste-le. Altfel:
1. Genereaza 5-8 keyword variations (long-tail, question-based, comparison)
2. Prezinta user-ului pentru confirmare
3. Selecteaza 1 primary + 3-5 secondary

Classify intent: informational / commercial / transactional / navigational.

## Step 3: Research + outline (sub-agent)

Spawn UN agent:

```
subagent_type: general-purpose
description: "Blog post: research + outline"
prompt: """
Topic: {topic}. Primary keyword: {primary}. Secondary: {secondary}. Intent: {intent}. Target length: {target_length}w.

Tasks:
1. WebSearch top 5-10 results pentru primary keyword. Note common angles + gaps + content formats + avg word count.
2. Pick angle: gap sau stronger take.
3. Build outline: H1 (cu primary keyword), Intro, 3-4 H2s (200-300w each, 1+ cu secondary keyword), Conclusion.
4. Returneaza JSON:
{
  "angle": "...",
  "outline": {"h1":"...", "intro_brief":"...", "sections":[{"h2":"...", "purpose":"...", "target_words":N}], "conclusion_brief":"..."},
  "competitor_gaps": ["..."],
  "avg_competitor_length": N
}
"""
```

Prezinta outline-ul user-ului: "Outline propus: {summary}. OK sau ajustez?"

## Step 4: Write draft + finalize (sub-agent)

Dupa confirmarea outline-ului, spawn:

```
subagent_type: general-purpose
description: "Blog post: draft + SEO + score + humanize + save"
prompt: """
Outline aprobat: {outline JSON}
Brand voice: citeste brand/voice.md.
Internal links: scaneaza projects/ pentru content existent relevant (2-4 linkable pieces).

Tasks:
1. Write full draft following outline. Rules: 1 idea per paragraph (3-5 sentences), keyword density 0.5-1.5% primary, lower secondary, vary sentence length.
2. Internal link suggestions: 2-4 cu anchor text + plasare.
3. SEO metadata: title tag (<60 chars), meta description (<155 chars), slug (<75 chars).
4. Score 7 dimensions (1-10): readability, keyword integration, structure, brand voice, value density, hook strength, CTA effectiveness. Revise if any <6.
5. Humanizer pass: scoate em-dash overuse, rule-of-three patterns, corporate buzzwords, hedging, AI tells.
6. Save la projects/content-blog-post/{date}-{slug}.md cu: full draft, SEO block, internal links, score card, outline used.
7. Append in context/learnings.md sub ## content-blog-post: topic, primary keyword, angle, word count, score summary, date.

Returneaza JSON:
{
  "saved_path": "...",
  "word_count": N,
  "score_summary": {...},
  "title_tag": "...",
  "meta_description": "..."
}
"""
```

## Step 5: Output (main thread)

```
Saved: {saved_path}
{word_count} words | Score: {avg}/10 | Title: {title_tag}
Meta: {meta_description}
```

STOP.

---

# === Multi-angle mode (mode = options) ===

## Step A: Load brand + extract brief (main thread)

Acelasi ca Steps 1-2 din default, dar fara confirmation pe outline (multi-angle skip-uie outline approval — fiecare agent isi face outline-ul lui).

Confirma scurt: "Generez 3 variante paralele: punchy/conversational, narrativ/story-led, contrarian/data-first. ~3x cost. OK?"

Daca user confirma → continua. Altfel cazi inapoi la default mode.

## Step B: Concurrency check

```bash
node scripts/parallel-budget.js check 3 45
```

(45s per draft full)

Returneaza `parallel`. Marcheaza `start_time`.

## Step C: Spawn 3 angle agents IN PARALLEL

**Critic:** intr-un SINGUR mesaj, 3 invocari `Agent`.

Toate primesc acelasi brief (topic, keywords, audience, target length) + brand voice. Fiecare are prompt stilistic diferit:

### Agent PUNCHY

```
subagent_type: general-purpose
description: "Blog post angle: punchy/conversational"
prompt: """
{base brief}

Style directive: punchy, conversational, hook puternic. Short paragraphs, direct address ("you"), opinions clearly stated. Hook in primele 50 cuvinte trebuie sa traga in. Sentences punctate. Sub-headlines crisp.

Build outline → write draft → SEO metadata → score → humanizer → return.

Returneaza JSON:
{
  "angle": "punchy",
  "status": "ok" | "failed",
  "draft_path_relative": "(NU salva fisier acum — main thread decide cum salveaza)",
  "draft_full": "markdown complet",
  "outline_used": {...},
  "word_count": N,
  "score_summary": {...},
  "title_tag": "...",
  "meta_description": "...",
  "characteristic": "1-line ce face acest draft unic"
}
"""
```

### Agent NARRATIVE

```
subagent_type: general-purpose
description: "Blog post angle: narrative/story-led"
prompt: """
{base brief}

Style directive: narrativ, story-led, emotional connection. Open with a story or scenario. Build through tension/resolution. Use anecdotes, dialogue moments, sensory details. Conclusion ties story back to actionable insight.

(rest same as PUNCHY agent)

Returneaza JSON cu "angle": "narrative" si characteristic specific.
"""
```

### Agent CONTRARIAN

```
subagent_type: general-purpose
description: "Blog post angle: contrarian/data-first"
prompt: """
{base brief}

Style directive: contrarian, data-first, debate-driven. Open cu o claim contra-consensus. Back with hard data (numbers, studies, examples). Acknowledge the conventional view, then dismantle it. Tone: confident, evidence-heavy, slightly provocative.

(rest same as PUNCHY agent)

Returneaza JSON cu "angle": "contrarian" si characteristic specific.
"""
```

## Step D: Best-effort save (main thread)

`wall_clock_ms = Date.now() - start_time`.

Pattern 4 = best-effort: prezinti ce a reusit, flag what failed.

Salveaza cele care au reusit in `projects/content-blog-post/{date}-{slug}/options/`:
- `punchy.md`, `narrative.md`, `contrarian.md` (doar cele cu status=ok)
- `_brief.md` cu user input + which angles succeeded

## Step E: Output (main thread)

```
3 variante generate ({N_ok}/3 OK):

1. PUNCHY: {characteristic}
   {snippet first 100 chars} ...
   File: projects/content-blog-post/{slug}/options/punchy.md ({word_count}w, score {avg}/10)

2. NARRATIVE: {characteristic}
   ...

3. CONTRARIAN: {characteristic}
   ...

{daca <3 OK}: ⚠ Esuat: {failed_angles}. Foloseste mode=options din nou pentru retry pe ele.

Care iti place? Pot face si un Frankenstein-blend din 2 dintre ele.
```

## Step F: Telemetrie

```bash
node scripts/parallel-budget.js log content-blog-post parallel 3 {failed_count} {wall_clock_ms} {fallback_used}
```

`fallback_used` = true daca <3 angles OK.

---

# Note pe ambele moduri

- Default mode foloseste 2 sub-agenti secventiali (research+outline, apoi draft) — incapsulare, nu paralelism. Telemetria nu se logheaza pentru default mode (nu e parallel).
- Multi-angle mode e opt-in only — niciodata default automat. Cost ~3x.
- Daca user cere multi-angle dar topic-ul e clar low-stakes (un how-to obisnuit), poti push back: "Topic-ul pare straightforward — un singur draft probabil suficient. Sigur 3 variante?"
