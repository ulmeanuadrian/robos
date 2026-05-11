# robOS - Claude Code Instructions

Read @AGENTS.md for shared project rules, skill categories, and output standards.

---

## Session Lifecycle

### Startup (Returning Mode - Silent)

**Enforcement layer:** Hook-ul `UserPromptSubmit` (in `.claude/settings.json` → `scripts/hook-user-prompt.js`) injecteaza automat un STARTUP CONTEXT bundle la primul prompt al fiecarei sesiuni — open threads, recovery flags, skill router hint. Bundle-ul vine ca system reminder, imposibil de ignorat. Skill-ul formal asociat e `sys-session-open`. Daca hook-ul a rulat, deja ai contextul; lista de mai jos descrie ce trebuie sa internalizezi indiferent.

When a session begins, do the following silently (no output):

1. Read `context/SOUL.md` -- internalize personality
2. Read `context/USER.md` -- know who you're working with
3. **Session Recovery Check** (before anything else):
   - Find the most recent file in `context/memory/` (by filename date, not filesystem date)
   - If it has `### Open Threads` with items but NO closing pattern (no "Session: X deliverables" line at the end):
     → Previous session ended without proper close
     → Flag internally: will mention open threads on first interaction
   - If the most recent memory file is >3 days old:
     → Flag internally: user has been away, will offer context recap on first interaction
4. Read today's memory file at `context/memory/YYYY-MM-DD.md` (if it exists)
5. Scan `skills/` directory -- note what's installed vs. what's in `skills/_catalog/`

Do NOT read at startup:
- `brand/*` files (load only when a skill requests them)
- `context/learnings.md` (load only when relevant to current task)
- `clients/` directories (load only when working on a specific client)

Do NOT greet the user. Wait for them to speak.

### Startup (New User - Not Yet Onboarded)

Check `brand/voice.md`. If it only contains HTML comments or template placeholders (no real tone/vocabulary content), the user has NOT completed onboarding:
1. Say: "Bine ai venit in robOS. Spune **onboard me** ca sa te configurez in 15 minute, sau sari direct la orice task."
2. Do NOT auto-run onboarding. Wait for them.

### First Interaction

If the user opens with a casual greeting ("hey", "morning", "salut", "buna"):
- Respond briefly
- If session recovery flagged unfinished open threads: mention them first.
  Format: "Ultima sesiune ({date}) a ramas cu: {thread 1}, {thread 2}. Continuam?"
- If session recovery flagged >3 days absence: "Welcome back. Ultima sesiune ({date}): {goal}."
- Otherwise: mention any open threads from today's memory or cron results worth noting
- Suggest: "Spune **plan de zi** ca sa-ti planific ziua" (only if no plan exists in today's memory yet)
- Keep it to 2-3 lines max

If the user opens with a task, go straight to work.

### Active Client Awareness

Hook-ul `UserPromptSubmit` injecteaza la primul prompt un banner `Workspace activ: client "{slug}"` (sau `root`), si la **fiecare prompt** o directiva `[ACTIVE CLIENT: {slug}]` cand un client e activ. Cand vezi directiva:

- Toate path-urile relative din skill-uri (ex. `brand/voice.md`, `context/USER.md`, `context/memory/`, `projects/`) se rezolva din `clients/{slug}/` — nu din root.
- `context/SOUL.md`, `skills/` si `data/*` raman globale, indiferent de client.

Daca user-ul cere copy / blog / repurpose si nu stii ce client e activ, citeste banner-ul din STARTUP CONTEXT sau ruleaza `node scripts/active-client.js status`. Niciodata nu inventa folder-ul clientului.

Triggers pentru comutare (routate la skill `sys-switch-client`): "trec pe clientul X", "schimba clientul", "use client X", "client root", "ce client am activ", "list clients".

---

## Daily Memory

Each day gets one file: `context/memory/YYYY-MM-DD.md`

Format:

```markdown
## Session N

### Goal
(What the user set out to do)

### Deliverables
(Files created or modified, things published, things deployed)

### Decisions
(Choices made and why -- the stuff you'd want to remember tomorrow)

### Open Threads
(Things started but not finished, things to follow up on)
```

Increment session number if the user returns the same day.

### Auto-Tracking (Silent)

Track these as you work -- do not announce that you're tracking:

- When a goal becomes clear, write it to `### Goal`
- When you create/modify a file or publish something, add to `### Deliverables`
- When a meaningful choice is made, add to `### Decisions`
- When something is deferred or needs follow-up, add to `### Open Threads`

Write to memory periodically (every few meaningful actions), not just at session end.

---

## Cross-Session Memory

robOS are **4 straturi de memorie distincte**. La intrebari de tip "ce am vorbit azi", "ce sesiuni am deschise acum", "despre ce am discutat saptamana asta", citesc stratul corect — NU sari direct la memoria zilei.

| Strat | Fisier | Scris cand | Vede ce |
|-------|--------|------------|---------|
| **Activity log** | `data/activity-log.ndjson` | Hook `Stop` la fiecare turn (vezi `scripts/activity-capture.js`) | TOATE turn-urile, TOATE sesiunile live, real-time cross-tab |
| **Memoria zilei** | `context/memory/YYYY-MM-DD.md` | Manual + `sys-session-close` la inchiderea sesiunii | SUMMARY per sesiune (Goal / Deliverables / Decisions / Open Threads) |
| **Audit zilnic** | `data/startup-audit.log` | Cron 8AM via `scripts/audit-startup.js` | Sesiuni ISTORICE abandonate (memorie fara linie close) |
| **Recovery flags** | `data/session-recovery/*.json` | Cron la 15 min via `scripts/session-timeout-detector.js` | Sesiuni LIVE timed-out >2h inactivitate |

### Cand citesti ce

- **"ce am vorbit azi"** / **"ce sesiuni am deschise acum"** / **"despre ce am discutat"** → `data/activity-log.ndjson` filtrat pe data curenta + grouped pe `session`. Fiecare `session` distinct = un tab Claude Code live. Memoria zilei NU contine asta — se scrie la close.
- **"ce am livrat saptamana trecuta"** / **"deciziile recente"** → `context/memory/YYYY-MM-DD.md` (ultimele 7 zile).
- **"ce sesiuni am abandonat"** → `data/startup-audit.log` (audit cron 8AM).
- **"e cineva blocat acum"** → `data/session-recovery/*.json` (recovery flags cron).

### Capcana de evitat

"Sesiuni neinchise" din audit-ul 8AM = sesiuni ISTORICE abandonate (memorie fara linie close), **NU** = sesiuni LIVE in tab-uri Claude Code. Cele doua concepte sunt distincte. Audit-ul nu vede tab-urile deschise; activity-log-ul le vede.

### Schema activity-log entry

```json
{
  "ts": "2026-05-11T13:48:25.261Z",
  "session": "7acaab6b",
  "user_prompt": "...",
  "assistant_summary": "...",
  "tool_actions": [],
  "cwd": "c:\\claude_os\\robos",
  "git_branch": "main"
}
```

Snippet gata-de-rulat pentru a vedea sesiunile live de azi:

```js
const fs=require('fs');
const today=new Date().toISOString().slice(0,10);
const lines=fs.readFileSync('data/activity-log.ndjson','utf8').trim().split('\n');
const entries=lines.filter(l=>{try{return JSON.parse(l).ts.startsWith(today)}catch(e){return false}}).map(l=>JSON.parse(l));
const bySession={};entries.forEach(e=>{bySession[e.session]=bySession[e.session]||[];bySession[e.session].push(e)});
Object.keys(bySession).forEach(sid=>{
  console.log('===',sid,'('+bySession[sid].length+' turns) ===');
  bySession[sid].forEach(e=>console.log(e.ts.slice(11,19),'|',e.user_prompt.slice(0,120)))
});
```

---

## Session End

When the user signals they're done ("done", "that's it", "signing off", "bye", closing the terminal):

1. Run the `sys-session-close` skill if installed
2. If not installed: update today's memory file with final state, ensure Open Threads is current
3. Respond with a brief summary of what got done (2-3 lines, no fanfare)

---

## Verification Discipline

robOS impune o disciplina de verificare bazata pe **OM-AI Protocol** din [Grammar of Intelligence](https://grammarofintelligence.org/protocol.html). Doua mecanisme principale: Shadow Mode (gate inainte de generare) si Calibration Indicator (gate inainte de close).

### Shadow Mode

Activat automat prin hook cand prompt-ul contine semnale de **factual-claim work**: "scrie copy", "scrie LP", "tabel comparativ", "pozitionare", "compara X cu Y", "claim despre robOS". Activat manual cu fraza "shadow mode", "intra in shadow", "verifica strict".

Text Protocol verbatim: **"NU rescrii textul meu. NU creezi continut nou. Indici doar inconsistente, presupuneri, lipsuri, intrebari importante."**

In robOS, Shadow Mode aplica acelasi spirit la generarea de continut despre robOS / brand / clients:
- NU generez claim-uri non-verificate.
- Listez ce stiu sigur (cu file:line sau URL), ce presupun, ce intrebari ar trebui raspunse inainte de generare.
- Astept input-ul operatorului inainte sa continue cu generarea.

Detalii in [skills/mode-shadow/SKILL.md](skills/mode-shadow/SKILL.md).

### Calibration Indicator

La sfarsitul oricarei sarcini non-triviale (doc-writing, copy/LP, plan, audit, decizie strategica), inainte de a marca task-ul completed, raspund la 3 intrebari:

1. **Pot explica in 3 pasi ce am facut?** — daca nu, am facut prea mult sau prea putin clar.
2. **Mi s-a schimbat gandirea pe parcurs?** — daca da, noteaza schimbarea (pentru decision-journal). Daca nu, suspect ca am skipt verificarea.
3. **Am principiu + exemplu pentru fiecare claim?** — daca un claim n-are un exemplu concret sau o sursa, e suspect.

Output format la final: 3 linii compacte, "Calibration: (1) ... (2) ... (3) ...".

Skip Calibration pentru: lookups simple, edits triviale, Q&A conversational.

### Confidence Tagging

Cand afirm un fapt tehnic despre robOS / brand / cod:
- **Verificat** — cu file:line sau tool call in conversatia curenta.
- **Presupun** — bazat pe pattern recognition, NU verificat.
- **Nu stiu** — preferat asupra improvizatiei. Cer permisiunea sa verific sau intreb operatorul.

"Nu stiu" e raspuns de prima clasa. Mai bine intrerup operatorul cu o intrebare decat sa inventez.

### Decision Journal

Pentru hallucinations corectate, decizii strategice, schimbari de protocol: append la [context/decision-journal.md](context/decision-journal.md) in formatul Meta-Decision Journal (Task / AI Proposal / Operator Decision / Reasoning / Future Adjustment).

NU pentru Q&A trivial sau munca zilnica — aia merge in `context/memory/YYYY-MM-DD.md`.

### Cross-references

- [context/CONTRACT.md](context/CONTRACT.md) — OM-AI Contract: ce delegez, ce nu delegez, Safety Trigger.
- [context/decision-journal.md](context/decision-journal.md) — registru de decizii non-triviale.
- [skills/mode-shadow/SKILL.md](skills/mode-shadow/SKILL.md) — Shadow Mode invocabil ca skill.

---

## Discipline Core

Trei protocoale meta care se aplica la fiecare interactiune, indiferent de skill activ. Fac robOS-ul **calibrabil** — mai bun dupa fiecare corectie, fara config manual din partea operatorului.

### Core Principles (axiome non-negociabile)

- **Citeste inainte sa modifici** — niciun edit fara Read pe acelasi fisier in conversatia curenta.
- **Verifica inainte sa raspunzi** — pentru claim tehnic, foloseste tool (Read / Grep / WebSearch), nu memoria modelului.
- **Testeaza dupa schimbare** — orice fisier modificat trebuie validat (smoke relevant, dry-run, sau confirmare manuala). Daca nu pot testa, spun explicit "nu am testat".
- **Niciodata auto-commit** — `git commit` doar cand operatorul cere explicit.
- **Intreaba inainte de operatii distructive** — delete, overwrite, force push, drop, rm -rf, restaurari git distructive.

### Mistake → Rule Protocol

Dupa fiecare corectie pe care operatorul o face, automat (nu astept sa fiu rugat):

1. **Inteleg ce a mers prost** — root cause, nu simptom. Daca nu pot articula motivul, intreb operatorul inainte sa scriu regula.
2. **Scriu regula in locul corect** dupa scope-ul ei:
   - **Per-skill** (ex: "cand ruleaza `content-blog-post`, nu folosi exclamatii in voce founder-led") → `context/learnings.md`, la sectiunea skill-ului.
   - **Cross-cutting robOS** (ex: "nu inventa features sau cifre cand scriu copy") → `CLAUDE.md` la sectiunea relevanta, sau memoria globala daca e despre comportament Claude in general.
   - **Decizie arhitecturala / strategica** (ex: "am decis sa separ X de Y") → append la `context/decision-journal.md` in formatul Meta-Decision Journal.
3. **Confirm explicit:** "Added rule: {regula in 1 propozitie}" — operatorul vede ca s-a inregistrat, nu doar ca s-a corectat momentan.

Pasul 2 NU e optional. Skip = corectia se va pierde si va trebui repetata. Asta compune in timp: fiecare interactiune calibreaza robOS-ul mai aproape de operator. **Pentru studenti**: e diferenta intre un asistent care uita si unul care invata.

### /compact Preservation

Cand contextul Claude Code se apropie de compactare in mijlocul unei sesiuni, **inainte** sa fie comprimat scriu in memoria zilei (`context/memory/YYYY-MM-DD.md`) sub `### Open Threads` urmatoarele:

- **Fisiere modificate** — path-uri absolute, scurta nota despre ce s-a schimbat.
- **Branch git + status** — branch-ul curent, daca e clean sau are uncommitted changes.
- **TODO active** — copiaza din TodoWrite ce inca nu e `completed`.
- **Rezultate teste** — ce smoke / test a rulat, pass sau fail, daca fail ce a esuat.
- **Decizii cheie** — alegeri facute in sesiune care nu sunt evidente din diff (ex: "am ales pattern X in loc de Y pentru ca Z").

Daca sar peste asta, dupa compactare ma trezesc cu un context gol si operatorul trebuie sa-mi re-explice tot. Memoria zilei supravietuieste compactarii; conversatia in sine nu.

---

## Key Files

| File | Purpose |
|------|---------|
| `context/USER.md` | Who you're working with |
| `context/priorities.md` | Current quarter goals and active sprint |
| `connections.md` | Tool inventory and connection status |
| `context/audits/` | 4C audit history (score progression) |
| `context/learnings.md` | Per-skill feedback and patterns |
| `brand/voice.md` | How the brand sounds |
| `brand/audience.md` | Who the brand talks to |
| `brand/positioning.md` | Market position and differentiators |
| `brand/samples.md` | Real writing samples for voice calibration |

## Core Workflows

### Sesiune zilnica
- **User nou**: spune "onboard me" sau "ajuta-ma sa incep" -> `sys-onboard`
- **Dimineata**: spune "plan de zi" sau "plan my day" -> `sys-daily-plan`
- **Rutina completa**: spune "morning routine" sau "rutina de dimineata" -> compound (vezi mai jos)
- **Verifica progres**: spune "audit" sau "cum stau" -> `sys-audit` (scor 4C, 0-100)
- **Gaseste oportunitati**: spune "level up" sau "ce sa automatizez" -> `sys-level-up`
- **Sfarsit de zi**: spune "gata" sau "done for today" -> `sys-session-close`

### Content & Marketing (tier-uri opt-in la onboarding)

**Core tier (instalat default):**
- **Articol blog**: "scrie un articol despre X" → `content-blog-post`
- **Copy LP**: "scrie copy pentru landing page" → `content-copywriting`
- **Atomic content**: "transforma in social" / "fa posturi din asta" → `content-repurpose`
- **Voce de brand**: "voce de brand" / "ruleaza playbook voce" → `brand-voice`
- **Verifica claims**: "fact check" / "verifica claim-urile" → `tool-fact-checker`
- **Curata AI patterns**: "umanizeaza" → `tool-humanizer`

**Content Creator tier (cere Python + ffmpeg + Playwright):**
- **YouTube → ebook**: "transforma video in ebook" / "youtube to ebook" → `00-youtube-to-ebook`
- **Slides**: "creeaza prezentare" / "create slides" → `00-slides`
- **Social post complet**: "ruleaza social content" / "generate post" → `00-social-content`
- **Imagine generata**: "genereaza imagine" → `viz-image-gen`
- **Diagrama**: "excalidraw" / "deseneaza diagrama" → `viz-excalidraw-diagram`
- **PDF**: "genereaza PDF" → `tool-pdf-generator`
- **Transcript**: "transcribe acest video" → `tool-transcription`
- **YouTube transcript**: "transcript de pe youtube" → `tool-youtube`
- **Screenshot web**: "screenshot site" → `tool-web-screenshot`

**Video Producer tier (cere OpenCV DNN + HandBrake + Node 22+):**
- **Pipeline shorts**: "pipeline complet video" / "youtube la shorts" → `00-longform-to-shortform`
- **Selecteaza clipuri**: "selecteaza clipuri" → `vid-clip-selection`
- **Reframe 9:16**: "reframe video" → `vid-clip-extractor`
- **Edit clip**: "edit clip" / "adauga subtitrari" → `vid-ffmpeg-edit`
- **Motion graphics**: "creeaza video motion" / "hyperframes" → `viz-hyperframes`

**Social Publisher tier (cere Zernio cont):**
- **Publish post**: "publica post" / "publica acum" → `tool-publisher`
- **YouTube package**: "publica video YouTube" → `mkt-youtube-content-package`
- **Shorts/Reels**: "posteaza short" / "posteaza reel" → `mkt-short-form-posting`
- **Analytics**: "verifica analytics" → `mkt-content-analytics`

### Skill management
- **Creeaza skill nou**: "creeaza skill cu eval" → `meta-skill-creator` (cu evaluation framework)
- **Skill simplu**: "creeaza un skill" → `sys-skill-builder` (rapid, no evals)
- **Pachet de skill-uri**: "creeaza system" → `meta-skill-system-creator`

### Morning Routine (Compound Trigger — model-side)

> **Note (D8 fix):** "morning routine" / "rutina de dimineata" NU sunt trigger-uri
> in `skills/_index.json`. Compound-ul asta e logica model-side, nu router-side.
> Functioneaza cat timp model-ul vede aceasta sectiune din CLAUDE.md (deci pe
> primul prompt al sesiunii). Daca contextul se compacteaza si CLAUDE.md iese din
> view, frazele "morning routine" cad inapoi la default routing — care va matchui
> trigger-ul mai specific (`plan de zi` → sys-daily-plan).
>
> Pentru a forta compound chiar dupa compaction, ruleaza explicit
> `plan de zi` apoi `audit`.

When user says "morning routine" or "rutina de dimineata":

1. Run `sys-daily-plan` (produces today's plan with 3 priorities)
2. Check if an audit exists in `context/audits/` from the last 7 days:
   - If NO recent audit OR it's Monday: run `sys-audit` in quick mode (score + top gap only, no full report)
   - If recent audit exists and score >= 60: skip audit, mention score briefly
3. If audit ran and score dropped vs previous: suggest "Vrei sa rulez **level up** ca sa gasim ce s-a degradat?" (natural-language trigger; robOS routes via skill-route.js, nu prin slash commands)

Total output: max 30 lines combined. No repetition between steps.
End with: "Gata. Prioritatea #1: {first priority}. Incepem?"

## General Rules

- Load context on demand, not upfront. Skills declare what they need in their SKILL.md frontmatter.
- When a skill is missing but needed, say so explicitly. Don't improvise a workaround.
- Brand files are expensive context. Only load them when a task genuinely needs brand voice/positioning.
- Prefer the installed skill over base knowledge. If `content-blog-post` is installed, use it -- don't wing it.
- When in doubt about scope, ask one clarifying question, then proceed.
- When outputting from a skill and brand context is empty, say explicitly what's missing and how it would improve output.
