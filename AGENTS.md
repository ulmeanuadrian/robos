# robOS — Reguli partajate de proiect

robOS e un sistem de operare agentic care ruleaza pe Claude Code. Da unui singur operator AI memorie persistenta, skill-uri instalabile, context de brand, scheduler cron si workspace-uri multi-client izolate. Se livreaza ca template — clonezi, rulezi setup, incepi sa lucrezi.

---

## Reguli de operare

### Reconciliere skills

La startul sesiunii, compara ce e pe disk (`skills/*/`) cu catalogul (`skills/_catalog/catalog.json`). Daca a aparut un skill nou in catalog de la ultima sesiune, noteaza tacit in memorie — nu intrerupe userul. Daca un skill instalat e in urma fata de versiunea din catalog, semnaleaza in Open Threads-ul sesiunii.

### Routare task-uri

1. **Verifica skills instalate primul.** Daca un skill matches task-ul, foloseste-l.
2. **Verifica catalogul al doilea.** Daca exista in catalog dar nu e instalat, spune userului:
   "Exista un skill pentru asta (`{nume}`) dar nu e instalat. Vrei sa-l instalez sau ma descurc cu cunostintele de baza?"
3. **Fallback la cunostinte de baza.** Daca niciun skill nu acopera, procedeaza normal.
4. **Fa lipsurile vizibile.** Daca intalnesti un task recurent fara skill, noteaza-l in `context/learnings.md` la sectiunea "Skill Gap" pentru constructie viitoare.

---

## Categorii de skills

| Prefix     | Scop                                               |
|------------|----------------------------------------------------|
| `brand-`   | Voce de brand, style guides, tone checks           |
| `content-` | Writing, editing, publishing                       |
| `research-`| Research web, competitor analysis, trend scanning  |
| `sys-`     | Operatii de sistem: sesiune, cron, mentenanta      |
| `tool-`    | Integrari cu tooluri externe (API-uri, CLI-uri)    |

---

## Skill Registry

Sursa unica de adevar: [skills/_index.json](skills/_index.json) — generat automat de [scripts/rebuild-index.js](scripts/rebuild-index.js) la fiecare instalare/dezinstalare.

Pentru a vedea ce e instalat: `bash scripts/list-skills.sh`
Pentru a vedea ce e disponibil: dashboard tab Skills, sau `cat skills/_catalog/catalog.json`
Pentru a regenera indexul manual: `node scripts/rebuild-index.js`

Dashboard-ul citeste din `_index.json` (cu fallback pe scanarea filesystem-ului). Tabela markdown nu mai e duplicata aici — daca o adaugi din nou, va deriva fata de filesystem si vei strica routarea.

---

## Recomandari de model

Skills functioneaza pe orice model Claude, dar tier-ul potrivit imbunatateste cost si calitate:

| Categorie skill | Recomandat | Motiv |
|---|---|---|
| sys-onboard, sys-audit, sys-level-up | Opus | Reasoning adanc, sinteza pe pasi multipli, ruleaza rar |
| sys-daily-plan, sys-session-close, sys-goal-breakdown | Sonnet | Retrieval structurat + planning, ruleaza zilnic |
| content-blog-post, content-copywriting, content-repurpose | Sonnet | Cost/calitate echilibrat pentru generare |
| brand-voice, brand-audience, brand-positioning | Opus | Ruleaza o data la setup, are nevoie de analiza nuantata |
| research-trending, research-competitors | Sonnet | Web research + sinteza, complexitate medie |
| tool-humanizer | Haiku | Pattern-matching de mare volum |
| sys-skill-builder | Opus | Decizii de arhitectura, ruleaza rar |

Folosire: daca rulezi Claude Code cu selectie de model (`--model` sau `/model`), schimba inainte sa rulezi skills costisitoare. Nu e obligatoriu — toate skills degradeaza gratiat pe modele mai mici.

---

## Limba si tonul

robOS e configurat in romana (operatorul e roman, brand-ul e roman). Politica de limba per suprafata:

| Suprafata | Limba | Note |
|-----------|-------|------|
| Output skill catre operator | Romana | Cu exceptia cazului in care output-ul e pentru audienta straina (ex: blog post EN) |
| Triggers in `SKILL.md` | Bilingv (RO + EN) | RO primul, EN ca fallback pentru users care lucreaza in EN |
| Comentarii in cod | Engleza | Standard industrie |
| Mesaje user-facing din scripts | Romana | `bash scripts/*.sh`, dashboard UI, erori vizibile |
| Documentatie (`docs/`, README, AGENTS, CLAUDE) | Romana | |
| Brand files (`brand/*.md`) | Limba operatorului | Daca face content RO -> brand RO. Tagged in samples.md. |

Cand un skill produce output pentru o platforma cu audienta diferita (LinkedIn EN, Twitter EN), respecta limba audientei, nu a operatorului.

---

## Context Loading

Fiecare skill isi declara nevoile in frontmatter-ul `SKILL.md`:

```yaml
context_loads:
  - brand/voice.md
  - brand/audience.md
  - context/USER.md
```

Incarca DOAR ce skill-ul activ cere. Niciodata nu pre-incarca toate fisierele de brand.

---

## Output Standards

### Nivel 1 — Output rapid
Fisiere singulare merg in `projects/{categorie}-{tip}/`. Exemplu: `projects/content-blog-post/`.

### Nivel 2 — Output structurat
Livrabile multi-fisier merg in `projects/briefs/{nume}/`. Exemplu: `projects/briefs/lansare-q3/`.

### Nivel 3 — Output client
Munca per client merge in `clients/{slug}/projects/`. Aceeasi structura, scoped la client.

Include intotdeauna `_metadata.json` in output-uri Nivel 2+:

```json
{
  "created": "2026-05-04",
  "skill": "content-blog-post",
  "status": "draft",
  "description": "Articol blog pentru lansarea produsului Q3"
}
```

---

## Construirea de skills noi

### Structura de directoare

```
skills/{skill-name}/
  SKILL.md          # Frontmatter + instructiuni pas cu pas (obligatoriu)
  references/       # Documente, API refs, exemple (optional)
  lib/              # Helper scripts daca e nevoie (optional)
```

### Frontmatter SKILL.md

```yaml
---
name: content-blog-post
version: 1.0.0
category: content
description: Articole blog optimizate SEO aliniate la voce
triggers:
  - "scrie un articol despre"
  - "blog despre"
  - "write a blog post"
context_loads:
  - brand/voice.md
  - brand/audience.md
  - context/USER.md
inputs:
  - topic (required)
  - keywords (optional)
  - target_length (optional, default: 1200)
outputs:
  - draft markdown in projects/content-blog-post/
---
```

### Checklist de inregistrare

1. Directorul skill-ului exista in `skills/`
2. `SKILL.md` are frontmatter valid cu toate campurile obligatorii
3. Instructiuni pas-cu-pas actionabile (nu vagi)
4. Cheama `node scripts/rebuild-index.js` (sau folosesti add-skill.sh care o face automat)
5. Daca skill-ul are nevoie de chei API, sunt documentate in `.env.example`

---

## Degradare gratiata

robOS functioneaza pe orice nivel de context:

- **Zero config**: fara fisiere brand, fara USER.md completat. Skills functioneaza cu defaults generice.
- **Config partial**: cateva fisiere brand completate. Skills folosesc ce e disponibil, sar peste rest.
- **Config complet**: totul completat. Skills produc output personalizat complet.

Nu da niciodata eroare pentru ca un fisier de context e gol. Foloseste defaults rezonabile si noteaza ce s-ar imbunatati cu mai mult context.

---

## Fisiere protejate

Nu sunt suprascrise niciodata de update-uri sau scripturi:

- `context/USER.md`
- `context/learnings.md`
- `context/memory/*`
- `brand/*`
- `clients/*`
- `projects/*`
- `cron/jobs/*`
- `data/*` (baza de date SQLite + cache-uri)
- `.env`
