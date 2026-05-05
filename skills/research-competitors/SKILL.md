---
name: research-competitors
version: 2.0.0
category: research
description: "Analyze competitor messaging, positioning, pricing. MapReduce: 1 agent per competitor scrapes all pages in parallel, a synthesizer builds matrix + identifies gaps + recommends differentiators."
triggers:
  - "analiza competitori"
  - "ce zic concurentii"
  - "competitor analysis"
  - "cum se pozitioneaza ei"
  - "compara-ne cu"
  - "competitive landscape"
  - "competitor research"
negative_triggers:
  - "trending"
  - "trend"
  - "voce de brand"
  - "scrie copy"
output_discipline: encapsulated
concurrency_pattern: mapreduce-research
context_loads:
  - brand/positioning.md (synthesizer reads, for comparison baseline)
  - brand/audience.md (synthesizer reads, for overlap detection)
  - brand/voice.md (synthesizer reads summary, for tone comparison)
  - context/learnings.md (synthesizer appends)
inputs:
  - competitors (required: 3-8 URLs or company names)
  - focus (optional: messaging | pricing | features | audience | all, default: all)
  - our_url (optional: your own site for direct comparison)
outputs:
  - projects/research-competitors/{date}-{slug}/analysis.md
  - projects/research-competitors/{date}-{slug}/matrix.md
  - projects/research-competitors/{date}-{slug}/raw/{competitor}.json
  - data/skill-telemetry.ndjson (appended)
---

# Output Discipline

In transcriptul vizibil userului apare DOAR:
1. Eventual confirmare URL-uri (daca user a dat nume in loc de URL-uri).
2. Executive summary final (3-5 bullets) + path catre raport.

**Reguli stricte:**
- NU folosi TodoWrite.
- NU anunta "Step 1: scrape", "Step 2: matrix", etc.
- NU rula WebFetch direct din main thread — fiecare competitor primeste un agent dedicat.
- Cele N invocari `Agent` pentru competitori TREBUIE SA FIE INTR-UN SINGUR mesaj de raspuns.

---

# Step 0: Resolve URLs (main thread, rapid)

User-ul da N competitori (3-8). Pentru fiecare:
- Daca e URL valid, foloseste-l.
- Daca e nume de companie, ruleaza WebSearch o data: `{name} official site` si ia primul rezultat care arata oficial. Confirma scurt user-ului: "Confirmed: {name} → {url}".

Daca user a dat <3 sau >8 competitori:
- <3: spune "Vreau minim 3 competitori pentru o analiza relevanta. Adauga inca {N} sau confirma sa continui cu cei {N}."
- >8: spune "Maxim 8 competitori per analiza (per cost cap-ul concurrency-ului). Aleg primii 8: {list}. OK?" — daca confirma, taie la 8.

Slug pentru output: `{date}-{first-competitor-slugified}`.

---

# Step 1: Concurrency check

```bash
node scripts/parallel-budget.js check {N} 25
```

(N = numar competitori, 25s estimat per competitor pentru ca scrapeaza ~5 pagini)

- Returneaza `parallel` daca N >= 3.
- `serial` daca N < 3 (rar — am gated la Step 0 sa fie min 3).

Marcheaza `start_time = Date.now()`.

---

# Step 2: Spawn N competitor agents IN PARALLEL

**Critic:** intr-un SINGUR mesaj de raspuns, N invocari `Agent` simultane (una per competitor).

Pentru fiecare competitor URL, spawn:

```
subagent_type: general-purpose
description: "Competitor analysis: {competitor name}"
prompt: """
Esti agentul de analiza pentru competitor: {competitor name} ({competitor URL}).
Focus: {focus} (sau "all" daca user n-a specificat).

Ruleaza WebFetch pe urmatoarele pagini target. Daca o pagina nu exista (404, redirect ciudat), noteaza si continua:

1. Homepage: {url}
2. About: {url}/about, {url}/company, {url}/who-we-are (incearca pana gasesti)
3. Pricing: {url}/pricing, {url}/plans (incearca pana gasesti)
4. Product/Features: {url}/product, {url}/features
5. Blog: {url}/blog (doar lista de titluri recente, nu scrape blog posts intregi)

Pentru fiecare pagina accesibila, extrage:

### Messaging
- headline: H1/hero text
- value_prop: core promise in 1 sentence
- supporting_claims: 3-5 puncte sub the fold
- social_proof_type: logos | testimonials | case studies | numbers | none
- cta_language: ce zic butoanele

### Audience signals
- pronouns_used: "you" / "your team" / pluralism
- job_titles_mentioned: ["..."]
- pain_points_referenced: ["..."]
- sophistication_level: technical | mid | accessible
- industry_focus: ["..."]

### Pricing (daca pricing accesibila)
- model: freemium | flat | per-seat | usage | custom
- tiers_count: N
- tier_names: ["..."]
- anchor_price: tier-ul cel mai promovat
- free_trial: yes/no, gated/ungated

### Tone
- formality: casual | professional | corporate | playful
- personality_markers: humor | urgency | authority | empathy | data-driven
- vocabulary_patterns: phrases repetate, branded terms

### Blog signal
- recent_post_count: cate posts in ultimele 30 zile
- topics_covered: ["..."]
- content_format: long-form | short | mixed

### Notes
- strengths_observed: ce face bine
- weaknesses_observed: ce face slab / gaps
- pages_failed: ["..."] daca vreuna nu accesibila

Returneaza DOAR JSON:
{
  "competitor": "{name}",
  "url": "{url}",
  "status": "ok" | "partial" | "failed",
  "pages_analyzed": ["homepage","about",...],
  "pages_failed": ["..."],
  "messaging": {...},
  "audience": {...},
  "pricing": {...} | null,
  "tone": {...},
  "blog": {...} | null,
  "strengths": ["..."],
  "weaknesses": ["..."],
  "notes": "scurt"
}
"""
```

Daca user a oferit `our_url`, spawn un agent IN ACELASI MESAJ pentru brand-ul propriu cu acelasi prompt.

---

# Step 3: Spawn synthesizer agent

Dupa ce primesti N JSON-uri (sau marcat ca failed), spawn UN synthesizer:

```
subagent_type: general-purpose
description: "Competitor synthesis: matrix + gaps + recommendations"
prompt: """
Esti synthesizer-ul pentru research-competitors. Slug: {slug}.

Competitor JSONs (N paralele):
{aici cele N JSON-uri primite — pentru cele failed, placeholder cu "status":"failed"}

{Daca our_url a fost folosit: include si JSON-ul brand-ului propriu cu marker "is_self": true}

Optional context:
- brand/positioning.md — pentru comparison baseline (citeste daca exista)
- brand/audience.md — pentru overlap detection
- brand/voice.md — summary pentru tone comparison

Tasks:

1. **Comparison matrix**: tabel cu coloane = competitori (+ You daca our_url), randuri = dimensiuni (Headline, Value prop, Target audience, Pricing model, Key differentiator, Tone, Social proof). Markdown table.

2. **Identify patterns**:
   - Messaging overlaps: unde 3+ competitori spun acelasi lucru ("sea of sameness")
   - Underserved angles: topics/audiences/benefits pe care nimeni nu le emphasizeaza
   - Pricing gaps: price points sau modele neacoperite
   - Audience mismatches: disconnect intre cine zic ca servesc vs content signals

3. **Recommend differentiators** (3-5):
   Pentru fiecare:
   - The gap (ce e missing in market)
   - Evidence (data din analiza care confirma)
   - How to claim it (messaging / positioning / feature angle specific)
   - Risk (de ce competitorii poate au evitat)
   - Impact (high/medium/low) + Effort (high/medium/low)

4. **Scrie 3 livrabile**:

   `projects/research-competitors/{slug}/analysis.md`:
   ```markdown
   # Competitor Analysis: {brand} vs {N} competitors
   **Date**: {date} | **Competitors analyzed**: {N_ok}/{N_total}{coverage_warning}

   ## Executive Summary
   3-5 bullets cu most important findings.

   ## Competitor Matrix
   {table de la step 1}

   ## Messaging Map
   {2-axis positioning visualization in text — ex. "Authority axis vs Approachability axis"}

   ## Key Findings
   ### Sea of Sameness
   ### Gaps
   ### Pricing Landscape
   ### Audience Alignment

   ## Recommended Differentiators
   {ranked list de la step 3}

   ## Per-Competitor Deep Dives
   {Per competitor: strengths + weaknesses + key takeaways}

   ## Coverage Notes
   {Daca o sursa a esuat, mentioneaza scurt aici. Altfel "Coverage complete."}
   ```

   `projects/research-competitors/{slug}/matrix.md`: doar tabelul standalone, pentru re-use rapid.

   `projects/research-competitors/{slug}/raw/{competitor-slug}.json`: cate un fisier pentru fiecare competitor cu JSON-ul complet primit de la agentul lui.

5. **Append in context/learnings.md** sub `## research-competitors`:
   ```
   ### {date}
   - Competitors: {names joined}
   - Analyzed: {N_ok}/{N_total}
   - Failed: {list daca exista, altfel "none"}
   - Key differentiator identified: {top recommendation}
   - Biggest gap: {gap description}
   ```

6. Returneaza DOAR JSON:
{
  "analysis_path": "projects/research-competitors/{slug}/analysis.md",
  "matrix_path": "projects/research-competitors/{slug}/matrix.md",
  "competitors_ok": N,
  "competitors_failed": ["..."],
  "executive_summary_bullets": ["3-5 bullets text"],
  "top_recommendation": "o propozitie",
  "biggest_gap": "o propozitie",
  "coverage_complete": true/false
}
"""
```

---

# Step 4: Output (main thread)

`wall_clock_ms = Date.now() - start_time`.

Output exact:

```
Analysis saved: {analysis_path}
Matrix: {matrix_path}

Executive summary:
- {bullet 1}
- {bullet 2}
- {bullet 3}
{eventual 4-5}

Top recommendation: {top_recommendation}
Biggest gap: {biggest_gap}
{coverage_note}
```

`coverage_note`: "" daca coverage_complete=true. Altfel "\n⚠ Competitori esuati: {competitors_failed joined}. Ruleaza din nou cu doar acele URL-uri pentru retry." pe linie noua.

STOP.

---

# Step 5: Telemetrie

```bash
node scripts/parallel-budget.js log research-competitors parallel {N+1} {agents_failed_count} {wall_clock_ms} {fallback_used}
```

- agents = N competitori + 1 synthesizer (+ 1 daca s-a inclus our_url)
- agents_failed = numarul de competitori cu status="failed"
- fallback_used = true daca coverage_complete=false
