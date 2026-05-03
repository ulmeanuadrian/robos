# RobOS Cheat Sheet

## Setup & Lifecycle

```bash
./scripts/setup.sh          # First-time setup (Node deps, .env, user profile)
./scripts/start.sh          # Start Command Centre dashboard
./scripts/stop.sh           # Stop Command Centre
./scripts/update.sh         # Pull latest + detect new skills
```

## Skills

```bash
./scripts/list-skills.sh              # Show installed + available skills
./scripts/add-skill.sh <name>         # Install from catalog
./scripts/remove-skill.sh <name>      # Uninstall (with confirmation)
```

In Claude Code, skills are triggered by natural language. Examples:
- "Write a blog post about X" triggers `content-blog-post`
- "Research competitors for X" triggers `research-competitors`
- "Check brand voice on this draft" triggers `brand-voice-check`

## Clients

```bash
./scripts/add-client.sh <slug> ["Display Name"]
# Creates: clients/<slug>/ with brand, context, projects, cron
```

Switch context in Claude Code:
- "Switch to client acme-corp"
- "Work on acme-corp's blog post"

## Cron / Scheduled Jobs

```bash
./scripts/start-crons.sh     # Start the cron daemon
./scripts/stop-crons.sh      # Stop the cron daemon
./scripts/status-crons.sh    # Show all jobs and their last run
```

Job file format (`cron/jobs/<name>.json`):
```json
{
  "name": "daily-blog-post",
  "schedule": "0 9 * * 1-5",
  "skill": "content-blog-post",
  "args": {"topic": "auto"},
  "enabled": true
}
```

## Directory Map

```
.
├── brand/              # Your brand context (voice, audience, etc.)
├── centre/             # Command Centre app (do not edit)
├── clients/            # Per-client workspaces
├── context/
│   ├── SOUL.md         # Agent personality
│   ├── USER.md         # Your profile
│   ├── learnings.md    # Cross-session insights
│   └── memory/         # Daily session journals
├── cron/
│   ├── jobs/           # Scheduled job definitions
│   ├── logs/           # Execution logs
│   └── templates/      # Job templates
├── docs/               # Documentation
├── projects/           # Output from skills
├── scripts/            # Management scripts
├── skills/
│   ├── _catalog/       # Available skills (read-only)
│   └── <skill>/        # Installed skills
├── AGENTS.md           # Shared project rules
├── CLAUDE.md           # Claude Code instructions
└── .env                # API keys (not committed)
```

## Daily Memory

Session journals are auto-created at `context/memory/YYYY-MM-DD.md`.
Each session tracks: Goal, Deliverables, Decisions, Open Threads.

## Context Loading

Skills declare what context they need. Brand files are only loaded when a skill requests them.
This keeps sessions fast and token-efficient.

## Keyboard Shortcuts (Claude Code)

| Shortcut | Action |
|----------|--------|
| `/` | Enter command mode |
| `Esc` | Cancel current operation |
| `Ctrl+C` | Interrupt generation |
| `Up/Down` | Navigate history |

## Tips

- Start sessions with a task, not a greeting -- gets you to output faster
- Fill in `brand/voice.md` first -- it unlocks the most skill improvements
- Use `context/learnings.md` to correct recurring mistakes
- Check `cron/logs/` if a scheduled job didn't produce expected output
