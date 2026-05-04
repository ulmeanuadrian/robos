# Changelog

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
