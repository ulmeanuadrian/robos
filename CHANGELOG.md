# Changelog

> **Acest fisier e developer-facing** — detalii tehnice, file paths, line numbers.
> Pentru rezumat in limba operatorului: vezi [WHATS-NEW.md](WHATS-NEW.md).

## [3.1.1] - 2026-05-13

### Fix: hook commands break on PowerShell (student fresh install)

- `.claude/settings.json` folosea sintaxa bash-only `node "$CLAUDE_PROJECT_DIR/scripts/X.js"`. Pe Windows PowerShell `$CLAUDE_PROJECT_DIR` e variabila bash → undefined → empty → node primeste `/scripts/X.js` → rezolva la drive root `C:\scripts\X.js` → "Cannot find module" pe toate cele 5 hook-uri (`hook-user-prompt`, `hook-post-tool`, `checkpoint-reminder`, `activity-capture`, `note-candidates`). Admin nu vede bug-ul daca are git-bash in PATH (Claude Code prefera bash). Pattern observat la 2/2 studenti pe 2 laptopuri (2026-05-12, 2026-05-13).
- Fix: path-uri relative (`node scripts/hook-user-prompt.js`). Functioneaza pe bash, PowerShell si cmd — Claude Code spawneaza hook-urile cu CWD=project root, deja conventia (`scripts/robos.js:613` cere `cd robos` explicit). Hook scripts-urile isi gasesc singure resursele via `import.meta.url`/`__dirname`, nu depind de env var.
- Regression guard: `scripts/smoke-hook-shell-resolve.js` (22 assertii) — lint pentru orice `$VAR`/`${VAR}` in commands + functional spawn prin AMBELE cmd.exe SI powershell.exe pe Windows. Auto-discovered de `smoke-all` (37/37 green).

## [3.0.1] - 2026-05-10

### MCP servers preconfigured

- `.mcp.json` includes 3 MCP servers ready out of the box: **playwright** (browser automation), **firecrawl** (web scraping, requires `FIRECRAWL_API_KEY` from `.env`), **sqlite** (read access to `data/robos.db`).
- `.gitignore` excludes `data/playwright-profile/` (chromium user data dir).
- Studentul nou primeste capabilitati augmentate fara setup MCP manual. Playwright descarca chromium (~300MB) la primul use; firecrawl si sqlite sunt fara payload.

### R2 maintenance

- Sterse din R2 tarball-urile vechi: v0.4.0, v0.4.1 (PII RoboMarketing leaked) si v0.5.0, v0.5.1, v2.0.0 (intermediare). Singurul tarball live = curent (v3.0.1).

## [3.0.0] - 2026-05-10

### Invariant infrastructure (waves 1-5)

Salt major: robOS trece de la "audituri ad-hoc cu fix de instanta" la "infrastructura de invariante verificabile cu fix de clasa". Sursa de adevar e [`context/INVARIANTS.md`](context/INVARIANTS.md) — 12 categorii × ~50 invariante, fiecare cu Statement / Why / Verify / Status. Audituri viitoare nu mai produc rapoarte ad-hoc — produc un `node scripts/smoke-all.js` verde sau o lista numerotata de invariante care fail-uiesc.

**Coverage:**
- Pre-Wave: 11 smoke tests existente
- Post-Wave 5: **33 smoke tests verzi** (--quick 12.9s / full 28s cu SLOW)
- 18 fisiere noi in `scripts/`, 3 lib-uri noi in `scripts/lib/`, 1 doc canonic in `context/INVARIANTS.md`

**Wave 1 — version-sync, security-lint, setup-idempotency, tarball-clean:**
- Pin LCY-1, SEC-1, DOC-4, DST-1/3/4, SEC-7. Fix `centre/package.json:engines.node "20"` → `"22.12.0"` (LCY-1 violation: setup.js hard-fails on <22.12 but engines admitted Node 20). Fix `licensing/src/endpoints/admin.js` token compare cu `===` → `constantTimeEqual()` helper (SEC-1: defense timing-safe pe Workers, unde Node `crypto.timingSafeEqual` nu exista).

**Wave 2 — license-perf, fresh-install, update-preserve, cron-log-rotation:**
- Pin LIC-3, PRF-2, UX-1, DAT-2, UX-5, DAT-5, SCA-5. Refactor `scripts/lib/protected-paths.js` (single source pentru update.js + smoke). Fix SCA-5: `session-timeout-detector` cleanup wired la `cron/logs/` (retention 14 days, .log predicate). Adaugat `main()` guard la `update.js` ca smoke-urile sa importe helpers fara sa firul update flow-ul real.

**Wave 3 — hook-error-sink, no-network, wrappers, lint-rules, claims-coverage:**
- Pin OBS-1, PRV-3, CP-4, SEC-7 fixture, DOC-1. Refactor `lint-security.js` cu export `lintContent(text, label)` pentru fixture testing. Refactor `lint-claims.js` cu `RUNTIME_FILES` + `RUNTIME_PREFIXES` allowlist + `looksLikePath` mai strict (require extension SAU trailing `/`). Lint-claims dupa fix a expus 2 doc bugs ascunse de zgomot: `README.md:482 X` placeholder → `{name}`, `WHATS-NEW.md:65 docs/init/` → `docs/init`.

**Wave 4 — skill-routing, telemetry, hook-latency, catalog, atomic-coverage:**
- Pin UX-3, OBS-2, PRF-1, DOC-3, DAT-1. Baseline hook latency: toate 5 hooks p95 50-80ms (6× sub buget 500ms). Refactor `scripts/lib/launcher-state.js` + `scripts/rebuild-index.js` (×2 sites) la `atomic-write` lib. Adaugat `detectCatalogOrphans()` pentru DOC-3. Skill-routing a expus drift `CLAUDE.md:186 "done"` → "gata" (real bug: skill-ul nu accepta "done" alone, doar "done for today" / "I'm done").

**Wave 5 — redact, env-secrets, args-validation, activity-log, doctor:**
- Pin PRV-4, SEC-2, SEC-5, OBS-4, UX-6. Refactor `scripts/lib/args-validator.js` (extras din `centre/api/system.js`). Recursion fix in `--doctor`: `ROBOS_INSIDE_DOCTOR=1` env flag previne `smoke-doctor-coverage → doctor → smoke-all → smoke-doctor-coverage` loop. SEC-2 live test: 11 secret-named entries verificate cu value=null/masked=true.

**Resolved violations (10):**
1. LCY-1 — `centre/package.json` engines.node `>=20` → `>=22.12.0`
2. SEC-1 — `admin.js` token compare cu `!==` → `constantTimeEqual()`
3. DOC-4 — `data/launcher-state.json:last_robos_version` `0.5.0` → sync cu VERSION
4. DOC-2 (memory) — INSTALL.md path corectat la `docs/INSTALL.md`
5. SCA-5 — `cron/logs/` retention 14d wired
6. DOC-1 (×2) — README `X` → `{name}`, WHATS-NEW `docs/init/` → `docs/init`
7. UX-3 — CLAUDE.md `"done"` → `"gata"` (skill nu avea "done" ca trigger standalone)
8. DAT-1 DRY — launcher-state + rebuild-index inline atomic → atomic-write lib
9. SEC-5 DRY — ARGS_FORBIDDEN_RE inline → args-validator lib
10. Doctor recursion — `ROBOS_INSIDE_DOCTOR=1` env guard

### Audit comprehensiv + remediation sweep

87 finding-uri identificate prin 4 agenti adversariali paraleli (functional/stability,
docs-truth, security, UX/onboarding) + smoke baseline. Documentate in
[AUDIT-2026-05-09.md](AUDIT-2026-05-09.md). 38 finding-uri rezolvate prin 17 commit-uri
atomice, fiecare cu smoke test verde inainte si dupa.

**Severity coverage:**
- 2 CRITICAL: 100% rezolvate
- 3 BLOCKER: 100% rezolvate
- 18 HIGH: 12 rezolvate (67%)
- 38 MED: 21 rezolvate (55%)
- 26 LOW: 5 rezolvate (19%)

### Critical fixes (data-loss / functional regression)

**F1 — Hooks citesc `.env` (loadEnv).** Toggle-urile `ROBOS_*_DISABLED` din
`.env.example` erau moarte — hook-urile rulau cu env curat (Claude Code nu
forwardeaza). Adaugat `scripts/lib/env-loader.js` (NEW) + `loadEnv()` la inceput
in 8 entry scripts (hook-user-prompt, hook-post-tool, checkpoint-reminder,
activity-capture, note-candidates, audit-startup, session-timeout-detector,
learnings-aggregator). Smoke: `scripts/smoke-env-toggles.js` 22 assertions.

**F2 — `session-timeout-detector` multi-client aware.** Cand un client era
activ, sesiunile ii erau fals-marcate "abandonate" pentru ca detector-ul vedea
doar `context/memory/` root. Fix: `getAllMemoryScopes()` in
`scripts/lib/client-context.js` + cross-scope walk + `--dry-run` flag.
Smoke: `scripts/smoke-session-timeout-multiclient.js` 10 assertions.

### Blocker UX (student-facing)

**U2 — `docs/init/README.md` (rogue Agentic OS docs) archived.** Fisier
leftover dintr-un produs diferit ("Agentic OS" by Simon Scrapes) — referinte
la `mkt-brand-voice`, `bash scripts/centre.sh`, `localhost:3000`. Mutat in
`.archive/legacy-vendor-docs/` (gitignored).

**U3 + D10 — Node version single-source 22.12.0.** Inconsistenta in 7 fisiere
(`README.md:34`, `setup.cmd:6`, `setup.ps1:11`, etc.) zicea "Node >= 20" dar
`setup.js:47` hard-fail pe < 22.12. Aliniat. Adaugate optiuni `.msi` direct +
winget alternative pentru Windows Sandbox / corporate images.

**ROBOS_DEV portita scoasa.** Bypass de license check intern. Decizie produs:
test envs trebuie sa foloseasca licenta reala. 7 fisiere modificate (license-check,
test-env scripts, docs).

### High-impact stability + security

**F4 — `scripts/lib/atomic-write.js` (NEW).** Pattern unified cu Windows
EBUSY/EPERM retry + try/finally cleanup. Inlocuieste 3 site-uri duplicate
(loop-detector, client-context, ndjson-log rotation). Random hex tmp suffix
elimina race conditions concurente.

**F5 + F10 — Session-state retention.** `scripts/lib/cleanup.js` (NEW)
pruneDirByAge — session-state 30 zile, recovery 7 zile. Detector-ul cron
ruleaza la 15 min si curata in pas. Disk bounded automat fara cleanup job
separat.

**F7 — Origin null bypass.** `centre/lib/auth.js isSameOrigin` returna `true`
cand Origin lipsea — orice proces local Node putea fura token-ul. Fix: missing
Origin → `false`. CLI tooling foloseste Bearer direct.

**S3 — `ARGS_FORBIDDEN_RE` curata.** Regex-ul bloca spatii (input multi-cuvant
catre `runSkill` returna 400). Cu `shell:false`, doar NUL/CRLF sunt periculoase.
Aliniat la `/[\0\n\r]/`.

**S4 — `cron-runner.js` shell:false + argv parse.** `shell:true` pentru jobs
cu camp `command` permitea metacharacters. Adaugat `parseCommandArgv()` +
`spawn(node, [...], { shell: false })`. argv[0]==='node' substituie cu
`process.execPath` (Windows .cmd shim safe).

### High-impact UX cross-platform

**U5 — 7 bash-only scripts → cross-platform.** add-client, add-skill,
list-skills, remove-skill, start-crons, stop-crons, status-crons. Sursa
unica `.js` (ESM) + 21 wrappers thin (`.cmd`, `.ps1`, `.sh` proxy).
`scripts/lib/process-utils.js` (NEW): `isProcessAlive`, `killProcessSync`
cross-platform. Smoke: `smoke-cross-platform-scripts.js` 28 assertions.

**U7 — License bind in setup, nu la primul prompt.** Student offline la
primul prompt era blocat. Bind mutat in `setup.js` (cand student e oricum
online instaland deps). `--skip-license-bind` pentru offline/dev/evaluator.

**U10 — Starter packs SMB + B2B SaaS.** Memorie zicea audienta = Operator-Peer + SMB,
dar pack-urile actuale erau consultant/agency/ecommerce/creator. Adaugate
`smb` (service/retail/trade local) + `b2b-saas` (developer-first product).
Sys-onboard menu 7-option + 1-question diagnostic pentru "Other".

**U13 — `WHATS-NEW.md` (NEW)** student-language changelog. CHANGELOG.md
marcat dev-facing.

### Cross-platform infrastructure

**5 lib-uri noi DRY:**
- `scripts/lib/env-loader.js` (F1)
- `scripts/lib/atomic-write.js` (F4)
- `scripts/lib/cleanup.js` (F5/F10)
- `scripts/lib/process-utils.js` (U5)
- Extens: `scripts/lib/client-context.js` cu `getAllMemoryScopes()` (F2)

**Tooling nou:**
- `scripts/smoke-all.js` — runner unificat (11/11 in 7s)
- `scripts/lint-portability.js` — detect shellisme (USERPROFILE, shell:true,
  backslash literal, exec sans-argv)

**6 smoke tests noi (87 assertions):** smoke-env-toggles, smoke-session-timeout-multiclient,
smoke-auth-origin, smoke-cron-runner-argv, smoke-atomic-write, smoke-cleanup,
smoke-cross-platform-scripts.

### MED + LOW polish (Wave 1-4)

- F8: orphan key detection in `setup-env.js`
- F12 + F20: `parallel-budget.js` ESM + `appendNdjson` rotation
- F14: cron-leader-lock atomic write
- F17: transcript-not-found logged via `hook-error-sink`
- F18: settings.js setEnv via atomic-write
- S5: redact.js generic UPPER_KEY=value pattern (6 cazuri noi)
- S6: timing-safe compare licensing /internal/licenses/create
- S7: HOST=0.0.0.0 startup warning
- S8 + S9: AUTH_REQUIRED extins cu `/api/files`, `/api/system/activity`
- S11: `buildTree` filter '/'/'\\'/NUL bytes
- S15: cron API clientId slug validation
- F13: launcher-state version refresh in setup
- D1, D2, D5, D7, D8, D9, D11, D13, D20: docs alignment
- U21: setup banner unmissable
- U22 (NEW): `node scripts/robos.js --doctor`
- U25 (NEW): `node scripts/robos.js --reset-onboarding`
- U26: `update.js` JWT fallback la first-run-bind
- U29 (NEW): `node scripts/robos.js --triggers <kw>`
- Lint: 4 BLOCK → 0 BLOCK, 2 WARN → 0 WARN

### Documentation new

- `WHATS-NEW.md` (NEW)
- `docs/glossary.md` (NEW)
- `docs/INSTALL.md` — sectiune "Probleme frecvente" extinsa cu 10 entries noi
- `AUDIT-2026-05-09.md` — raport complet 87 finding-uri
- `PLAN-FIX-2026-05-09.md` — plan atomic-commit cu safety gates

### Validation

- 11 smoke suites, 235+ assertions — toate verzi pe fiecare commit
- Lint portability: 0 BLOCK, 0 WARN
- Tag git `pre-fix-baseline-2026-05-09` disponibil pentru rollback
- 17 commit-uri atomice (bisect-friendly)

### Migration / upgrade notes

- Update path: `node scripts/update.js` (cere licenta JWT — fallback la
  first-run-bind daca lipseste).
- `.env.example` modificat: GEMINI_API_KEY, ANTHROPIC_API_KEY descrieri
  corectate; GITHUB_TOKEN/REPO comentate ("RESERVED for future"); adaugat
  ROBOS_CANDIDATES_DISABLED. Operatorii cu `.env` existente: ruleaza
  `node scripts/setup-env.js` pentru sync.
- Hooks loadEnv() — daca aveai toggle-uri ROBOS_* in `.env` care nu
  functionau, ACUM functioneaza. Verifica `.env` pentru valori ne-intentionate.
- ROBOS_DEV scos: daca foloseai pentru test envs, vezi
  `scripts/test-env/README.md` pentru flow-ul nou cu licenta reala.

---

## [2.0.0] - 2026-05-09

### Multi-client REAL + Loop Detector + Bearer auth coverage + per-client memory/notes/audit

Salt major de versiune (0.5.1 → 2.0.0): robOS trece de la "marketing scaffold" la "produs runtime cu enforcement complet". Multi-client devine real end-to-end, hook-ul nou PostToolUse detecteaza si sparge loop-uri, Bearer auth acopera toate mutations, schema DB primeste migration 005 pentru per-client notes filtering. Sarim peste 1.x intentional — versiunea actuala marcheaza maturizarea sistemului ca pachet livrabil cu nivelul real de robustete.

**Loop Detector (NOU — PostToolUse hook):**

Detecteaza cand modelul e blocat in loop (acelasi tool call identic repetat consecutiv) si injecteaza warning in context ca sa-l forteze sa schimbe abordarea. Inainte: model citea acelasi fisier de 50 de ori, user vedea token waste si frustrare. Acum: warning la al 3-lea apel identic, escalation la al 6-lea.

- **`scripts/lib/loop-detector.js`** nou (~210 linii) — lib pur cu API: `recordCall`, `hashCall`, `canonicalJson`, `summarizeCall`, `resetSession`. Hash determinist SHA256 din `tool_name + canonicalJson(tool_input)` (sort keys recursiv, max 50KB). State per sesiune in `data/session-state/{sid}-tools.json` cu atomic write `.tmp+rename`. Tier-1 warning la N apeluri, Tier-2 escalat la 2N. Reset automat cand un alt tool intervine.
- **`scripts/hook-post-tool.js`** nou (~70 linii) — hook handler. Citeste stdin Claude Code (`{session_id, tool_name, tool_input}`), apeleaza lib, output JSON cu `additionalContext` cand loop detectat. Niciodata blocheaza tool-ul, niciodata throw — erori → `data/hook-errors.ndjson`. Latenta ~10ms per tool call.
- **`.claude/settings.json`** — adaugat `PostToolUse` hook cu timeout 3s.
- **`.env.example`** — 3 env vars noi: `ROBOS_LOOP_DETECTOR_DISABLED` (toggle), `ROBOS_LOOP_DETECTOR_THRESHOLD` (default 3), `ROBOS_LOOP_DETECTOR_EXEMPT` (default `TodoWrite`, comma-separated tools care nu declanseaza warning).
- **`scripts/smoke-loop-detector.js`** nou (~240 linii) — 16 scenarii, 69 assertii: hash determinism cu key reorder, single/2/3 calls, reset on different call, alternating A/B, escalation tier-2, exempt tool, disabled env, custom threshold/exempt, corrupt state recovery, invalid session_id (path traversal), live hook process via stdin.

**Multi-client real (skill + lib + CLI + hook + dashboard):**

Inainte: `add-client.sh` crea folder-uri dar niciun skill/hook/dashboard nu comuta workspace-ul activ. Marketing fara produs. Acum: comutare reala persistenta cross-sesiune, smoke 45/45.

- **`scripts/lib/client-context.js`** nou — single source of truth pentru clientul activ. State in `data/active-client.json`, atomic write, self-healing pe folder lipsa, API: `getActiveClient`, `setActiveClient`, `clearActiveClient`, `listClients`, `resolveContextPath`, `getMemoryDir`/`getBrandDir`/`getProjectsDir`.
- **`scripts/active-client.js`** nou — CLI Romanian: `status` / `list` / `set <slug>` / `clear` / `json`.
- **`skills/sys-switch-client/`** nou — skill cu 22 trigger-uri RO+EN ("schimba clientul", "trec pe clientul X", "use client X", "client root", "ce client am activ", "list clients").
- **`scripts/hook-user-prompt.js`** — la primul prompt: banner `Workspace activ: client "X"` cu lista path-urilor redirectate. La FIECARE prompt cand client activ: directiva `[ACTIVE CLIENT: X]` injectata in context (~40 tokens, supravietuieste compactarii). Memory dir resolvat per active client. Surface zilnic `data/startup-audit.log` cand verdict `ABANDONED_FOUND`.
- **`scripts/checkpoint-reminder.js`** — memory dir resolvat per active client; mesaj de block (al 3-lea reminder) referentiaza path-ul corect (`clients/{slug}/context/memory/...` sau root).
- **`centre/api/clients.js`** — refacut sa wrap-uiasca `client-context.js` (era duplicat, citea `_metadata.json` care nu exista). `GET /api/clients` returneaza `active`/`has_brand`/`has_memory`/`name` din USER.md. Endpoint-uri noi: `GET /api/clients/active`, `PUT /api/clients/active`.
- **`centre/src/islands/ClientSwitcher.svelte`** — dropdown DEAD UI inlocuit cu real switch via `apiFetch` PUT, busy state, error handling, fetch active state, dispatch event `client-change` cu detaliu real.
- **`scripts/smoke-multiclient.js`** nou — 45 assertii end-to-end (validation slug, set/clear, path routing, CLI integration, self-healing).

**Per-client scope expandat la cron + audit + notes:**

- **`scripts/audit-startup.js`** — loop peste root + toate `clients/*/context/memory/`. Per-scope tracking, `entry.scopes[]` nou, `flatAbandoned` cu tag scope. Cron de 8 dimineata raporteaza acum corect sesiunile abandonate per fiecare client.
- **`centre/migrations/005_notes_client.sql`** nou — coloana `notes.client_slug` + index. Backwards-compatible (existing notes raman NULL = root).
- **`scripts/notes-index.js`** — `deriveClientSlug()` din path + walk peste `clients/*` pentru notes/memory/audits/learnings per fiecare client.
- **`scripts/notes-search.js`** — defaults la activeClient, filter explicit cu `--client SLUG` / `--root` / `--all-clients`. Fara mai mult context bleed intre clienti.
- **`scripts/parallel-budget.js`** — `logTelemetry({client})` citeste `data/active-client.json` automat. CLI accepta `[client]` arg. Analytics `/api/analytics/costs` returneaza acum cost real per client si pentru sesiunile live (nu doar cron).
- **`centre/api/system.js`** — memory APIs (`listMemory`, `getMemoryFile`, `saveMemoryFile`) si `getLearnings` route per active client via `getMemoryDir()` + `resolveContextPath()`. Dashboard tab Memorie/Learnings urmeaza activeClient.

**Bearer auth coverage Phase B (CSRF mitigation):**

- **`centre/server.js`** — `AUTH_REQUIRED` extins cu 8 patterns noi. Pana acum doar settings + skill/run erau gated; tasks/cron/memory mutations erau deschise la CSRF (browser malicios pe localhost putea sterge task-uri, schimba cron jobs, scrie memorie).
- Acum gated: `POST/PATCH/DELETE /api/tasks`, `POST/PATCH/DELETE /api/cron`, `POST /api/cron/.../run`, `PUT /api/system/memory/:date`, `PUT /api/clients/active`.
- Read-only informational endpoints (memory list, audit-history, activity, connections-health, skills list, dashboard summary) raman deschise.
- **3 islands convertite la `apiFetch`**: `TaskPanel.svelte`, `CronDashboard.svelte`, `SystemPanel.svelte`. Bearer token automat din `centre/src/lib/api-client.ts`.

**Doc fixes (referinte rupte + inducere in eroare):**

- **`README.md`** — versiune 0.4.0 → 2.0.0; status alpha → stable; sectiune Bearer auth rescrisa cu starea reala (nu mai zice "in roadmap"); referinte la fisiere inexistente sterse (`tests/cron-e2e.sh`, `scripts/update.sh`); dev update simplificat la `git pull && node scripts/setup.js` (idempotent).
- **`AGENTS.md`** — sectiune noua "Multi-client routing" cu API, scope, enforcement, self-healing, limite cunoscute. Tabela hooks include si PostToolUse pentru loop detector.
- **`CLAUDE.md`** — "Active Client Awareness" sub First Interaction.
- **`docs/claude-vs-robos.md`** — claim multi-client rescris pe realitate (cu comenzi concrete in tabel + sectiune "Multi-client — comenzi naturale").

**Operational hygiene:**

- **`licensing/wrangler.toml`** — `CURRENT_ROBOS_VERSION` 0.5.0 → 2.0.0. `wrangler deploy` necesar la livrare.
- **`.gitattributes`** — `docs/intel-second-brain-category.md export-ignore` (strategic intel intern, NU pleaca la studenti).
- **`.mcp.json`** — placeholder URL eliminat (era `api.example.com/mcp`), `{}` clean. Studentul adauga MCP-uri din UI Settings.
- **`cron/defaults/activity-redact.json`** nou — cron weekly duminica 04:00 ruleaza `redact-activity-log.js` cu pattern-urile curente. Idempotent, deterministic, zero token.
- **`centre/api/system.js`** `getConnectionHealth` — Firecrawl ping schimbat la `GET /v1/team/credit-usage` (zero credit cost). Inainte: POST `/v1/scrape` consuma 1 credit per dashboard refresh.

**Smoke validation finala:**
- `node scripts/smoke-loop-detector.js` → **69/69 PASS** (16 scenarii)
- `node scripts/smoke-multiclient.js` → **45/45 PASS**
- `node scripts/smoke-parallel.js` → structural validation OK
- `node scripts/audit-startup.js` → multi-scope OK, exit 1 cand abandoned, scope-uri logate corect
- `npx astro build` (centre) → 8 pagini, zero erori TypeScript / Svelte
- Live server: `PUT /api/clients/active` fara token → 401; cu token → 200
- Live server: `POST /api/tasks` fara token → 401 (CSRF protection real)
- Manual hook test: 3x Bash identice → JSON warning emis corect

**Migration path pentru existing installs (0.5.x → 2.0.0):**
- `node scripts/setup.js` aplica migration 005 automatic (incremental, idempotent)
- Notitele existente raman cu `client_slug=NULL` (root) — ruleaza `node scripts/notes-index.js --rebuild` daca vrei reindex explicit.
- Hook-urile noi (PostToolUse + multi-client) pornesc imediat la urmatoarea sesiune Claude Code (nu necesita restart manual).
- Comenzi noi pentru operator: `node scripts/active-client.js` (status), `bash scripts/add-client.sh <slug>` (creeaza client), apoi spune in Claude "trec pe clientul <slug>".
- Loop detector activ default; toggle cu `ROBOS_LOOP_DETECTOR_DISABLED=1` in `.env`.

**De ce 2.0.0 si nu 0.6.0 sau 1.0.0:** robOS pana acum a fost iterat in 0.x ca alpha/beta. Cu multi-client real + loop detector + Bearer coverage, sistemul atinge nivel de produs livrabil pentru operator-peer (target audience). Sarim peste 1.x intentional pentru a marca tranzitia clara — nu mai e prototip.

## [0.5.1] - 2026-05-07

Audit profund peste tot codul (30+ fisiere citite linie cu linie) a relevat ca multi-client era marketing, nu produs: scaffold-ul de creare exista (`add-client.sh`) dar runtime-ul nu il folosea — niciun skill, hook sau dashboard nu comuta workspace-ul activ. Aceasta versiune transforma multi-client intr-un mecanism real, end-to-end, cu enforcement la fiecare prompt + persistenta cross-sesiune + smoke test 45/45.

**Multi-client real (skill + lib + CLI + hook + dashboard):**

- **`scripts/lib/client-context.js`** nou — single source of truth pentru clientul activ. State in `data/active-client.json`, atomic write, self-healing pe folder lipsa, API: `getActiveClient`, `setActiveClient`, `clearActiveClient`, `listClients`, `resolveContextPath`, `getMemoryDir`/`getBrandDir`/`getProjectsDir`.
- **`scripts/active-client.js`** nou — CLI Romanian: `status` / `list` / `set <slug>` / `clear` / `json`.
- **`skills/sys-switch-client/`** nou — skill cu 22 trigger-uri RO+EN ("schimba clientul", "trec pe clientul X", "use client X", "client root", "ce client am activ", "list clients").
- **`scripts/hook-user-prompt.js`** — la primul prompt: banner `Workspace activ: client "X"` cu lista path-urilor redirectate. La FIECARE prompt cand client activ: directiva `[ACTIVE CLIENT: X]` injectata in context (~40 tokens, supravietuieste compactarii). Memory dir resolvat per active client. Surface zilnic `data/startup-audit.log` cand verdict `ABANDONED_FOUND`.
- **`scripts/checkpoint-reminder.js`** — memory dir resolvat per active client; mesaj de block (al 3-lea reminder) referentiaza path-ul corect (`clients/{slug}/context/memory/...` sau root).
- **`centre/api/clients.js`** — refacut sa wrap-uiasca `client-context.js` (era duplicat, citea `_metadata.json` care nu exista). `GET /api/clients` returneaza `active`/`has_brand`/`has_memory`/`name` din USER.md. Endpoint-uri noi: `GET /api/clients/active`, `PUT /api/clients/active`.
- **`centre/src/islands/ClientSwitcher.svelte`** — dropdown DEAD UI inlocuit cu real switch via `apiFetch` PUT, busy state, error handling, fetch active state, dispatch event `client-change` cu detaliu real.
- **`scripts/smoke-multiclient.js`** nou — 45 assertii end-to-end (validation slug, set/clear, path routing, CLI integration, self-healing).

**Per-client scope expandat la cron + audit + notes:**

- **`scripts/audit-startup.js`** — loop peste root + toate `clients/*/context/memory/`. Per-scope tracking, `entry.scopes[]` nou, `flatAbandoned` cu tag scope. Cron de 8 dimineata raporteaza acum corect sesiunile abandonate per fiecare client.
- **`centre/migrations/005_notes_client.sql`** nou — coloana `notes.client_slug` + index. Backwards-compatible (existing notes raman NULL = root).
- **`scripts/notes-index.js`** — `deriveClientSlug()` din path + walk peste `clients/*` pentru notes/memory/audits/learnings per fiecare client.
- **`scripts/notes-search.js`** — defaults la activeClient, filter explicit cu `--client SLUG` / `--root` / `--all-clients`. Fara mai mult context bleed intre clienti.
- **`scripts/parallel-budget.js`** — `logTelemetry({client})` citeste `data/active-client.json` automat. CLI accepta `[client]` arg. Analytics `/api/analytics/costs` returneaza acum cost real per client si pentru sesiunile live (nu doar cron).
- **`centre/api/system.js`** — memory APIs (`listMemory`, `getMemoryFile`, `saveMemoryFile`) si `getLearnings` route per active client via `getMemoryDir()` + `resolveContextPath()`. Dashboard tab Memorie/Learnings urmeaza activeClient.

**Bearer auth coverage Phase B (CSRF mitigation):**

- **`centre/server.js`** — `AUTH_REQUIRED` extins cu 8 patterns noi. Pana acum doar settings + skill/run erau gated; tasks/cron/memory mutations erau deschise la CSRF (browser malicios pe localhost putea sterge task-uri, schimba cron jobs, scrie memorie).
- Acum gated: `POST/PATCH/DELETE /api/tasks`, `POST/PATCH/DELETE /api/cron`, `POST /api/cron/.../run`, `PUT /api/system/memory/:date`, `PUT /api/clients/active`.
- Read-only informational endpoints (memory list, audit-history, activity, connections-health, skills list, dashboard summary) raman deschise.
- **3 islands convertite la `apiFetch`**: `TaskPanel.svelte`, `CronDashboard.svelte`, `SystemPanel.svelte`. Bearer token automat din `centre/src/lib/api-client.ts`.

**Doc fixes (referinte rupte + inducere in eroare):**

- **`README.md`** — versiune 0.4.0 → 0.6.0; status alpha → beta; sectiune Bearer auth rescrisa cu starea reala (nu mai zice "in roadmap"); referinte la fisiere inexistente sterse (`tests/cron-e2e.sh`, `scripts/update.sh`); dev update simplificat la `git pull && node scripts/setup.js` (idempotent).
- **`AGENTS.md`** — sectiune noua "Multi-client routing" cu API, scope, enforcement, self-healing, limite cunoscute.
- **`CLAUDE.md`** — "Active Client Awareness" sub First Interaction.
- **`docs/claude-vs-robos.md`** — claim multi-client rescris pe realitate (cu comenzi concrete in tabel + sectiune "Multi-client — comenzi naturale").

**Operational hygiene:**

- **`licensing/wrangler.toml`** — `CURRENT_ROBOS_VERSION` 0.5.0 → 0.6.0. `wrangler deploy` necesar la livrare.
- **`.gitattributes`** — `docs/intel-second-brain-category.md export-ignore` (strategic intel intern, NU pleaca la studenti).
- **`.mcp.json`** — placeholder URL eliminat (era `api.example.com/mcp`), `{}` clean. Studentul adauga MCP-uri din UI Settings.
- **`cron/defaults/activity-redact.json`** nou — cron weekly duminica 04:00 ruleaza `redact-activity-log.js` cu pattern-urile curente. Idempotent, deterministic, zero token.
- **`centre/api/system.js`** `getConnectionHealth` — Firecrawl ping schimbat la `GET /v1/team/credit-usage` (zero credit cost). Inainte: POST `/v1/scrape` consuma 1 credit per dashboard refresh.

**Smoke validation finala:**
- `node scripts/smoke-multiclient.js` → 45/45 PASS (validation slug, set/clear, path routing, CLI, self-healing)
- `node scripts/smoke-parallel.js` → structural validation OK
- `node scripts/audit-startup.js` → multi-scope OK, exit 1 cand abandoned, scope-uri logate corect
- `npx astro build` (centre) → 8 pagini, zero erori TypeScript / Svelte
- Live server: `PUT /api/clients/active` fara token → 401; cu token → 200
- Live server: `POST /api/tasks` fara token → 401 (CSRF protection real)

**Migration path pentru existing installs:**
- `node scripts/setup.js` aplica migration 005 automatic (incremental, idempotent)
- Notitele existente raman cu `client_slug=NULL` (root) — ruleaza `node scripts/notes-index.js --rebuild` daca vrei reindex explicit.
- Hook-urile noi pornesc imediat la urmatoarea sesiune Claude Code (nu necesita restart manual).
- Comenzi noi pentru operator: `node scripts/active-client.js` (status), `bash scripts/add-client.sh <slug>` (creeaza client), apoi spune in Claude "trec pe clientul <slug>".

## [0.5.1] - 2026-05-07

### Documentation pass + cleanup hygiene (no behavior change)

Audit complet al pachetului student + actualizare docs cu realitatea verificata la cod.

**Cleanup local (working tree, nu afecteaza tarball anterior)**:
- Removed: 8 fisiere build artifacts vechi (v0.4.0, v0.4.1 + intermediate v0.5.0 .tar/.noterm.tar) — ~6 MB liberat
- Removed: `data/test-server-3099.log` (cruft din testare port 3099)
- Extended `.gitignore`: `licensing/build/`, `data/.update-staging/`, `data/.update-backup/`, `robos-tests/`, `docs/init/`

**LP material rescris** (`docs/claude-vs-robos.md` v2.0):
- Skill count corectat: 17 → **22** (verificat in `skills/_index.json` count=22)
- Trigger count: **206** RO+EN (confirmat la generated_at runtime)
- Versionare: **v0.3.x → v0.5.x**
- Sectiune NOUA "Ce NOU adauga v0.5": launcher unic, update.js, verification discipline, OS notifications
- Adaugare row dashboard cu Astro+Svelte + cold start 300ms
- Adaugare row concurrency framework cu numere reale (8 skills paralelizate, 3-5x wall-clock)
- Toate claims verificate la cod inainte de afirmare

**Student docs updated** (consistent cu launcher v0.5):
- `docs/INSTALL.md`: v0.4.1 → v0.5.0; Pas 3 'Setup' → 'Lansezi robOS' (un singur pas); Pas 6 dashboard NU mai e optional; update flow rescris cu `update.js` in-place
- `docs/cheat-sheet.md`: rewrite complet — toate 22 skills cu trigger primary, comenzi noi launcher/update, sectiune cron actualizata cu leader lock + [SILENT]
- `docs/operator-handbook.md`: 17 → 22 skills; sectiuni noi sys-* (second brain) + mode-* (cognitive switches); `bash scripts/start.sh` → `bash scripts/robos`

**Admin docs NEW** (`docs/admin-handbook.md`):
- 10 sectiuni: infrastructura, emitere licente, suport probleme comune, deploy versiune noua, refund/revoke, monitoring (event log, anomalii, wrangler tail), backup + DR (D1 export, JWT key rotation), toolkit local, limitari, resurse
- Marcat `export-ignore` in `.gitattributes` → NU pleaca la studenti
- Pereche cu `operator-handbook.md` (pentru student)

**Audit student package** (tarball v0.5.0 final):
- 242 fisiere, 4 docs shipped (INSTALL, cheat-sheet, claude-vs-robos, operator-handbook)
- 0 fisiere din scripts/test-env (correct, export-ignored)
- 0 fisiere admin-handbook (correct, export-ignored)
- 0 fisiere licensing/ (correct, export-ignored)
- 0 fisiere paperclip/ (correct, export-ignored)
- 0 fisiere tests/ (correct, export-ignored)
- Brand templates HTML-comments-only (no PII)

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
