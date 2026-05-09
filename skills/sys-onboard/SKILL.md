---
name: sys-onboard
version: 2.0.0
category: sys
description: "Interactive onboarding that populates brand and context files in under 15 minutes. Q&A interactive, then 3 parallel agents craft brand/voice.md, brand/audience.md, brand/positioning.md from collected inputs — saves ~2x at the moment user is most tired."
triggers:
  - "ajuta-ma sa incep"
  - "configurare"
  - "pornire"
  - "onboard me"
  - "onboarding"
  - "set up my AIOS"
  - "get started"
  - "I just cloned this"
  - "help me set up"
  - "first time setup"
negative_triggers:
  - "onboard a client"
  - "client onboarding"
  - "set up a new client"
concurrency_pattern: multi-asset-generation (soft-fail variant)
context_loads:
  - context/USER.md (writes)
  - brand/voice.md (parallel agent writes)
  - brand/audience.md (parallel agent writes)
  - brand/positioning.md (parallel agent writes)
  - brand/samples.md (writes raw)
  - context/priorities.md (writes)
  - connections.md (writes)
  - context/learnings.md (section sys-onboard)
inputs:
  - starter_pack (optional: consultant, agency, ecommerce, creator, smb, b2b-saas, other)
outputs:
  - Populated brand/ files
  - context/USER.md, context/priorities.md, connections.md
  - One completed skill run in projects/
  - data/skill-telemetry.ndjson (appended)
---

# Step 0: Check if already onboarded

Read `brand/voice.md`. Daca contine continut real (nu doar template comments):

"Looks like you've already been onboarded — brand/voice.md has content. Want to re-run from scratch (will overwrite brand/) sau prefer /audit pentru a vedea unde sa imbunatatesti?"

Daca user accepta re-run, continua. Altfel stop.

---

# Step 1: Starter pack selection (main thread, interactive)

```
Hai sa te configuram. Ce tip de munca faci?

1. Consultant / Coach   — solo expert, vinzi cunostinte si servicii
2. Agency               — echipa de 2-10 face client work
3. E-commerce           — vinzi produse fizice / digitale online
4. Creator              — content-first business (YouTube, newsletter, courses)
5. SMB local            — service / retail / trade business cu echipa mica
6. B2B SaaS             — produs software pentru echipe tehnice
7. Other                — descriu eu
```

**Optiunile 1-6:** Copy starter pack files din `skills/_catalog/starter-packs/{type}/` → `brand/`:
- `voice.md` → `brand/voice.md`
- `audience.md` → `brand/audience.md`
- `positioning.md` → `brand/positioning.md`

Mapping: 1→consultant, 2→agency, 3→ecommerce, 4→creator, 5→smb, 6→b2b-saas.

Spune: "Loaded {type} starter pack into brand/. Personalizam acum."

**Optiunea 7 (Other):** Intreaba "Descrie business-ul in 2-3 propozitii" + 1 intrebare diagnostica:
"Cu cine vorbesti cel mai des: clienti finali (B2C), alte business-uri (B2B), sau o piata specifica?". Pe baza raspunsului alege starter pack-ul cel mai apropiat ca template structural, apoi rescrie continutul conform descrierii business-ului.

---

# Step 2: 5-question interview (main thread, interactiv, secvential)

Acest pas e inerent secvential — user-blocking, nu paralelizezi.

**Q1 — Identity:**
"Numele tau, numele business-ului, si ce faci intr-o singura propozitie?"

→ Write `context/USER.md`:
```markdown
# User Profile

Name: {name}
Business: {business_name}
Role: {what they do}
Onboarded: {YYYY-MM-DD}
Starter pack: {type}
```

**Q2 — Voice samples:**
"Lipeste 1-2 lucruri pe care le-ai scris recent — un email, un post, orice. Nu edita. Vreau vocea ta reala."

→ Save raw samples to `brand/samples.md` (NO analysis yet — analiza se face paralel la Step 3).

**Q3 — Priorities:**
"Care sunt 2-3 prioritati majore pentru urmatoarele 90 zile?"

→ Write `context/priorities.md`:
```markdown
# Current Priorities

Updated: {YYYY-MM-DD}
Quarter: {current quarter}

## Active priorities
1. {priority 1}
2. {priority 2}
3. {priority 3}

## Parking lot
(Things that matter but not this quarter)
```

**Q4 — Tools:**
"Ce tools folosesti zilnic? Email, project management, calendar, CRM, social, analytics, file storage."

→ Write `connections.md` la radacina proiectului. Mapeaza fiecare tool la unul din 7 tier-1 domains: revenue, customer, calendar, comms, tasks, meetings, knowledge.

```markdown
# Connections

Last updated: {YYYY-MM-DD}

## Connected
(None yet — set up API keys in .env)

## Planned
| Tool | Domain | Connection type | Status |
|------|--------|----------------|--------|
| {tool1} | {domain} | API / MCP / CLI | not connected |
| ...
```

**Q5 — First automation target:**
"O sarcina pe care o faci repetat si pare manuala — ai vrea s-o predai cuiva?"

→ Cache answer pentru Step 4.

---

# Step 3: Parallel brand-file generation

Aici e schimbarea v2: in loc de scrierea secventiala a brand/voice.md + brand/audience.md + brand/positioning.md, le facem in paralel.

## Step 3a: Concurrency check

```bash
node scripts/parallel-budget.js check 3 25
```

Returneaza `parallel`. Marcheaza `start_time`.

## Step 3b: Spawn 3 brand-file agents IN PARALLEL

**Critic:** intr-un SINGUR mesaj de raspuns, 3 invocari `Agent` simultane. Toate primesc context-ul colectat la Step 2.

### Agent VOICE

```
subagent_type: general-purpose
description: "Onboard: brand/voice.md from samples"
prompt: """
Genereaza brand/voice.md personalizat pentru user.

Context:
- USER.md content: {USER.md scris la Q1}
- Voice samples (raw): {samples scrise la Q2}
- Starter pack template: citeste brand/voice.md curent (acela e template-ul de starter pack incarcat la Step 1)
- Business type: {starter_pack chosen}

Tasks:
1. Analizeaza samples-urile pentru: sentence length, vocabulary level, formality, personality markers, favorite phrases.
2. Suprascrie brand/voice.md mentinand structura starter pack-ului dar cu:
   - Tone section: rescris cu tonul observat in samples
   - Vocabulary section: adauga phrases preferate / vocab caracteristic
   - Sentence Rhythm section: ajustat la pattern observat (long/short mix, comma usage, etc.)
   - Personality Traits: ajustate la energy + attitude din samples
   - Never-do list: pastreaza din starter pack daca e generic, adauga specific daca samples revela aversiuni
3. NU sterge structura starter pack — merge cu observatiile reale.
4. Save direct la brand/voice.md.

Returneaza DOAR JSON:
{
  "file": "brand/voice.md",
  "status": "ok" | "failed",
  "characteristics_observed": ["lista scurta cu cele mai distinctive trasaturi voice-ului user-ului"],
  "starter_pack_used": "{type}",
  "notes": "scurt"
}
"""
```

### Agent AUDIENCE

```
subagent_type: general-purpose
description: "Onboard: brand/audience.md personalized"
prompt: """
Genereaza brand/audience.md personalizat.

Context:
- USER.md: {Q1 raspuns}
- Voice samples: {samples} (te ajuta sa intelegi cui vorbeste)
- Starter pack: citeste brand/audience.md curent (template)
- Q3 priorities: {priorities scrise}

Tasks:
1. Pe baza Q1 (cine sunt, ce fac) si samples (cui vorbesc), updateaza brand/audience.md:
   - Demographics: cine e audienta tinta concreta (nu generic)
   - Pain Points: ce probleme rezolva user-ul lor
   - Aspirations: ce vor sa atinga audienta lor
   - Anti-audience: cine NU e audienta (la fel de important)
2. Pastreaza structura starter pack — dar continut specific la business-ul lor.
3. NU rula web research / surveys — doar inferi din ce ai.
4. Save direct la brand/audience.md.

Returneaza DOAR JSON:
{
  "file": "brand/audience.md",
  "status": "ok" | "failed",
  "primary_audience": "scurt",
  "notes": "scurt"
}
"""
```

### Agent POSITIONING

```
subagent_type: general-purpose
description: "Onboard: brand/positioning.md personalized"
prompt: """
Genereaza brand/positioning.md personalizat.

Context:
- USER.md: {Q1 raspuns}
- Q3 priorities: {priorities}
- Starter pack: citeste brand/positioning.md curent (template)
- Voice samples: pentru tone consistency

Tasks:
1. Pe baza Q1 (one-line description) si Q3 priorities (unde se duc), updateaza:
   - One-Liner: cum se pozitioneaza (1 propozitie crisp)
   - Value Proposition: ce ofera + cui + de ce conteaza
   - Differentiators: 3-5 lucruri specifice care-i face diferit
   - Anti-positioning: ce NU sunt (clarifica boundaries)
2. NU rula competitor research — doar inferi din ce ai.
3. Save direct la brand/positioning.md.

Returneaza DOAR JSON:
{
  "file": "brand/positioning.md",
  "status": "ok" | "failed",
  "one_liner": "...",
  "top_differentiator": "...",
  "notes": "scurt"
}
"""
```

## Step 3c: Failure handling (soft-fail variant)

`wall_clock_ms = Date.now() - start_time`. Aceasta e o varianta soft-fail a Multi-Asset Generation — onboarding e cost mare (15 min Q&A) deci nu vrem hard-fail care sa-l forteze sa reia tot.

**Daca toate 3 OK:** continua la Step 4.

**Daca 1 esueaza:**
Spune user-ului: "{file} a esuat de generat. Le-am pastrat pe celelalte. Vrei sa retry pentru {file} acum, sau continui cu starter pack-ul existent pentru fisierul ala?"

Daca retry: respawn JUST acel agent. Daca skip: lasa starter pack-ul intact pentru acel fisier.

**Daca 2+ esueaza:** "Generarea brand-ului a esuat partial ({N}/3 OK). Probabil intermitenta. Vrei sa rulez Step 3 din nou? Inputurile tale (USER.md, samples) sunt salvate."

---

# Step 4: First win (main thread)

Pe baza starter pack + Q5, ruleaza un skill live:

| Pack | Default skill | Why |
|------|--------------|-----|
| consultant | brand-positioning | Trebuie sa-si articuleze unghiul |
| agency | research-competitors | Trebuie sa stie market-ul |
| ecommerce | content-copywriting | Trebuie product copy |
| creator | content-repurpose | Are content de atomizat |
| smb | brand-positioning | Trebuie diferentiator local clar |
| b2b-saas | content-copywriting | Trebuie pagini docs/landing care convertesc dezvoltatori |
| other | sys-goal-breakdown | Universal value |

Spune: "Sa punem asta la treaba. Rulez {skill} cu contextul tau real."

Ruleaza skill-ul. Save output to `projects/`.

Acest pas e momentul cand user-ul vede robOS produce valoare reala personalizata pentru el.

---

# Step 5: 4C score + next steps

Calculeaza scor rapid (NU rulezi /audit complet — e prea greu pentru un new user):

- **Context**: USER.md (5) + voice.md (5) + audience.md (5) + positioning.md (5) + priorities.md (5) = /25
- **Connections**: count tools planned in connections.md. Score = min(count * 4, 25). 0 daca lipsa.
- **Capabilities**: count installed skills (exclud _catalog). Score = min(count * 2, 25).
- **Cadence**: 0 pentru new user (no cron, no memory yet).

```
robOS Score: {total}/100

Context:     {score}/25  ✓ filled
Connections: {score}/25  {status}
Capabilities:{score}/25  {N skills installed}
Cadence:     0/25         (build up over time)

Next steps:
1. {highest-leverage gap — usually Connections or Cadence}
2. {second gap}
3. /audit anytime pentru scor refresh
```

---

# Step 6: Telemetrie + log

```bash
node scripts/parallel-budget.js log sys-onboard parallel 3 {failed_count} {wall_clock_ms} {fallback_used}
```

`fallback_used` = true daca >=1 brand-file agent failed (chiar daca s-a recuperat prin retry sau skip).

Append in `context/learnings.md` sub `## sys-onboard`:
- Date, starter pack chosen, 4C score at completion
- First skill run result (which skill, output location)
- User's automation target from Q5 (for future skill building)
- Brand generation status (ok/partial)
