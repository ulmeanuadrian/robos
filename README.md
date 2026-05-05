# robOS

Sistem de operare agentic pentru Claude Code. Da unui singur operator AI memorie persistenta, skills instalabile, context de brand, scheduler cron si workspace-uri multi-client izolate.

**Versiune actuala:** 0.3.0
**Status:** alpha — folosibil pentru content/automation, in dezvoltare activa.

---

## Cuprins

1. [Instalare](#instalare)
2. [Structura](#structura)
3. [Skills](#skills)
4. [Memorie zilnica](#memorie-zilnica)
5. [Cron / joburi programate](#cron--joburi-programate)
6. [Multi-client](#multi-client)
7. [Dashboard (Command Centre)](#dashboard-command-centre)
8. [Update](#update)
9. [Configuratie](#configuratie)
10. [Troubleshooting](#troubleshooting)
11. [Stack tehnic](#stack-tehnic)

> **Pentru utilizare zilnica**, citeste **[docs/operator-handbook.md](docs/operator-handbook.md)** — cum se porneste/inchide o sesiune, cum functioneaza memoria si activity log, ce skill triggers exista, bune practici si troubleshooting.

---

## Instalare

**Cerinte**: Node >= 20, Claude Code CLI ([install](https://docs.anthropic.com/en/docs/claude-code)), git.

```bash
git clone <repo-url> robos
cd robos
bash scripts/setup.sh
bash scripts/start.sh
```

Setup-ul:
1. Verifica Node si Claude CLI
2. Instaleaza dependentele Centre (`npm install`)
3. Build dashboard (Astro static)
4. Initializeaza SQLite (`data/robos.db`)
5. Genereaza `skills/_index.json`
6. Cere numele tau si business-ul, scrie `context/USER.md`

Dashboard la `http://localhost:3001`.

---

## Structura

```
robos/
  AGENTS.md           Reguli partajate (limba, output, categorii skills)
  CLAUDE.md           Instructiuni Claude Code (lifecycle sesiune)
  VERSION             Versiunea curenta
  CHANGELOG.md        Istoric schimbari

  brand/              Context de brand (citit de skills)
    voice.md          Profil voce (6 dimensiuni)
    audience.md       Profil ICP
    positioning.md    Unghiuri de diferentiere
    samples.md        Exemple de continut

  context/
    SOUL.md           Personalitatea agentului
    USER.md           Profilul tau (generat la setup)
    priorities.md     Prioritati trimestriale
    learnings.md      Acumulare feedback per skill
    audits/           Istoric scoruri 4C
    memory/           Jurnale zilnice (YYYY-MM-DD.md)
      _archive/       Arhive lunare (rollup automat)

  connections.md      Inventar tool-uri conectate (7 domenii)

  skills/             Skills instalate (citite la sesiune)
    _index.json       Generated: registry single-source-of-truth
    _catalog/         Catalog skills disponibile pentru instalare
      catalog.json    Manifest catalog
      starter-packs/  Template-uri brand (consultant, agency, etc.)

  projects/           Output din skills
  clients/            Workspace-uri per client (izolate)
  cron/
    jobs/             Definitii joburi JSON (optional, importate in DB)
    logs/             Loguri executie
    status/           PID daemon, status fisiere

  centre/             Command Centre (Astro + Svelte + SQLite)
  scripts/            Setup, start, update, management skills + clients
  data/               SQLite + cache-uri (audit cache, etc.)
  .env                Chei API (gitignored)
```

---

## Skills

Skills sunt unitati de comportament cu instructiuni step-by-step. Fiecare are un `SKILL.md` cu:
- **Frontmatter YAML** (nume, versiune, categorie, triggers, context_loads, inputs, outputs)
- **Body markdown** cu pasi numerotati pe care Claude ii urmeaza

### Categorii

| Prefix | Scop |
|--------|------|
| `brand-` | Voce, audienta, pozitionare |
| `content-` | Articole, copy, repurpose |
| `research-` | Trenduri, competitori |
| `sys-` | Onboard, audit, plan, close, skill builder |
| `tool-` | Integrari externe (humanizer, WhatsApp, Drive) |

### Listare

```bash
bash scripts/list-skills.sh              # vezi instalate + disponibile
bash scripts/add-skill.sh <nume>          # instaleaza din catalog
bash scripts/remove-skill.sh <nume>       # sterge (cu confirmare)
node scripts/rebuild-index.js             # regenereaza _index.json manual
```

Skills se activeaza prin limbaj natural, exemple:

| Spune | Ruleaza |
|-------|---------|
| "ajuta-ma sa incep" | sys-onboard |
| "audit" / "cum stau" | sys-audit |
| "plan de zi" | sys-daily-plan |
| "level up" | sys-level-up |
| "scrie un articol despre X" | content-blog-post |
| "scrie copy pentru landing X" | content-copywriting |
| "fa posturi din asta" | content-repurpose |
| "umanizeaza textul" | tool-humanizer |
| "analiza competitori" | research-competitors |
| "ce e trend in X" | research-trending |
| "creeaza un skill" | sys-skill-builder |
| "gata" / "merci, gata" | sys-session-close |

### Cum se construieste un skill nou

```bash
# In Claude Code:
"Creeaza un skill care face X"
# -> sys-skill-builder porneste
```

Sau manual: `mkdir skills/my-skill && touch skills/my-skill/SKILL.md`, completeaza frontmatter conform [AGENTS.md](AGENTS.md), apoi `node scripts/rebuild-index.js`.

---

## Memorie zilnica

Fiecare zi primeste un fisier: `context/memory/YYYY-MM-DD.md` cu sectiunile:

```markdown
## Session N

### Goal
(Ce voia userul sa faca)

### Deliverables
(Fisiere create, lucruri publicate)

### Decisions
(Alegeri facute si de ce)

### Open Threads
(Lucruri incepute si neterminate)
```

**Auto-tracking** (tacit, fara anunt):
- Cand un goal devine clar → `### Goal`
- Cand creezi/modifici un fisier → `### Deliverables`
- Cand iei o decizie → `### Decisions`
- Cand amani ceva → `### Open Threads`

**Rollup lunar** (cu skill-ul `sys-archive-memory`): la sfarsit de luna, fisierele zilnice sunt mutate in `_archive/{YYYY-MM}/` si un sumar e generat la `_archive/{YYYY-MM}.md`. Pastreaza directorul principal mic.

---

## Cron / joburi programate

**Arhitectura (v0.3.0)**: scheduler-ul ruleaza **in-process in dashboard-ul Centre**. Cand pornesti `bash scripts/start.sh`, cron-ul porneste cu el. **Sursa de adevar**: tabela SQLite `cron_jobs`.

### Trei cai sa creezi joburi

1. **Dashboard** (recomandat): tab Schedule → buton "+ Job nou" → completezi formul → submit. Validare instant.
2. **Fisier JSON** (pentru git tracking): pune `cron/jobs/{nume}.json` cu formatul de mai jos. Scheduler-ul il importa in DB la pornire (idempotent).
3. **API direct**: `POST /api/cron` cu JSON body.

Format JSON:
```json
{
  "name": "daily-blog-post",
  "schedule": "0 9 * * 1-5",
  "skill": "content-blog-post",
  "args": {"topic": "auto"},
  "enabled": true,
  "timeout": "30m",
  "retries": 2,
  "clientId": "acme-corp"
}
```

### Comenzi

```bash
bash scripts/start.sh           # porneste dashboard + scheduler in-process
bash scripts/status-crons.sh    # vezi joburi + ultima rulare
bash scripts/stop.sh            # opreste tot

bash scripts/start-crons.sh     # OPTIONAL: daemon standalone (numai daca nu vrei dashboard)
bash scripts/stop-crons.sh      # opreste daemon standalone
```

### Features cron

- **Run Now** din dashboard lanseaza `claude -p` instant
- **Validare schedule** la POST/PATCH (cron string invalid → 400)
- **Retry policy**: 30s/2min/8min backoff exponential pentru rulari programate
- **Cwd per-client**: jobul cu `clientId` ruleaza in `clients/{clientId}/`
- **Notificari live**: SSE catre dashboard (toast la start/completed)
- **Vezi log per run**: tabela istoric → buton "Vezi"
- **Edit/Delete** din UI

Test end-to-end: `bash tests/cron-e2e.sh` (cu serverul pornit).

---

## Multi-client

Fiecare client e un sub-workspace izolat:

```bash
bash scripts/add-client.sh acme-corp "Acme Corp"
cd clients/acme-corp && claude
```

Creeaza:
```
clients/acme-corp/
  brand/        # Voce, audienta, positioning specifice clientului
  context/      # USER.md, learnings, memorie izolata
  projects/     # Livrabile pentru acest client
  cron/jobs/    # Joburi specifice clientului
  CLAUDE.md     # Instructiuni: incarca brand/ si context/ de aici, nu din root
```

Schimbare client: `cd clients/{slug}` — Claude detecteaza automat din `CLAUDE.md` ca lucreaza in scope-ul clientului.

---

## Dashboard (Command Centre)

Aplicatie statica Astro + Svelte servita de Node, ruleaza la `localhost:3001`.

| Tab | Ce arata |
|-----|----------|
| **Home** | Task-uri active, coada review, sanatate sistem |
| **Tasks** | Kanban (Backlog, Active, Review, Done) |
| **Schedule** | Joburi cron + istoric rulari (in dezvoltare) |
| **Skills** | Skills instalate + catalog disponibil |
| **Files** | Browser pentru `context/`, `brand/`, `projects/` |
| **Settings** | Variabile env, config MCP, setari Claude |

Cold start sub 300ms. Build static (nu dev server). Update live prin Server-Sent Events.

---

## Update

```bash
bash scripts/update.sh
```

Face:
1. Backup `data/robos.db`
2. `git pull --ff-only`
3. Re-instaleaza dependinte daca `centre/` s-a schimbat
4. Regenereaza `skills/_index.json`
5. Listeaza skills noi in catalog

**Fisiere protejate** (nu sunt rescrise niciodata): `context/USER.md`, `context/learnings.md`, `context/memory/*`, `brand/*`, `clients/*`, `projects/*`, `cron/jobs/*`, `data/*`, `.env`.

---

## Configuratie

### Chei API (`.env`)

Vezi `.env.example` pentru lista completa. Skills functioneaza fara chei (cu degradare gratiata) — cheile imbunatatesc capabilitatile.

**Importante:**
- `PORT` — portul dashboard (default 3001)
- `FIRECRAWL_API_KEY` — research web (research-trending, brand-voice auto-scrape)
- `OPENAI_API_KEY` / `XAI_API_KEY` — research social (Reddit, X)
- `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` — skill `tool-whatsapp`
- `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` — skill `tool-drive`

### Limba

robOS e configurat in romana (vezi politica completa in [AGENTS.md](AGENTS.md)). Triggers skills sunt bilingv (RO + EN), output catre operator e in romana, output catre audienta straina respecta limba audientei.

### Configurare brand

Dupa instalare, fie:
- Spune "ajuta-ma sa incep" → `sys-onboard` ruleaza un interviu de 15 min
- Sau editeaza manual `brand/voice.md`, `brand/audience.md`, `brand/positioning.md`

`brand-voice` are 4 moduri: `import` (paste guidelines), `extract` (din continut existent), `build` (interviu), `auto-scrape` (din URL).

---

## Troubleshooting

**Dashboard nu porneste / "site can't be reached"**
- Verifica portul: `cat .command-centre/server.log` — prima linie zice ce port asculta
- Default e 3001. Daca `.env` are alt port, dashboard-ul deschide acel port.
- Conflict de port: `PORT=3002 bash scripts/start.sh`

**Skill nu se declanseaza pe trigger**
- `cat skills/_index.json | jq '.triggers'` — vezi mapping-ul
- Daca trigger-ul nu apare, regenereaza: `node scripts/rebuild-index.js`
- Triggers sunt advisory pentru Claude — nu sunt routare hard. Daca continua sa nu mearga, foloseste numele explicit: "ruleaza skill-ul X"

**Cron daemon nu ruleaza joburile**
- `bash scripts/status-crons.sh` — vezi daemon status si joburi din DB
- `tail -50 cron/logs/daemon-$(date +%Y-%m-%d).log` — log daemon
- Joburile JSON din `cron/jobs/` sunt importate in DB la pornire. Daca dashboard-ul si daemon-ul vad joburi diferite, restarteaza daemon-ul: `bash scripts/stop-crons.sh && bash scripts/start-crons.sh`

**"Skill X is in catalog but not installed"**
- `bash scripts/add-skill.sh X` — instaleaza
- Daca esueaza cu "not found in catalog", catalogul a fost editat manual. Verifica `skills/_catalog/X/SKILL.md` exista.

**Audit lent (>5s)**
- Cache-ul foloseste mtime hash. Verifica: `node scripts/audit-cache.js status`
- Daca returneaza MISS la fiecare rulare, vezi de ce: probabil un fisier de input se modifica (auto-save din alt proces).
- Force refresh: `node scripts/audit-cache.js clear` apoi runeaza din nou.

**Memorie balooneaza (multe fisiere in `context/memory/`)**
- Ruleaza `sys-archive-memory` (instaleaza din catalog daca nu e deja)
- Sau cron lunar: vezi exemplul in skill-ul `sys-archive-memory`

---

## Stack tehnic

- **Dashboard**: Astro 6 + Svelte 5 islands + Tailwind 4
- **Backend**: Node.js 20+, http nativ (fara framework)
- **DB**: SQLite (better-sqlite3, WAL mode, busy_timeout 5s)
- **Cron**: croner library, daemon Node separat
- **Update live**: Server-Sent Events (SSE)
- **Static build**: Astro produce `dist/`, server-ul Node il serveste

---

## Note de design

- **Filesystem ca sursa de adevar**: skills, brand, memorie sunt fisiere markdown editabile manual. SQLite are doar tasks, cron jobs si runs (efemere).
- **Single source of truth pentru registry**: `skills/_index.json` generat din `skills/*/SKILL.md`. NU edita manual.
- **Degradare gratiata**: skills functioneaza fara brand, fara connections, fara API keys — outputul scade in calitate dar nu pica.
- **Limba**: romana peste tot (operator, docs, scripturi). Bilingv unde util (skill triggers).

---

## Licenta

Privat. Construit de RoboMarketing.
