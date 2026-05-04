# robOS - Ghid rapid

## Setup si pornire

```bash
./scripts/setup.sh          # Prima configurare (Node deps, .env, profil)
./scripts/start.sh          # Porneste dashboard-ul
./scripts/stop.sh           # Opreste dashboard-ul
./scripts/update.sh         # Actualizeaza + detecteaza skills noi
```

## Skills

```bash
./scripts/list-skills.sh              # Arata skills instalate + disponibile
./scripts/add-skill.sh <name>         # Instaleaza din catalog
./scripts/remove-skill.sh <name>      # Dezinstaleaza (cu confirmare)
```

Skills se activeaza prin limbaj natural. Exemple:
- "onboard me" sau "ajuta-ma sa incep" -> `sys-onboard`
- "plan de zi" sau "plan my day" -> `sys-daily-plan`
- "audit" sau "cum stau" -> `sys-audit`
- "level up" sau "ce sa automatizez" -> `sys-level-up`
- "write a blog post about X" -> `content-blog-post`
- "research competitors for X" -> `research-competitors`
- "humanize this" -> `tool-humanizer`

## Clienti

```bash
./scripts/add-client.sh <slug> ["Nume Afisat"]
# Creeaza: clients/<slug>/ cu brand, context, projects, cron
```

## Cron / Joburi programate

```bash
./scripts/start-crons.sh     # Porneste daemonul cron
./scripts/stop-crons.sh      # Opreste daemonul
./scripts/status-crons.sh    # Arata joburile si ultimele rulari
```

Format fisier job (`cron/jobs/<name>.json`):
```json
{
  "name": "daily-blog-post",
  "schedule": "0 9 * * 1-5",
  "skill": "content-blog-post",
  "args": {"topic": "auto"},
  "enabled": true
}
```

## Structura directorului

```
.
├── brand/              # Context de brand (voce, audienta, pozitionare)
├── centre/             # Dashboard (nu edita manual)
├── clients/            # Workspace-uri per client
├── context/
│   ├── SOUL.md         # Personalitate agent
│   ├── USER.md         # Profilul tau
│   ├── priorities.md   # Prioritati curent trimestru
│   ├── learnings.md    # Feedback per-skill
│   ├── audits/         # Istoric scoruri 4C
│   └── memory/         # Jurnale zilnice
├── connections.md      # Inventar tool-uri conectate
├── cron/
│   ├── jobs/           # Definitii joburi programate
│   └── logs/           # Loguri de executie
├── projects/           # Output din skills
├── scripts/            # Scripturi de management
├── skills/
│   ├── _catalog/       # Skills disponibile (catalog + starter packs)
│   └── <skill>/        # Skills instalate
├── AGENTS.md           # Reguli partajate
├── CLAUDE.md           # Instructiuni Claude Code
└── .env                # API keys (nu se comit)
```

## Fluxul zilnic

1. Dimineata: "plan de zi" -> planifica pe baza memoriei si prioritatilor
2. Lucreaza in Claude Code -> skills se activeaza automat
3. Seara: "gata" -> `sys-session-close` salveaza memoria
4. Saptamanal: "audit" -> verifica scor 4C si progres

## Memory

Jurnalele se creeaza automat la `context/memory/YYYY-MM-DD.md`.
Fiecare sesiune urmareste: Goal, Deliverables, Decisions, Open Threads.

## Tips

- Incepe cu "onboard me" daca e prima data -- te configureaza in 15 min
- Completeaza `brand/voice.md` prima -- deblocheaza calitatea tuturor skills
- Ruleaza "audit" regulat ca sa vezi ce mai ai de imbunatatit
- Foloseste `context/learnings.md` ca sa corectezi greseli recurente
