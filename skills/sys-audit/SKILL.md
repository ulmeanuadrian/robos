---
name: sys-audit
version: 3.0.0
category: sys
description: "Scor 4C (Context, Connections, Capabilities, Cadence) din 100. Pillar Fan-Out: 4 sub-agenti paraleli scoreaza fiecare cate un pilon, un reducer agreaga top-gaps + delta + cache. Userul vede doar raportul final."
triggers:
  - "audit"
  - "verifica setup-ul"
  - "cum stau"
  - "scor 4C"
  - "run an audit"
  - "how's my setup"
  - "what am I missing"
  - "4C score"
  - "check my AIOS"
negative_triggers:
  - "audit a client"
  - "security audit"
  - "code audit"
output_discipline: encapsulated
concurrency_pattern: pillar-fan-out
modes:
  - full (default): audit complet + raport detaliat + loop optional de revizie
  - quick: scor + top gap, fara save, folosit de morning routine
  - force: forteaza recalculare ignorand cache-ul
context_loads:
  - context/USER.md (sub-agents read)
  - brand/* (sub-agents read)
  - context/priorities.md (sub-agents read)
  - connections.md (sub-agents read)
  - context/learnings.md (sub-agents read)
  - data/audit-cache.json (main + reducer write)
inputs:
  - mode (optional: "full" | "quick" | "force", default "full")
outputs:
  - context/audits/{YYYY-MM-DD}.md (in full mode, written by reducer)
  - data/audit-cache.json (written by reducer)
  - data/skill-telemetry.ndjson (appended)
  - Raport final concis afisat user-ului
---

# Output Discipline (citeste inainte de a face orice)

Acest skill ruleaza in mod **incapsulat** + **paralelizat (Pillar Fan-Out)**. In transcriptul vizibil userului trebuie sa apara DOAR:

1. (Quick mode) Un singur one-liner: scorul + top gap.
2. (Full mode) Raportul final compact + intrebarea "vrei sa repar gap-ul #1?".
3. (Fix loop) Doar pasii efectivi de remediere.

**Reguli stricte:**
- NU folosi TodoWrite.
- NU anunta "Step 1: scan...", "Step 2: scoring...", etc.
- NU rula Read direct din main thread pe brand/, USER.md, learnings.md, priorities.md, connections.md.
- Cele 4 invocari `Agent` pentru piloni TREBUIE SA FIE INTR-UN SINGUR mesaj de raspuns (4 tool calls in acelasi message). Mesaje separate = secvential = pierzi tot castigul.

---

# Step 0: Cache check (main thread, fast)

Inainte de orice scanare, verifica cache-ul prin helper-ul canonic. Skip pasul daca `mode = force`.

```bash
node scripts/audit-cache.js status --json
```

Helper-ul returneaza JSON cu structura:
```json
{ "status": "hit" | "miss", "reason": "...", "cache": {...} | null, "age_ms": N }
```

Parseaza JSON-ul. Pastreaza `cache.input_hash` daca status=hit (vei avea nevoie de el la Step 3 pentru cache write). Doua cai:

**Status: hit** → mergi la Step 4 (Output) cu valorile din `cache`. Mode-ul ramane same; in quick → one-liner cu " (cached)", in full → raport scurt.

**Status: miss** sau `mode=force` → continua la Step 1. Pentru a obtine hash-ul curent (necesar la Step 3 cache write), ruleaza:

```bash
node scripts/audit-cache.js hash
```

Pastreaza output-ul (un sha256 hex) pentru reducer.

---

# Step 1: Decide concurrency mode

Cheama helper-ul:

```bash
node scripts/parallel-budget.js check 4 15
```

In conditii normale (4 piloni, ~15s/pilon) → returneaza `parallel`. Daca returneaza `serial` (modificare neasteptata a pragurilor), foloseste fallback-ul: spawn UN SINGUR agent monolitic care ruleaza toti 4 piloni secvential, apoi sari direct la Step 3.

Pentru modul normal (parallel), continua la Step 2.

---

# Step 2: Spawn 4 pillar agents IN PARALLEL

**Regula critica:** intr-un SINGUR mesaj de raspuns, fa 4 invocari `Agent` simultane. Toate 4 trebuie sa fie tool calls separate in acelasi assistant message.

Inceput timpul cu `Date.now()` la inceputul Step 2; il vei folosi la Step 5 pentru telemetrie.

## Agent CTX — Context pillar

```
subagent_type: general-purpose
description: "Audit Context pillar"
prompt: """
Scoreaza pilonul Context pentru sys-audit in robOS. Citeste tacit:

- context/USER.md → 5pt daca name + business sunt completate cu valori reale, 0 daca placeholder/template
- brand/voice.md → 5pt daca are tone/vocabulary real (nu doar HTML comments), 0 daca template
- brand/audience.md → 5pt daca demographics + pain points reale, 0 daca template
- brand/positioning.md → 5pt daca one-liner + differentiators reale, 0 daca template
- context/priorities.md → 5pt daca exista cu Q goals, 0 daca lipseste

Pentru fiecare fisier, "real" inseamna ca un cititor nou ar putea folosi continutul. "Template" inseamna doar HTML comments, placeholders gen [your name], sau text generic care n-a fost personalizat.

Returneaza DOAR JSON, nimic altceva:
{
  "pillar": "context",
  "score": N,
  "max": 25,
  "details": {
    "user_md": {"score": N, "note": "scurt"},
    "voice": {"score": N, "note": "scurt"},
    "audience": {"score": N, "note": "scurt"},
    "positioning": {"score": N, "note": "scurt"},
    "priorities": {"score": N, "note": "scurt"}
  }
}
"""
```

## Agent CONN — Connections pillar

```
subagent_type: general-purpose
description: "Audit Connections pillar"
prompt: """
Scoreaza pilonul Connections pentru sys-audit in robOS. Citeste tacit connections.md si .env.

7 domenii tier-1 (numara cate sunt acoperite, fie via connections.md fie via .env):
- Revenue (Stripe, QuickBooks, payment)
- Customer (CRM, support, community)
- Calendar (Google Calendar, Calendly)
- Comms (email, Slack, messaging)
- Tasks (ClickUp, Notion, Linear)
- Meetings (Fireflies, Otter, transcription)
- Knowledge (Drive, local files, wikis)

Score domain = min(domains_covered * 3.5, 25), rotunjit la integer.

API keys bonus: pentru fiecare cheie non-empty in .env (FIRECRAWL_*, OPENAI_*, XAI_*, YOUTUBE_*, GEMINI_*) adauga +1 la score. Cap total: 25.

Returneaza DOAR JSON:
{
  "pillar": "connections",
  "score": N,
  "max": 25,
  "details": {
    "domains_covered": N,
    "domains_list": ["..."],
    "active_api_keys": N,
    "missing_high_value": ["..."]
  }
}
"""
```

## Agent CAP — Capabilities pillar

```
subagent_type: general-purpose
description: "Audit Capabilities pillar"
prompt: """
Scoreaza pilonul Capabilities pentru sys-audit in robOS.

- Numara skills instalate in skills/ (exclude _catalog/, _index.json, fisiere care nu sunt directoare): 2pt/skill, max 20pt.
- Verifica context/learnings.md: daca are intrari per-skill reale (nu doar headere goale), +5pt.
- Cap total: 25.

Returneaza DOAR JSON:
{
  "pillar": "capabilities",
  "score": N,
  "max": 25,
  "details": {
    "skills_installed": N,
    "skill_names": ["..."],
    "learnings_active": true/false,
    "categories_covered": ["sys","content","brand","research","tool"]
  }
}
"""
```

## Agent CAD — Cadence pillar

```
subagent_type: general-purpose
description: "Audit Cadence pillar"
prompt: """
Scoreaza pilonul Cadence pentru sys-audit in robOS.

- Cron jobs activi in cron/jobs/ (cel putin 1 fisier non-empty): 8pt daca da, 0 altfel.
- Memory files in context/memory/ din ultimele 7 zile (verifica filename YYYY-MM-DD vs azi): 7pt daca exista cel putin 1, 0 altfel.
- context/audits/ exista cu cel putin un fisier de audit: 5pt daca da, 0 altfel.
- sys-session-close rulat recent: cauta linia "Session: N deliverables, M decisions" in cea mai recenta memorie din ultimele 7 zile. 5pt daca exista, 0 altfel.
- Cap total: 25.

Data de azi: foloseste data sistemului. Pentru filename matching, parseaza prima parte YYYY-MM-DD din nume.

Returneaza DOAR JSON:
{
  "pillar": "cadence",
  "score": N,
  "max": 25,
  "details": {
    "cron_active": true/false,
    "recent_memory_count": N,
    "audits_history": true/false,
    "session_close_pattern": true/false
  }
}
"""
```

---

# Step 3: Spawn reducer agent

Dupa ce ai primit cele 4 JSON-uri (sau marcat unele ca esuate), spawn UN agent reducer:

```
subagent_type: general-purpose
description: "Audit reducer — gaps + delta + save"
prompt: """
Esti reducer-ul pentru sys-audit. Primesti 4 pillar JSONs (sau flag-uri de esec). Mode: {full|quick}.

Pillar JSONs:
{aici inserezi cele 4 JSON-uri primite, sau placeholder cu "FAILED" daca un pilon a esuat}

Input hash (pentru cache): {hash-ul calculat la Step 0}

Tasks:

1. **Total + label**:
   - Total = suma pillar scores. Pentru piloni esuati, foloseste 0 + flag "incomplete".
   - Label: 0-20 "Getting started", 21-40 "Foundation laid", 41-60 "Growing", 61-80 "Strong", 81-100 "Operating".
   - Daca >=2 piloni esuati, label devine "Incomplete (X pillars failed)".

2. **Top 3 gaps**: pentru fiecare pilon sub max si NEFALAT, gap = 25 - score. Sorteaza desc. Pentru top 3:
   - Name (ex: "Connections")
   - Pillar
   - Current/max
   - Why (o propozitie despre de ce conteaza)
   - Fix (actiune concreta — comanda exacta, intrebare specifica, sau pas urmator)

3. **Delta**: cauta context/audits/. Daca exista fisiere YYYY-MM-DD.md, gaseste cel mai recent. Extrage scorul lui (linia "## Score: N/100"). Calculeaza diff. Daca nu exista istoric, delta = null.

4. **Save** (DOAR daca mode = full SI nu sunt erori critice):
   - Scrie context/audits/{YYYY-MM-DD de azi}.md cu: titlu, score, label, tabel piloni cu detalii, top 3 gaps cu fixes, sectiune "Changes Since Last Audit".
   - Scrie data/audit-cache.json: { score, pillars, label, top_gaps, computed_at: ISO acum, input_hash: {hash primit} }.

In quick mode: NU scrii fisierul de audit, dar TOT actualizezi cache-ul.

5. Returneaza DOAR JSON:
{
  "score": N,
  "label": "...",
  "pillars": { "context": {"score":N, "failed":false}, ... },
  "incomplete": true/false,
  "failed_pillars": ["..."],
  "top_gaps": [{"name":"...", "pillar":"...", "current":N, "max":25, "why":"...", "fix":"..."}, ...],
  "delta": { "previous_score": N, "previous_date": "YYYY-MM-DD", "diff": +N } sau null,
  "audit_file_path": "..." sau null
}
"""
```

---

# Step 4: Output (main thread)

Calculeaza wall_clock_ms = `Date.now() - start_time_step2`.

## Quick mode

```
4C: {score}/100 ({label}) | Top gap: {top_gaps[0].name} ({top_gaps[0].pillar} {top_gaps[0].current}/25){cached}{warning}{incomplete_flag}
```

- `cached`: " (cached)" daca cache hit la Step 0
- `warning`: " ⚠ -{abs(diff)} vs {previous_date}" daca delta + diff<0
- `incomplete_flag`: " — incomplete (X pillars failed)" daca incomplete=true

STOP. Nu output altceva.

## Full mode

```
Scor: {score}/100 ({label}){delta_line}{incomplete_line}

Pillars:
- Context:      {pillars.context.score}/25{pillar_fail_marker}
- Connections:  {pillars.connections.score}/25
- Capabilities: {pillars.capabilities.score}/25
- Cadence:      {pillars.cadence.score}/25

Top 3 gaps:
1. {top_gaps[0].name} ({top_gaps[0].pillar}: {top_gaps[0].current}/25)
   {top_gaps[0].why}
   Fix: {top_gaps[0].fix}
2. ...
3. ...

Detalii: {audit_file_path}
```

- `delta_line`: " (+{diff} fata de {previous_date})" daca delta cu diff>=0, " ({diff} fata de {previous_date})" daca diff<0, omite daca null.
- `incomplete_line`: "\nNote: Audit incomplete — {failed_pillars} a/au esuat. Ruleaza /audit force pentru retry." daca incomplete=true.
- `pillar_fail_marker`: " ⚠ failed" pentru piloni in failed_pillars.

End cu: "Vrei sa repar gap-ul #1 acum? Spune **fix it**. Sau /level-up pentru oportunitati, /daily-plan pentru plan de zi."

---

# Step 5: Telemetrie (main thread, post-output)

Dupa ce ai afisat raportul, scrie telemetria. UN bash call:

```bash
node scripts/parallel-budget.js log sys-audit {mode_label} 4 {failed_count} {wall_clock_ms} {fallback_used}
```

- `mode_label`: "parallel" daca s-a folosit fan-out, "serial" daca fallback monolitic, "cached" daca cache hit la Step 0 (in cazul cached, agents=0, failed=0).
- `failed_count`: numarul de piloni esuati (0-4).
- `fallback_used`: true daca incomplete=true.

Asta e tacit pentru user — bash call-ul scrie ndjson, nu trebuie afisat output.

---

# Step 6: Fix loop (triggered by "fix it" / "repara" / "da")

Daca user raspunde afirmativ dupa Step 4:

**Iteration N (max 3):**

1. Ia gap-ul curent (start cu #1).
2. Executa fix-ul:
   - Daca cere informatii doar de la user (ex: completare brand/voice.md): pune intrebarile minime in main thread, primesti raspunsurile, deleaga scrierea fisierului unui Agent rapid.
   - Daca e comanda concreta (ex: bash scripts/add-skill.sh {name}): ruleaza in main thread (actiune autorizata).
   - Daca cere setup .env: ghideaza pas cu pas in main thread.
3. Dupa fix, deleaga RESCAN punctual (NU full audit) catre un agent specialist pe pilonul afectat.
4. Raporteaza delta: "{Pillar}: {old}/25 → {new}/25 (+{diff})".
5. Daca a urcat: "Gap #N adresat. Trecem la gap #{N+1}?"

**Stall detection:** daca pilon-ul NU a urcat dupa fix, NU re-incerca. Spune: "Acest gap necesita actiuni manuale (cont API platit, samples reale). Logat in Open Threads." Append in memoria zilei sub Open Threads.

**Hard limits:** max 3 iteratii per sesiune. Niciodata loop fara confirmare. Niciodata acelasi fix de doua ori.
