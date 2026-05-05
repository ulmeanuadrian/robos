---
name: sys-daily-plan
version: 2.0.0
category: sys
description: "Morning planning skill. Mecanica de gather + synthesis (citire memorie, priorities, learnings) e incapsulata intr-un sub-agent — userul vede doar planul propus, ajusteaza, si confirma."
triggers:
  - "plan my day"
  - "planifica-mi ziua"
  - "plan de zi"
  - "morning coffee"
  - "daily plan"
  - "what should I focus on"
  - "what's on my plate"
  - "ce am de facut azi"
negative_triggers:
  - "plan a project"
  - "plan a campaign"
  - "quarterly plan"
output_discipline: encapsulated
context_loads:
  - context/priorities.md (sub-agent reads)
  - context/memory/ (sub-agent reads last 3 days)
  - connections.md (sub-agent reads, summary)
  - context/learnings.md (sub-agent reads, summary)
inputs:
  - date (optional, defaults to today)
outputs:
  - Plan zilnic scris in memoria zilei (via sub-agent dupa confirmare)
---

# Output Discipline (citeste inainte de a face orice)

Acest skill ruleaza in mod **incapsulat**. In transcriptul vizibil userului trebuie sa apara DOAR:

1. Planul propus (max 20 linii, format definit la Step 2).
2. Intrebarea de confirmare/ajustare ("Asta e sugestia mea. Vrei sa ajustezi sau mergi cu asta?").
3. Mesajul de kickoff dupa salvare.

**Reguli stricte:**
- NU folosi TodoWrite.
- NU anunta "Step 1: gather context", "Step 2: synthesize", etc.
- NU rula Read direct din main thread pentru priorities.md, memorie sau connections.md.
- Userul nu trebuie sa vada lista de fisiere scanate sau procesul de sinteza.

---

# Step 1: Deleaga gather + synthesis (UN SINGUR Agent call)

Invoca Agent tool o singura data:

```
subagent_type: general-purpose
description: "Daily plan — gather + synthesize"
prompt: """
Esti agentul de pregatire pentru sys-daily-plan in robOS.

Ruleaza tacit:

1. Citeste context/priorities.md — extrage obiectivele de Q curent + parking lot.

2. Citeste ultimele 3 fisiere din context/memory/ (sortate dupa filename YYYY-MM-DD desc). Pentru fiecare, extrage:
   - ### Open Threads (lucruri neterminate)
   - ### Decisions (alegeri facute, ca sa nu redecidem)
   - ### Deliverables (momentum recent)

3. Scaneaza connections.md — note ce tooluri sunt conectate (relevant pentru sugestii de skill).

4. Sintetizeaza in 3 categorii:
   - **Carry-overs**: open threads care necesita atentie azi
   - **Priority work**: aliniat cu Q goals
   - **Quick wins**: <30 min, momentum builders

5. Pentru fiecare priority, identifica:
   - Skill care aplica (din skills/_index.json) sau "manual work" daca niciunul
   - AI leverage % estimat pentru priority #1 (cat poate AI face: 0-100%)

6. Construieste max 3 prioritati (rank descending: importance * urgency).

7. Daca un fisier lipseste sau e gol, lucreaza cu ce exista. Nu bloca.

8. Returneaza DOAR acest JSON:
{
  "today_date": "YYYY-MM-DD",
  "today_dow": "Monday" | ...,
  "session_number": N (verifica daca exista deja memorie azi → N+1, altfel 1),
  "priorities": [
    { "rank": 1, "title": "...", "skill": "skill-name" | "manual work", "rationale": "scurt — de ce e priority #1" },
    { "rank": 2, "title": "...", "skill": "..." },
    { "rank": 3, "title": "...", "skill": "..." }
  ],
  "carry_overs": ["thread 1", "thread 2"],
  "default_shift": "o propozitie scurta despre AI leverage % pentru priority #1",
  "no_priorities_reason": null sau "explicatie daca nu s-au gasit prioritati clare"
}
"""
```

Astepti JSON-ul. Nu il afisezi brut.

---

# Step 2: Prezinta planul (main thread)

Format exact, max 20 linii:

```
Today: {today_dow}, {today_date}

Priorities:
1. {priorities[0].title}
   Skill: {priorities[0].skill}
2. {priorities[1].title}
   Skill: {priorities[1].skill}
3. {priorities[2].title}
   Skill: {priorities[2].skill}

Carry-overs:
- {carry_overs[0]}
- {carry_overs[1]}

Default shift check (priority #1):
{default_shift}
```

Omiteri:
- Daca `carry_overs` e gol, scoate sectiunea complet.
- Daca `priorities` are doar 1-2 elemente, afiseaza cate sunt (nu inventezi).
- Daca `no_priorities_reason` e non-null, afiseaza in loc de prioritati: "Nu am identificat prioritati clare azi: {reason}. Vrei sa pornim de la ceva specific?"

Fara fluff. Fara "Buna dimineata!". Doar planul.

---

# Step 3: Ajustari (main thread)

Intreaba: "Asta e sugestia mea. Vrei sa ajustezi prioritatile, sa adaugi ceva, sau mergi cu asta?"

Asteapta:
- **Confirma** ("merge", "ok", "da") → Step 4
- **Ajusteaza** (modifica/adauga/scoate) → integreaza schimbarile in plan, re-afiseaza scurt versiunea finala, apoi Step 4
- **Schimba complet** → re-construieste lista cu input-ul user-ului, apoi Step 4

---

# Step 4: Salveaza in memorie (deleaga)

Invoca un al doilea Agent call:

```
subagent_type: general-purpose
description: "Save daily plan to memory"
prompt: """
Scrie planul aprobat in context/memory/{today_date}.md.

Plan aprobat:
{lista finala de prioritati + carry-overs}
Session number: {session_number}

Format:

## Session {session_number}

### Goal
{priorities[0].title}

### Deliverables
- Daily plan created: {priorities concat cu " | "}

### Decisions
(va fi populat pe parcurs)

### Open Threads
{carry_overs ca bullets, daca exista}

Daca fisierul exista deja (sesiune anterioara azi), NU suprascrie — adauga ## Session {N+1} la final.

Returneaza: "saved"
"""
```

---

# Step 5: Kickoff (main thread)

Output exact:

"Ready. Prioritatea #1: {priorities[0].title}. Incepem? Sau vrei /audit intai?"

STOP. Nu auto-porni munca. Asteapta userul.
