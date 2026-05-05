---
name: sys-session-open
version: 1.0.0
category: sys
description: "Deschidere de sesiune simetrica cu sys-session-close. Citeste SOUL/USER, verifica recovery (sesiune anterioara abandonata sau >3 zile absenta), formalizeaza protocolul de startup ca skill auditabil. Apelat automat de hook-ul UserPromptSubmit la primul prompt — dar poate fi rulat si manual."
triggers:
  - "deschide sesiunea"
  - "incepe sesiunea"
  - "session open"
  - "open session"
  - "startup check"
  - "sesiune noua"
negative_triggers:
  - "deschide fisierul"
  - "open file"
context_loads:
  - context/SOUL.md (reads)
  - context/USER.md (reads)
  - context/memory/ (reads, latest file)
  - skills/_index.json (reads, summary only)
inputs: []
outputs:
  - Acknowledgment intern (nu output catre user decat la prima interactiune)
  - data/session-state/{session_id}.json actualizat
---

# Context

Acest skill e contraponderea lui `sys-session-close`. Sesiunea trebuie sa aiba un open simetric cu close-ul:
inchidem cu confirmation gate + memorie finalizata + git check, deci deschidem cu identity load + recovery check + open threads surface.

In mod normal, hook-ul `UserPromptSubmit` (din `.claude/settings.json`) injecteaza deja un STARTUP CONTEXT bundle la primul prompt al sesiunii — vine ca system reminder, imposibil de ignorat. Skill-ul asta formalizeaza ce trebuie sa faci dupa ce primesti acel bundle.

Daca esti aici fara hook (sesiune mai veche, hook dezactivat, debugging), ruleaza pasii manual.

# Step 1: Identity Load

Citeste tacit (fara output catre user):

1. **`context/SOUL.md`** — personalitatea. Cum vorbesti, cum nu vorbesti, ce nu faci niciodata.
2. **`context/USER.md`** — cu cine lucrezi. Nume, business, preferinte invatate.

Daca vreunul lipseste sau e gol (doar template/HTML comments), userul nu e onboarded — vezi Step 5.

# Step 2: Recovery Check

Determina starea sesiunii anterioare. Trei cazuri:

**Cazul A — Memoria zilei curente exista deja:**
- Citeste `context/memory/YYYY-MM-DD.md`
- Daca contine sectiuni `### Open Threads` cu items: tine-le minte pentru Step 4.
- Asta inseamna sesiune in continuare azi (poate Session 2 sau 3).

**Cazul B — Memoria zilei nu exista, dar exista o memorie anterioara:**
- Gaseste cel mai recent fisier din `context/memory/` (sortat dupa filename)
- Verifica daca are linia de inchidere: `Session: N deliverables, M decisions`
  - **Are linia** → sesiunea anterioara s-a inchis curat. Continua.
  - **NU are linia** → sesiunea anterioara a fost abandonata. Extrage open threads din ea.
- Calculeaza zile de la ultima sesiune.
  - **>3 zile** → user a fost plecat. Pregateste recap scurt pentru Step 4.

**Cazul C — Niciun fisier de memorie:**
- Sesiune complet noua. Probabil user nou neonboarded — vezi Step 5.

# Step 3: Skill Reconciliation (tacit)

Compara `skills/_index.json` (instalate) cu `skills/_catalog/catalog.json` (disponibile).

- Daca exista skills in catalog dar nu instalate: noteaza tacit. Nu intrerupe userul.
- Daca un skill instalat e in urma fata de versiunea catalogului: semnaleaza in Open Threads la sfarsitul sesiunii (NU acum).

Niciun output catre user din acest pas decat daca userul intreaba explicit.

# Step 4: First Interaction Response

Cand userul scrie primul mesaj, raspunde dupa urmatoarele reguli:

**Daca primul mesaj e o salutare** ("hey", "salut", "buna", "morning"):
- Raspunde scurt (2-3 linii max)
- Daca Cazul A sau B au open threads: mentioneaza-le.
  Format: "Ultima sesiune ({data}) a ramas cu: {thread 1}, {thread 2}. Continuam?"
- Daca Cazul B cu >3 zile absenta: "Welcome back. Ultima sesiune ({data}): {goal}."
- Daca nu exista plan zilnic in memoria de azi: sugereaza "Spune **plan de zi** ca sa-ti planific ziua"

**Daca primul mesaj e un task:**
- Mergi direct la lucru. Fara preambul, fara "Buna! Sigur ca te ajut!"
- Daca task-ul matchaza un skill (router-ul a marcat asta deja in STARTUP CONTEXT): foloseste skill-ul.

**Daca primul mesaj e ambiguu:**
- O singura intrebare de clarificare, apoi procedeaza.

# Step 5: New User Path

Daca `brand/voice.md` contine doar template placeholders (HTML comments, no real content):
- Userul nu a terminat onboarding-ul.
- Spune EXACT: "Bine ai venit in robOS. Spune **onboard me** ca sa te configurez in 15 minute, sau sari direct la orice task."
- NU rula automat sys-onboard. Asteapta confirmare.

# Step 6: Mark Session Open

Acest pas e gestionat automat de hook-ul `UserPromptSubmit` care creeaza `data/session-state/{session_id}.json` cu:

```json
{
  "session_id": "...",
  "started_at": "ISO timestamp",
  "first_prompt_at": "ISO timestamp"
}
```

Daca rulezi skill-ul manual (fara hook), creeaza fisierul tu.

# Reguli generale

- **Niciodata nu output STARTUP CONTEXT bundle catre user.** E intern.
- **Niciodata nu repeta deja-spuse din SOUL/USER.** Internalize, nu replay.
- **Niciodata nu blocheaza primul mesaj cu protocol.** Userul scrie un task → mergi la lucru, sari peste salutari ceremoniale.

# Eliminari false-positive

Hook-ul stie ca acest skill nu se ruleaza explicit prin trigger — el ruleaza la fiecare prim prompt al unei sesiuni. Triggerele in frontmatter sunt pentru:
- Re-rulare manuala (debugging)
- Cazuri unde hook-ul nu a rulat (ex: sesiune restartata fara session_id nou)

Daca userul scrie efectiv "deschide sesiunea", confirma scurt: "Sesiune deja deschisa pe {data}. Vrei sa rulez recovery check din nou?"
