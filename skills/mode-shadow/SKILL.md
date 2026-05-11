---
name: mode-shadow
version: 1.0.0
category: mode
description: "Shadow Mode din OM-AI Protocol. Comutator cognitiv: Claude NU rescrie, NU genereaza continut nou — listeaza inconsistente, presupuneri, lipsuri si intrebari importante. Folosit ca verification gate inainte de generare de copy/LP/tabel sau pentru review de fapte despre robOS / brand / clients."
triggers:
  - "shadow mode"
  - "intra in shadow"
  - "verifica strict"
  - "modul shadow"
  - "stop mod explicativ"
  - "enter shadow mode"
  - "explanation only"
negative_triggers:
  - "exit shadow"
  - "iesi din shadow"
  - "scrie acum"
output_discipline: structured-flag-list
context_loads:
  - context/CONTRACT.md
  - context/decision-journal.md
  - .gitignore
inputs:
  - target (optional: ce verific — "tabel LP", "claim despre robOS X", "doc claude-vs-robos.md")
outputs:
  - Lista de 3-7 puncte structurate
  - Fara generare de continut nou
  - Optional: append in context/decision-journal.md daca se rezolva un hallucination
tier: core
---

# Shadow Mode — Verification Gate

## Activare

Acest mod se activeaza prin:
- **Hook automat** — UserPromptSubmit detecteaza prompt-uri de tip factual-claim ("scrie copy/LP", "tabel comparativ", "compara X cu Y", "pozitionare") si injecteaza un Shadow Mode reminder.
- **Manual operator** — fraza "shadow mode", "intra in shadow", "verifica strict {target}", "stop mod explicativ".
- **Self-trigger** — Claude poate intra in Shadow inainte de orice generare cu risc factual ridicat.

## Comportament (text Protocol verbatim)

> **NU rescrii textul meu. NU creezi continut nou. Indici doar inconsistente, presupuneri, lipsuri, intrebari importante.**

In context robOS, asta se traduce in:

1. **NU generez** copy / tabele / LP / claim-uri pana la confirmare.
2. **Listez** structurat:
   - **Inconsistente** — fisier X spune A, fisier Y spune B (cu file:line).
   - **Presupuneri** — claim-uri pe care le-as fi inclus dar nu am evidenta in cod.
   - **Lipsuri** — path-uri / features mentionate in surse care NU exista in repo.
   - **Intrebari importante** — ce ar trebui operatorul sa raspunda inainte ca generarea sa aiba sens.
3. **Astept input** explicit inainte sa ies din mod.

## Pasi de executie

### Pasul 1 — Identifica scope-ul verificarii

Operatorul a cerut un mod sau verifici inainte de o sarcina:
- Daca e mod manual: target-ul e ce a spus operatorul.
- Daca e injectat de hook: target-ul e factual-claim-ul din prompt-ul curent.

Scrie tacit (nu output): "Verific: {target}".

### Pasul 2 — Citeste sursele relevante

Pentru target-ul identificat, citeste:
- Fisierele directe mentionate.
- `.gitignore` daca e claim despre git/persistenta.
- `centre/package.json`, `VERSION`, `scripts/setup.sh` pentru claim-uri despre instalare.
- `data/` directory listing pentru claim-uri despre persistenta.
- Skill-ul relevant daca e claim despre comportament robOS.

### Pasul 3 — Construieste lista de 3-7 puncte

Format strict:

```
SHADOW MODE — verificare {target}

Inconsistente:
- [file:line] X spune A, dar [other:line] spune B.
- ...

Presupuneri (NU verificate, NU genera fara confirmare):
- "{claim X}" — bazat pe pattern, nu am gasit evidenta in {locatii cautate}.
- ...

Lipsuri (mentionate dar inexistente):
- {path}: nu exista in repo (verificat cu Glob/Read).
- ...

Intrebari importante (raspunde inainte de generare):
1. {intrebare specifica, neambigua}
2. ...
```

### Pasul 4 — NU generezi pana la raspuns

Dupa lista, scrii o singura linie:

> "Astept raspunsuri inainte sa generez {target}. Daca preferi sa generez cu disclaimer-uri pentru presupuneri, spune."

Nu propune solutii. Nu rescrie textul. Nu da exemple alternative.

### Pasul 5 — Iesire din mod

Operatorul iese explicit prin:
- "iesi din shadow"
- "scrie acum"
- "exit shadow"
- Raspunsul direct la intrebari (implicit exit dupa procesare)

La iesire, daca s-a corectat un hallucination, append entry in `context/decision-journal.md`.

## Reguli stricte

- **NU treci la Pas 5** automat doar pentru ca operatorul nu raspunde imediat. Astept.
- **NU listez puncte cosmetice** — doar inconsistente cu impact real, presupuneri cu risc de eroare, lipsuri verificabile, intrebari care chiar conteaza.
- **NU am voie sa generez "ca exemplu"** — chiar si exemple ilustrative incalca regula.
- **Daca lista are >7 puncte**, prioritizez topul 5 critice si mentionez "+ N alte puncte minore disponibile la cerere".

## Cazuri de utilizare verificate

- **Inainte de scriere LP / copy** — verifica claim-urile despre features inainte de a le include.
- **Code review pe schimbari critice** — listeaza problemele, nu rescrie codul.
- **Inainte de raspuns la o intrebare tehnica neclara** — listeaza ce ar trebui clarificat in loc de a improviza un raspuns.
- **Recovery dupa hallucination** — cand operatorul a prins un claim fals, intri in shadow pentru restul sesiunii pe acea tema.

## Anti-pattern (de evitat)

- "Shadow mode" + apoi imediat scriu varianta mea reformulata. **Gresit** — Shadow Mode = NU rescriu.
- Listare prea generica ("verifica path-urile"). **Gresit** — punctele trebuie specifice si actionabile.
- Tranzitie automata din Shadow in generare dupa ce operatorul nu raspunde. **Gresit** — Shadow nu expira de la sine.

## Reference

- OM-AI Protocol: https://grammarofintelligence.org/protocol.html
- Context contract: [context/CONTRACT.md](../../context/CONTRACT.md)
- Journal: [context/decision-journal.md](../../context/decision-journal.md)
