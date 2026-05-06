---
name: sys-capture-note
version: 1.0.0
category: sys
description: "Salveaza o nota atomica in second brain (markdown + SQLite FTS5). Trigger explicit din partea userului. Genereaza ID stabil, frontmatter, indexeaza imediat."
triggers:
  - "noteaza asta"
  - "noteaza"
  - "tine minte"
  - "tine minte asta"
  - "memoreaza"
  - "salveaza asta"
  - "salveaza"
  - "fixeaza"
  - "fixeaza in memorie"
  - "pune in notite"
  - "ia nota"
  - "scrie undeva"
  - "remember this"
  - "save this"
  - "capture this"
  - "note this"
negative_triggers:
  - "noteaza in jurnal"
  - "scrie in memorie"
  - "salveaza fisierul"
  - "salveaza in"
output_discipline: minimal
context_loads: []
inputs:
  - title (extras din prompt sau cerut explicit, max 80 chars)
  - body (continutul notei — text liber, markdown ok)
  - tags (optional, derivate din continut sau cerute)
outputs:
  - context/notes/YYYY/MM/{id}-{slug}.md (frontmatter + body)
  - rand nou in tabela `notes` + FTS5 (via scripts/note-create.js)
  - confirmare scurta catre user (ID + path)
---

# sys-capture-note

Salvezi o nota atomica in second brain. Markdown e canonic, SQLite e index.

## Discipline

- **Output minim.** Confirma in 1 linie + path. NU rezuma continutul. NU intreba "ai mai vrea sa adaugi ceva".
- **NU scrie tu fisierul direct.** Foloseste helper-ul `scripts/note-create.js` — el genereaza ID-ul stabil, slug-ul, frontmatter-ul si indexeaza.
- **NU intreba** decat daca title-ul nu poate fi inferat. Body-ul e cel din mesajul user-ului.

## Pas 1 — Extrage title + body

Din promptul user-ului:

- **Daca formularea e "noteaza ca X"** → body = "X", title = primele 60 chars din X (curatat).
- **Daca formularea e "noteaza: X"** → body = "X", title la fel.
- **Daca user-ul a furnizat title explicit** ("noteaza titlu='...' cu continut '...'") → respecta.
- **Daca body-ul e neclar** (ex. "tine minte asta" fara referinta) → intreaba scurt: "Ce sa salvez?"

## Pas 2 — Tag-uri (heuristic, fara intrebare)

Inferenza pe baza continutului. Adauga max 3 tag-uri:

- Contine "decid", "decizie" → `decision`
- Contine "regula:", "intotdeauna", "niciodata" → `rule`
- Contine "client", "proiect" → `project`
- Contine "TODO", "follow up", "trebuie sa" → `todo`
- Domeniu evident (tehnologie/produs/persoana) → tag respectiv

NU bloca pe tag-uri. Daca nu e clar, las array gol.

## Pas 3 — Apeleaza helper-ul

Folosesti tool-ul Bash. Body-ul ajunge prin stdin (suporta multi-line):

```bash
echo "BODY_CONTENT" | node scripts/note-create.js --title "TITLE" --tags "tag1,tag2" --origin manual
```

Pentru body-uri lungi sau cu caractere speciale, foloseste here-doc:

```bash
node scripts/note-create.js --title "TITLE" --tags "tag1,tag2" --origin manual <<'EOF'
BODY_LINE_1
BODY_LINE_2
EOF
```

Output: JSON cu `{id, path, title, indexed}`.

## Pas 4 — Confirma scurt

Format strict (1 linie):

> Notat: **{title}** → `{path}` ({tags daca exista})

Exemplu:
> Notat: **Decizie: SQLite FTS5 ramane index** → `context/notes/2026/05/note-...md` (#decision #arhitectura)

Atat. Nu adaugi alte sugestii.

## Failure modes

- Helper iese cu code !=0 → afiseaza eroarea exact si opreste.
- `indexed: false` in output JSON → mentioneaza ca nota e scrisa pe disk dar indexer-ul a esuat (poate fi rulat manual: `node scripts/notes-index.js --file <path>`).
- User specifica `--scope client` → adauga `--origin client/{slug}` (rezervat — nu e implementat azi, ignora).
