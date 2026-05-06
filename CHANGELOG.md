# Changelog

## [0.5.0] - 2026-05-06

### Launcher unic + cron leader lock + in-place update + PowerShell parity

Inspirat de `centre.sh` din Agentic OS dar adaptat la stack-ul nostru. Transforma UX-ul zilnic de la "4 comenzi separate" la "1 comanda".

**Faza 1 — Launcher (`scripts/robos.js`):**
- One-command launch: setup-if-needed → start dashboard → open browser → state save
- Idempotent: probe port → reuse if alive (fara double-spawn vs `start.sh`)
- Compatible cu `scripts/start.sh` (acelasi PID file `.command-centre/server.pid`, acelasi log path, acelasi port precedence)
- Cross-platform: detached spawn cu fd-based stdio (parent exit ~0.7s)
- Comenzi: `--status`, `--stop`, `--setup-only`, `--no-browser`, `--clean`, `--install-shortcut`, `--uninstall-shortcut`
- State machine la `data/launcher-state.json` (atomic write, schema_version migration, corruption recovery)
- Wrappers: `scripts/robos` (bash), `scripts/robos.cmd` (Windows), `scripts/robos.ps1` (PowerShell)
- Optional shortcut: `--install-shortcut` adauga `robos` la `.zshrc`/`.bashrc`/PowerShell `$PROFILE` (idempotent via markers)

**Faza 2 — Cron polish:**
- **Leader lock** (`centre/lib/cron-leader-lock.js`): doar un proces scheduleaza la un moment dat. Heartbeat 10s, stale detection 30s, re-entrant pentru acelasi PID, release la stopScheduler. Daemon-ul standalone si Centre dashboard concureaza prin acelasi lock — primul venit e leader.
- **`[SILENT]` smart suppression**: jobs care produc `[SILENT]` in output suprima notification (jobs de monitoring "all clear"). Failure-urile NU se suprima.
- **Cross-platform notify** (`centre/lib/notify.js`): `node-notifier` optional + fallback OS-native (osascript / notify-send / PowerShell NotifyIcon). Best-effort, niciodata throw.

**Faza 3 — Update in-place + Worker endpoints:**
- **`/version`** (Worker, public GET): returneaza `{current_version, minimum_version, changelog_url, released_at}`.
- **`/update-token`** (Worker, POST cu JWT): valideaza JWT cu cheia publica (acceptat pana la 7 zile post-expiry pentru update-uri stale), elibereaza download token nou (24h TTL), refoloseste tabela `download_tokens`.
- **`scripts/update.js`** (cross-platform Node): GET version → comparare semver → confirmare → stop dashboard daca ruleaza → backup user content in `data/.update-backup/{ts}/` → POST update-token → download tarball → extract cu system tar → apply selectiv (NICIODATA atinge `brand/`, `context/`, `clients/`, `projects/`, `cron/jobs/`, `data/`, `.env`, `connections.md`) → cleanup staging → restart dashboard → migrarea schemei se aplica automat la next start.
- **`scripts/update.ps1`** + **`scripts/update.cmd`** — pereche Windows
- **`scripts/setup.ps1`** + **`scripts/robos.ps1`** — pereche PowerShell pentru toate launcher comenzile

**README rescris** cu:
- Quickstart 30 secunde pentru student tarball
- Tabel comenzi launcher (status/stop/clean/etc)
- Sectiune "Datele tale sunt in siguranta" cu lista completa fisiere protejate
- Sectiune Update separata: tarball flow (update.js) vs dev flow (update.sh)

**Welcome email** (licensing/src/lib/email.js): pasi reduceti de la 5 la 4, mentioneaza optional `--install-shortcut`.

**Test integrare verificat:**
- robos.js full lifecycle (setup-only, launch, reuse, stop) pe Windows
- Concurenta cron leader lock cu 2 procese simultan — doar leader scheduleaza
- `[SILENT]` detection: empty/non-silent/silent/case-insensitive/partial-match
- update.js detecteaza /version 404 (Worker live e v0.4.0) cu mesaj clar

## [0.4.1] - 2026-05-06

### Distribution hygiene — kit student curat

Bug critic descoperit la testarea install-ului ca student: tarball-ul v0.4.0 livra date personale ale autorului si avea install incomplet pe Windows.

**Fix-uri:**
- `brand/*.md` ship ca template-uri goale (HTML comments) — sys-onboard le populeaza prin starter packs
- `data/robos.db` untracked — se creeaza prin `init-db.js` cu schema completa (notes + FTS5)
- `licensing/wrangler.toml` — sterse PII (`ADMIN_EMAIL`); mutat in wrangler secrets
- `skills/_catalog/tool-whatsapp/SKILL.md` — sterse numar telefon hardcoded; pointeaza la `.env`
- `.gitattributes` cu `export-ignore` pentru `licensing/`, `tests/`, `paperclip/` — student tarball mai mic, fara surse Worker
- `scripts/setup.js` cross-platform (Node) + `setup.cmd` pentru Windows; vechiul `setup.sh` delega la `setup.js`
- `welcomeEmail` cu prerequisites Node.js + Claude Code + pas explicit setup

**Impact:** student tarball v0.4.1 = 223 fisiere (vs 254 in v0.4.0), zero PII, install identic Windows/Mac/Linux.

## [0.4.0] - 2026-05-06

### Concurrency framework — 5 patterns documentate + 8 skills paralelizate

- **AGENTS.md > Concurrency Patterns** — 5 patterns standardizate cu invariants nenegociabile (prag, cost cap 8 agenti, timeout advisory, retry policy, idempotenta, no secrets in prompts, single-message spawn discipline, telemetrie obligatorie):
  - **Pillar Fan-Out** — N dimensiuni independente de scoring; graceful degradation
  - **MapReduce Research** — N surse paralele + synthesizer; graceful
  - **Multi-Asset Generation** — N output formats; hard-fail (sau soft-fail variant pentru cost-de-Q&A)
  - **Multi-Angle Creativity** — N stiluri pe acelasi brief; opt-in only, best-effort
  - **Adversarial Synthesis** — PRO/CONTRA/ALT pentru decizii strategice; combats confirmation bias
- **`scripts/parallel-budget.js`** — `shouldParallelize`, `logTelemetry`, `readStats`. Pragul: ≥3 unitati × ≥10s/unitate.
- **`data/skill-telemetry.ndjson`** — fiecare skill paralelizat scrie un rand: `{ts, skill, mode, agents, agents_failed, wall_clock_ms, fallback_used}`.
- **`scripts/smoke-parallel.js`** — validare structurala SKILL.md (Output Discipline, parallel-budget reference, single-message rule, AGENTS.md alignment).

### Skills refactorizate

- **sys-audit v3.0.0** — Pillar Fan-Out pe 4 piloni (Context/Connections/Capabilities/Cadence) + reducer; ~4× wall-clock vs v2.
- **sys-onboard v2.0.0** — 3 brand-file agenti paraleli post-Q&A (voice/audience/positioning) — soft-fail variant pentru ca Q&A-ul de 15 min e cost-prohibitive de retry total.
- **sys-level-up v2.0.0** — Adversarial Synthesis (PRO/CONTRA/ALT + synthesizer) inlocuieste single-pass ranking; combate confirmation bias.
- **sys-session-close v2.0.0**, **sys-session-open v2.0.0**, **sys-daily-plan v2.0.0** — encapsulation pattern (mecanica routata prin sub-agent, main thread doar confirmation gates + final summary). Nu e paralelism, doar output discipline.
- **content-repurpose v2.0.0** — Multi-Asset Generation: 1 agent per platforma (max 8 din 8 disponibile); hard-fail per Pattern 3.
- **content-blog-post v2.0.0**, **content-copywriting v2.0.0** — Multi-Angle Creativity opt-in (mode=options); 3 stiluri paraleli per brief; ~3× tokens, opt-in only.
- **research-trending v2.0.0**, **research-competitors v2.0.0** — MapReduce: 5 surse paralele (research-trending) sau 1-8 competitori paraleli + synthesizer.

### Audit cross-perspective + remediation marathon

Audit multi-agent (6 opus paraleli + synthesizer) a produs 95 findings. Batch-uri de remediation cu regression check sistemic dupa fiecare commit:

**Batch 1 — Security critical (5 commits):**
- **`centre/server.js`** — bind `127.0.0.1` default (era `0.0.0.0` cu zero auth → LAN compromise vector). `ROBOS_CENTRE_HOST=0.0.0.0` pentru opt-in LAN.
- **`scripts/session-timeout-detector.js`** — fix regex `[^-]+\.json$` (excludea UUIDs cu dashes); subsystem complet mort, acum vede 15 markers.
- **`centre/api/files.js`** — denylist pentru `.env`, `.mcp.json`, `.claude/`, `.command-centre/`, `data/`, `node_modules/`, `.git/`. Removed `.env` exception din file tree filter.
- **`centre/api/settings.js`** — setMcp shape validation completa (command whitelist regex, args/env shell-safe, https-only urls, server name regex). setMcp returneaza `{ok, error}`, route handler raspunde 400 pe failure. maskValue intoarce intotdeauna `****` (era leak primii 3 chars).
- **`scripts/lib/hook-error-sink.js`** nou — single error log la `data/hook-errors.ndjson`. Cablat in 3 hooks (UserPromptSubmit + 2x Stop). Closes systemic theme "silent failure as default".

**Batch 2 — Stability sinks (4 commits):**
- **`scripts/lib/ndjson-log.js`** — `appendFileSync` fast path + atomic rotation prin `.tmp + rename`. ~50× speedup pe activity-capture hot path; race window inchis.
- **`scripts/parallel-budget.js`** — `SUBAGENT_TIMEOUT_MS` → `*_ADVISORY` rename + AGENTS.md rule #3 honest "NU enforced runtime". False promise eliminat.
- **`scripts/rebuild-index.js`** — atomic write `_index.json` (.tmp + rename); partial-read race in hook loadIndex inchis.
- **`scripts/hook-user-prompt.js`** + **`checkpoint-reminder.js`** — sanitize `session_id` din stdin JSON cu regex `[a-zA-Z0-9_-]{1,128}`; defense-in-depth path traversal.

**Batch 3 — Architecture refactor (5 commits):**
- **`scripts/lib/skill-frontmatter.js`** nou — single canonical YAML parser. 3 implementari (rebuild-index + centre/api/skills + smoke-parallel) consolidate. `PUBLIC_SKILL_FIELDS` whitelist pasase prin `concurrency_pattern`, `output_discipline`, `modes`, `multi_angle_triggers` (erau dropped silentios). smoke-parallel convertit la ESM.
- **`scripts/lib/memory-format.js`** nou — `CLOSING_PATTERN`, `isClosed`, `extractOpenThreads`, `REQUIRED_SECTIONS`. 4 callers (hook-user-prompt, session-timeout-detector, audit-startup, lint-memory) de-duplicate.
- **`scripts/audit-cache.js`** — `status --json` flag adaugat; sys-audit/SKILL.md foloseste helper-ul (nu inline 13-line node script).
- **`skills/_catalog/catalog.json`** v1.3.0 — `status: "planned"` pe 12 phantoms (content-newsletter, brand-style-guide, sys-cron-manager, etc.). add-skill.sh respinge clean cu mesaj specific. Cross-platform fix pentru bash-on-Windows path resolution.
- **AGENTS.md** rule despre catalog version comparison drop (era unimplementable, catalog n-are version per skill).

### Hook system + activity log (surfaced retroactively)

(Aceste schimbari au fost livrate pre-0.4.0 dar nu au fost mentionate in CHANGELOG anterior.)

- **`.claude/settings.json`** — UserPromptSubmit hook pentru injection STARTUP CONTEXT + skill router; Stop hooks pentru checkpoint-reminder + activity-capture.
- **`scripts/hook-user-prompt.js`** — STARTUP CONTEXT bundle (memorie zilei, recovery flags, skill router hints) injectat la primul prompt al fiecarei sesiuni.
- **`scripts/skill-route.js`** — natural-language skill matching cu word-boundary pe triggere ≤4 chars + diacritic stripping.
- **`scripts/activity-capture.js`** — Stop hook captureaza prompt user (300 chars) + tool actions + assistant summary in `data/activity-log.ndjson` (rotation 500 entries).
- **`scripts/checkpoint-reminder.js`** — Stop hook ridica reminder cand memoria zilei nu a primit scriere recent; escalation in 3 trepte cu blocking dupa al 3-lea unheeded.
- **`scripts/session-timeout-detector.js`** — cron job (15 min) detecteaza sesiuni abandoned, scrie `data/session-recovery/*.json` consumate la urmatorul session start.

---

## [0.3.0] - 2026-05-05

### Cron — sistem complet refacut

- **Scheduler in-process** (`centre/lib/cron-scheduler.js`) — ruleaza in interiorul `centre/server.js`. Cand pornesti dashboard-ul, cron-ul porneste odata cu el. Daemon standalone ramane optional pentru cazuri fara dashboard.
- **Runner partajat** (`centre/lib/cron-runner.js`) — un singur cod path pentru rulari programate si manuale. Include cwd per-client, retry policy cu backoff exponential, scriere log, emitere SSE.
- **Run Now functional** — POST `/api/cron/:slug/run` lanseaza efectiv `claude -p` (anterior insera doar un rand `running` fara executie reala)
- **Validare schedule** — POST/PATCH respinge cron strings invalide cu HTTP 400 si mesaj clar
- **DELETE endpoint** — `DELETE /api/cron/:slug` sterge jobul + run-urile asociate
- **Log endpoint** — `GET /api/cron/:slug/runs/:runId/log` citeste logul fisierului (truncare la 200KB)
- **Status endpoint** — `GET /api/cron/status` arata cate joburi sunt active si urmatoarele rulari
- **Cwd per-client** — daca jobul are `clientId`, `claude -p` ruleaza in `clients/{clientId}/`
- **Retry policy** — `retries` din DB e respectat: 30s/2min/8min backoff exponential pentru rulari programate (nu si manuale)
- **Notificari SSE** — `cron:run:started` si `cron:run:completed` ajung la dashboard

### Dashboard cron UI complet

- Buton **+ Job nou** cu modal: slug, name, schedule, prompt, model, timeout, retries, clientId, active
- Buton **Edit** per job cu modal pre-filled
- Buton **Sterge** cu confirm dialog
- Buton **Vezi log** in tabela istoric — modal cu output complet
- **Toast notifications** la job started/completed (verde/rosu)
- Refresh automat al listingului dupa fiecare actiune

### Schimbari minore

- `start-crons.sh` detecteaza daca dashboard ruleaza si nu mai porneste daemon dublu
- `cron-daemon.js` redus la shim subtire ce importa `cron-scheduler.js`
- `tests/cron-e2e.sh` — test end-to-end care verifica toate cele 10 cazuri

---

## [0.2.1] - 2026-05-05

### Adaugat
- **skills/_index.json** — single source of truth pentru registry-ul de skills, generat automat de `scripts/rebuild-index.js` la fiecare add/remove
- **tool-whatsapp** in catalog — schelet skill cu suport WhatsApp Cloud API + fallback wa.me link
- **tool-drive** in catalog — schelet skill pentru read-only access la Google Drive prin service account
- **sys-archive-memory** in catalog — rollup lunar al fisierelor de memorie zilnice in `_archive/`
- **scripts/audit-cache.js** — helper CLI pentru cache-ul auditului (status / hash / clear)
- **data/audit-cache.json** — cache pe baza mtime hash + TTL 24h pentru re-run-uri rapide ale `sys-audit`
- **Step 0 in sys-audit** — verificare cache inainte de scanare; cu mode `force` se ignora
- **Step 0 in sys-session-close** — poarta de confirmare ("Inchidem sesiunea?") pentru a elimina false-fire pe trigger-uri ca "thanks"
- Triggers RO-first pe toate skills core (RO inainte, EN ca fallback)

### Schimbat
- **Cron unificat**: daemon-ul (`centre/scripts/cron-daemon.js`) citeste din tabela SQLite `cron_jobs` (sursa de adevar). Migrarea fisierelor `cron/jobs/*.json` se face automat la pornire (one-shot, idempotent). Run-urile sunt scrise in `cron_runs`.
- **`scripts/start-crons.sh`** — verifica DB-ul, nu mai depinde doar de fisiere JSON
- **`scripts/status-crons.sh`** — query catre DB cu ultima rulare per job
- **`AGENTS.md`** — eliminat tabelul Skill Registry (era duplicat fata de filesystem). Adaugat sectiune politica de limba (RO peste tot, bilingv pe triggers).
- **`README.md`** — rescris ca documentatie (cuprins, troubleshooting, structura completa, note de design). Nu mai e pitch.
- **`centre/api/skills.js`** — citeste prioritar din `skills/_index.json`, fallback la scanare filesystem
- **catalog.json** — eliminat campul `installed` (deriva acum din filesystem). Toate descrierile in romana.
- **Default port** — `start.sh` foloseste acum 3001 (consistent cu `server.js` si `.env.example`). Eliminata divergenta cu README.
- **VERSION** — sincronizat 0.1.0 → 0.2.1
- Toate scripturile (`*.sh`) — mesaje user-facing in romana
- Casing — `RobOS` ramas → `robOS` peste tot

### Reparat
- **add-skill.sh** functioneaza acum cu skill-uri din catalog (anterior catalogul nu avea sub-directoare cu SKILL.md)
- **listCatalog API** returneaza skill-uri reale din catalog.json (anterior filtra dupa `existsSync(SKILL.md)` si gasea zero)
- Script `start.sh` afiseaza portul corect care a fost folosit (nu hardcodat)

---

## [0.2.0] - 2026-05-04

### Adaugat
- **sys-onboard** -- onboarding interactiv in 15 min (starter pack + 5 intrebari + first win)
- **sys-audit** -- scor 4C (Context/Connections/Capabilities/Cadence) din 100, salvat in context/audits/
- **sys-level-up** -- 5 intrebari discovery pt urmatoarea automatizare
- **sys-daily-plan** -- planificare dimineata din memorie + prioritati
- `connections.md` -- inventar tool-uri cu 7 domenii tier-1
- `context/priorities.md` -- template prioritati trimestriale
- `context/audits/` -- director istoric audituri
- Trigger-uri romanesti pe toate skills noi
- Endpoint `/api/dashboard/health` -- verifica Claude CLI real

### Securitate
- Eliminat CORS wildcard `Access-Control-Allow-Origin: *`
- Fix path traversal in files API (resolve + relative)
- Fix path traversal in static file serving (safePath containment)
- `.env` scos din file browser (previne leak plaintext secrets)
- Body size limit 1MB pe request
- Sanitizare env values (blocheaza shell metacharacters)
- Validare schema MCP config la write
- SQLite `busy_timeout = 5000` (previne SQLITE_BUSY)

### Fixat
- Onboarding funnel -- detectia user nou se face pe brand/voice.md, nu USER.md
- SSE keepalive mutat la global interval (era O(N^2) per-client)
- SettingsPanel double `$effect` eliminat
- SettingsPanel referinta gresita `scripts/setup.js` -> `setup.sh`
- sys-daily-plan memory format aliniat cu CLAUDE.md (eliminat `### Plan` extra)
- "good morning" trigger scos din sys-daily-plan (conflicta cu greeting logic)
- TaskPanel prop mutation fix (foloseste callback in loc de mutare directa)
- SystemHealth verifica Claude CLI real (nu mai hardcodeaza "ok")
- DB migrations wrapped in transaction (previne half-migrated state)
- update.sh face backup DB inainte de git pull

### Eliminat
- `brand/assets.md` (template orfan, niciun skill nu-l referenta)
- `prompt.md` requirement din AGENTS.md (nu exista si nu e necesar)
- Dependente npm nefolosite: `chokidar`, `lucide-svelte`
- Dead exports `on()` si `clientCount()` din event-bus.js
- Index pe coloana `goalGroup` (nefolosita in queries)

### Schimbat
- `RobOS` -> `robOS` in toate fisierele
- `.gitignore`: adaugat `data/`, `node_modules/` root
- `package.json`: adaugat `engines: { node: ">=20" }`
- Sensitive patterns extinse: +PRIVATE, CREDENTIAL, DSN, AUTH
- Mask value nu mai leaka primele/ultimele caractere

## [0.1.0] - 2026-05-04

### Adaugat
- Dashboard Command Centre (Astro 5 + Svelte 5 + SQLite)
- 12 skills pre-instalate: brand-voice, brand-audience, brand-positioning, sys-skill-builder, sys-session-close, sys-goal-breakdown, content-blog-post, content-copywriting, content-repurpose, research-trending, research-competitors, tool-humanizer
- 4 starter packs: consultant, agency, ecommerce, creator
- Catalog cu 11 skills optionale
- Framework brand context (voice, audience, positioning, samples)
- Daemon cron cu joburi programate
- Workspace-uri multi-client izolate
- Memorie zilnica cu auto-tracking
- Scripturi management: setup, start, stop, update, add/remove/list skills
- Degradare gratiata la toate nivelurile de context
