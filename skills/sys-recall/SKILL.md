---
name: sys-recall
version: 1.0.0
category: sys
description: "Cauta in second brain (notite + jurnale + audituri + learnings) prin FTS5. Returneaza top-K rezultate cu citatii la fisier:linie. Folosit cand userul intreaba 'ai mai notat despre X' sau cand un alt skill are nevoie de context istoric."
triggers:
  - "ai mai notat"
  - "ai mai discutat"
  - "ce stim despre"
  - "ce-am notat despre"
  - "ce am notat despre"
  - "cauta in notite"
  - "search notes"
  - "recall"
  - "ce-am decis despre"
  - "ce am decis despre"
negative_triggers:
  - "cauta pe web"
  - "cauta in cod"
output_discipline: minimal
context_loads: []
inputs:
  - query (extras din prompt — termenii dupa "despre" / "about" / fraza literala)
  - source (optional: note | memory | audit | learnings)
  - limit (optional, default 5)
outputs:
  - Lista rezultate cu titlu + path + excerpt (markdown clickable)
  - Daca zero rezultate: spune asta clar, NU inventa continut
---

# sys-recall

Cauti in second brain (markdown indexat in SQLite FTS5). NU folosi cunostintele tale generale — folosesti DOAR ce gaseste search-ul.

## Discipline

- **Output factual.** Citatie cu file:line pentru fiecare rezultat. Daca nu gasesti nimic, spui "Niciun rezultat" si te opresti.
- **NU rezuma** rezultatele intr-un text general. Userul vrea sa vada notitele, nu interpretarea ta.
- **NU citi** fisierele intregi — search-ul iti da deja excerpt-ul. Doar daca user-ul cere `expand` pe un rezultat anume, citesti acel fisier.

## Pas 1 — Extrage query-ul

Din promptul user-ului:

- "ce-am notat despre **X**" → query = "X"
- "ai mai discutat despre **X si Y**" → query = "X Y" (FTS5 face AND implicit)
- "recall **fraza exacta**" → query = "\"fraza exacta\"" (cu ghilimele pentru phrase match)
- "ce stim despre X la **client Y**" → query = "X Y"

Daca prompt-ul e ambiguu ("cauta in notite") fara termen → intreaba scurt: "Ce sa caut?"

## Pas 2 — Detecteaza source filter

Daca user-ul mentioneaza explicit:
- "in jurnale" / "in memorie" → `--source memory`
- "in audituri" → `--source audit`
- "in learnings" → `--source learnings`
- "in notite" / niciun filtru explicit → fara `--source` (cauta in tot)

## Pas 3 — Ruleaza search

```bash
node scripts/notes-search.js "QUERY" --limit 5 --json
```

Adauga `--source X` daca s-a detectat la pasul 2.

## Pas 4 — Formateaza output

Daca `results.length === 0`:

> Niciun rezultat pentru "{query}" in second brain.

Atat. NU adauga "incearca cu...". NU inventa continut.

Daca exista rezultate, format strict (markdown):

```
{N} rezultate pentru "{query}":

1. **{title}** ({source})
   `{path}`
   > {excerpt curatat — un singur rand, …înlocuieste « » cu **bold**}

2. ...
```

Folosesc link-uri clickable: `[path](path)` dupa convention robOS pentru file references.

## Pas 5 — Optional: expand

Daca user-ul cere "expand 2" / "arata-mi toata nota 2" → citeste fisierul respectiv cu Read si afiseaza-l.

## Auto-recall (apelat de alte skills)

Daca un alt skill te invoca cu un query specific (ex. `content-blog-post` cere context despre "LP redesign"), returneaza output-ul JSON brut, nu formatat. Detectie: dac promptul vine cu `--json` sau format `recall_for_skill={skill_name}`, sari direct la JSON.

## Failure modes

- Indexer nu a rulat de mult timp → search returneaza date stale. Daca user-ul flag-eaza ca "stiu ca am notat ceva despre X dar nu apare", ruleaza `node scripts/notes-index.js --rebuild` si re-cauta.
- FTS5 syntax error → helper-ul deja sanitizeaza, dar daca apare oricum, simplifica query (scoate ghilimele si operatori).
