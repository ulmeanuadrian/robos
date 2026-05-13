# robOS

Sistem de operare agentic pentru Claude Code. Da unui singur operator AI memorie persistenta, skills instalabile, context de brand, scheduler cron si workspace-uri multi-client izolate.

**Versiune actuala:** 3.1.1
**Status:** stable — folosibil pentru content/automation/multi-client cu enforcement complet (multi-client real, loop detector, Bearer auth coverage).

---

## Cuprins

1. [Instalare](#instalare)
2. [Structura](#structura)
3. [Skills](#skills)
4. [Hooks & enforcement layer](#hooks--enforcement-layer)
5. [Concurrency framework](#concurrency-framework)
6. [Memorie zilnica](#memorie-zilnica)
7. [Cron / joburi programate](#cron--joburi-programate)
8. [Multi-client](#multi-client)
9. [Dashboard (Command Centre)](#dashboard-command-centre)
10. [Update](#update)
11. [Configuratie](#configuratie)
12. [Troubleshooting](#troubleshooting)
13. [Stack tehnic](#stack-tehnic)

> **Ce e nou in versiunea curenta**, citeste **[WHATS-NEW.md](WHATS-NEW.md)** — schimbarile importante in limba operatorului (CHANGELOG-ul detaliat e developer-facing).
>
> **Pentru utilizare zilnica**, citeste **[docs/operator-handbook.md](docs/operator-handbook.md)** — cum se porneste/inchide o sesiune, cum functioneaza memoria si activity log, ce skill triggers exista, bune practici si troubleshooting.
>
> **Glossary** ([docs/glossary.md](docs/glossary.md)) — termeni robOS / OM-AI Protocol / acronime business cu explicatii scurte.
>
> **Pentru pozitionare** (Claude singur vs Claude + robOS), citeste **[docs/claude-vs-robos.md](docs/claude-vs-robos.md)** — tabel ASCII comparativ cu ce face Claude din start si ce adauga robOS la fiecare capacitate.

---

## Instalare

**Cerinte**: Node >= 22.12.0 (Astro dependency), Claude Code CLI ([install](https://claude.com/claude-code)).

### Quickstart 30 secunde (student care a primit tarball)

Dupa ce dezarhivezi `robos-X.Y.Z.tar.gz` si intri in folder:

```bash
# Mac/Linux:
bash scripts/robos

# Windows (PowerShell sau cmd):
scripts\robos.cmd

# Universal (orice platforma cu Node):
node scripts/robos.js
```

Atat. Comanda asta:
1. Detecteaza ca-i prima rulare → ruleaza setup-ul (npm install + build + DB init)
2. Porneste dashboard-ul la `http://localhost:3001` si deschide browser-ul
3. Salveaza state-ul ca lansari ulterioare sa fie instant (~0.7s)

Pentru chat cu Claude — in alt terminal in folder: `claude`, apoi scrie `onboard me`.

Optional, ca sa lansezi `robos` din orice director:
```bash
node scripts/robos.js --install-shortcut
```
(adauga un alias in `.zshrc`/`.bashrc` sau o functie in PowerShell `$PROFILE`).

### Quickstart pentru dev (git clone)

```bash
git clone <repo-url> robos
cd robos
node scripts/setup.js
node scripts/robos.js
```

Setup-ul (ce face automat):
1. Verifica Node + Claude CLI
2. Instaleaza dependentele Centre (`npm install`)
3. Build dashboard (Astro static)
4. Initializeaza SQLite (`data/robos.db`) cu schema completa (4 migratii)
5. Genereaza `skills/_index.json` (registry single source of truth)
6. Bootstrap `.env` din `.env.example` (auto-generat ROBOS_DASHBOARD_TOKEN)

### Comenzi launcher

| Comanda | Ce face |
|---|---|
| `node scripts/robos.js` | Launch normal: setup-if-needed → start dashboard → open browser |
| `node scripts/robos.js --status` | Diagnostic complet (PID, port, version, shortcut, last launch) |
| `node scripts/robos.js --stop` | Opreste dashboard graceful (SIGTERM, fallback SIGKILL la 5s) |
| `node scripts/robos.js --setup-only` | Doar setup, fara pornire dashboard |
| `node scripts/robos.js --no-browser` | Pornire fara deschidere browser |
| `node scripts/robos.js --clean` | Sterge `centre/dist/` + rebuild |
| `node scripts/robos.js --install-shortcut` | Adauga `robos` la PATH/profile |
| `node scripts/robos.js --uninstall-shortcut` | Sterge shortcut-ul |

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

## Hooks & enforcement layer

Claude Code expune doua hook events pe care robOS le foloseste pentru a impune comportamentul, **nu doar a-l recomanda**:

| Hook | Fisier | Ce face |
|------|--------|---------|
| **UserPromptSubmit** | [scripts/hook-user-prompt.js](scripts/hook-user-prompt.js) | La PRIMUL prompt al sesiunii: injecteaza STARTUP CONTEXT (memorie azi, recovery flags, open threads) ca system-reminder imposibil de ignorat. La fiecare prompt: ruleaza skill-route.js si injecteaza SKILL ROUTER hint daca matcheaza un trigger. |
| **Stop** | [scripts/checkpoint-reminder.js](scripts/checkpoint-reminder.js) + [scripts/activity-capture.js](scripts/activity-capture.js) | Checkpoint-reminder ridica reminder cand memoria zilei n-a primit scriere recent (escalation in 3 trepte cu blocking dupa al 3-lea). Activity-capture scrie cross-session log la `data/activity-log.ndjson`. |

Configurarea live in [.claude/settings.json](.claude/settings.json). Erori de hook ajung in `data/hook-errors.ndjson` (rotated 500 entries) — operator scaneaza cu `cat data/hook-errors.ndjson` daca ceva pare iesit din schema.

**Cron complementar:**
- `audit-startup` (zilnic 8:00): scaneaza memoria din ultimele 7 zile, raporteaza sesiuni abandoned
- `session-timeout-detector` (15 min): detecteaza sesiuni abandoned > 2h, scrie recovery flag pentru next session
- `learnings-aggregator` (saptamanal lunea): genereaza review din `context/learnings.md`

---

## Concurrency framework

8 skills paralelizeaza intern prin sub-agenti opus paraleli pentru castig 3-5× wall-clock + calitate per-felie. 5 patterns documentate in [AGENTS.md > Concurrency Patterns](AGENTS.md#concurrency-patterns):

| Pattern | Skill exemplu | Failure mode |
|---------|---------------|--------------|
| **Pillar Fan-Out** | sys-audit (4 piloni) | Graceful degradation |
| **MapReduce Research** | research-trending (5 surse), research-competitors (1 per competitor) | Graceful |
| **Multi-Asset Generation** | content-repurpose (8 platforms) | Hard-fail |
| **Multi-Angle Creativity** | content-blog-post, content-copywriting (mode=options, 3 stiluri) | Best-effort, opt-in only |
| **Adversarial Synthesis** | sys-level-up (PRO/CONTRA/ALT) | Hard-fail |

Reguli globale (nenegociabile): prag ≥3 unitati × ≥10s, cost cap 8 agenti paraleli, single-message spawn discipline (mesaje separate = secvential = pierzi castigul), telemetrie obligatorie in `data/skill-telemetry.ndjson`.

Helper: `node scripts/parallel-budget.js {check|log|stats}`. Smoke validare structurala: `node scripts/smoke-parallel.js`.

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

**Rollup lunar** (cu skill-ul `sys-archive-memory`, optional — instaleaza din catalog cu `bash scripts/add-skill.sh sys-archive-memory`): la sfarsit de luna, fisierele zilnice sunt mutate in `_archive/{YYYY-MM}/` si un sumar e generat la `_archive/{YYYY-MM}.md`. Pastreaza directorul principal mic.

---

## Second brain (knowledge persistent)

Layer de cautare peste tot ce scrii — notite atomice + jurnale + audituri + learnings — indexat in SQLite FTS5, deschis si in Obsidian daca vrei viewer vizual.

**Cele 3 straturi:**
- **Markdown** = sursa de adevar la `context/notes/` (template-ul livreaza folder gol)
- **SQLite FTS5** = motor de cautare derivat (rebuild oricand din markdown)
- **Obsidian** = viewer optional (deschide direct folder-ul `context/`, niciun import)

**Salvare:** "noteaza X", "tine minte X", "memoreaza X", "salveaza asta", "fixeaza in memorie", "pune in notite", "ia nota despre X" — sau doar scrie natural cu prefix "Decizie:" / "Regula:" si Stop hook ([scripts/note-candidates.js](scripts/note-candidates.js)) detecteaza candidati pe care ii confirmi in batch la urmatoarea sesiune.

**Cautare:** "ai mai notat despre X", "ce stim despre X", "recall X", "cauta in notite X" → top-K rezultate cu snippets BM25-ranked.

**Sub capota:**
- Schema: [centre/migrations/004_notes.sql](centre/migrations/004_notes.sql) — tabele `notes`, `notes_fts`, `note_tags`, `note_links`, `note_candidates`
- Indexer: `node scripts/notes-index.js [--rebuild|--dry-run|--file <path>]`
- Search CLI: `node scripts/notes-search.js "query" [--limit N] [--source memory|note|audit] [--tag T] [--json]`
- Skills: [skills/sys-capture-note](skills/sys-capture-note/SKILL.md), [skills/sys-recall](skills/sys-recall/SKILL.md)
- Disable auto-capture: `ROBOS_CANDIDATES_DISABLED=1`

Cost pentru student la install: zero. `setup.js` (sau `setup.sh` / `setup.cmd` / `setup.ps1`) ruleaza `centre/scripts/init-db.js` care aplica migrarea automat. Fara dependinte noi.

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

Smoke validare structurala paralelism: `node scripts/smoke-parallel.js`. Smoke multi-client: `node scripts/smoke-multiclient.js`.

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
| **Schedule** | Joburi cron + istoric rulari, modal CRUD complet, butoane Run/Edit/Sterge/Vezi log |
| **Skills** | Skills instalate + catalog disponibil (cu `status: planned` pentru cele neimplementate inca) |
| **Analytics** | Run history, cost timeline, skill performance |
| **Files** | Browser pentru `context/`, `brand/`, `projects/` (cu denylist pentru `.env`, `.mcp.json`, `data/`, `.claude/`) |
| **Sistem** | Activitate cross-session, auditori, memorie editor, learnings viewer, conexiuni health-check |
| **Settings** | Variabile env (mascate cu `****`), config MCP (cu shape validation), setari Claude |

Cold start sub 300ms. Build static (nu dev server). Update live prin Server-Sent Events.

**Bind default**: `127.0.0.1` (loopback only). Pentru expunere LAN intentionata, seteaza `ROBOS_CENTRE_HOST=0.0.0.0` in `.env`.

**Auth Bearer token** este implementat pentru endpoint-uri sensibile (settings/env, settings/mcp, skills/run, mutations pe tasks/cron/memory). Token auto-generat in `ROBOS_DASHBOARD_TOKEN` la `setup-env.js`. UI-ul il citeste o data per page load via `apiFetch()` din [centre/src/lib/api-client.ts](centre/src/lib/api-client.ts) — endpoint-urile de citire informationala (memory list, audit history, skills list, activity log) raman deschise.

---

## Update

### Pentru student (instalat din tarball)

```bash
node scripts/update.js
```

Face:
1. Verifica versiunea curenta vs `api.robos.vip/version`
2. Daca update disponibil, cere confirmare
3. Backup user content in `data/.update-backup/{timestamp}/`
4. Cere update token (autentificat cu JWT-ul existent)
5. Descarca tarball nou via `dl.robos.vip/{token}`
6. Aplica: copiaza fisiere `centre/`, `scripts/`, `skills/`, root files — preserva user content
7. Migrarile DB se aplica automat la urmatoarea pornire dashboard (`runMigrations` incremental)
8. Restarteaza dashboard-ul daca rula

### Pentru dev (git clone)

```bash
git pull --ff-only
node scripts/setup.js   # re-aplicam migratii DB + regenerare _index
```

Atat. Setup-ul e idempotent — re-rulare safe. Daca centre/ s-a schimbat, `npm install` se ruleaza automat in interior.

### Datele tale sunt in siguranta

Aceste fisiere/directoare **NU sunt suprascrise NICIODATA** de update:

| Fisier/director | Continutul tau |
|---|---|
| `context/USER.md` | Profilul tau personal |
| `context/learnings.md` | Feedback-ul acumulat per skill |
| `context/memory/` | Jurnalele zilnice (toate) |
| `context/notes/` | Second brain markdown notes |
| `context/decision-journal.md` | Jurnalul decizii non-triviale |
| `brand/` | Voce, audienta, pozitionare, samples (intregul folder) |
| `clients/` | Toate workspace-urile per client |
| `projects/` | Tot output-ul generat |
| `cron/jobs/` | Joburile tale custom |
| `data/` | DB SQLite + cache-uri + state files |
| `.env` | Cheile API |
| `connections.md` | Inventar tool-uri |

Update-ul atinge DOAR: cod sursa (`centre/`, `scripts/`, `licensing/` daca dev), skill-uri din catalog (`skills/_catalog/`), root files (AGENTS.md, CLAUDE.md, README.md, VERSION, CHANGELOG.md, .gitignore, .gitattributes). Tot ce-i mai sus e protejat.

---

## Configuratie

### Chei API (`.env`)

Vezi `.env.example` pentru lista completa. Skills functioneaza fara chei (cu degradare gratiata) — cheile imbunatatesc capabilitatile.

**Importante:**
- `PORT` — portul dashboard (default 3001)
- `FIRECRAWL_API_KEY` — research web (research-trending, research-competitors). Brand-voice auto-scrape foloseste WebFetch (Claude Code tool), nu Firecrawl.
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
- Daca esueaza cu "not found in catalog", catalogul a fost editat manual. Verifica `skills/_catalog/{name}/SKILL.md` exista.

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
