# robOS Invariants

> **Scop:** lista numerotata de proprietati care **trebuie** sa fie adevarate despre robOS, fiecare cu metoda de verificare.
>
> **De ce exista:** auditele anterioare au gasit buguri "noi" in locuri "fixate" pentru ca fix-urile erau de **instanta**, nu de **clasa**. Acest fisier convertete "audit comprehensiv" dintr-o cautare ad-hoc intr-un check determinist: din N invariante, M trec.
>
> **Cum se foloseste:**
> - Cand declari "fixed", verifica invariantele relevante GLOBAL, nu doar instanta vazuta.
> - Cand un audit gaseste un bug, intreaba: "ce invariant ar fi prins asta?" → daca niciun, adauga unul.
> - Cand cresti o invarianta de la `?` la `✓`, scrie testul/lint-ul asociat.
>
> **Status legend:**
> - `✓` ENFORCED — check automat ruleaza in `smoke-all` sau lint
> - `⚠` PARTIAL — check exista dar are gap-uri documentate
> - `?` CLAIMED — afirmat, fara check automat (gap = trebuie adaugat)
> - `✗` KNOWN VIOLATION — actual fail; trebuie reparat
>
> **Ultima trecere:** 2026-05-10 (verificat manual + smoke-all 33/33 green, 12.9s --quick / 35/35 with SLOW).
>
> **Wave 1 (2026-05-10):** 4 smokes/lints noi (`smoke-version-sync`, `lint-security` + `smoke-security`, `smoke-setup-idempotency`, `smoke-tarball-clean`). 3 violari fixate: `centre/package.json` Node engine, `admin.js` token compare cu constant-time, `launcher-state.json` version drift. 8 invariante `?`/`⚠` → `✓`. Smoke-all 11/11 → 15/15.
>
> **Wave 1 closure (2026-05-10):** `lint-portability` SCAN_DIRS dedup; memory entry `reference_node_min_version.md` corrected (path `docs/INSTALL.md`).
>
> **Wave 2 (2026-05-10):** 4 smokes noi (`smoke-license-perf`, `smoke-fresh-install`, `smoke-update-preserves-user-files`, `smoke-cron-log-rotation`). Refactor: `scripts/lib/protected-paths.js` (single source pentru update.js + smoke). Fix SCA-5: `session-timeout-detector` cleanup wired la `cron/logs/`. `update.js` adaugat main() guard pentru import safety. 6 invariante `?`/`⚠` → `✓`. Smoke-all 15/15 → 18/18.
>
> **Wave 3 (2026-05-10):** 5 smokes noi (`smoke-hook-error-sink-coverage`, `smoke-hooks-no-network`, `smoke-wrapper-completeness`, `smoke-lint-security-rules`, `smoke-claims-coverage`). Refactor `lint-security` sa exporte `lintContent` pentru fixture testing. Refactor `lint-claims` cu `RUNTIME_FILES`/`RUNTIME_PREFIXES` allowlist + tighter `looksLikePath` (extension SAU trailing `/` cerut). Doc fixes: README.md `X` → `{name}` placeholder, WHATS-NEW.md `docs/init/` → `docs/init` (drop trailing slash). 5 invariante `?` → `✓`. Smoke-all 18/18 → 23/23.

---

## Categorii

1. [DOC — Claim Integrity](#doc--claim-integrity)
2. [CP — Cross-Platform (Win + macOS)](#cp--cross-platform-win--macos)
3. [UX — Student Onboarding & DX](#ux--student-onboarding--dx)
4. [SCA — Scalability](#sca--scalability)
5. [LIC — License System](#lic--license-system)
6. [SEC — Security](#sec--security)
7. [DAT — Data Safety, Atomicity, Idempotency](#dat--data-safety-atomicity-idempotency)
8. [PRF — Performance Budgets](#prf--performance-budgets)
9. [OBS — Observability](#obs--observability)
10. [PRV — Privacy (Local-First)](#prv--privacy-local-first)
11. [LCY — Compatibility Lifecycle](#lcy--compatibility-lifecycle)
12. [DST — Distribution Hygiene](#dst--distribution-hygiene)

---

## DOC — Claim Integrity

> Tot ce afirmam ca exista in docs / brand / LP / copy → exista in cod sau pe disk.

### DOC-1 — Path-uri citate in markdown exista
- **Statement:** orice `path/to/file.ext` mentionat in `AGENTS.md`, `CLAUDE.md`, `README.md`, `WHATS-NEW.md`, `docs/INSTALL.md` trebuie sa existe pe disk SAU sa fie un path runtime cunoscut (`data/hook-errors.ndjson`, `projects/*`, `clients/*`) SAU placeholder explicit (`{slug}`, `YYYY-MM-DD`).
- **Why:** lansari publice (LP, blog) repeta path-uri; un path inventat = pierderea increderii.
- **Verify:** `node scripts/smoke-claims-coverage.js`. Sub-tool: `node scripts/lint-claims.js <files>` cu `RUNTIME_FILES` + `RUNTIME_PREFIXES` allowlist + `looksLikePath` care cere extension SAU trailing `/` (filtreaza prose false-positives ca `brand/context`).
- **Status:** `✓` ENFORCED. Wave 3 (2026-05-10) a redus de la 8 false positives + 2 real bugs ascunse → 0/0. Real bugs gasite: `README.md:482 X` → `{name}`, `WHATS-NEW.md:65 docs/init/` → `docs/init`.

### DOC-2 — Memoria nu inventeaza fisiere
- **Statement:** entry-uri in `memory/MEMORY.md` care numesc fisiere specifice trebuie sa fie verificabile la momentul recall-ului.
- **Why:** memoria are TTL implicit — un fisier mentionat acum 2 luni poate fi sters. Recall fara verificare = halucinatie cu cover legitim.
- **Verify:** la recall, daca memoria numeste un path, fa `Read` inainte sa-l citezi userului. (Aceasta regula traieste in `~/.claude/CLAUDE.md` "Before recommending from memory".)
- **Status:** `?` CLAIMED — disciplina umana, niciun check.
- **Known:** initial corecte 2026-05-10: memory entry `reference_node_min_version.md` cita `INSTALL.md` la root, dar fisierul exista la `docs/INSTALL.md`. Memoria nu era inventata, doar path-ul gresit. Lectie: cand citez un path din memorie, verific cu `Glob` inainte sa afirm.

### DOC-3 — Catalog skill-uri nu mentioneaza skill-uri inexistente
- **Statement:** fiecare entry in `skills/_catalog/catalog.json` cu `status != "planned"` trebuie sa aiba SAU `skills/_catalog/{name}/SKILL.md` (sursa pentru add-skill) SAU `skills/{name}/SKILL.md` (instalat). Altfel `bash scripts/add-skill.sh <name>` esueaza cu "not found in catalog".
- **Why:** "exista un skill pentru asta" trebuie sa duca la un skill care chiar pleaca.
- **Verify:** `node scripts/smoke-catalog-coverage.js` — 4 assertii: live catalog 0 orphans + injected fixture (orphan + planned) verifica rebuild-index WARN signal.
- **Status:** `✓` ENFORCED. Wave 4 (2026-05-10) a adaugat `detectCatalogOrphans()` in rebuild-index.js care printeaza `[WARN]` per orphan (NU fail — orphans sunt soft signal, operator decide).

### DOC-4 — VERSION = wrangler CURRENT_ROBOS_VERSION = launcher last_robos_version
- **Statement:** continutul `VERSION` (root) = `[vars] CURRENT_ROBOS_VERSION` din `licensing/wrangler.toml` = `README.md "Versiune actuala:"` = `data/launcher-state.json:last_robos_version` dupa setup.
- **Why:** patru surse de adevar pentru "ce versiune robOS rulam"; daca diverg, license server respinge updates valide sau accepta build-uri vechi.
- **Verify:** `node scripts/smoke-version-sync.js` — sectiunea "robOS version".
- **Status:** `✓` ENFORCED. Detectat drift `launcher-state.json:0.5.0` vs `VERSION:2.0.0` la 2026-05-10, fixat.

---

## CP — Cross-Platform (Win + macOS)

> Tot ce ruleaza pe Win trebuie sa ruleze identic pe macOS si invers.

### CP-1 — `process.env.HOME` / `USERPROFILE` interzis
- **Statement:** niciun script JS nu citeste `process.env.HOME` sau `process.env.USERPROFILE`. Tot home-dir access foloseste `os.homedir()`.
- **Why:** HOME = Mac/Linux only; USERPROFILE = Windows only. Oricare alegere sparge celalalt OS.
- **Verify:** `node scripts/lint-portability.js` — rule `env-home` si `env-userprofile`, severity BLOCK, exit 1.
- **Status:** `✓` ENFORCED — lint-ul a rulat 2026-05-10, 0 violations pe 100 fisiere.

### CP-2 — `child_process.exec` + `shell:true` interzis (sau exemptat explicit)
- **Statement:** `spawn` cu `shell:false` + argv array. `exec()` si `shell:true` doar cu `// lint-allow:exec` comment si motiv.
- **Why:** `cmd.exe` vs `sh` au escaping diferit; user input duce la command injection.
- **Verify:** `node scripts/lint-portability.js` — rule `shell-true` si `exec-call`, severity WARN.
- **Status:** `✓` ENFORCED — pasa cu 0 violations.

### CP-3 — Path-uri construite cu `path.join`, niciodata cu backslash literal
- **Statement:** path-uri multi-segment in cod folosesc `path.join()`. String literal `"a\\b"` interzis.
- **Why:** Windows Node accepta `/`, dar concat manual cu `\` da string-uri care fail pe macOS.
- **Verify:** `node scripts/lint-portability.js` — rules `backslash-path` + `forward-slash-multi-segment`, severity WARN cu exempt pentru regex/URL.
- **Status:** `✓` ENFORCED.

### CP-4 — Pereche wrapper `.cmd` + `.ps1` + `.sh` pentru fiecare CLI usor accesibil
- **Statement:** 10 wrapped commands (`add-skill`, `add-client`, `list-skills`, `remove-skill`, `start-crons`, `stop-crons`, `status-crons`, `setup`, `update`, `robos`) au toate 4 fisiere: `.js` (sursa) + `.cmd` + `.ps1` + `.sh` (sau bare-name pentru `robos`). Fiecare wrapper deleaga la sursa unica `.js`. **Exceptie cunoscuta:** `update.sh` foloseste git-pull flow (dev install) in loc sa delege la `update.js` (tarball flow); split intentional cross-platform.
- **Why:** Win Powershell, Win cmd, Mac/Linux bash — toate trebuie sa functioneze cu invocatie nativa.
- **Verify:** `node scripts/smoke-wrapper-completeness.js` — 69 assertii (existence + delegation per wrapper).
- **Status:** `✓` ENFORCED.

### CP-5 — Round-trip add-skill / add-client / remove functioneaza pe host curent
- **Statement:** add-skill X + remove-skill X = no-op (filesystem identical), cross-platform.
- **Why:** student deinstaleaza un skill, apoi reinstaleaza — nu vrea reziduu.
- **Verify:** `node scripts/smoke-cross-platform-scripts.js` (28 assertions, ruleaza pe host curent).
- **Status:** `✓` ENFORCED — pasa 2026-05-10.

### CP-6 — `.env` parser tolereaza CRLF si BOM
- **Statement:** `loadEnv()` parseaza `.env` indiferent de line-ending (LF/CRLF) si Byte Order Mark (Windows editors notepad).
- **Why:** student deschide `.env` in notepad → Windows poate adauga BOM si CRLF; parser fragil = toggle-uri silent ignored.
- **Verify:** `scripts/lib/env-loader.js:54` strip BOM, `:61` split pe `\r?\n`.
- **Status:** `✓` IMPLEMENTED — verificat in cod.
- **Gap:** smoke-env-toggles.js NU testeaza BOM/CRLF explicit. Adauga 2 cazuri.

### CP-7 — Atomic write retry pe Windows EBUSY/EPERM
- **Statement:** `atomicWrite()` din `scripts/lib/atomic-write.js` retry-eaza pe EBUSY/EPERM (Windows file lock) si curata `.tmp` orfani.
- **Why:** Windows blocheaza fisierul cand alt proces il citeste; rename atomic fail fara retry → corupere de state.
- **Verify:** `node scripts/smoke-atomic-write.js`.
- **Status:** `✓` ENFORCED.

---

## UX — Student Onboarding & DX

> Studentul descarca, ruleaza setup, are 0 confuzii in primele 30 min.

### UX-1 — Single command setup
- **Statement:** un singur comand `node scripts/setup.js` (sau `setup.cmd` / `setup.sh`) duce de la set-de-fisiere-tarball-equivalent la sistem functional, idempotent. Verifica artifacts: `.env` cu token auto-generat, `data/robos.db`, `centre/dist/index.html`, `centre/node_modules`, `skills/_index.json`, `decision-journal.md`.
- **Why:** student nu trebuie sa citeasca documentatie ca sa porneasca.
- **Verify:** `node scripts/smoke-fresh-install.js` (SLOW, ~15-90s). Strategie: `git ls-files` snapshot → copy in TMP_DIR → run setup.js --skip-license-bind → assert artifacts. Marcat in `smoke-all.js SLOW_TESTS` (skipped in `--quick`).
- **Status:** `✓` ENFORCED. Baseline 2026-05-10: 14.6s, 15/15 assertions green.

### UX-2 — Setup detecteaza Node prea vechi cu mesaj actionabil
- **Statement:** Node < 22.12.0 → setup esueaza imediat cu mesaj care numeste versiunea minima si linkul de download.
- **Why:** Astro >=22.12 e dependency hard; eroarea generica de npm e ne-actionabila.
- **Verify:** `scripts/setup.js:50-58` — fail explicit cu link nodejs.org + nvm command.
- **Status:** `✓` IMPLEMENTED.

### UX-3 — Niciun trigger de skill in romana mainstream nu cade la default
- **Statement:** comenzi documentate ("plan de zi", "audit", "level up", "gata", "onboard me", "schimba clientul", "list clients", "scrie un articol despre AI") duc la skill-ul corect prin `skill-route.js`. Toate trigger-urile declarate in SKILL.md frontmatter routeaza inapoi la skill-ul propriu (sau pierd in fata unui trigger mai lung — documentat).
- **Why:** confuzia e UX-killer. Userul a invatat o fraza din docs; daca nu lucreaza, increderea cade.
- **Verify:** `node scripts/smoke-skill-routing.js` — 235 assertii (227 trigger round-trip + 8 documented Romanian phrasings).
- **Status:** `✓` ENFORCED. Wave 4 (2026-05-10) a expus un drift: CLAUDE.md:186 cita "done" ca trigger pentru sys-session-close, dar skill-ul foloseste "done for today"/"gata" (nu "done" singur — risc false positives ca "I'm done with this commit"). Fix: CLAUDE.md "done" → "gata".
- **Known incomplete:** "morning routine" e compound model-side, nu router-side (CLAUDE.md D8 fix). Daca user reseteaza context, frazele cad. Documentat dar nu testat.

### UX-4 — Mesajele de eroare student-facing sunt in romana, actionabile
- **Statement:** orice eroare care ajunge la student (CLI output, dashboard UI, hook block message) e in romana si numeste actiunea de remediere.
- **Why:** eroare engleza generica = blocaj.
- **Verify:** TODO — un grep peste console.error/exit messages care valideaza non-empty + romana keyword density. Imperfect, dar baseline.
- **Status:** `?` CLAIMED. Codul e in mare parte conform (vezi `setup.js`, `license-check.js`, `add-client.js`), dar fara enforcement.

### UX-5 — Fisierele protejate user nu sunt suprascrise de update
- **Statement:** `update.js` NU suprascrie: `context/`, `brand/`, `clients/`, `projects/`, `cron/jobs/`, `data/`, `.env`, `.env.bak`, `connections.md`. Lista canonica in `scripts/lib/protected-paths.js` (PROTECTED_PATHS + isProtected).
- **Why:** munca studentului = sacra. Update-ul tarball-based copiaza din extracted/ in ROOT, dar trebuie sa SARA peste user data chiar daca tarball-ul accidentally include un protected file (regression scenario).
- **Verify:** `node scripts/smoke-update-preserves-user-files.js` — 54 assertii: PROTECTED_PATHS coverage, isProtected classification (16 protected + 15 non-protected cases), simulated update walk, source check ca update.js importa din lib (no drift).
- **Status:** `✓` ENFORCED.

### UX-6 — `node scripts/robos.js --doctor` raporteaza tot ce e gresit
- **Statement:** `--doctor` verifica required files (VERSION, .env, _index.json, robos.db, settings.json), prezenta tuturor 5 hook scripts, recent hook errors din `data/hook-errors.ndjson`, ruleaza `smoke-all --quick` + `lint-portability`, si printeaza verdict final ("Toate verificarile au trecut" sau "{N} probleme detectate").
- **Why:** student suspects ceva e stricat → un comand spune ce.
- **Verify:** `node scripts/smoke-doctor-coverage.js` — 23 assertii: 15 source structure (commandDoctor function + flag wiring + 5 file checks + 5 hook checks + 3 sub-runs) + 8 live invocation (banner + sections + verdict + deterministic exit). Recursion guard: `ROBOS_INSIDE_DOCTOR=1` env flag previne loop cand smoke-all e invocat de doctor.
- **Status:** `✓` ENFORCED.

---

## SCA — Scalability

> Sistemul ramane sanatos cand creste numarul de clienti, skill-uri, sesiuni, fisiere de memorie.

### SCA-1 — Memorie zilnica nu creste necontrolat
- **Statement:** `context/memory/YYYY-MM-DD.md` nu sufera growth nelimitat in cadrul unei zile (limita rezonabila per fisier, ex: 50 KB warning).
- **Why:** un user care lucreaza intens fara restart poate ajunge la fisier 5 MB, slow read la fiecare hook fire.
- **Verify:** TODO. Niciun mecanism actual.
- **Status:** `?` CLAIMED.

### SCA-2 — `data/activity-log.ndjson` are rotation
- **Statement:** activity log este capat la 500 entries; al 501-lea entry trim.
- **Why:** crestere liniara per turn de prompt → GB-uri intr-un an.
- **Verify:** `scripts/lib/ndjson-log.js` `appendNdjson` cu `maxLines` parameter; AGENTS.md confirma 500 default.
- **Status:** `✓` IMPLEMENTED — verificat in `hook-error-sink.js:29 MAX_LINES = 500`.
- **Gap:** smoke nu testeaza ca trim chiar functioneaza. Adauga 501-entry stress test.

### SCA-3 — `data/session-state/` si `data/session-recovery/` sunt curate
- **Statement:** session-state pruneaza fisiere > 30 zile; session-recovery > 7 zile.
- **Why:** un nou marker file per sesiune; in 1 an = ~1000 fisiere stale.
- **Verify:** `scripts/lib/cleanup.js` `pruneDirByAge`, apelat de session-timeout-detector cron.
- **Status:** `✓` IMPLEMENTED. Smoke: `smoke-cleanup.js` 2026-05-10 PASS.

### SCA-4 — Multi-client scaleaza la N clienti fara conflict
- **Statement:** N clienti in `clients/{slug}/` nu interfereaza intre ei. Active-client mechanism e atomic. Listare e O(N), accept ~50 clienti.
- **Why:** agency cu 20 clienti = scenariu real.
- **Verify:** `node scripts/smoke-multiclient.js` (45 assertions) — pasa 2026-05-10.
- **Status:** `✓` ENFORCED.
- **Gap:** smoke nu testeaza N=50; doar 1 client smoke. Stress test optional.

### SCA-5 — Cron job-urile nu acumuleaza log-uri
- **Statement:** `cron/logs/*.log` au retention 14 zile, prune la fiecare invocare a `session-timeout-detector` (cron 15 min). Steady-state cap ~1344 logs (96/zi × 14).
- **Why:** session-timeout cron ruleaza la 15 min → 96 log/zi total cross-jobs. Fara rotation = unbounded.
- **Verify:** `node scripts/smoke-cron-log-rotation.js` — 12 assertii pentru `pruneDirByAge` + verifica wiring in session-timeout-detector source.
- **Status:** `✓` ENFORCED. Wiring adaugat 2026-05-10 in `session-timeout-detector.js` impreuna cu pruning existent pentru `data/session-state/` si `data/session-recovery/`. Cleanup activ pe orice cron tick care vede log-uri >14 zile.

---

## LIC — License System

> JWT signed Ed25519, hardware-bound, valid offline dupa first-bind, refresh la 60d.

### LIC-1 — Public key embedded match priva key Cloudflare Worker
- **Statement:** `PUBLIC_KEY_BASE64` din `scripts/license-check.js:26` corespunde la `LICENSE_JWT_PRIVATE_KEY` din wrangler secrets.
- **Why:** mismatch = TOATE licentele invalide global. Fix-ul cere re-deploy worker + re-distribuit toate tarballs.
- **Verify:** TODO — `licensing/scripts/verify-key-pair.js` care semneaza un JWT cu private key + valideaza cu public key embedded.
- **Status:** `?` CLAIMED — sursa singulara: cheile generate 2026-05-06 (comentat in cod). Niciun check automat.

### LIC-2 — Hardware fingerprint stabil intre run-uri
- **Statement:** `computeHardwareHash()` returneaza acelasi hash pe acelasi device intre run-uri (zero drift legitim).
- **Why:** drift = student e validat continuu ca "device nou" → rebind blocat → student blocat.
- **Verify:** `scripts/license-check.js:computeHardwareHash` foloseste `hostname + cpus[0].model|speed + platform + arch` → toate stabile cross-reboot, fara network.
- **Status:** `✓` VERIFIED 2026-05-12. MAC-ul a fost SCOS din fingerprint dupa incident real (Adrian schimbat reteaua → MAC randomization Win11 + virtual adapter drift → rebind_blocked). Vezi context/decision-journal.md 2026-05-12.
- **Trade-off acceptat:** doi useri cu acelasi model laptop + acelasi hostname se pot ciocni → warning admin la `bind.js:62-74`, nu block.

### LIC-3 — License check NICIODATA blocheaza prompt cand cheia e valida offline
- **Statement:** un JWT valid + hardware match = 0 network calls in operare normala. Refresh in background la <30 zile expira. Latency p95 < 100ms.
- **Why:** student fara internet trebuie sa lucreze; license check ruleaza pe FIECARE prompt.
- **Verify:** `node scripts/smoke-license-perf.js` — 100 invocari, asserteaza p95 < 100ms si max < 500ms. Skip gracefully daca JWT lipseste.
- **Status:** `✓` ENFORCED. Baseline 2026-05-10: p50=4.09ms, p95=5.52ms, p99=6.44ms, max=7.07ms — bine sub buget.

### LIC-4 — License bind in setup, nu la primul prompt
- **Statement:** `setup.js` face bind cand student e oricum online (instaland deps). Primul prompt cu JWT deja bound = 0 network.
- **Why:** student offline la primul prompt = experienta proasta dar reversibila la setup, irreversibila la primul prompt.
- **Verify:** `scripts/setup.js:201` `setupLicense()` apelat in main flow.
- **Status:** `✓` IMPLEMENTED — vezi CHANGELOG U7 fix.

### LIC-5 — Eroarea de licenta e student-friendly (5 cazuri)
- **Statement:** mesaje pentru `no_license`, `invalid_stamp`, `network_required`, `bind_failed`, `hardware_mismatch`, `rebind_blocked`, `refresh_failed` sunt actionabile, in romana.
- **Why:** student blocat la setup citete eroarea — daca e tehnica, contacteaza support.
- **Verify:** `scripts/license-check.js:159-208, 280-335` confirmate manual 2026-05-10.
- **Status:** `✓` IMPLEMENTED.

### LIC-6 — Nicio portita ROBOS_DEV
- **Statement:** niciun env var sau flag interior ocoleste check-ul de licenta in productie.
- **Why:** o portita inseamna ca un user piratand poate elimina check-ul.
- **Verify:** `Grep ROBOS_DEV scripts/ centre/ licensing/` — should return zero results.
- **Status:** `✓` VERIFIED — CHANGELOG 2.1.0 confirma "ROBOS_DEV portita scoasa". Re-verificat 2026-05-10 (necesita grep separat).

### LIC-7 — License worker e idempotent pe re-bind cu acelasi hardware
- **Statement:** student care sterge `~/.robos/license.jwt` apoi re-runs setup → hardware deja bound → reissue JWT, nu eroare "device nou".
- **Why:** student face restore din backup, sau copia .robos/ se piardea.
- **Verify:** `licensing/src/endpoints/bind.js:47-58` — `existing` branch reissue.
- **Status:** `✓` IMPLEMENTED.

### LIC-8 — Cross-hash gate la 4 entry points
- **Statement:** licenta + integritate cross-verificata la 4 entry points (hook-user-prompt, centre/server, setup, update) via `scripts/lib/license-validator.js`. Tabela SELF + 5 peer hashes (sha256 cu marker lines stripped) detecteaza tampering.
- **Why:** bypass-ul prin "comenteaza 3 linii in hook" e prea ieftin pentru €97. Cross-hash escaleaza bypass-ul la "modifica 4 fisiere si reruleaza rehash" — non-trivial pentru ChatGPT one-shot.
- **Verify:** `node scripts/smoke-license-integrity.js` (9 assertii: baseline + peer tamper + self tamper + half-bypass + restore). Maintenance: `node scripts/rehash-validators.js` dupa modificari la oricare din cele 5 fisiere critice.
- **Status:** `✓` VERIFIED 2026-05-12 (initial implementation).
- **Trade-off acceptat:** dev care editeaza unul din 5 fisiere fara rehash → loveste integrity_fail. Solutia: pre-commit hook care ruleaza rehash. v3.2 candidate.

### LIC-9 — Perf gate integrity + license < 5ms typical
- **Statement:** `checkLicenseAndIntegrity()` (full gate) sub 5ms typical pe hardware median. Cross-hash adauga ~1-2ms peste checkLicense baseline.
- **Why:** ruleaza la fiecare prompt; nu vrem latency vizibila.
- **Verify:** masurat 2026-05-12: p50=1.87ms, p95=2.42ms, max=2.84ms (N=100).
- **Status:** `✓` VERIFIED 2026-05-12.

---

## SEC — Security

### SEC-1 — Token comparison foloseste timingSafeEqual sau constant-time
- **Statement:** orice comparatie de secret in cod foloseste `crypto.timingSafeEqual` (Node) sau o functie `constantTimeEqual` manuala (Workers). Niciodata `===` / `!==` direct intre doua variabile cu nume `token|secret|password|jwt|hmac|signature|api_?key`.
- **Why:** comparatie literala leaks lungime + match-prefix prin timing.
- **Verify:** `node scripts/lint-security.js` — rule `secret-strict-equals`, severity BLOCK. Self-exempt pe `typeof X ===`, `=== null/undefined/'' / "" / numere / boolean`, fisiere `smoke-*.js`, comment `// lint-allow:secret-compare`.
- **Status:** `✓` ENFORCED. Resolved 2026-05-10: `licensing/src/endpoints/admin.js:58` migrat de la `if (token !== expected)` la `constantTimeEqual(token, expected)`.

### SEC-2 — `.env` valori cu KEY/TOKEN/SECRET nu sunt expose-d prin GET API
- **Statement:** `getEnv()` din dashboard returneaza `value: null` + `masked: true` pentru orice cheie matchata de `SECRET_PATTERNS` (KEY|SECRET|TOKEN|PASSWORD|PASS|PRIVATE|CREDENTIAL|DSN|AUTH). `NON_SECRET_OVERRIDES` (path keys ca `LICENSE_JWT_*_KEY_PATH`) raman expuse.
- **Why:** chiar daca dashboard-ul are bug de auth, valorile secrete nu pot fi citite (defense in depth).
- **Verify:** `node scripts/smoke-env-api-secrets.js` — 18 assertii: SECRET_PATTERNS source check (×9 patterns) + getEnv masking expression check + live call cu .env real (verificate 11 secret-named entries × value=null/masked=true + 19 non-secret entries + path overrides).
- **Status:** `✓` ENFORCED.

### SEC-3 — Origin missing → reject (F7 fix)
- **Statement:** `isSameOrigin()` cu Origin lipsa → false. CLI tooling autentifica cu Bearer din `.env` direct.
- **Why:** orice proces local Node putea fura token-ul.
- **Verify:** `node scripts/smoke-auth-origin.js`. PASS 2026-05-10.
- **Status:** `✓` ENFORCED.

### SEC-4 — `cron-runner.js` nu shell-out pe input din job
- **Statement:** `cron-runner.js` apeleaza `spawn(node, [...], { shell: false })` cu argv parsat manual (`parseCommandArgv()`). Nu `shell:true`.
- **Why:** un job malicios cu metacharacters poate executa cod arbitrar.
- **Verify:** `node scripts/smoke-cron-runner-argv.js`. PASS 2026-05-10.
- **Status:** `✓` ENFORCED — CHANGELOG S4 fix.

### SEC-5 — Argument validation pentru runSkill
- **Statement:** input pentru endpoints care lanseaza skill-uri (`/api/skills/*/run`) restricteaza characters periculoase doar la `[\0\n\r]` (NUL, CR, LF), nu intregul `[\s\S]`. Spatii, punctuatie, diacritice romane, shell metas (`$();|&<>*?`) — toate acceptate (cu `shell:false`, niciuna nu poate corupe argv).
- **Why:** restrictia anterioara bloca input multi-cuvant legitim → 400. Restrictie prea relaxata = NDJSON log corupt + posibil C-string truncation.
- **Verify:** `node scripts/smoke-args-validation.js` — 40 assertii: 11 positive cases (multi-word + romana + shell metas), 18 negative cases (NUL/CR/LF + length cap + non-string types), 6 regex sanity, 3 wiring (system.js imports lib + nu redefiniteste).
- **Status:** `✓` ENFORCED. Wave 5 (2026-05-10) refactor: `ARGS_FORBIDDEN_RE` + `validateRunSkillArgs()` extrase la `scripts/lib/args-validator.js` (single source pentru system.js + smoke).

### SEC-6 — Slug validation pentru active-client
- **Statement:** `setActiveClient(slug)` accepta doar `^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$`. Path traversal blocat.
- **Why:** slug = path component → `../` ar permite escape din `clients/`.
- **Verify:** `scripts/lib/client-context.js:39` SLUG_RE. Smoke: `smoke-multiclient.js` testeaza slug invalid.
- **Status:** `✓` ENFORCED.

### SEC-7 — Niciun secret hardcoded in cod
- **Statement:** chei API, parole, tokeni, JWT private — niciodata literal in cod. Public keys + endpoint URLs au voie embedded (sunt publice prin definitie). Heuristica: orice string de 32+ chars hex in cod e suspect; exceptii pentru prefixe `PUBLIC_KEY`, `TEST_`, `EXAMPLE_`, `FIXTURE_` si UUID v4 (cu liniute).
- **Why:** secret leaked in git = revoke + rotate global.
- **Verify:** `node scripts/lint-security.js` — rule `hardcoded-secret-hex`, severity WARN. Smoke `smoke-lint-security-rules.js` testeaza atat positive (3 cazuri) cat si negative (7 cazuri) ca rule-ul nu e dead.
- **Status:** `✓` ENFORCED. WARN severity (nu BLOCK) — un long hex e ambiguu, operator decide.

### SEC-8 — Prompt injection prin continut extern (memorie / cron / agent output) e flagged
- **Statement:** continut citit din fisiere user-controllable (memorie, brand, learning) inserat in context model nu este interpretat ca instructiuni autoritative.
- **Why:** un atacator care manipuleaza brand/voice.md poate emite instructiuni pe care model-ul le executa.
- **Verify:** sistem de prompt isolation. TODO — niciun mecanism actual.
- **Status:** `?` CLAIMED — risc cunoscut, mitigare nedocumentata.

---

## DAT — Data Safety, Atomicity, Idempotency

### DAT-1 — Toate scrierile in fisiere "live" folosesc atomicWrite din lib
- **Statement:** scrierile in `.env`, `data/launcher-state.json`, `data/active-client.json`, `skills/_index.json`, `data/required-secrets.json`, `data/audit-cache.json` MERG prin `atomicWrite()` din `scripts/lib/atomic-write.js` (lib are Windows EBUSY/EPERM retry + cleanup tmp + random hex suffix anti-race).
- **Why:** crash mid-write = corupere → student blocat la re-run.
- **Verify:** `node scripts/smoke-atomic-write-coverage.js` — 6 assertii: zero direct `writeFileSync` pe critical paths in scripts/+centre/+licensing/, plus 5 expected consumers (launcher-state, client-context, rebuild-index, loop-detector, ndjson-log) au import-ul.
- **Status:** `✓` ENFORCED. Wave 4 (2026-05-10) a refactorat 3 site-uri inline atomic la lib: `lib/launcher-state.js write()`, `rebuild-index.js` (×2: _index.json + required-secrets.json).

### DAT-2 — `setup.js` e idempotent (full coverage)
- **Statement:** rularea `setup.js` pe sistem deja setup = a doua rulare nu modifica niciun fisier user. Rularea pe sistem fresh = aduce la stare functionala.
- **Why:** student paranoic re-run; sau update auto; sau cron auto-run.
- **Verify:**
  - `node scripts/smoke-setup-idempotency.js` (fast: setup-env, rebuild-index, mkdirSync, seedDecisionJournal — 13 assertii).
  - `node scripts/smoke-fresh-install.js` (slow: full setup pe TMP_DIR cu git ls-files copy — 15 assertii). Marcat SLOW in smoke-all.
- **Status:** `✓` ENFORCED.

### DAT-3 — `setup-env.js` nu suprascrie valori existente in .env
- **Statement:** rularea `setup-env.js` cand `.env` exista deja: zero valori existente touched. Doar slot-uri noi adaugate cu marker `# added by setup-env <data>`. Token deja generat preserved.
- **Why:** student a populat OPENAI_API_KEY; o re-rulare nu trebuie sa-l reseteze.
- **Verify:** `node scripts/smoke-setup-idempotency.js` — sectiunea "setup-env.js idempotency", 8 assertii inclusive byte-identical re-run + user-populated value preserved.
- **Status:** `✓` ENFORCED.

### DAT-4 — `.env.bak` rolling backup
- **Statement:** fiecare modificare a `.env` salveaza precedenta in `.env.bak` (single rolling).
- **Why:** student isi sterge accidental cheia → un comand restore.
- **Verify:** `scripts/setup-env.js:79`.
- **Status:** `✓` IMPLEMENTED.

### DAT-5 — Memorie (yyyy-mm-dd.md) nu este sterge / suprascrisa de update
- **Statement:** `update.js` n-atinge `context/memory/` (subset al UX-5).
- **Why:** memoria = log permanent al user-ului.
- **Verify:** `node scripts/smoke-update-preserves-user-files.js` — assertia `user data preserved: context/memory/2026-05-10.md`.
- **Status:** `✓` ENFORCED via UX-5.

### DAT-6 — Data race intre 3 Stop hooks
- **Statement:** cele 3 Stop hooks (checkpoint-reminder, activity-capture, note-candidates) ruleaza serial sau independent — niciuna nu citeste state intermediar de la alta.
- **Why:** scriere paralela in aceeasi fisier = corupere.
- **Verify:** `.claude/settings.json:20-39` listeaza in ordine; Claude Code ruleaza sequential. Confirmat manual.
- **Status:** `✓` BY DESIGN — Claude Code sequential.

---

## PRF — Performance Budgets

### PRF-1 — Hooks finalizeaza sub timeout-ul declarat in settings.json
- **Statement:** `UserPromptSubmit` < 5s, `Stop` < 5s/3s/5s (3 hooks), `PostToolUse` < 3s. Buget operational p95 < 500ms (10% timeout), max < 2000ms (40%).
- **Why:** timeout = hook killed mid-run, state corruption.
- **Verify:** `node scripts/smoke-hook-latency.js` — 20 assertii: 5 hooks × (p95 + max + spawn errors + exit 0), N=10 iteratii fiecare cu mock JSON payload via stdin.
- **Status:** `✓` ENFORCED. Baseline 2026-05-10 (Win 11): toate 5 hooks p95=50-80ms, max=53-81ms — 6× sub buget operational.

### PRF-2 — License check < 10ms typical, < 100ms p95 (offline JWT validation)
- **Statement:** `checkLicense()` cu JWT valid si hardware match: typical < 10ms, p95 < 100ms, max < 500ms (samples N=100).
- **Why:** ruleaza la fiecare prompt — buget strict.
- **Verify:** `node scripts/smoke-license-perf.js`.
- **Status:** `✓` ENFORCED. Baseline 2026-05-10 (Win 11, NVMe): p50=4.09ms, p95=5.52ms.

### PRF-3 — `smoke-all` ruleaza in < 30s pe host curent
- **Statement:** suite completa <30s; --quick <10s.
- **Why:** smoke care ia 5 min nu se ruleaza.
- **Verify:** 2026-05-10 quick = 1.8s (11 suites).
- **Status:** `✓` VERIFIED.

### PRF-4 — Dashboard initial load < 2s pe device modern
- **Statement:** `astro build` produce static dist; server.js servete cu zero render → first byte < 100ms, full page < 2s.
- **Why:** dashboard rar deschis ar trebui sa fie instant.
- **Verify:** TODO.
- **Status:** `?` CLAIMED.

---

## OBS — Observability

### OBS-1 — Erorile in hooks + cron ajung intr-un sink vizibil
- **Statement:** **Hook scripts** (Claude Code hooks: hook-user-prompt, hook-post-tool, checkpoint-reminder, activity-capture, note-candidates) apeleaza `logHookError(scope, err)` → append in `data/hook-errors.ndjson` cu rotation 500. **Cron scripts** (audit-startup, session-timeout-detector, learnings-aggregator) au top-level error handler (try/catch in main, `.catch()`, sau `uncaughtException`) — stderr captured de cron-runner in `cron/logs/`.
- **Why:** hooks exit 0 ca sa nu blocheze user → fara sink, failure-uri silentioase pentru luni.
- **Verify:** `node scripts/smoke-hook-error-sink-coverage.js` — 16 assertii: 5 hook scripts × (import + call) + 3 cron × (error handler) + 3 sink-lib (export, NDJSON path, rotation).
- **Status:** `✓` ENFORCED.

### OBS-2 — Telemetrie skill-uri paralelizate
- **Statement:** fiecare skill cu `concurrency_pattern` declarat in SKILL.md frontmatter trebuie sa aiba si `parallel-budget log` invocation in body (instrueste executor-ul) si `parallel-budget check` (sau `shouldParallelize`) pentru gating. Logul ajunge in `data/skill-telemetry.ndjson` cu rotation 2000 entries.
- **Why:** detectia regresiilor (ex: `fallback_used > 20%` weekly = bug).
- **Verify:** `node scripts/smoke-skill-telemetry-adoption.js` — 19 assertii: 8 parallel skills × (log + check) + 3 lib sanity. Static check pe SKILL.md content.
- **Status:** `✓` ENFORCED.

### OBS-3 — Loop detector emite warning detectabil
- **Statement:** `hook-post-tool.js` detecteaza N apeluri identice consecutive (default 3) si injecteaza `[LOOP DETECTOR]` warning.
- **Why:** model blocat in loop = waste tokens + waste user time.
- **Verify:** `node scripts/smoke-loop-detector.js`. PASS 2026-05-10.
- **Status:** `✓` ENFORCED.

### OBS-4 — Activity log capturable cross-session
- **Statement:** `data/activity-log.ndjson` capteaza ultimele MAX_ENTRIES (=500) turn-uri prin `Stop` hook `activity-capture.js`. Fiecare entry e JSON valid cu camp ISO `ts`. User prompts + assistant text + bash commands sunt redacted via `redactSensitive` inainte de write. Toggle `ROBOS_ACTIVITY_DISABLED=1` da silent no-op.
- **Why:** "ce am facut ieri" → query pe log. Bridge cross-session. Fara redactare → secrete leak in log persistent.
- **Verify:** `node scripts/smoke-activity-log.js` — 12 assertii: 6 source wiring (redactSensitive imports + 3 use sites + appendNdjson + MAX_ENTRIES + toggle), 4 live log structural (parseable, ISO ts, count cap), 2 disabled-toggle behaviour.
- **Status:** `✓` ENFORCED.

---

## PRV — Privacy (Local-First)

### PRV-1 — Dashboard bind 127.0.0.1 default
- **Statement:** `ROBOS_CENTRE_HOST=127.0.0.1` default; LAN exposure necesita modificare explicita user.
- **Why:** student pe wifi public nu trebuie sa expuna dashboardul.
- **Verify:** `.env.example:32`. `centre/server.js` foloseste env var.
- **Status:** `✓` IMPLEMENTED.

### PRV-2 — Astro telemetry off
- **Statement:** `ASTRO_TELEMETRY_DISABLED=1` setat de `setup.js` si `robos.js` pentru toate child processes.
- **Why:** local-first promit; niciun pixel catre Astro.
- **Verify:** `scripts/setup.js:34`, `scripts/robos.js:40`.
- **Status:** `✓` IMPLEMENTED.

### PRV-3 — Niciun hook trimite date catre Anthropic / Claude API in afara turn-ului user
- **Statement:** hook scripts (UserPromptSubmit, Stop, PostToolUse) + cron scripts (audit-startup, session-timeout-detector, learnings-aggregator) NU fac network calls. Allowlist: `license-check.js` (gated by user purchasing license), `update.js` (gated by user invoking update), `lib/http-probe.js` (local dashboard ping pentru launcher).
- **Why:** local-first = hard claim. Dac-am face background analytics in hooks, e exfiltrare silentioasa per prompt.
- **Verify:** `node scripts/smoke-hooks-no-network.js` — 11 assertii: 8 hook/cron scripts (forbid network imports) + 3 allowlist sanity (confirm gated exceptions exista).
- **Status:** `✓` ENFORCED.

### PRV-4 — Niciun secret in log-uri (telemetry, error sink, activity log)
- **Statement:** `scripts/lib/redact.js` `redactSensitive(text)` mascheaza 12 pattern-uri provider (Anthropic/OpenAI/Stripe sk-, Firecrawl fc-, Google AIza, GitHub gh*_, Cloudflare cfat_, Slack xox*-, npm_, AWS AKIA/ASIA, JWT eyJ, Bearer, generic UPPER_KEY=value). Toti caller-ii (activity-capture.js, redact-jsonl.js, redact-activity-log.js) il importa.
- **Why:** student isi share-uieste log-ul cu support → secret leaked.
- **Verify:** `node scripts/smoke-redact-coverage.js` — 12 assertii: redact `--self-test` 16 cazuri (chained patterns + JSON Bearer + env-style assignments + innocent text untouched) + caller wiring (3 fisiere × import + actual call).
- **Status:** `✓` ENFORCED.

### PRV-5 — `scripts/redact-jsonl.js` poate sterge istoricul daca user cere
- **Statement:** un comand `node scripts/redact-jsonl.js <file>` curata secret-uri din log.
- **Why:** GDPR / drept la stergere.
- **Verify:** `scripts/redact-jsonl.js`, `scripts/redact-activity-log.js` exista (Glob 2026-05-10).
- **Status:** `✓` IMPLEMENTED — verificat exists, comportament neverificat.

---

## LCY — Compatibility Lifecycle

### LCY-1 — Node minimum version e single-source 22.12.0
- **Statement:** `setup.js`, `centre/package.json:engines.node`, README, `docs/INSTALL.md`, WHATS-NEW.md, scripts wrappers (`.cmd`/`.ps1`/`.sh`), `sandbox.wsb`, email templates — toate citeaza acelasi minimum (22.12.0 sau o range care il INCLUDE).
- **Why:** drift = student pe Node 20 reuseste npm install dar fail-uieste la setup.js (UX killer).
- **Verify:** `node scripts/smoke-version-sync.js` — sectiunea "Node minimum (22.12.0)" verifica 14 surse + `engines.node` semver range.
- **Status:** `✓` ENFORCED. Resolved 2026-05-10: `centre/package.json` `>=20` → `>=22.12.0`.

### LCY-2 — Astro & svelte version pin
- **Statement:** `centre/package.json` pin Astro la `^6.x` (6.2.1) si svelte `^5.x`. Major bump = explicit decision + smoke re-run.
- **Why:** Astro 7 ar putea sparge build cu API changes.
- **Verify:** `centre/package.json:18-23`.
- **Status:** `✓` IMPLEMENTED — caret range nu admite major bump automat.

### LCY-3 — better-sqlite3 ABI match Node version
- **Statement:** dupa Node major upgrade, `npm rebuild better-sqlite3` ruleaza automat in setup.
- **Why:** better-sqlite3 e native; ABI mismatch = "module compiled against different Node version" la primul prompt.
- **Verify:** `setup.js` should `npm install` care detecteaza ABI change si rebuild. TODO confirma comportament.
- **Status:** `?` CLAIMED.

### LCY-4 — wrangler.toml `compatibility_date` actualizat anual
- **Statement:** `licensing/wrangler.toml:3 compatibility_date` reflecta luna curenta sau luna anterioara.
- **Why:** un date prea vechi = Workers ruleaza pe API behavior depreciat.
- **Verify:** `licensing/wrangler.toml:3` = `2026-05-01` (current 2026-05-10) ✓.
- **Status:** `✓` VERIFIED.

---

## DST — Distribution Hygiene

### DST-1 — Tarball NU contine `.env`, `data/keys/`, `.command-centre/`, secrete autor
- **Statement:** `git ls-files HEAD` (exact ce `git archive` packageeaza) NU include nicio variabila `.env*` (in afara de `.env.example`), `data/keys/`, `.command-centre/`, `centre/dist/`, `node_modules/`, `.archive/`, log-uri runtime, state-uri per-install (`launcher-state.json`, `active-client.json`).
- **Why:** student descarca tarball cu cheia mea private = compromise total.
- **Verify:** `node scripts/smoke-tarball-clean.js` — 20 forbidden patterns + 15 required files + sanity count.
- **Status:** `✓` ENFORCED.

### DST-2 — Tarball contine `.license-stamp`
- **Statement:** fiecare tarball generat per-customer include `.license-stamp` cu seed JWT + license_id, atasat de Worker (`licensing/src/lib/tarball.js:download.js`).
- **Why:** fara stamp, license-check.js raporteaza `no_license` → student blocat.
- **Verify:** TODO — smoke care simuleaza download flow + extracteaza arhiva. Necesita Worker live sau mock D1. Out-of-scope pentru smoke local; trebuie test end-to-end separat.
- **Status:** `?` CLAIMED.

### DST-3 — `.gitignore` cuprinde toate fisierele user-data + secrets
- **Statement:** `context/memory/`, `brand/*` (cu exceptii templates), `clients/*/`, `data/` (cu exceptii), `.env`, `cron/logs/`, `.archive/`, `node_modules/`, `centre/dist/` — toate excluded.
- **Why:** un commit accidental cu `.env` = secret leaked in git history → revoke obligatoriu.
- **Verify:** `node scripts/smoke-tarball-clean.js` cu rule "no .env / .env.local etc." + altele 19. Daca un fisier protejat ajunge tracked, smoke-ul fail-uieste.
- **Status:** `✓` ENFORCED.

### DST-4 — Niciun fisier `.archive/`, `node_modules/`, `centre/dist/` in tarball
- **Statement:** `git ls-files` confirma ca aceste directories sunt complet excluse.
- **Why:** tarball obez = download lent + pirateaza dist build artifacts care pot contine path-uri local-machine.
- **Verify:** `node scripts/smoke-tarball-clean.js` — rules `no .archive/`, `no node_modules/`, `no centre/dist/`.
- **Status:** `✓` ENFORCED.

### DST-5 — Documente "internal" nu se distribuie
- **Statement:** `.internal/`, `docs/init/`, fisiere `paperclip/` filtrate.
- **Verify:** `.gitignore` linia 1, 55, 73 — confirmate.
- **Status:** `✓` IMPLEMENTED in gitignore. Tarball build trebuie sa onoreze.

---

## Known Violations (status la 2026-05-10, post Wave 1)

### Resolved
1. ~~**LCY-1:** `centre/package.json:7` are `"node": ">=20"`~~ — fixat 2026-05-10 Wave 1 (`>=22.12.0`).
2. ~~**SEC-1:** `licensing/src/endpoints/admin.js:58` token compare cu `!==`~~ — fixat 2026-05-10 Wave 1 (constantTimeEqual).
3. ~~**DOC-4:** `data/launcher-state.json:last_robos_version=0.5.0` vs `VERSION=2.0.0`~~ — fixat 2026-05-10 Wave 1.
4. ~~**DOC-2 (memory drift):** `INSTALL.md` path correction~~ — fixat 2026-05-10 Wave 1 closure (`docs/INSTALL.md`).
5. ~~**SCA-5:** `cron/logs/` no retention~~ — fixat 2026-05-10 Wave 2 (`pruneDirByAge` wired la session-timeout-detector, retention 14 zile).
6. ~~**DOC-1 fixes:** `README.md:482 X` placeholder, `WHATS-NEW.md:65 docs/init/`~~ — fixate 2026-05-10 Wave 3.
7. ~~**UX-3 drift:** `CLAUDE.md:186 "done"` nu e trigger pentru sys-session-close~~ — fixat 2026-05-10 Wave 4 ("gata").
8. ~~**DAT-1 DRY:** launcher-state.js + rebuild-index.js implementau atomic write inline~~ — refactorate la `atomic-write.js` lib 2026-05-10 Wave 4.
9. ~~**SEC-5 DRY:** ARGS_FORBIDDEN_RE inline in centre/api/system.js~~ — extras la `scripts/lib/args-validator.js` 2026-05-10 Wave 5.
10. ~~**Doctor recursion bug:** smoke-doctor-coverage spawnea robos.js --doctor → loop pana timeout cand smoke-all era invocat de doctor~~ — fix `ROBOS_INSIDE_DOCTOR=1` env flag 2026-05-10 Wave 5.

### Open
- *(niciuna)*

---

## Ce NU acopera acest fisier

- **Comportamentul AI-side al skill-urilor.** Daca `sys-audit` produce un scor 4C corect din input dat e calitate, nu invariant verificabil determinist.
- **UX subjective.** "Onboarding e clar" e judecata, nu invariant. UX-1..6 acopera proprietati verificabile (single command, error messages romane), nu sentiment-ul.
- **Cloudflare Worker invariants live in productie.** D1 schema integrity, R2 quota, KV expiration — toate live, nu local. TODO: separat `licensing/INVARIANTS.md`.
- **Skill-ul individual.** Fiecare skill are `SKILL.md`; SKILL-uri au propriile invariante (input/output schema). Nu sunt agregate aici.

---

## Cum cresc invariantele de la `?` la `✓`

1. **Identifica gap-ul.** Citeste statement; daca verify nu e o comanda determinista, e gap.
2. **Scrie testul/lint-ul.** Adauga `smoke-{topic}.js` sau lint rule in `lint-portability.js` / `lint-security.js` / `lint-claims.js`.
3. **Adauga la smoke-all.** `scripts/smoke-all.js` il discovera automat (pattern `smoke-*.js`).
4. **Daca un check gaseste violari → fix-ul + smoke-ul + invariant update merg in acelasi commit.** Pattern: "Wave N — invariant infrastructure".
5. **Update statusul aici** la `✓` cu pointer la smoke/lint care il valideaza.

**Niciun audit "comprehensiv" nou nu trebuie pornit fara ca invariantele de la `?` sa fie acoperite mai intai.** Altfel iar gasim buguri "noi" in locuri "fixate".

## Waves history

- **Wave 1 (2026-05-10):** invariant infrastructure pornit. Adaugate `smoke-version-sync`, `lint-security` + `smoke-security`, `smoke-setup-idempotency`, `smoke-tarball-clean`. Fixate 3 violari (LCY-1, SEC-1, DOC-4 drift). 8 invariante au trecut la `✓`. Smoke-all 11/11 → 15/15 (2.3s).
- **Wave 1 closure (2026-05-10):** `lint-portability` SCAN_DIRS dedup (87 fisiere unique vs 100 cu duplicates). Memory entry corrected pentru `docs/INSTALL.md`.
- **Wave 2 (2026-05-10):** Adaugate `smoke-license-perf`, `smoke-fresh-install` (SLOW), `smoke-update-preserves-user-files`, `smoke-cron-log-rotation`. Refactor: `scripts/lib/protected-paths.js` extract (single source pentru update.js + smoke). Fix SCA-5: `session-timeout-detector` cleanup wired la `cron/logs/`. `update.js` adaugat main() guard pentru import safety. 6 invariante `?`/`⚠` → `✓`. Smoke-all 15/15 → 18/18 (2.8s --quick).
- **Wave 3 (2026-05-10):** Adaugate `smoke-hook-error-sink-coverage`, `smoke-hooks-no-network`, `smoke-wrapper-completeness`, `smoke-lint-security-rules`, `smoke-claims-coverage`. Refactor `lint-security` (export `lintContent`) + `lint-claims` (RUNTIME_FILES/PREFIXES allowlist + tighter looksLikePath). Lint-claims a expus 2 doc bugs reale ascunse de zgomot: `README.md:482 X` placeholder → `{name}`, `WHATS-NEW.md:65 docs/init/` → `docs/init`. 5 invariante `?` → `✓`. Smoke-all 18/18 → 23/23 (3.0s --quick / 25/25 cu SLOW).
- **Wave 4 (2026-05-10):** Adaugate `smoke-skill-routing`, `smoke-skill-telemetry-adoption`, `smoke-hook-latency`, `smoke-catalog-coverage`, `smoke-atomic-write-coverage`. Refactor: `launcher-state.js` + `rebuild-index.js` (×2 sites) la `atomic-write` lib. Adaugat: `detectCatalogOrphans()` in rebuild-index pentru DOC-3. Skill-routing a expus drift `CLAUDE.md:186 "done"` → "gata" (real bug). 5 invariante `?`/`⚠` → `✓`. Smoke-all 23/23 → 28/28 --quick (6.5s) / 30/30 cu SLOW.
- **Wave 5 (2026-05-10):** Adaugate `smoke-redact-coverage`, `smoke-env-api-secrets`, `smoke-args-validation`, `smoke-activity-log`, `smoke-doctor-coverage`. Refactor: `scripts/lib/args-validator.js` extract (single source pentru centre/api/system.js runSkill + smoke). Recursion fix: `ROBOS_INSIDE_DOCTOR=1` env guard previne smoke-doctor-coverage → doctor → smoke-all → smoke-doctor-coverage loop. 5 invariante `?`/`⚠` → `✓`. Smoke-all 28/28 → 33/33 --quick (12.9s) / 35/35 cu SLOW.
