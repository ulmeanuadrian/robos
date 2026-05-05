---
name: sys-archive-memory
version: 1.0.0
category: sys
description: "Arhiveaza fisierele de memorie zilnice intr-un sumar lunar (rollup). Pastreaza fisierele individuale in _archive/ ca backup, dar elibereaza directorul principal pentru lookup-uri rapide."
triggers:
  - "arhiveaza memoria"
  - "rollup memorie"
  - "archive memory"
  - "memory rollup"
  - "compacteaza memoria"
  - "cleanup memory"
negative_triggers:
  - "delete memory"
  - "sterge memoria"
  - "wipe memory"
context_loads:
  - context/memory/ (reads, writes)
  - context/learnings.md (section sys-archive-memory)
inputs:
  - month (optional: "YYYY-MM", default = luna trecuta)
  - keep_days (optional: numar zile recente de pastrat in directorul principal, default 30)
outputs:
  - context/memory/_archive/{YYYY-MM}.md (sumar lunar)
  - context/memory/_archive/{YYYY-MM}/ (backup fisiere zilnice originale)
  - Fisierele zilnice arhivate sterse din directorul principal
---

# Cand sa rulezi acest skill

- Manual: cand vezi prea multe fisiere in `context/memory/` (>40)
- Programat: cron lunar pe ziua 1 la 4am (vezi exemplu de job mai jos)
- Sfarsit de trimestru: pentru curatare aditionala

# Step 1: Determina luna tinta

Daca user a specificat `month`, foloseste-l. Altfel:
- Calculeaza luna trecuta (ex: daca azi e 2026-05-05, tinta = 2026-04)
- Verifica daca fisiere de pe ziua 30 din luna tinta sunt mai vechi de `keep_days`. Daca da, procedeaza.

# Step 2: Identifica fisierele de arhivat

Listeaza `context/memory/*.md` (excluzand `_archive/`). Pentru fiecare fisier `YYYY-MM-DD.md`:
- Daca `YYYY-MM` matches luna tinta → adaugat la lista de arhivat
- Altfel → ignorat

Daca lista e goala: "Nu sunt fisiere de arhivat pentru {luna}." Stop.

# Step 3: Genereaza sumarul lunar

Citeste fiecare fisier zilnic. Pentru fiecare:
1. Extrage `## Session N` blocks
2. Compileaza:
   - Toate Goal-urile (cate o linie per zi)
   - Top 10 Deliverables (filtreaza pe semnificatie — ignora "Daily plan created")
   - Decizii cheie (pastreaza doar cele care au impact persistent)
   - Open Threads care sunt INCA deschise (cross-reference cu fisierul de azi)

Construieste `context/memory/_archive/{YYYY-MM}.md`:

```markdown
# Memoria lunii {YYYY-MM}

Generat: {YYYY-MM-DD}
Fisiere arhivate: {N} zile

## Goal-uri zilnice
- {YYYY-MM-DD}: {goal}
- ...

## Deliverables semnificative
- {data}: {ce a fost livrat}
- ...

## Decizii cu impact persistent
- {data}: {decizia + de ce}
- ...

## Open Threads care erau inca deschise la sfarsitul lunii
- {tema}: {context scurt + data prima mentionare}
- ...

## Statistici
- Sesiuni: {numar total}
- Zile active: {N}
- Zile cu deliverable: {N}
- Pattern observat: {orice tendinta vizibila — ex: "5 zile la rand cu plan-vs-reality drift pe priority #1"}
```

# Step 4: Mut fisierele originale in backup

Creeaza `context/memory/_archive/{YYYY-MM}/` (daca nu exista).

Pentru fiecare fisier identificat la Step 2:
- Mut `context/memory/{YYYY-MM-DD}.md` → `context/memory/_archive/{YYYY-MM}/{YYYY-MM-DD}.md`
- NU sterge — doar muta. Backup garantat.

# Step 5: Update CLAUDE.md (daca e prima rulare)

Verifica `CLAUDE.md` la sectiunea "Daily Memory" — adauga referinta la arhive daca lipseste:

> Fisierele mai vechi de 30 zile sunt arhivate in `context/memory/_archive/{YYYY-MM}.md` (sumar) si `context/memory/_archive/{YYYY-MM}/` (originale). Pentru context istoric, citeste sumarele lunare.

# Step 6: Loghez

Append in `context/learnings.md` la `## sys-archive-memory`:
- Luna arhivata, numar de fisiere
- Cantitatea de tokens economisita (estimat)
- Open threads care au persistat (semnaleaza pattern de procrastinare)
- Data completare

# Job cron sugerat

Dupa instalare, propune userului sa adauge un job:

```json
{
  "name": "monthly-memory-rollup",
  "schedule": "0 4 1 * *",
  "skill": "sys-archive-memory",
  "args": {},
  "enabled": true,
  "timeout": "5m"
}
```

Salveaza in `cron/jobs/monthly-memory-rollup.json` — daemonul il importa automat la pornire.

# Notes

- NICIODATA nu sterge fisiere zilnice — doar muta in `_archive/{YYYY-MM}/`.
- Sumarul lunar e generat o data, nu se regenereaza la fiecare rulare. Daca user vrea sa-l regenereze, sterge manual fisierul `_archive/{YYYY-MM}.md` si re-rul.
- Daca `_archive/` deja contine sumar pentru luna tinta dar fisierele zilnice nu sunt mutate (interrupted run), reia de la Step 4.
