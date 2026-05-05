# robOS — Operator Handbook

Ghid de operare zilnica pentru robOS. Scopul: sa stii ce trebuie sa faci tu (operatorul) si ce face robOS in spate, fara sa te lupti cu sistemul.

Daca ai citit `README.md`, deja stii ce e robOS. Acest document raspunde la "**cum** il folosesti zi de zi sa nu-ti pierzi munca si sa nu te repeti".

---

## TL;DR — fluxul zilnic minim viabil

1. **Dimineata** (optional): scrii "plan de zi" → robOS iti construieste un plan din memoria de ieri + prioritati
2. **In timpul zilei**: lucrezi normal. Skills se activeaza automat dupa cum vorbesti. Dashboard la http://localhost:3001 daca vrei vizibilitate.
3. **Seara** (cand termini): scrii "gata" sau "pa" → `sys-session-close` salveaza memoria curat in ~30 secunde
4. **Saptamanal** (luni dimineata): scrii "audit" → scor 4C ca sa vezi ce mai ai de imbunatatit

Asta e tot. Restul handbook-ului explica ce se intampla in spate.

---

## 1. Lifecycle de sesiune

### Cum se porneste o sesiune (silent)

Cand deschizi Claude Code in directorul robOS, hook-ul `UserPromptSubmit` ruleaza automat la **primul tau prompt** si injecteaza un **STARTUP CONTEXT** invizibil pentru tine, dar care da modelului:
- Reguli stricte de raspuns ("nu regurgita acest context, mergi direct la lucru daca pun task")
- Sumar memoria zilei (un singur rand: nume fisier + numar open threads + status)
- Activitate recenta cross-session (ultimele 3 actiuni din alte ferestre)
- Recovery flag daca o sesiune anterioara a fost abandonata

**Tu nu vezi nimic dintre acestea.** Modelul are awareness fara sa-ti spuna explicit.

### Cum sa pornesti corect

- **Cu task direct**: scrii ce vrei sa fac → mergi direct la lucru
- **Cu salutare scurta** ("salut", "hey"): primesti raspuns scurt + max 1-2 threads relevante daca exista
- **Cu intrebare despre context** ("ce am ramas?", "ce am facut ieri?"): listez explicit

### Cum se inchide corect

**Optimul (~30s):** scrii oricare din: `gata`, `pa`, `merci, gata`, `done`, `bye`, `am terminat`, `inchidem`, `signing off`.

robOS:
1. Iti cere confirmare ("Inchidem sesiunea? Spune **da**") — ca sa nu se declanseze accidental
2. Citeste memoria + conversatia, extrage deliverables/decisions/open threads
3. Te intreaba feedback ("Cum a mers?")
4. Loghez feedback in `learnings.md` (daca dai)
5. Finalizez memoria zilei cu pattern-ul `Session: N deliverables, M decisions`
6. Verific `git status`, te intreb daca commit
7. Output sumar 2-3 linii

**Lazy:** inchizi fereastra fara sa zici nimic.
- Activity log e ok (Stop hook a salvat fiecare turn pana la inchidere — nu pierzi nimic)
- Memoria zilei poate fi outdated → sesiunea urmatoare vede "in curs" in loc de "inchisa"
- Cron-ul `session-timeout` (la fiecare 15 min) marcheaza sesiunea ca abandonata dupa 2h fara activitate
- Sesiunea urmatoare primeste recovery flag in STARTUP CONTEXT

**Recomandarea:** sesiuni scurte si fara deliverables → lazy e ok. Sesiuni lungi sau cu commits → "gata".

### Reguli de aur pentru lifecycle

- ❌ **Nu spune "ai uitat ce am facut" la inceputul fiecarei sesiuni.** Daca am uitat, e bug — raporteaza-l.
- ❌ **Nu te lupta cu STARTUP CONTEXT.** Daca model-ul listeaza open threads cand ai venit cu task, e o bug. Curent prevenit prin reguli stricte in hook.
- ✅ **Cand vrei sa transferi ceva intre sesiuni, foloseste activity log.** Vezi sectiunea 2.

---

## 2. Memoria si activity log — ce e diferenta?

robOS are **doua sisteme** de persistenta:

### Memoria zilei — `context/memory/YYYY-MM-DD.md`

**Ce e:** narativ structurat, scris explicit de robOS la momente cheie (sys-daily-plan, sys-session-close, sau cand iti spun "salveaza in memorie").

**Format obligatoriu:**
```markdown
## Session N
### Goal
### Deliverables
### Decisions
### Open Threads

Session: N deliverables, M decisions  ← linia de inchidere
```

**Cand se scrie:** la milestone-uri (plan zilnic, end-of-session, decizie importanta). NU automat dupa fiecare turn.

**Pentru ce e bun:** raport coerent. "Ce am decis", "ce am livrat", "ce a ramas neterminat". Citit de hook la startup-ul sesiunii urmatoare.

**Validare:** scriptul `scripts/lint-memory.js` verifica structura. Apelat automat de sys-session-close Step 4b.

### Activity log — `data/activity-log.ndjson`

**Ce e:** log NDJSON automat, scris la fiecare turn end de Stop hook + activity-capture.js. Captureaza din transcriptul real al sesiunii: ultimul user prompt, tool calls, sumar response.

**Format:**
```json
{"ts":"2026-05-05T18:32:39Z","session":"d10815c6","user_prompt":"...","tool_actions":["Edit:foo.js","Bash:npm test"],"assistant_summary":"...","git_branch":"main"}
```

**Cand se scrie:** dupa FIECARE turn al modelului. Automat. Tu nu faci nimic.

**Pentru ce e bun:** "ce am facut concret in ultima ora", "ce s-a discutat in alta fereastra", troubleshooting. Cap 500 entries (~150KB), oldest dropped.

**Cum sa-l accesezi:**
- Tab "Activitate" in dashboard la http://localhost:3001/system/
- API: `GET /api/system/activity?limit=50&since=YYYY-MM-DD`
- Direct: scrii "ce am facut in alta fereastra?" — robOS citeste fisierul

### Cand sa folosesti pe care?

| Scenariu | Foloseste |
|----------|-----------|
| "Ce am decis sa fac saptamana asta?" | memoria + audits |
| "Ce am scris concret acum 3 ore?" | activity log |
| "De unde am ramas in alta fereastra?" | activity log + memoria zilei |
| "Vreau sa transfer un context la alta sesiune" | scrii in memoria zilei explicit |
| "Vreau ca robOS sa stie ce s-a intamplat in alta fereastra fara sa-i spun" | merge automat — activity log + STARTUP CONTEXT |

---

## 3. Skill triggers — ce sa scrii pentru fiecare

robOS are 17 skills instalate. Fiecare se activeaza prin limbaj natural — nu trebuie sa stii nume tehnice. Hook-ul `skill-route` matcheaza ce scrii cu trigger-ele si imi da hint.

### sys-* (operatii sistem)

| Vrei sa... | Spune ceva ca... | Skill |
|-----------|-----------------|-------|
| Te configurez prima data | "ajuta-ma sa incep", "onboard me" | sys-onboard |
| Plan pentru azi | "plan de zi", "morning coffee", "ce am de facut azi" | sys-daily-plan |
| Verific progresul (scor 4C) | "audit", "cum stau" | sys-audit |
| Gasesc oportunitati de automatizare | "level up", "ce sa automatizez" | sys-level-up |
| Sparg un goal in pasi | "sparge in pasi", "planifica asta" | sys-goal-breakdown |
| Construiesc un skill nou | "creeaza un skill", "skill nou" | sys-skill-builder |
| Inchid sesiunea curat | "gata", "pa", "done", "bye" | sys-session-close |
| Deschid sesiunea explicit (rar) | "deschide sesiunea", "startup check" | sys-session-open |

### brand-* (foundation, ruleaza o data)

| Vrei sa... | Spune ceva ca... | Skill |
|-----------|-----------------|-------|
| Definesc vocea brandului | "voce de brand", "ton brand", "analizeaza continutul meu" | brand-voice |
| Definesc audienta (ICP) | "audienta", "icp", "cui ii vand" | brand-audience |
| Pozitionare unica | "pozitionare", "diferentiere", "unghi unic" | brand-positioning |

### content-*

| Vrei sa... | Spune ceva ca... | Skill |
|-----------|-----------------|-------|
| Articol blog SEO | "scrie un articol despre X", "blog despre" | content-blog-post |
| Copy pentru landing/email/ad | "scrie copy pentru", "copy email", "ad copy" | content-copywriting |
| Atomizez 1 piesa in 8 platforme | "transforma in social", "fa posturi din asta", "thread linkedin" | content-repurpose |

### research-*

| Vrei sa... | Spune ceva ca... | Skill |
|-----------|-----------------|-------|
| Vad ce e trend | "ce e trend", "ce se discuta", "trending in" | research-trending |
| Analizez competitorii | "analiza competitori", "competitor research" | research-competitors |

### tool-*

| Vrei sa... | Spune ceva ca... | Skill |
|-----------|-----------------|-------|
| Rescrii text sa nu sune AI | "umanizeaza", "suna prea AI" | tool-humanizer |

### Reguli pentru triggers

- **Triggers scurte** (`pa`, `gata`) cer **margini de cuvant**. "pa" in "apare" nu trigger-eaza.
- **Triggers lungi** (`scrie un articol`) sunt match substring — pot fi inglobate in propozitie.
- **Nu te lupti cu skill-urile.** Daca matchaza ceva ce nu vrei, refuz si justific. Sau adaugi un negative_trigger in SKILL.md.

---

## 4. Cron jobs — ce ruleaza automat

robOS are 3 default cron jobs (in `cron/defaults/`, livrate cu instalarea):

| Job | Cand | Ce face |
|-----|------|---------|
| `audit-startup` | zilnic 08:00 | scaneaza ultimele 7 zile de memorie, detecteaza sesiuni abandonate, logheaza in `data/startup-audit.log` |
| `session-timeout` | la fiecare 15 min | marcheaza sesiunile >2h fara activitate ca abandonate, scrie recovery flag pentru sesiunea urmatoare |
| `learnings-review` | luni 09:00 | scaneaza `learnings.md`, gaseste skills cu >=3 actions neresolved in 30 zile, produce raport in `context/learnings/_review-YYYY-WW.md` |

**Toate sunt deterministe** (bypass Claude, 0 cost token). Ruleaza in scheduler-ul in-process din `centre/server.js`.

### Cum adaugi un cron custom

**Via dashboard** (recomandat): tab "Program" la http://localhost:3001/schedule/ → buton Add. Cere prompt + schedule. Comenzile shell directe sunt INTERZISE via API (motiv de securitate).

**Via filesystem** (pentru jobs deterministe care ruleaza scripts): adaugi un JSON in `cron/jobs/<slug>.json`:
```json
{
  "slug": "my-daily-task",
  "name": "My Daily Task",
  "schedule": "0 9 * * *",
  "command": "node scripts/my-script.js",
  "timeout": "60s",
  "enabled": true
}
```
Restart server → migreaza in DB.

### Reguli pentru cron

- ✅ **Default jobs raman activi.** Daca te deranjeaza, dezactiveaza-i din dashboard, NU sterge fisierul JSON (revine la urmatorul restart).
- ✅ **Logs in `cron/logs/<slug>-<runId>.log`** pentru fiecare rulare. Disponibile in dashboard tab Schedule.
- ❌ **Nu modifica `cron/defaults/*.json`** decat daca esti sigur. Acelea sunt versionate cu robOS.

---

## 5. Dashboard — cele 8 tab-uri

Toate la http://localhost:3001 dupa `bash scripts/start.sh`.

| Tab | Cand sa intri | Ce gasesti |
|-----|---------------|-----------|
| **Acasa** | overview rapid | task-uri, activity feed, system health |
| **Task-uri** | Kanban management | backlog/active/review/done |
| **Program** | Cron jobs | jobs active, history, run-now button |
| **Skills** | Browse + run | catalog + instalate, buton "Run now" |
| **Analitice** | Token costs + quality | per-skill breakdown |
| **Fisiere** | Browse context/brand/projects | read-only browser |
| **Sistem** | Operational | Activitate / Audituri / Memorie / Learnings / Conexiuni |
| **Setari** | Env vars + MCP | edit `.env` from UI |

### Sistem tab — sectiuni

- **Activitate** (default open): cross-session activity log. Filtru text + refresh. Cel mai util zilnic.
- **Audituri**: history pentru startup audits, session timeouts, learnings reviews.
- **Memorie**: editor pentru fisierele zilnice. Save creeaza backup automat in `data/memory-backups/`.
- **Learnings**: viewer pentru `context/learnings.md` (read-only).
- **Conexiuni**: testeaza chei API live (Firecrawl, OpenAI, X AI, WhatsApp, Anthropic). Click "Verifica acum".

---

## 6. Bune practici (do's & don'ts)

### Do's

- ✅ **Completeaza brand/* in primele zile** — voice, audience, positioning. Deblocheaza calitatea tuturor skills-urilor de content.
- ✅ **Scrie "audit" saptamanal** — vezi unde scor-ul 4C scade.
- ✅ **Foloseste "level up" cand simti ca repeti aceeasi munca** — robOS gaseste oportunitati de automatizare.
- ✅ **Inchide sesiunile cu "gata"** pentru memoria curata. Lazy e ok ocazional.
- ✅ **Verifica activity log** cand revii dupa 1-2 zile — vezi exact ce ai facut.
- ✅ **Pune `.env` cu chei reale** pentru research-* si brand-voice (auto-scrape) sa functioneze.
- ✅ **Push regulat catre git** — robOS e centrat pe filesystem, git e backup-ul tau.

### Don'ts

- ❌ **Nu edita `skills/_catalog/catalog.json` manual** — foloseste sys-skill-builder sau add-skill.sh.
- ❌ **Nu sterge `data/`** decat daca vrei reset complet (DB + activity log + audit logs + recovery files).
- ❌ **Nu modifica `centre/dist/`** — e build artifact. Se regenereaza din `centre/src/`.
- ❌ **Nu folosi `command` field in cron via API** — refuzat din motive de securitate. Doar din `cron/defaults/` filesystem.
- ❌ **Nu inchide ferestrele de Claude Code mid-task** — pierzi oportunitatea sa pun fixes inainte de close.
- ❌ **Nu scrie credentials in fisiere brand sau memorie** — sunt in plain text. `.env` e gitignored, restul nu.

### Pattern-uri recomandate

**Daily rhythm:**
```
Dimineata:   "plan de zi"
Pe parcurs:  task-urile zilei
Seara:       "gata"
```

**Weekly rhythm:**
```
Luni:        "plan saptamanal" + "audit" (verifici scor 4C)
Joi/Vineri:  "level up" (opportunity hunting)
Duminica:    review learnings.md (ce s-a inregistrat in saptamana)
```

**Cand revii dupa pauza:**
```
"ce am ramas neterminat?"  → robOS listeaza open threads
"ce am facut saptamana trecuta?" → robOS citeste activity log + memoria
```

---

## 7. Troubleshooting

### "Hook-ul nu se vede ca ruleaza"

Hook-ul `UserPromptSubmit` injecteaza context **invizibil** modelului — nu apare in UI. Verifica deterministic:

```bash
ls data/session-state/
```

Dupa primul prompt al sesiunii noi, ar trebui sa apara un fisier nou cu UUID-ul session_id.

Daca nu apare:
1. Verifica `cat .claude/settings.json` — trebuie sa aiba sectiunea hooks
2. Verifica `cat .command-centre/server.log | tail -30` — vezi daca scheduler-ul a pornit corect
3. Restart Claude Code (Ctrl+Shift+P → Developer: Reload Window)

### "Server-ul nu porneste"

```bash
bash scripts/stop.sh
cat .command-centre/server.log | tail -50
bash scripts/start.sh
```

Cauze comune:
- Port 3001 ocupat → `PORT=3002 bash scripts/start.sh`
- DB migration esuata → sterge `data/robos.db` (loss: cron jobs configurati manual; defaults raman)
- Node version <20 → `node --version`

### "Memoria zilei nu se actualizeaza"

Memoria se scrie EXPLICIT, nu automat. Daca sesiunea s-a inchis fara "gata", memoria ramane in starea ultimei mele scrieri. Activity log captureaza tot, dar memoria zilei nu agrega automat.

**Solutie:** scrie "salveaza in memorie ce am facut" in timpul sesiunii. Eu agrega din activity log si scriu.

### "Activity log e gol"

```bash
ls data/activity-log.ndjson
```

Cauze:
- Stop hook nu se executa → verifica `.claude/settings.json` are sectiunea Stop
- Path-ul transcript-ului nu match-eaza → verifica `~/.claude/projects/` are un director care contine "robos" in nume

### "Skill-ul gresit se trigger-eaza"

Adauga negative_trigger in SKILL.md:
```yaml
negative_triggers:
  - "fraza care matcheaza fals"
```
Apoi: `node scripts/rebuild-index.js`.

### "Connection health zice 'unset' pentru toate"

Normal pentru instalare proaspata. Adauga chei in `.env`:
```bash
FIRECRAWL_API_KEY=fc-...
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```
Restart server. Click "Verifica acum" in tab Conexiuni.

---

## 8. Cand sa NU folosesti robOS

robOS e potrivit pentru:
- Operator solo cu workflow zilnic content/research/automation
- Nevoia de memorie persistenta intre sesiuni Claude Code
- Multi-client cu workspace-uri izolate (clients/)
- Cron jobs care ruleaza Claude in background

robOS NU e potrivit pentru:
- **Echipe**: nu are auth, nu sincronizeaza intre useri (foloseste git push/pull manual)
- **Productie cu uptime SLA**: e local-first, fara HA, fara monitoring
- **One-shot tasks fara persistenta**: overhead-ul nu se merita
- **Anonim / GDPR sensitive**: tot e in plain text pe disk, plus chei API

---

## 9. Cum extinzi robOS

### Adaugi un skill nou

```
Spui: "creeaza un skill care face X"
→ sys-skill-builder te ghideaza prin frontmatter + structura + validare
→ rezultat: skills/<name>/SKILL.md + catalog updated + index regenerat
```

### Adaugi un cron job

```
Dashboard tab Program → Add
SAU
cron/jobs/<slug>.json + restart server
```

### Adaugi un brand pentru un client nou

```bash
bash scripts/add-client.sh acme-corp "Acme Corp"
cd clients/acme-corp && claude
```

Apoi rulezi sys-onboard scoped la client.

### Adaugi un hook custom

Editeaza `.claude/settings.json`. Atentie: hooks ruleaza la fiecare event, fa-le rapide (<5s) si non-blocking. Vezi exemplele din `scripts/hook-user-prompt.js`.

---

## 10. Glosar rapid

| Termen | Ce e |
|--------|------|
| **Hook** | Script care ruleaza la un eveniment Claude Code (UserPromptSubmit, Stop) |
| **Skill** | Unitate de comportament reutilizabila in `skills/<name>/SKILL.md` |
| **Trigger** | Fraza in limbaj natural care activeaza un skill |
| **Negative trigger** | Fraza care EXCLUDE skill-ul de la match |
| **STARTUP CONTEXT** | Bundle injectat la primul prompt al sesiunii (memoria + activity + reguli) |
| **Activity log** | NDJSON in `data/activity-log.ndjson`, alimentat de Stop hook |
| **Recovery flag** | Fisier in `data/session-recovery/` care marcheaza sesiuni abandonate |
| **Cron defaults** | Jobs livrate cu robOS in `cron/defaults/` (in git) |
| **Cron user jobs** | Jobs create local in `cron/jobs/` (gitignored) |
| **Dashboard** | http://localhost:3001 — Centre app, server in `centre/server.js` |
| **Memorie zilei** | `context/memory/YYYY-MM-DD.md`, scrisa de robOS la milestones |

---

## 11. Cand intervii in cod

robOS e build-at sa nu trebuiasca sa intervii in cod. Dar daca vrei:

- **Personalizeaza prompt-uri skill**: `skills/<name>/SKILL.md` — frontmatter + body
- **Modifica reguli sistem**: `CLAUDE.md`, `AGENTS.md` (project-level)
- **Modifica scheduler**: `centre/lib/cron-scheduler.js` + `cron-runner.js`
- **Modifica hooks**: `scripts/hook-user-prompt.js`, `scripts/checkpoint-reminder.js`, `scripts/activity-capture.js`

Dupa orice schimbare in cod:
```bash
# Daca ai modificat skills:
node scripts/rebuild-index.js

# Daca ai modificat dashboard (centre/src):
cd centre && npm run build

# Daca ai modificat scheduler / API:
bash scripts/stop.sh && bash scripts/start.sh

# Daca ai modificat .claude/settings.json:
# Restart Claude Code window (Ctrl+Shift+P → Developer: Reload Window)
```

---

## Suport si feedback

robOS e in alpha. Cand ceva nu merge:
1. **Citeste `.command-centre/server.log`** — primul loc de cautat
2. **Verifica `data/audit-log.ndjson`** — track record cron jobs
3. **Verifica `data/activity-log.ndjson`** — ce s-a intamplat ultimele turn-uri
4. **Foloseste github issues** — daca e bug reproductibil, deschide issue cu output din log + comanda care a esuat

robOS evolueaza prin learnings.md — feedback-ul pe care-l dai la sys-session-close se acumuleaza si se transforma in reguli noi pentru skills. Fii direct in feedback. "Step 3 a fost confuz" e mai util decat "merge".

---

**Versiune handbook:** 1.0
**Acopera robOS:** v0.3.x
**Ultima update:** 2026-05-05
