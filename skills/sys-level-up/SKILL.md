---
name: sys-level-up
version: 2.0.0
category: sys
description: "Asks 5 targeted questions to discover what to automate next. Adversarial Synthesis: 3 parallel agents (PRO/CONTRA/ALT) analyze answers + synthesizer produces balanced trade-off matrix instead of single confirmation-bias view."
triggers:
  - "level up"
  - "ce sa automatizez"
  - "imbunatateste"
  - "urmatorul pas"
  - "what should I automate"
  - "what's next"
  - "help me improve"
  - "find automation opportunities"
negative_triggers:
  - "level up a skill"
  - "upgrade"
  - "update"
output_discipline: encapsulated
concurrency_pattern: adversarial-synthesis
context_loads:
  - context/USER.md (sub-agents read)
  - context/priorities.md (sub-agents read)
  - connections.md (sub-agents read)
  - context/learnings.md (sub-agents read + synthesizer appends)
  - skills/_catalog/catalog.json (sub-agents read)
inputs: []
outputs:
  - 3 perspective deliverables (PRO/CONTRA/ALT) merged into a trade-off matrix
  - context/priorities.md updated cu DEFERRED items
  - context/learnings.md appended sub ## sys-level-up
  - data/skill-telemetry.ndjson (appended)
---

# Output Discipline

In transcriptul vizibil userului apare DOAR:
1. Cele 5 intrebari de discovery (pe rand, asteptand raspuns).
2. Trade-off matrix final + intrebarea "vrei sa actionez pe vreuna?".
3. Pasi de actiune daca user accepta.

**Reguli stricte:**
- NU folosi TodoWrite.
- NU anunta "Step 1: set context", "Step 3: analyze answers", etc.
- NU rula Read direct din main thread pe USER.md, priorities.md, connections.md, learnings.md, catalog.json — toate citite de sub-agenti.
- Cele 3 invocari `Agent` adversariale (PRO/CONTRA/ALT) TREBUIE SA FIE INTR-UN SINGUR mesaj. Synthesizer e separat dupa.

---

# Step 1: Discovery Q&A (main thread, interactiv)

Intreaba pe rand cele 5 intrebari, asteptand fiecare raspuns inainte de urmatoarea. Acest pas e **inerent secvential** (user-blocking) — nu paralelizezi.

**Q1 — Repetition detector:**
"Walk me through saptamana asta. Ce ai facut de 3+ ori?"

**Q2 — Drudgery detector:**
"A fost ceva ce a parut manual, plictisitor, sau copy-paste? Unde te-ai gandit 'trebuie sa fie o cale mai buna'?"

**Q3 — Smart intern test:**
"A fost ceva ce un intern smart ar fi putut face — dar ai facut tu pentru ca explicarea ar fi durat mai mult decat executarea?"

**Q4 — Bottleneck detector:**
"Daca luni iti pica de 10x mai multa munca, ce-ar ceda primul?"

**Q5 — Growth lever:**
"Ce te-ar duce la 10 clienti in plus (sau 10x output) maine, daca ar rula pe pilot automat?"

Pastreaza raspunsurile ca un bloc structurat:
```
A1: ...
A2: ...
A3: ...
A4: ...
A5: ...
```

---

# Step 2: Concurrency check

```bash
node scripts/parallel-budget.js check 3 25
```

Returneaza `parallel`. Marcheaza `start_time = Date.now()`.

---

# Step 3: Spawn 3 adversarial agents IN PARALLEL

**Critic:** intr-un SINGUR mesaj de raspuns, 3 invocari `Agent` simultane.

Toate primesc:
- Cele 5 raspunsuri (A1-A5)
- Acces la `context/USER.md`, `context/priorities.md`, `connections.md`, `context/learnings.md`, `skills/_catalog/catalog.json`

## Agent PRO — best-case for action

```
subagent_type: general-purpose
description: "Level-up: PRO perspective"
prompt: """
Esti agentul PRO pentru sys-level-up. Joaca optimist constructiv.

User answers:
{A1-A5}

Citeste contextual: context/USER.md, context/priorities.md, connections.md, context/learnings.md, skills/_catalog/catalog.json.

Task:
Identifica top 3 sugestii cu cel mai puternic caz PENTRU actiune. Pentru fiecare:
- Type: build skill / install catalog skill / add connection
- Title scurt
- From: Q{n} — citat scurt din raspuns
- Frequency (daily/weekly/monthly)
- Time cost estimat (hours sau minutes)
- AI leverage % (cat poate AI face: 0-100)
- Why this is THE win: cel mai puternic argument pro
- Next step: actiune exacta (comanda sau intrebare)

Filtreaza prin Feasibility Gate:
- PASS: rezolvabil cu un SKILL.md folosing context si conectari existente / install catalog skill / o singura cheie API noua in .env
- DEFER: necesita infrastructura platita noua / >2h setup manual / acces la sisteme inaccesibile / multi-human coordination

Returneaza DOAR JSON:
{
  "perspective": "pro",
  "status": "ok" | "failed",
  "suggestions_pass": [
    {"rank": 1, "type":"...", "title":"...", "from_q":N, "quote":"...", "frequency":"...", "time_cost":"...", "ai_leverage_pct":N, "why":"...", "next_step":"..."},
    ...
  ],
  "suggestions_deferred": [
    {"title":"...", "blocked_by":"..."},
    ...
  ]
}
"""
```

## Agent CONTRA — best-case against action

```
subagent_type: general-purpose
description: "Level-up: CONTRA perspective"
prompt: """
Esti agentul CONTRA pentru sys-level-up. Joaca skeptic riguros — caut motive sa NU automatizam.

User answers:
{A1-A5}

Citeste contextual la fel ca agentul PRO.

Task:
Pentru fiecare din raspunsurile A1-A5, identifica reasons sa NU automatizezi acum:
- Premature optimization: e prea rar sau prea putin time-cost?
- Misclassification: ce pare repetitiv chiar e? Sau e diferit de fiecare data?
- Hidden cost: setup-ul ar dura mai mult decat economia totala estimata?
- Quality risk: AI ar produce output mai prost decat user-ul, chiar daca mai rapid?
- Identity / craft: e ceva ce user-ul VREA sa faca el, nu sa delegheze?
- Already covered: user-ul are deja un skill / tool care face asta dar nu-l foloseste?

Apoi identifica 1-2 "false positives" — sugestii care PAR bune dar n-ar trebui actionate inca.

Returneaza DOAR JSON:
{
  "perspective": "contra",
  "status": "ok" | "failed",
  "warnings": [
    {"about_q":N, "warning_type":"premature|misclassification|hidden_cost|quality|identity|already_covered", "reasoning":"..."},
    ...
  ],
  "false_positives": [
    {"would_be_pro_suggestion":"...", "why_not_now":"..."},
    ...
  ],
  "skip_recommendation": "scurt — ce ar face TU daca ai fi user-ul"
}
"""
```

## Agent ALT — third option

```
subagent_type: general-purpose
description: "Level-up: ALT (third option)"
prompt: """
Esti agentul ALT pentru sys-level-up. Joaca lateral thinker — caut alternativa neevidenta pe care PRO si CONTRA n-ar gandi-o.

User answers:
{A1-A5}

Citeste contextual la fel ca ceilalti.

Task:
Pentru fiecare din raspunsurile A1-A5 (sau pentru pattern-ul lor agregat), identifica abordari laterale:
- Re-framing: nu automatiza task-ul X, ci elimina-l (de ce face user-ul X in primul rand?)
- Combine: 2 task-uri intermitente se pot combina intr-un proces unic mai mare?
- Outsource: nu skill, ci o resursa externa (VA, contractor, tool platit)?
- Procedure change: nu AI, ci un schimbe de proces care reduce munca cu 80%?
- Strategic pivot: ce pattern emerge din A1-A5 care indica o decizie mai mare (ex: schimba target market, schimba pricing model)?

Identifica 1-3 "third options" pe care PRO si CONTRA le-ar pierde.

Returneaza DOAR JSON:
{
  "perspective": "alt",
  "status": "ok" | "failed",
  "third_options": [
    {"title":"...", "type":"reframing|combine|outsource|procedure|strategic", "from_q":N, "approach":"...", "why_overlooked":"..."},
    ...
  ],
  "meta_pattern": "scurt — daca exista un pattern across A1-A5 care indica ceva mai mare"
}
"""
```

---

# Step 4: Spawn synthesizer agent

Dupa ce ai cele 3 JSON-uri:

```
subagent_type: general-purpose
description: "Level-up: synthesize trade-off matrix"
prompt: """
Esti synthesizer-ul pentru sys-level-up. Primesti 3 perspective adversariale.

PRO JSON: {pro_json}
CONTRA JSON: {contra_json}
ALT JSON: {alt_json}

Task:
1. Reconcile: pentru fiecare sugestie PRO, vezi daca CONTRA a marcat-o ca false_positive sau warning. Reconcile.
2. Build trade-off matrix:
   | Optiune | Tip | Why now (PRO) | Why not (CONTRA) | Hidden alt (ALT) | Recomandare |
   Top 3-5 randuri.
3. **NU recommendezi cea mai entuziasta optiune** — recomanda optiunea care supravietuieste celor mai multe obiectii CONTRA si care nu e dominata de un third option ALT mai bun.
4. Daca skip_recommendation de la CONTRA + un strong third option de la ALT pun la indoiala intregul exercitiu, fii onest: "Niciuna nu e clar worth-it acum."
5. Append in context/learnings.md sub ## sys-level-up:
   ```
   ### {date}
   - User answered 5 discovery questions
   - PRO surfaced: {N suggestions}
   - CONTRA flagged: {N warnings, N false positives}
   - ALT surfaced: {N third options}
   - Synthesis: {top recommendation sau "no clear winner"}
   ```
6. Pentru DEFERRED items de la PRO (Feasibility Gate fail), append in context/priorities.md sub Parking lot:
   `[sys-level-up {date}] {title} - Blocat de: {what's needed first}`

Returneaza DOAR JSON:
{
  "matrix": [
    {"option":"...", "type":"...", "pro_why":"...", "contra_why_not":"...", "alt_third_option":"...", "recommendation":"act|defer|skip"}
  ],
  "top_recommendation": "scurt — care optiune sau 'no clear winner'",
  "second_choice": "scurt sau null",
  "skip_entirely": true/false,
  "skip_reason": "scurt sau null",
  "deferred_count": N,
  "deferred_added_to_parking": ["..."]
}
"""
```

---

# Step 5: Output (main thread)

`wall_clock_ms = Date.now() - start_time`.

Output trade-off matrix in format clar:

```
Trade-off matrix dupa 3 perspective:

| Optiune | Tip | PRO | CONTRA | ALT third option | Recomand |
|---------|-----|-----|--------|------------------|----------|
| ...     | ... | ... | ...    | ...              | act/defer/skip |

Recomandarea principala: {top_recommendation}
{second_choice ca alternativa daca exista}

{daca skip_entirely}: Niciuna nu e clar worth-it acum. Motivul: {skip_reason}.
{deferred N items adaugate in parking lot priorities.md.}

Vrei sa actionez pe ceva? Sau lasi totul logat in priorities pentru mai tarziu?
```

---

# Step 6: Act on decision (main thread)

Daca user spune "build {ceva}" / "install {nume}" / "connect {tool}":
- Build skill → invoca `sys-skill-builder` cu descrierea
- Install → ruleaza `bash scripts/add-skill.sh {name}` (vizibil — actiune autorizata)
- Connect → ghideaza setup .env

Daca user spune "skip" / "lasa-le pentru mai tarziu" → confirma ca sunt logate si gata.

---

# Step 7: Telemetrie

```bash
node scripts/parallel-budget.js log sys-level-up parallel 4 {failed_count} {wall_clock_ms} {fallback_used}
```

- agents = 4 (PRO + CONTRA + ALT + synthesizer)
- agents_failed = numarul de perspective cu status="failed". 

**Hard-fail nota**: per Pattern 5, daca >=1 perspectiva esueaza, synthesizer-ul primeste contextul ca incomplet si recomanda re-run. Tu (main thread) trebuie sa flag user-ul:

```
⚠ Adversarial Synthesis incomplet — perspectiva {failed_perspectives} a esuat. Recomandarea de mai sus se bazeaza pe doar {N_ok}/3 perspective. Pentru decizii strategice mai mari, ruleaza /level-up din nou.
```

`fallback_used` = true daca >=1 agent failed.
