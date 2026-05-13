# Ce e nou in robOS

Schimbarile importante explicate pentru tine ca operator, nu ca developer.
Pentru detalii tehnice complete vezi [CHANGELOG.md](CHANGELOG.md) (developer-facing).

---

## v3.1.4 — Fix: hook Stop nu mai arunca eroare la final de turn

### Ce castigi

**Sesiunile se inchid curat fara stack trace vizibil.** v3.1.3 a deblocat onboarding-ul complet. La final, hook-ul Stop (`note-candidates.js`) afisa 30 de linii de eroare `Cannot find package 'better-sqlite3'` daca studentul deschisese `claude` inainte sa ruleze `node scripts/robos.js` (deci setup nu instalase dependentele centre-ului). Functionalitatea de auto-capture a deciziilor era oricum degradata, dar erorea aparea vizibil dupa fiecare turn.

Fix: hook-ul Stop foloseste acum dynamic import + try/catch (acelasi pattern ca `hook-user-prompt.js`). Daca DB lipseste, capture-ul se opreste tacit, hook-ul iese curat exit 0, log-ul ajunge in `data/hook-errors.ndjson` pentru diagnostic.

### Cum te afecteaza

- **Student care a sarit Pasul 4 (lansare dashboard)** → hook-urile nu mai cad cu stack trace. Capture-ul de note se reactiveaza singur dupa primul `node scripts/robos.js` (care ruleaza setup + npm install).
- **Operator existent** → niciun impact, deps deja instalate.

### Sub capota

- `scripts/note-candidates.js` — static import inlocuit cu `await import('../centre/lib/db.js')` in main().
- `scripts/smoke-hook-missing-deps.js` (nou, 10 assertii) — lint + functional simulator: redenumeste `better-sqlite3` temporar, ruleaza toate cele 5 hook-uri, asteapta exit 0. Auto-discovered de smoke-all.

---

## v3.1.3 — Fix: onboard me nu mai esueaza la Write peste stub-uri

### Ce castigi

**Onboarding-ul trece complet pana la final.** v3.1.2 a deblocat integrity gate. Imediat dupa, primul student a lovit al treilea bug in lant: 3 din 4 Write-uri din sys-onboard esuau cu "Error writing file" pentru ca Claude Code refuza sa suprascrie fisier existent fara sa-l fi citit intai. Fisierele `brand/samples.md`, `context/priorities.md`, `connections.md` exista ca stub-uri in tarball.

Fix: skill-ul sys-onboard citeste fiecare fisier inainte de a-l rescrie (acelasi pattern pe care brand-voice / brand-audience / brand-positioning il foloseau deja). Onboarding-ul completeaza voce + audience + positioning + connections fara intrerupere.

### Cum te afecteaza

- **Student nou** → onboarding-ul scrie toate cele 4 fisiere (samples + priorities + connections + memory) fara erori.
- **Student care a tras v3.1.1 sau v3.1.2 si a esuat la Write** → fie redownload v3.1.3, fie sterge manual cele 3 fisiere si re-ruleaza `onboard me`: `Remove-Item brand\samples.md, context\priorities.md, connections.md` apoi `claude` → `onboard me`.

### Sub capota

- `skills/sys-onboard/SKILL.md` Step 2 — adaugat `Read X first` inainte de Write la samples, priorities, connections.
- `context/USER.md` Write NU avea bug (file lipseste din tarball, e nou la fiecare instalare).

---

## v3.1.2 — Fix: integrity check nu mai cade pe instalari fresh

### Ce castigi

**Instalarea trece de prima validare de integritate.** v3.1.1 a reparat hook-urile dar a expus un al doilea bug ascuns: pe Windows, fisierele in working tree au CRLF (line ending Windows), dar tarball-ul exportat de git e LF (Unix). Hash-urile din manifest erau calculate pe CRLF si nu se potriveau cu LF din tarball → `Integritate robOS compromisa (centre/server.js)` la primul `onboard me`.

Fix: hashing normalizeaza CRLF → LF inainte de hash. Identic pe Windows, Mac, Linux. Toate viitoarele rebuild-uri vor produce hash-uri stabile cross-platform.

### Cum te afecteaza

- **Student nou** → instalarea v3.1.2 trece direct prin gate-ul de integritate. Hook-uri OK + license OK + integritate OK.
- **Student care a tras v3.1.1** → redownload din ghidul de instalare (acelasi URL, primesc tarball-ul nou). v3.1.1 R2 object exista inca dar nu mai e referit.
- **Operator existent (admin)** → niciun impact. Hash-urile pe disk se recalculeaza automat la prima rulare.

### Sub capota

- `scripts/lib/license-validator.js` + `scripts/rehash-validators.js` — `hashContent` face `content.replace(/\r\n/g, '\n')` ca prima operatie.
- `scripts/smoke-license-integrity.js` test #10 — regression guard: dupa ce rescriem `centre/server.js` ca LF, integrity trebuie sa treaca.

---

## v3.1.1 — Fix: hook-urile robOS nu mai cad pe Windows fara git-bash

### Ce castigi

**Instalare fresh pe Windows merge curat.** Pana acum, daca aveai doar PowerShell (fara Git Bash in PATH), toate cele 5 hook-uri robOS esuau cu "Cannot find module 'C:\\scripts\\hook-X.js'" la primul `onboard me`. Sesiunea nu se inchidea corect, memoria zilei nu se scria, skill router-ul nu rula. Bug observat la 2 studenti pe 2 laptopuri.

Fix: hook commands din `.claude/settings.json` folosesc path-uri relative, nu mai depind de o variabila de mediu specific bash. Functioneaza pe orice shell: bash, PowerShell, cmd.

### Cum te afecteaza

- **Student nou** → instalarea functioneaza din prima, fara sa cer Git Bash.
- **Operator existent cu git-bash** → niciun impact, hooks-urile mergeau deja.
- **Operator existent fara git-bash care vede erori** → `git pull` (sau ia tarball-ul nou) si reporneste Claude Code.

### Sub capota

- Nou smoke `smoke-hook-shell-resolve.js` — invoca fiecare hook prin AMBELE cmd.exe SI powershell.exe pe Windows, ca regresia sa nu se mai intample.
- Total smoke suites: 37/37 verzi (era 36).

---

## v3.1.0 — Skill ecosystem expanded (51 skill-uri, 5 tier-uri)

### Ce castigi

**De la 23 la 51 skill-uri instalate.** Migrare completa a portofoliului din ecosystem extern. Acces la skill-uri specializate pentru:
- **Content video** — `tool-youtube`, `tool-transcription`, `00-youtube-to-ebook`
- **Video editing** — `vid-clip-extractor`, `vid-clip-selection`, `vid-ffmpeg-edit`
- **Vizualizare** — `viz-image-gen`, `viz-excalidraw-diagram`, `viz-frontend-slides`, `viz-hyperframes`
- **Social publishing** — `tool-zernio-social`, `mkt-short-form-posting`, `mkt-youtube-content-package`
- **PDF & screenshots** — `tool-pdf-generator`, `tool-web-screenshot`, `tool-screenshot-annotator`
- **Orchestratori** — `00-slides`, `00-social-content`, `00-longform-to-shortform`

**5 capability tiers — alegi ce instalezi.** La onboarding (sau ulterior) alegi:
- **Core** (default) — 26 skill-uri esentiale, no extra deps
- **Content Creator** (+15) — articole, transcripts, screenshots, PDF-uri (cere Python)
- **Video Producer** (+5) — shorts pipeline, motion graphics (cere ffmpeg + Node 22+)
- **Social Publisher** (+6) — publish pe LinkedIn/IG/TikTok/YouTube (cere Zernio)
- **Researcher** (+1) — engagement metrics reale (cere API keys)

Setup: `bash scripts/setup-python.sh --tier=content-creator` (sau `.cmd` pe Windows).

**Skill-uri vechi merged cu features noi:**
- `brand-voice` v2 — Playbook mode, Firecrawl auto-scrape, Voice Test mandatory
- `brand-audience` v2 — Update mode + research validation
- `brand-positioning` v2 — Schwartz 5 stages + 8 angle frameworks
- `content-repurpose` v3 — 7 atoms, algorithm check, humanizer gate, calendar
- `research-trending` v3 — Python script cu OpenAI Reddit + xAI X engagement
- `tool-humanizer` v2 — 50+ patterns, scoring 0-10

**4 categorii noi**: `00-` (orchestratori), `viz-`, `vid-`, `meta-`.

**569 trigger-uri totale, zero colizii** in strict mode.

### Stats v3.1
- 51 skill-uri instalate
- 10 categorii valide
- 569 trigger-uri
- 9 chei API tracked
- 5 tier-uri opt-in

### Migrare

Nimic de facut pentru clean install. Daca ai instalat anterior `.claude/skills/` extern, folder-ul e safe sa-l stergi — skill-urile sunt in `skills/`.

---

## v2.1.0 — Stabilitate, securitate, Windows parity

### Ce castigi

**Toggle-urile din `.env` chiar functioneaza acum.**
Inainte, daca puneai `ROBOS_LOOP_DETECTOR_DISABLED=1` in `.env`, nu se intampla
nimic — hook-urile nu citeau `.env`. Acum citesc. Daca vrei sa dezactivezi loop
detector / activity capture / checkpoint reminder, schimbi `.env` si gata.

**Multi-client cu adevarat.**
Inainte, daca aveai un client activ si lasai sesiunea sa expire 2h, robOS o
considera fals "abandonata" si afisa avertismente la urmatoarea sesiune. Acum
detector-ul vede memoria pe TOATE scope-urile (root + fiecare client), deci
clasifica corect.

**Pachetul ruleaza pe Windows fara WSL.**
Daca esti pe Windows si nu ai bash/Git Bash, scripturile zilnice de management
(client nou, skill nou, status crons) functioneaza acum. Foloseste:
- `scripts\add-client.cmd acme-corp` (sau `.ps1` din PowerShell)
- `scripts\list-skills.cmd`
- `scripts\add-skill.cmd <nume>`
- `scripts\status-crons.cmd`

Pe Mac/Linux comenzile vechi (`bash scripts/...sh`) functioneaza identic.
Universal: `node scripts/add-client.js acme-corp` merge oriunde ai Node.

**Mesaje de eroare aliniate la realitate.**
Inainte, instalatorii Windows ziceau "Node >= 20" dar setup-ul real esua pe Node
20 cu o eroare obscura din Astro. Acum toate scripturile zic clar
**Node >= 22.12.0** si te trimit la `.msi` direct daca n-ai winget.

**Securitate intarita la dashboard.**
- Dashboard-ul nu mai accepta cereri fara header `Origin` (un proces local
  malicios nu mai poate fura token-ul).
- `.env.bak` e creat cu permisiuni explicite restrictive (intent documentat
  pe POSIX, ACL pe Windows).
- Cron jobs ruleaza fara shell — metacaracterele shell (`&&`, `|`) nu mai
  pot fi interpretate.

**Mai putine surprize la scara.**
- `data/session-state/` se curata automat (>30 zile).
- `data/session-recovery/` se curata automat (>7 zile).
- Atomic writes au retry pe Windows EBUSY (fisier blocat de editor) — nu
  mai pierzi scrieri silentios.

**Catalog-ul de skill-uri e onest.**
Inainte, 6 skill-uri instalate lipseau din catalog. Acum e 1:1 pentru toate
23 instalate.

### Ce nu mai functioneaza (daca depindeai)

**`ROBOS_DEV=1` a fost scos.**
Daca foloseai escape-ul ca sa skip-uiesti license check in test envs, acum
trebuie sa generezi o licenta proaspata via dashboard admin si s-o copiezi
in `.license-stamp` din test folder INAINTE de setup. Vezi
`scripts/test-env/README.md`.

**Folder `docs/init` a fost mutat.**
Acel folder continea continut de la un produs diferit ("Agentic OS" — nimic
de-a face cu robOS). E in `.archive/legacy-vendor-docs/` acum, gitignored
(local-only). Niciun student nu primea acel continut oricum (era gitignored).

### Ce ramane neschimbat

- API-ul skills (trigger-uri, frontmatter, output paths) e identic.
- Comenzile zilnice principale (`onboard me`, `audit`, `noteaza asta`,
  `gata`) merg la fel.
- Memoria zilnica si learnings.md sunt protejate la update.
- Brand files (`brand/*.md`) sunt protejate la update.

### Cum primesti acest update

Daca rulezi v2.0.0:
```bash
node scripts/update.js
```

Update-ul nu atinge `.env`, `brand/`, `clients/`, `context/notes/`,
`context/USER.md`, `context/learnings.md` sau memoria zilnica.

---

## Versiuni anterioare

### v2.0.0 — Loop Detector + jump versiune

A introdus Loop Detector ca hook PostToolUse (te scapa de cazurile cand model-ul
incearca sa citeasca acelasi fisier de 50 ori in loop). Salt de la 0.6 la 2.0
ca semnal ca produsul e stable, nu beta.

Vezi [CHANGELOG.md](CHANGELOG.md) pentru detalii tehnice.

### v0.6.0 — Multi-client real

A activat workspace-uri multi-client izolate. Fiecare client are brand, context,
memory, projects separate. Comuti intre clienti cu o fraza ("trec pe clientul
acme-corp").

### v0.5.x — Bearer auth + per-client memory

Securitate dashboard cu Bearer token + Origin check. Memorie zilnica per client.

---

**Pentru schimbari complete cu fisiere si linii de cod, vezi
[CHANGELOG.md](CHANGELOG.md).**
