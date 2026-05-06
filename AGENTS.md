# robOS — Reguli partajate de proiect

robOS e un sistem de operare agentic care ruleaza pe Claude Code. Da unui singur operator AI memorie persistenta, skill-uri instalabile, context de brand, scheduler cron si workspace-uri multi-client izolate. Se livreaza ca template — clonezi, rulezi setup, incepi sa lucrezi.

---

## Hook system (enforcement layer)

robOS impune comportament prin **hooks** Claude Code (configurate in `.claude/settings.json`). Reguli si fapte din AGENTS.md / CLAUDE.md / SKILL.md ar fi recomandari fara hook-urile care le materializeaza la runtime.

| Hook | Script | Rol |
|------|--------|-----|
| `UserPromptSubmit` | [scripts/hook-user-prompt.js](scripts/hook-user-prompt.js) | (a) la primul prompt al sesiunii: injecteaza STARTUP CONTEXT (memorie azi, recovery flags, open threads, instructiuni-prioritare); (b) la fiecare prompt: ruleaza skill-route.js si injecteaza SKILL ROUTER hint daca matcheaza un trigger. |
| `Stop` (1) | [scripts/checkpoint-reminder.js](scripts/checkpoint-reminder.js) | Ridica reminder cand memoria zilei nu a primit scriere recent. Escalation in 3 trepte; al 3-lea unheeded blocheaza Stop pana cand operatorul scrie memoria. |
| `Stop` (2) | [scripts/activity-capture.js](scripts/activity-capture.js) | Captureaza turn-ul curent in `data/activity-log.ndjson` (rotation 500 entries). Bridge cross-session — urmatorul prompt vede ce s-a intamplat ieri/saptamana trecuta. |

Erori de hook → `data/hook-errors.ndjson` (rotation 500). Niciun hook nu blocheaza promptul user-ului pe baza de eroare interna; eroarea ajunge in error sink, hook-ul iese 0 (silent failure are vizibilitate via sink, nu via Claude Code).

### Cron complementar (deterministic, fara tokens)

| Job | Frecventa | Rol |
|-----|-----------|-----|
| `audit-startup.js` | zilnic 8:00 | Scaneaza memoria din ultimele 7 zile, raporteaza sesiuni abandonate. Append in `data/startup-audit.log`. |
| `session-timeout-detector.js` | la 15 min | Detecteaza sesiuni abandonate >2h (markeri din `data/session-state/`), scrie recovery flag in `data/session-recovery/{ts}.json` consumat la urmatorul session start. |
| `learnings-aggregator.js` | saptamanal lunea | Genereaza review din `context/learnings.md` cu pattern detection (3+ aparitii → rule candidate). Output in `context/learnings/_review-{week}.md`. |

Toti scriu prin `scripts/lib/ndjson-log.js` (atomic append + rotation). Toti foloseasc `scripts/lib/memory-format.js` pentru parsare consistenta a memoriei.

### Sub-agent timeouts (advisory)

`SUBAGENT_TIMEOUT_MS_ADVISORY = 90s` din `parallel-budget.js` e contract de design, **NU runtime-enforced**. Agent tool e invocat declarativ in SKILL.md prompts; main thread n-are Promise.race hook. Skill-uri proiecteaza failure modes presupunand acest budget; in practica timeout-ul real vine de la harness-ul Claude Code.

---

## Reguli de operare

### Reconciliere skills

La startul sesiunii, compara ce e pe disk (`skills/*/`) cu catalogul (`skills/_catalog/catalog.json`). Daca a aparut un skill nou in catalog de la ultima sesiune, noteaza tacit in memorie — nu intrerupe userul.

(Comparatia de versiune per-skill catalog-vs-instalat NU e tracked in catalog.json — sursa de adevar pentru versiune e SKILL.md-ul instalat. Daca un skill primeste un update upstream, operatorul re-instaleaza explicit prin add-skill.sh sau editeaza direct.)

### Routare task-uri

**Enforcement layer:** Hook-ul `UserPromptSubmit` ruleaza `scripts/skill-route.js` la fiecare prompt. Daca matches un trigger, injecteaza un SKILL ROUTER hint in context cu skill-ul potrivit. Cand vezi "Promptul a matchat trigger-ul X pentru skill-ul Y", foloseste skill-ul Y; daca alegi sa nu, justifica explicit de ce baza ta de cunostinte e mai potrivita.

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
| `mode-`    | Comutatoare cognitive (Shadow, Facilitator, Anti-Dependence) — schimba postura Claude pentru o sarcina specifica |
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

## Concurrency Patterns

Cand un skill are munca naturala paralela (≥3 unitati independente, fiecare ≥10s estimat), foloseste unul din pattern-urile standardizate de mai jos. **NU inventa pattern-uri noi** — daca nu se potriveste niciunul, ramai secvential si flag-ul gap-ul aici pentru pattern viitor.

### Reguli globale (invariants, nenegociabile)

1. **Prag de paralelism**: helper `scripts/parallel-budget.js`, functia `shouldParallelize(units, est_seconds_per_unit)` decide. Sub prag → secvential, intentionat.
2. **Cost cap**: max **8 sub-agenti paraleli** per invocare de skill. Daca ai mai multi, sparge in waves secventiale de cate 8.
3. **Timeout per sub-agent (advisory)**: 90s soft, 180s hard cap, definit in `parallel-budget.js` ca `SUBAGENT_TIMEOUT_MS_ADVISORY`. **NU e enforced runtime** — Agent tool e invocat declarativ din SKILL.md prompts si parent-ul nu are hook sa puna `Promise.race`. Constantele exista ca contract documentat: cand designezi un skill, presupui ca sub un agent care depaseste 90s e degradant si proiectezi pattern-ul de fail accordingly. In practica, depinzi de Claude Code harness pentru timeout final.
4. **Retry policy**: 1 retry max, doar pentru agenti idempotenti (citire + analiza). Zero retry pentru agenti cu side-effects (file writes).
5. **Idempotenta**: sub-agentii NU comit git, NU push, NU trimit email, NU modifica `.env`. Side-effects ireversibile raman in main thread, dupa confirmare user.
6. **Niciun secret in prompt**: daca un agent are nevoie de API key, citeste el `.env`. Main thread nu pasa cheia ca string.
7. **Spawn paralel = un singur mesaj**: invocarile `Agent` paralele MERG IN ACELASI MESAJ DE RASPUNS, multiple tool calls. Mesaje separate = secvential = pierzi tot castigul.
8. **Telemetrie obligatorie**: dupa fiecare invocare paralelizata, skill-ul scrie o linie in `data/skill-telemetry.ndjson` via `parallel-budget.js log`.

### Pattern 1 — Pillar Fan-Out

**Cand:** skill cu N dimensiuni independente de scoring sau analiza.

**Structura:**
```
Main → spawn paralel N agenti specialisti, fiecare pe o dimensiune
Main → astepti toti N (sau timeout)
Main → spawn 1 reducer agent care primeste cele N rezultate + face top-gaps/sinteza
Main → afiseaza
```

**Failure mode:** **graceful degradation**. Daca 1-2 dimensiuni esueaza → reducer primeste flag-uri si raporteaza "incomplete (X failed)". Hard-fail doar daca ≥50% din agenti esueaza.

**Cost profile:** Nx tokens, 1x wall-clock vs serial.

**Skill exemplu:** sys-audit (4 piloni paraleli + reducer).

### Pattern 2 — MapReduce Research

**Cand:** munca care implica X surse / queries independente de scanat.

**Structura:**
```
Main → spawn paralel N agenti, fiecare pe o sursa (web, API, doc set)
Main → astepti toti
Main → spawn synthesizer agent care merge + dedupe + ranking
Main → afiseaza
```

**Failure mode:** **graceful**. Synthesizer-ul scoate sectiunea pentru sursa lipsa cu footnote. Userul vede ce a reusit + ce a esuat.

**Cost profile:** Nx tokens.

**Skill exemple:** research-trending, research-competitors.

### Pattern 3 — Multi-Asset Generation

**Cand:** o campanie / brief produce N formate de output diferite (blog + tweets + newsletter + ...).

**Structura:**
```
Main → spawn paralel N agenti, fiecare cu prompt specializat pe formatul lui
Main → astepti toti
Main → afiseaza colectia / scrie in projects/briefs/{nume}/
```

**Failure mode:** **hard-fail**. Campanie incompleta = livrabil broken. Daca un agent esueaza, skill-ul opreste si raporteaza ce trebuie regenerat.

**Cost profile:** Nx tokens.

**Skill exemple:** content-blog-post / content-copywriting / content-repurpose in `mode=campaign`.

### Pattern 4 — Multi-Angle Creativity

**Cand:** content high-stakes (lansare, pitch) sau user cere explicit "show me options".

**Structura:**
```
Main → spawn paralel 3 agenti cu prompturi STILISTIC diferite (acelasi brief, voci diferite)
Main → astepti toti
Main → prezinta variantele user-ului → user pick (sau Frankenstein blend)
```

**Failure mode:** **best-effort**. Daca 1 esueaza, prezinti 2. Daca 2 esueaza, fall back la generare normala.

**Cost profile:** ~3x tokens. **Opt-in only** (nu default — trebuie cerut explicit sau auto-trigger pe high-stakes detection).

**Skill exemple:** content-* cu `mode=options`.

### Pattern 5 — Adversarial Synthesis

**Cand:** decizii strategice care risca confirmation bias (sugestii level-up, recomandari brand).

**Structura:**
```
Main → spawn paralel:
  Agent PRO   (cel mai bun caz pentru propunere)
  Agent CONTRA (cel mai bun caz contra)
  Agent ALT   (alternativa neevidenta, third option)
Main → spawn synthesizer agent → matrix de trade-offs balansata
Main → afiseaza user-ului
```

**Failure mode:** **hard-fail**. Pentru decizii ai nevoie de toate 3 perspective sau niciuna — output partial e mai prost decat output zero.

**Cost profile:** 3x tokens, folosit rar (doar la momentele de decizie reale).

**Skill exemple:** sys-level-up.

### Telemetrie

Fiecare skill paralelizat apeleaza dupa run:

```bash
node scripts/parallel-budget.js log {skill} {mode} {agents} {failed} {wall_ms} {fallback_used}
```

Linie scrisa in `data/skill-telemetry.ndjson`:
```json
{"ts":"2026-05-05T19:42:11Z","skill":"sys-audit","mode":"parallel","agents":4,"agents_failed":0,"wall_clock_ms":7234,"fallback_used":false}
```

Reguli pentru telemetrie:
- `mode`: "parallel" | "serial" | "cached" (cand cache hit a evitat work)
- `fallback_used: true` cand graceful degradation s-a activat — saptamanal scaneaza si daca un skill foloseste fallback >20%, e bug nu feature.

### Cand NU paralelizezi

- Sub prag (helper-ul returneaza false)
- Munca user-blocking (Q&A interactiv) — userul oricum asteapta
- Side-effects ireversibile (commit, deploy, email send)
- Cand un singur agent are deja contextul perfect si paralelismul ar duplica fetch-ul

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

---

## Secret management (.env e singura sursa de adevar)

**Regula:** orice secret in robOS — API keys, parole, tokeni, ID-uri, signing keys — traieste in `.env`. Nicaieri altundeva. Nu in cod hardcoded, nu in `.mcp.json` ca valoare inline, nu in `clients/*/`, nu in fisiere de skill, nu in `data/*`.

### Lifecycle

1. **Bootstrap:** la prima rulare, `node scripts/setup-env.js` copiaza `.env.example` in `.env`. Idempotent — re-rularea nu suprascrie valorile existente.
2. **Auto-discovery skill secrets:** skill-urile declara cheile lor in frontmatter (`secrets_required` / `secrets_optional`). `rebuild-index.js` agrega in `data/required-secrets.json`. Urmatorul `setup-env.js` adauga slot-urile lipsa in `.env` cu marker `# added by setup-env <date>`.
3. **Token auth dashboard:** `ROBOS_DASHBOARD_TOKEN` (64 chars hex) e auto-generat la primul `setup-env.js`. Pe orice endpoint sensitive (`/api/settings/env`, `/api/settings/mcp` PUT, `/api/skills/*/run`) serverul cere `Authorization: Bearer <token>`.
4. **UI:** dashboard tab Settings → Environment listeaza toate slot-urile, grupate pe categorie (Core / Skills / Distribution), cu badge "cerut de: <skill>". Valorile secrete (`KEY`/`TOKEN`/`SECRET`/`PASSWORD`/...) NU sunt afisate niciodata — UI arata doar `set` / `unset` / `placeholder`. Operatorul apasa **Set** ca sa scrie o valoare noua.

### Atomic write

`PUT /api/settings/env` foloseste `parseEnv → mutate → renderEnv → atomic rename`:
- Comentariile si banner-ele din `.env` sunt **preservate** (vechiul handler le pierdea).
- Backup-ul ultimei stari salvate in `.env.bak` (single rolling backup).
- Atomic — daca scrierea esueaza, `.env` ramane neatins.

### Threat model

- Server bind 127.0.0.1 by default → fara expunere LAN.
- Browser malicios pe localhost (CSRF) blocat de Bearer token + Origin check pe `/api/auth/token`.
- Token-ul nu e persistat in `localStorage` (XSS protection); UI il citeste o data per page load din `/api/auth/token` (same-origin gated).
- Valorile secrete nu parasesc `.env` prin GET API — `getEnv()` intoarce `value: null` pentru orice cheie care contine `KEY/TOKEN/SECRET/PASSWORD/PASS/PRIVATE/CREDENTIAL/DSN/AUTH`.

### Open thread — Phase B auth coverage

Endpoint-urile de tasks/cron/memory mutations nu sunt acum sub Bearer auth (UI islands ar trebui rescrise sa foloseasca `apiFetch()` din `centre/src/lib/api-client.ts`). Risc rezidual: browser malicios poate scrie task-uri/cron/memory daca user-ul vizita `evil.com`. Mitigation curent: bind 127.0.0.1 + scope limitat de actiuni. Phase B: convertire toate islands → `apiFetch()` + extindere `AUTH_REQUIRED` la toate mutations.

### Pentru studenti (operatorii care cumpara robOS)

Studentul instaleaza robOS, ruleaza `setup-env.js` (sau `setup.sh` care-l include), primeste un `.env` cu toate slot-urile + token auto-generat. Populeaza cheile pe care le foloseste (Firecrawl pentru research, Whatsapp pentru tool-whatsapp, etc.). Sectiunea **DISTRIBUTION** ramane goala — e doar pentru autorul care distribuie robOS comercial.
