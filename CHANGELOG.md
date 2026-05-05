# Changelog

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
