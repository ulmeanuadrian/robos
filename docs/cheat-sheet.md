# robOS — Ghid rapid

## Pornire si oprire

| Comanda | Ce face |
|---|---|
| `bash scripts/robos` (Mac/Linux) | Setup + dashboard + browser, intr-un singur pas |
| `scripts\robos.cmd` (Windows) | Idem |
| `node scripts/robos.js` | Universal |
| `node scripts/robos.js --status` | Diagnostic complet |
| `node scripts/robos.js --stop` | Opreste dashboard graceful |
| `node scripts/robos.js --no-browser` | Pornire fara browser auto-deschis |
| `node scripts/robos.js --clean` | Sterge `centre/dist/` si rebuild |
| `node scripts/robos.js --install-shortcut` | Adauga `robos` la PATH/profile |
| `node scripts/update.js` | Update in-place de la server |

## Skills — comenzi gestiune

```bash
bash scripts/list-skills.sh           # instalate + disponibile in catalog
bash scripts/add-skill.sh <name>      # instaleaza din catalog
bash scripts/remove-skill.sh <name>   # dezinstaleaza (cu confirmare)
node scripts/rebuild-index.js         # regenereaza skills/_index.json manual
```

22 skills out-of-the-box, 206 trigger-uri. Activate prin limbaj natural:

| Spune... | Skill |
|---|---|
| "onboard me" / "ajuta-ma sa incep" | `sys-onboard` |
| "plan de zi" / "morning routine" | `sys-daily-plan` |
| "audit" / "cum stau" | `sys-audit` (scor 4C, 0-100) |
| "level up" / "ce sa automatizez" | `sys-level-up` |
| "scrie un articol despre X" | `content-blog-post` |
| "scrie copy pentru landing" | `content-copywriting` |
| "fa posturi din asta" | `content-repurpose` |
| "voce de brand" / "ton brand" | `brand-voice` |
| "cui ii vand" / "icp" | `brand-audience` |
| "pozitionare" / "diferentiere" | `brand-positioning` |
| "umanizeaza textul" | `tool-humanizer` |
| "competitor research" | `research-competitors` |
| "ce e trend in X" | `research-trending` |
| "noteaza asta" / "tine minte" | `sys-capture-note` |
| "ai mai notat despre X" | `sys-recall` |
| "creeaza un skill" | `sys-skill-builder` |
| "shadow mode" / "verifica strict" | `mode-shadow` |
| "facilitator mode" | `mode-facilitator` |
| "anti-dependence" / "ce as face eu" | `mode-anti-dependence` |
| "gata" / "done" / "pa" | `sys-session-close` |

## Clienti

```bash
bash scripts/add-client.sh <slug> ["Nume Afisat"]
# Creeaza: clients/<slug>/ cu brand, context, projects, cron izolate
cd clients/<slug> && claude
```

## Cron / joburi programate

Scheduler-ul ruleaza **in-process in dashboard** (in centre/server.js). Cand `robos` porneste, cron porneste cu el. Sursa de adevar: tabela SQLite `cron_jobs`.

```bash
# Vezi joburi + ultima rulare
node scripts/robos.js --status     # sumar
# Sau dashboard tab Schedule la http://localhost:3001/schedule/
```

3 default jobs livrate:
- `audit-startup` — zilnic 08:00, scaneaza memorie ultimele 7 zile
- `session-timeout-detector` — la 15 min, marcheaza sesiuni abandonate
- `learnings-aggregator` — luni 09:00, review pattern-uri din learnings.md

Adauga job custom: dashboard tab Schedule → buton "+ Job nou", sau JSON in `cron/jobs/<slug>.json`:
```json
{
  "name": "daily-blog-post",
  "schedule": "0 9 * * 1-5",
  "skill": "content-blog-post",
  "args": {"topic": "auto"},
  "enabled": true
}
```

**Leader lock**: doar un proces scheduleaza la un moment dat. `[SILENT]` token in output → notification suprimata.

## Structura directorului

```
.
├── brand/              # Context de brand (voce, audienta, pozitionare, samples)
├── centre/             # Dashboard (Astro + Svelte) — nu edita manual
├── clients/            # Workspace-uri per client
├── context/
│   ├── SOUL.md         # Personalitate agent
│   ├── USER.md         # Profilul tau
│   ├── CONTRACT.md     # OM-AI Contract (delegare)
│   ├── priorities.md   # Prioritati trimestru
│   ├── learnings.md    # Feedback per-skill
│   ├── audits/         # Istoric scoruri 4C
│   ├── memory/         # Jurnale zilnice (YYYY-MM-DD.md)
│   └── notes/          # Second brain (markdown + SQLite FTS5)
├── connections.md      # Inventar tool-uri conectate
├── cron/
│   ├── defaults/       # Joburi standard livrate
│   ├── jobs/           # Joburi custom
│   ├── logs/           # Loguri executie
│   └── status/         # PID daemon, status fisiere
├── data/               # SQLite + cache + telemetry + state files
├── projects/           # Output din skills
├── scripts/            # Setup, robos, update, management skills + clients
├── skills/
│   ├── _index.json     # Generated: registry single-source-of-truth
│   ├── _catalog/       # Skills disponibile + starter packs brand
│   └── <skill>/        # Skills instalate
├── AGENTS.md           # Reguli partajate (limba, output, categorii)
├── CLAUDE.md           # Instructiuni Claude Code (lifecycle sesiune)
└── .env                # API keys (gitignored, niciodata in repo)
```

## Fluxul zilnic

1. **Dimineata**: scrii "plan de zi" → 3 prioritati construite din memorie + audit recent
2. **Lucrezi**: skills se activeaza automat la triggers. Dashboard la `localhost:3001`.
3. **Seara**: scrii "gata" / "done" → `sys-session-close` salveaza memoria curat
4. **Saptamanal**: "audit" → vezi unde scor-ul 4C scade

## Memory & second brain

- Jurnalele zilnice: `context/memory/YYYY-MM-DD.md` (Goal/Deliverables/Decisions/Open Threads)
- Note atomice: `context/notes/YYYY/MM/{id}-{slug}.md` + SQLite FTS5 index
- Activity log cross-session: `data/activity-log.ndjson` (rotation 500)

## Tips

- Incepe cu "onboard me" daca e prima data — te configureaza in 15 min cu 5 intrebari
- Completeaza `brand/voice.md` prima — deblocheaza calitatea tuturor skills content-*
- Ruleaza "audit" saptamanal — tracking scor 4C
- Foloseste `context/learnings.md` pentru corectie pattern recurent
- `robos --install-shortcut` o data si poti lansa `robos` din orice director

## Troubleshooting

```bash
node scripts/robos.js --status              # diagnostic complet (PID, port, version, etc.)
cat .command-centre/server.log              # log dashboard
cat data/hook-errors.ndjson                 # erori hook-uri (rotated 500)
sqlite3 data/robos.db "SELECT * FROM schema_version"  # verifica migrari aplicate
```

Pentru probleme specifice, vezi `docs/operator-handbook.md` sectiunea Troubleshooting sau scrie la adrian@robos.vip.
