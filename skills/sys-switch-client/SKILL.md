---
name: sys-switch-client
version: 1.0.0
category: sys
description: "Comuta workspace-ul activ intre root si un client. Toate skill-urile rezolva brand/, context/USER.md, learnings.md, memory/ si projects/ din clients/{slug}/ pana la urmatoarea comutare. Persista intre sesiuni."
triggers:
  - "schimba client"
  - "schimba clientul"
  - "trec pe client"
  - "trec pe clientul"
  - "lucram pentru clientul"
  - "lucrez pentru clientul"
  - "switch client"
  - "switch to client"
  - "use client"
  - "active client"
  - "client activ"
  - "ce client am activ"
  - "which client"
  - "client root"
  - "iesi din client"
  - "back to base"
  - "back to root"
  - "workspace root"
  - "clientii mei"
  - "list clients"
  - "lista clienti"
negative_triggers:
  - "creeaza un client"
  - "add client"
  - "client onboarding"
  - "onboard a client"
  - "audit a client"
  - "audit client"
context_loads: []
inputs:
  - target (required for set: slug client; pentru clear: "root" / "base")
outputs:
  - data/active-client.json (set/clear)
  - confirmare scurta catre user
output_discipline: minimal
tier: core
---

# sys-switch-client

Comuta clientul activ. Mecanism real, persistent intre sesiuni.

## Discipline

- **Output minim.** O linie de confirmare + ce path-uri se schimba. Nu rezuma, nu intreba "vrei sa faci si X".
- **Foloseste scriptul, nu scrie tu fisierul.** Scriptul `scripts/active-client.js` valideaza slug + existenta folder + scrie atomic.
- **Niciodata nu inventa slug-uri.** Daca nu stii slug-ul, ruleaza `node scripts/active-client.js list` mai intai.

## Pas 1 — Identifica intentia

Trei intentii posibile in promptul user-ului:

1. **Status / lista** — "ce client am activ", "clientii mei", "active client", "list clients"
2. **Set** — "schimba pe acme", "trec pe client X", "use client acme-corp", "switch to bcme"
3. **Clear** — "client root", "iesi din client", "back to base", "workspace root"

## Pas 2a — Status / lista

Ruleaza:
```bash
node scripts/active-client.js
```

Afiseaza output-ul direct. Niciun comentariu adaugat.

## Pas 2b — Set

1. **Extrage slug-ul** din prompt:
   - "schimba pe acme-corp" → slug = `acme-corp`
   - "trec pe ACME" → ruleaza `list` mai intai sa gasesti slug-ul real (poate fi `acme` sau `acme-corp`)
   - Daca slug-ul nu poate fi inferat clar, intreaba scurt: "Care slug? (ruleaza `list` daca nu stii)"

2. Ruleaza:
   ```bash
   node scripts/active-client.js set <slug>
   ```

3. Daca scriptul iese cu cod 2 (client lipseste), output-ul lui contine deja lista de clienti existenti — afiseaza asta user-ului si intreaba care e cel corect.

4. Daca exit 0, confirma in **maximum 2 linii**:
   - Ce client e activ acum
   - "De acum, brand, context, memorie si output din clients/{slug}/."

## Pas 2c — Clear

Ruleaza:
```bash
node scripts/active-client.js clear
```

Confirma in 1 linie: "Inapoi la workspace root."

## Pas 3 — Verifica context (doar la set)

DUPA ce setezi clientul, daca user-ul continua imediat cu un task care implica brand voice (scrie copy, blog, etc.), reaminteste-ti ca skill-ul respectiv va citi `clients/{slug}/brand/voice.md` automat — directiva ACTIVE CLIENT din hook injecteaza asta in context la fiecare prompt.

Nu mai ai nevoie sa explici user-ului mecanismul. Se intampla singur.

## Edge cases

- **Slug invalid** (ex: spatii, majuscule) → CLI-ul refuza si propune corectia.
- **Client nu exista pe disk** → CLI-ul listeaza clientii existenti si sugereaza `add-client.sh`.
- **Nu exista clientul tinta dar user a scris numele afisat** (ex: "ACME Corp") — incearca slug-ul lowercase cu dash (`acme-corp`); daca nu match, ruleaza `list` si intreaba.
- **Comutare in mijlocul unei sarcini** — confirma cu user: "Sigur comutam? Ai un draft in lucru pe X." (doar daca contextul curent are dovada de munca in curs).

## Output exemplu

User: "schimba pe acme-corp"

Skill output:
```
OK. Lucrezi acum pentru: acme-corp (Acme Corp).
Brand, context, memorie si projects/ se rezolva din clients/acme-corp/.
```

User: "client root"

Skill output:
```
OK. Iesit din clientul "acme-corp". Workspace activ acum: root.
```

User: "ce client am activ"

Skill output (rulat direct CLI-ul si afisat ce iese):
```
Client activ: acme-corp (Acme Corp)
Switched at:  2026-05-08T08:23:11.000Z
```

## NU face

- NU edita `data/active-client.json` direct cu Write/Edit. Foloseste CLI-ul.
- NU recomanda manual reinitializare directoare client. Daca brand-ul e gol pentru clientul nou, sugereaza `onboard me` dupa switch.
- NU pastra in memorie ce client era activ — citeste mereu de pe disk via CLI.
