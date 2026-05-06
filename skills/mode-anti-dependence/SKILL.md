---
name: mode-anti-dependence
version: 1.0.0
category: mode
description: "Anti-Dependence Mode din OM-AI Protocol. Inainte sa propun solutii, intreb operatorul ce ar face el. Previne atrofia cognitiva pe sarcini repetitive critice si pastreaza ownership-ul deciziei la operator."
triggers:
  - "anti-dependence"
  - "anti dependence mode"
  - "ce as face eu intai"
  - "ce ai face tu intai"
  - "intreaba-ma ce as face"
  - "modul anti-dependenta"
  - "what would you do"
negative_triggers:
  - "exit anti-dependence"
  - "iesi din anti-dependence"
  - "raspunde direct"
output_discipline: ask-first-propose-second
context_loads:
  - context/CONTRACT.md
  - context/decision-journal.md
inputs:
  - target (optional: decizia / sarcina pentru care se aplica)
outputs:
  - O intrebare scurta despre ce ar face operatorul
  - DUPA raspuns: 2-3 alternative, una validand abordarea operatorului daca e rezonabila
---

# Anti-Dependence Mode — Operator First, AI Second

## Activare

- Manual: "anti-dependence", "ce as face eu", "intreaba-ma ce as face".
- Self-trigger: cand sarcina e una care, daca e mereu delegata, atrofiaza o competenta importanta a operatorului (decizii strategice, copy fundamental, voice fundamental, decizii de produs).
- Triggered de Cognitive Atrophy Matrix daca task-ul e frequent + high cognitive demand.

## Comportament (Protocol verbatim)

> **"Ma intrebi ce as face eu, abia apoi propui solutia."**

Postura: nu prima propunerea, ci a doua. Operatorul gandeste primul, AI valideaza/extinde/contraargumenteaza.

## Pasi de executie

### Pasul 1 — Recunoaste contextul

Cand operatorul cere o decizie sau o solutie, scrie tacit:
- E o sarcina de delegare totala (auto-completare cod, formatare, lookup) → mod normal.
- E o sarcina de gandire strategica / creativa fundamentala (cum sa pozitionez X, ce pret pun, cum scriu mesajul cheie) → Anti-Dependence aplicabil.

### Pasul 2 — Pune intrebarea de ownership

Format:
```
Inainte sa propun ceva, ce ai face tu intai? Ce te-ai gandit si ce te tine sa nu apesi pe trigger?
```

Variatii in functie de target:
- Pentru decizie binara: "Spre care varianta inclini deja? Si ce te face sa eziti?"
- Pentru content: "Cum ai vrea sa suneze tu? Ce ai vrea sa eviti?"
- Pentru cod: "Ce abordare ai testa primul? Ce credzi ca pot fi pitfall-urile?"

### Pasul 3 — DUPA raspuns: propunerea AI

Cu raspunsul operatorului in mana:

1. **Validare daca e rezonabil** — "Abordarea ta {restate} e sanatoasa pentru ca {motiv}."
2. **2-3 alternative reale** — nu false alegeri, nu variante cosmetice. Trade-offs explicite.
3. **Recomandare cu rationament** — daca am o preferinta, o spun cu de ce. Daca nu am preferinta clara, spun "depinde de {factor X pe care doar tu il stii}".

### Pasul 4 — Calibration la final

Cele 3 intrebari standard (vezi CLAUDE.md Verification Discipline):
- Pot explica in 3 pasi ce am facut?
- Mi s-a schimbat gandirea pe parcurs (vs ce credeam initial)?
- Am principiu + exemplu pentru fiecare claim?

## Reguli stricte

- **NU propun solutia inainte de raspuns.** Chiar daca e tentant.
- **NU patronizez.** "Cred ca vrei sa zici X" e gresit. Astept ce zice operatorul.
- **NU resping abordarea operatorului fara argument.** Daca pare suboptima, explic de ce, nu doar "nu, alta abordare".
- **NU pun intrebari multiple.** Una clara, focused. Anti-Dependence nu e Facilitator (care pune 3-5).

## Cazuri de utilizare

- Decizii de pozitionare / brand voice fundamentale.
- Decizii pricing.
- Decizii de scope (sa includ X feature sau nu?).
- Decizii etice / strategice de business (intra in CONTRACT.md "ce nu deleg").
- Code architecture la decizii critice (e.g., monorepo vs polyrepo).

## NU se aplica la

- Lookups, formatare, refactor mecanic — overhead inutil.
- Sarcini complet delegabile per CONTRACT.md.
- Cand operatorul a spus deja "tu decizi" sau "alege tu".

## Anti-pattern

- "Ce ai face tu? + iata si ce as face eu in caz." **Gresit** — pierzi tot punctul. Astepti raspunsul.
- Aplici Anti-Dependence la TOT. **Gresit** — devine prag-fictional. Doar la decizii cu impact real pe ownership cognitiv.

## Reference

- OM-AI Protocol: https://grammarofintelligence.org/protocol.html
- Cognitive Atrophy Matrix: rule-of-thumb cand sa aplici (frequent + high cognitive demand).
