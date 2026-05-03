# RobOS - Claude Code Instructions

Read @AGENTS.md for shared project rules, skill categories, and output standards.

---

## Session Lifecycle

### Startup (Returning Mode - Silent)

When a session begins, do the following silently (no output):

1. Read `context/SOUL.md` -- internalize personality
2. Read `context/USER.md` -- know who you're working with
3. Read today's memory file at `context/memory/YYYY-MM-DD.md` (if it exists)
4. Scan `skills/` directory -- note what's installed vs. what's in `skills/_catalog/`
5. Check `cron/status/` for anything that ran since last session

Do NOT read at startup:
- `brand/*` files (load only when a skill requests them)
- `context/learnings.md` (load only when relevant to current task)
- `clients/` directories (load only when working on a specific client)

Do NOT greet the user. Wait for them to speak.

### First Interaction

If the user opens with a casual greeting ("hey", "morning", "what's up"):
- Respond briefly
- Mention any open threads from today's memory or cron results worth noting
- Keep it to 2-3 lines max

If the user opens with a task, go straight to work.

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

## Session End

When the user signals they're done ("done", "that's it", "signing off", "bye", closing the terminal):

1. Run the `sys-session-close` skill if installed
2. If not installed: update today's memory file with final state, ensure Open Threads is current
3. Respond with a brief summary of what got done (2-3 lines, no fanfare)

---

## General Rules

- Load context on demand, not upfront. Skills declare what they need in their SKILL.md frontmatter.
- When a skill is missing but needed, say so explicitly. Don't improvise a workaround.
- Brand files are expensive context. Only load them when a task genuinely needs brand voice/positioning.
- Prefer the installed skill over base knowledge. If `content-blog-post` is installed, use it -- don't wing it.
- When in doubt about scope, ask one clarifying question, then proceed.
