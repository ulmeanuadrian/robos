---
name: content-copywriting
version: 2.0.0
category: content
description: "Persuasive copy for landing pages, sales pages, emails, ads, social posts. Default: single draft via framework. Mode=options: 3 parallel agents craft 3 framework angles (logical / emotional / contrarian) — user picks or blends."
triggers:
  - "scrie copy"
  - "copy pentru landing"
  - "ajuta-ma sa vand"
  - "sa converteasca"
  - "headline"
  - "tagline"
  - "CTA"
  - "copy email"
  - "copy ad"
  - "write copy"
  - "landing page copy"
  - "sales page"
  - "ad copy"
negative_triggers:
  - "articol"
  - "blog post"
  - "SEO article"
  - "repurpose"
  - "social posts from"
multi_angle_triggers:
  - "show me options"
  - "vreau optiuni"
  - "3 variante"
  - "3 angles"
  - "show me angles"
output_discipline: encapsulated
concurrency_pattern: multi-angle-creativity (opt-in only)
context_loads:
  - brand/voice.md (reads)
  - brand/audience.md (reads)
  - brand/positioning.md (reads)
  - context/learnings.md (section content-copywriting)
inputs:
  - format (required: landing-page | sales-page | email | ad | social | headline)
  - product_or_offer (required: what we're selling)
  - audience (optional: overrides brand/audience.md if provided)
  - awareness_level (optional: 1-5, auto-detected if not specified)
  - mode (optional: "default" | "options", default "default")
outputs:
  - Copy draft(s) in projects/content-copywriting/
  - Score card (7 dimensions)
  - data/skill-telemetry.ndjson (appended in mode=options)
---

# Output Discipline

In transcriptul vizibil userului apare:
1. (Ambele moduri) Confirmari interactive: format clarification (daca ambiguu), awareness level confirmation, multi-angle cost confirmation (~3x).
2. (Default mode) Mesaj final cu path + framework + score + headline + CTA.
3. (Mode=options) 3 variante prezentate cu framework per variant + headline + characteristic.

**Reguli stricte:**
- NU folosi TodoWrite.
- NU anunta "Step 1: load brand", "Step 2: awareness", etc.
- NU rula generarea de copy direct din main thread — totul prin sub-agent (default sau multi-angle).
- In multi-angle: cele 3 invocari `Agent` TREBUIE SA FIE INTR-UN SINGUR mesaj.

---

# Mode selection (main thread, first decision)

Verifica daca user a cerut multi-angle:
- Mesaj contine `mode=options`, "show me options", "vreau optiuni", "3 variante" → mode = "options"
- Sau detectezi high-stakes (lansare, pitch important, sales page mare) → propune: "Asta e high-stakes. Vrei 3 variante stilistice paralele (mode=options) sau un singur draft?"
- Altfel → mode = "default"

---

# === Default mode (mode = default) ===

## Step 1: Load brand + format (main thread)

Read `brand/voice.md`, `brand/audience.md`, `brand/positioning.md`. Internalize. Read `context/learnings.md` sectiunea `## content-copywriting`.

Detecteaza format-ul cerut: landing-page / sales-page / email / ad / social / headline. Daca ambiguu, intreaba O singura intrebare: "Ce format vrei — landing, email, ad, sau altceva?"

## Step 2: Awareness level (main thread)

Eugene Schwartz scale 1-5:
1. Unaware
2. Problem-aware
3. Solution-aware
4. Product-aware
5. Most aware

Daca user n-a specificat, infer din context, state assumption: "Presupun audience la awareness {N}. Confirmi?".

## Step 3: Pick framework + write (sub-agent)

Spawn UN agent:

```
subagent_type: general-purpose
description: "Copy: framework + draft + score + humanize + save"
prompt: """
Format: {format}
Product/offer: {product_or_offer}
Audience: {audience or brand/audience.md}
Awareness level: {1-5}
Brand voice: citeste brand/voice.md.

Tasks:

1. Pick framework dupa matrix:
   | Awareness | Short-form | Mid-form | Long-form |
   | 1 | Pattern interrupt + curiosity | Before-After-Bridge | Story-led |
   | 2 | PAS (Problem-Agitate-Solve) | PAS expanded | Problem-Mechanism-Solution |
   | 3 | AIDA | Feature-Advantage-Benefit | Comparison + proof |
   | 4 | Social proof + urgency | Objection handling | Case study narrative |
   | 5 | Direct offer + deadline | Reminder + bonus stack | Risk reversal + scarcity |

2. Write copy:
   - 5 headline variants → pick strongest
   - Body following framework
   - 3 CTA variants (soft, medium, direct)
   - Micro-copy (button text, caption, PS line)
   Rules: lead cu reader's situation, not product. 1 idea / sentence. Specificity > generality. Use brand vocab.

3. Score 1-10 pe 7 dimensiuni: clarity, persuasion, brand alignment, specificity, emotion, urgency, readability. Revise if any <6.

4. Humanizer pass: scoate em-dash overuse, rule-of-three, corporate buzzwords (leverage/synergy/unlock), hedging ("it's worth noting"), promotional superlatives.

5. Save la projects/content-copywriting/{date}-{format}-{slug}.md cu: final copy, score card, framework rationale, headline + CTA variants.

6. Append in context/learnings.md sub ## content-copywriting: format, framework, score summary, date.

Returneaza JSON:
{
  "saved_path": "...",
  "framework_used": "...",
  "framework_rationale": "scurt",
  "score_summary": {dimensiune: N, ...},
  "headline_picked": "...",
  "cta_picked": "...",
  "char_count": N
}
"""
```

## Step 4: Output (main thread)

```
Saved: {saved_path}
Framework: {framework_used} — {framework_rationale}
Score avg: {avg}/10
Headline: {headline_picked}
CTA: {cta_picked}
```

STOP.

---

# === Multi-angle mode (mode = options) ===

## Step A: Load brand + brief (main thread)

Acelasi ca Steps 1-2 din default. Confirma scurt: "Generez 3 variante stilistice: logical/data-driven, emotional/story-led, contrarian/pattern-interrupt. ~3x cost. OK?"

Daca user confirma → continua. Altfel default mode.

## Step B: Concurrency check

```bash
node scripts/parallel-budget.js check 3 30
```

Returneaza `parallel`. Marcheaza `start_time`.

## Step C: Spawn 3 angle agents IN PARALLEL

**Critic:** intr-un SINGUR mesaj, 3 invocari `Agent`. Toate primesc same brief (format + product + audience + awareness). Diferenta: prompt-ul stilistic.

### Agent LOGICAL

```
subagent_type: general-purpose
description: "Copy angle: logical/data-driven"
prompt: """
{base brief}

Style directive: logical, data-driven, evidence-heavy. Numbers in headline si proof points. Specific claims (not "much faster" → "47% faster"). Comparison tables daca format permite. Risk reversal explicit. Tone: authoritative, confident, no-fluff.

Pick framework potrivit dar tilt logical (FAB, comparison, case study). Write copy → score 7 dim → humanizer → return.

Returneaza JSON cu "angle": "logical", framework, draft full, score, characteristic.
"""
```

### Agent EMOTIONAL

```
subagent_type: general-purpose
description: "Copy angle: emotional/story-led"
prompt: """
{base brief}

Style directive: emotional, story-led, identity-driven. Open cu o problema relatable sau un moment specific. Evoke felt needs, fears, aspirations. Use sensory language. Connect cu identity ("for the X who...", "you're not alone if..."). Tone: warm, empathetic, but with clear authority.

Pick framework cu emotional tilt (Story-led, Before-After-Bridge, PAS expanded). Write → score → humanizer → return.

Returneaza JSON cu "angle": "emotional", framework, draft, score, characteristic.
"""
```

### Agent CONTRARIAN

```
subagent_type: general-purpose
description: "Copy angle: contrarian/pattern-interrupt"
prompt: """
{base brief}

Style directive: contrarian, pattern-interrupt, conversation-stopping. Open cu un claim against industry consensus sau o question that breaks pattern. Re-frame the offer. Direct address ("everyone tells you X, but...", "stop doing Y"). Tone: confident, slightly provocative, urgent.

Pick framework cu interrupt tilt (Pattern interrupt, Mechanism-Solution, Risk reversal). Write → score → humanizer → return.

Returneaza JSON cu "angle": "contrarian", framework, draft, score, characteristic.
"""
```

## Step D: Best-effort save (main thread)

`wall_clock_ms = Date.now() - start_time`.

Salveaza variantele care au reusit in `projects/content-copywriting/{date}-{format}-{slug}/options/`:
- `logical.md`, `emotional.md`, `contrarian.md` (doar cu status=ok)
- `_brief.md` cu input + which angles succeeded

## Step E: Output (main thread)

```
3 variante {format} generate ({N_ok}/3 OK):

1. LOGICAL ({framework}): {characteristic}
   Headline: "{headline}"
   File: projects/content-copywriting/{slug}/options/logical.md (score {avg}/10)

2. EMOTIONAL ({framework}): {characteristic}
   Headline: "{headline}"
   File: ...

3. CONTRARIAN ({framework}): {characteristic}
   Headline: "{headline}"
   File: ...

{daca <3}: ⚠ Esuat: {failed}. Foloseste mode=options din nou pentru retry.

Care iti place? Pot face si un blend (ex: emotional headline + logical proof + contrarian CTA).
```

## Step F: Telemetrie

```bash
node scripts/parallel-budget.js log content-copywriting parallel 3 {failed_count} {wall_clock_ms} {fallback_used}
```

`fallback_used` = true daca <3 angles OK.

---

# Note pe ambele moduri

- Default mode foloseste 1 sub-agent (incapsulare).
- Multi-angle e opt-in. Cost ~3x. Niciodata default automat.
- Daca user cere multi-angle pentru un format scurt unde diferenta nu se vede (ex: o singura tagline), push back: "Pentru un singur tagline, multi-angle e overkill. Pot da 5 variante intr-un singur draft. OK?"
