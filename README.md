# robOS

Turn Claude Code into your agentic operating system.

robOS gives Claude Code persistent brand memory, proven skill methodologies, scheduled automation, and a visual command centre. It works like a business partner that knows your voice, your audience, and your workflow -- from day one.

---

## Quickstart

```bash
git clone https://<TOKEN>@github.com/your-org/robos.git
cd robos
bash scripts/setup.sh
bash scripts/start.sh
```

Setup checks your system, installs dependencies (~30 seconds), and asks two questions: your name and your business. Then open `http://localhost:3000` -- you're ready.

On first launch, the dashboard detects you're new and walks you through building your brand foundation: voice, audience, and positioning.

---

## What You Get

### 1. Brand Memory That Follows You Everywhere

Claude Projects work on claude.ai only. robOS brand context works across every Claude surface -- CLI, VS Code, Desktop, Web. Your voice profile, audience, and positioning load automatically in every session.

### 2. Proven Skill Methodologies

Claude Code has skill infrastructure. robOS fills it with tested processes. The copywriting skill doesn't just "write copy" -- it follows a framework, loads your brand voice, scores output on 7 dimensions, and strips AI patterns automatically.

**6 core skills included:**

| Skill | What it does |
|-------|-------------|
| `brand-voice` | Extract or build your brand voice (4 modes: import, extract, build, auto-scrape) |
| `brand-audience` | Define your ideal customer through interview or research |
| `brand-positioning` | Find the angle that makes your offer stand out |
| `sys-skill-builder` | Create custom skills for your business |
| `sys-session-close` | End-of-session memory capture and feedback logging |
| `sys-goal-breakdown` | Break goals into actionable tasks across 3 complexity levels |

**15 optional skills** available in the catalog (copywriting, SEO, content repurposing, trending research, humanizer, and more).

### 3. Per-Skill Learning

Feedback accumulates per skill, not in a generic blob. Corrections to your copywriting output don't pollute your SEO skill. After 30 days, each skill is measurably better than day one.

### 4. Visual Command Centre

A lightweight dashboard (Astro + Svelte, < 80KB JS) that shows you everything at a glance:

| Tab | What it shows |
|-----|---------------|
| **Home** | Active tasks, review queue, recent activity, system health |
| **Tasks** | Kanban board (Backlog, Active, Review, Done) with slide-out details |
| **Schedule** | Cron jobs with run history, cost per run, pause/resume |
| **Skills** | Installed skills + catalog of available ones |
| **Files** | Browse context/, brand/, projects/ -- read any file |
| **Settings** | Environment variables, MCP config, Claude settings |

Cold start: under 300ms. No dev server -- production-built static assets.

### 5. Scheduled Automation

Define jobs as markdown files in `cron/jobs/`. The managed scheduler runs them headlessly via `claude -p` and tracks results in the dashboard.

```markdown
---
name: Daily Research
schedule: "09:00"
days: weekdays
model: sonnet
active: true
---

Research trending topics in AI automation for the last 24 hours.
Save output to: projects/research-trending/{today}_daily.md
```

Manage from the dashboard or CLI:
```bash
bash scripts/start-crons.sh    # start the scheduler
bash scripts/status-crons.sh   # check what's running
bash scripts/stop-crons.sh     # stop scheduling
```

### 6. Multiple Clients

Each client gets isolated brand context, memory, projects, and scheduled jobs. Zero cross-contamination.

```bash
bash scripts/add-client.sh "Acme Corp"
cd clients/acme-corp && claude
```

Switch clients from the dashboard dropdown or by changing directories.

---

## How It Works

**Claude Code is where you work. The dashboard is where you see and control.**

```
You (terminal)              Dashboard (browser)
     |                           |
     v                           v
  claude                   localhost:3000
     |                           |
     +--- reads CLAUDE.md -------+--- shows status
     |    reads brand/           |    shows tasks
     |    uses skills/           |    manages cron
     |    writes projects/       |    browses files
     |    writes memory/         |    edits settings
     |                           |
     +------ shared filesystem --+
```

The dashboard watches the filesystem for changes. When Claude writes a file, the dashboard picks it up. When you create a cron job in the dashboard, the scheduler runs it via Claude CLI.

---

## File Structure

```
robos/
  context/
    SOUL.md              Agent personality
    USER.md              Your profile (generated at setup)
    learnings.md         Per-skill feedback accumulation
    memory/              Daily session logs
  brand/
    voice.md             Brand voice profile (6 dimensions)
    audience.md          Ideal customer profile
    positioning.md       Differentiating angles
    samples.md           Example content
    assets.md            Links, handles, resources
  skills/                Installed skill packs
  projects/              All generated output
  cron/jobs/             Scheduled job definitions
  clients/               Multi-client workspaces
  centre/                Dashboard app (Astro + Svelte)
  scripts/               Setup, start, update, manage
  CLAUDE.md              Instructions for Claude Code
  AGENTS.md              Shared project rules
```

---

## Managing Skills

```bash
bash scripts/list-skills.sh                    # see installed + available
bash scripts/add-skill.sh content-copywriting  # install from catalog
bash scripts/remove-skill.sh content-seo       # remove a skill
```

Or from the dashboard: Skills tab > catalog > Install.

---

## Updating

```bash
bash scripts/update.sh
```

Pulls the latest skills, methodologies, and dashboard improvements. Your brand context, memory, projects, and API keys are never overwritten.

If a skill you've customized has upstream changes, you'll see a diff and choose per-skill: accept upstream or keep yours.

---

## API Keys

Most skills work without API keys. Some are enhanced with external services. All keys go in `.env`.

```bash
cat .env.example    # see available keys with descriptions
```

Skills tell you when they could use a key and always offer a fallback.

---

## Your Data Is Safe

Never overwritten by updates:
- `brand/` -- your voice, audience, positioning
- `context/` -- your memory, learnings, session history
- `projects/` -- everything generated for you
- `clients/` -- all client workspaces
- `.env` -- your API keys (gitignored)

---

## Tech Stack

- **Dashboard**: Astro 5 + Svelte 5 islands + Tailwind 4
- **Database**: SQLite (better-sqlite3, WAL mode)
- **Server**: Node.js production server (not a dev server)
- **Scheduling**: croner library with leader election
- **File watching**: chokidar for workspace sync
- **Live updates**: Server-Sent Events (SSE)

---

Built by RoboMarketing
