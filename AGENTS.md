# RobOS - Shared Project Instructions

RobOS is an agentic operating system that runs on Claude Code. It gives a single AI operator
persistent memory, installable skills, brand context, cron scheduling, and multi-client
workspace isolation. It ships as a template -- users clone it, run setup, and start working.

---

## Operating Rules

### Skill Reconciliation

At session start, compare what's on disk (`skills/*/`) against the catalog (`skills/_catalog/`).
If a new skill appeared in the catalog since last session, note it silently in memory -- don't
interrupt the user. If an installed skill's version is behind the catalog version, flag it
in the session's Open Threads.

### Task Routing

1. **Check installed skills first.** If a skill matches the task, use it.
2. **Check the catalog second.** If a matching skill exists but isn't installed, tell the user:
   "There's a skill for this (`{skill-name}`) but it's not installed. Want me to install it, or should I handle it from base knowledge?"
3. **Fall back to base knowledge.** If no skill covers it, proceed normally.
4. **Make skill gaps explicit.** If you encounter a recurring task with no skill, note it in
   `context/learnings.md` under "Skill Gap" so it can be built later.

---

## Skill Categories

| Prefix     | Purpose                                          |
|------------|--------------------------------------------------|
| `brand-`   | Brand voice analysis, style guides, tone checks  |
| `content-` | Writing, editing, publishing workflows            |
| `research-`| Web research, competitor analysis, trend scanning |
| `sys-`     | System operations: session, cron, maintenance     |
| `tool-`    | External tool integrations (APIs, CLIs)           |

---

## Skill Registry

<!-- Auto-populated by skill installation. Do not edit manually. -->
<!-- Format: | skill-name | version | category | one-line description | -->

| Skill | Version | Category | Description |
|-------|---------|----------|-------------|
| brand-voice | 1.0.0 | brand | Extract or build a brand voice profile (import, extract, build, or auto-scrape) |
| brand-audience | 1.0.0 | brand | Build an Ideal Customer Profile through interview or market research |
| brand-positioning | 1.0.0 | brand | Find the positioning angle that makes a product stand out |
| sys-skill-builder | 1.0.0 | sys | Create new skills with proper frontmatter, structure, and test validation |
| sys-session-close | 1.0.0 | sys | End-of-session wrap-up with feedback, memory, and git check |
| sys-goal-breakdown | 1.0.0 | sys | Break a goal into actionable tasks across 3 complexity levels |
| content-copywriting | 1.0.0 | content | Persuasive copy with 7-dimension scoring for landing pages, ads, emails |
| content-repurpose | 1.0.0 | content | Turn one piece of content into platform-native posts for 8 platforms |
| content-blog-post | 1.0.0 | content | Write SEO-optimized blog posts with keyword research and humanizer pass |
| research-trending | 1.0.0 | research | Research trending topics across Reddit, X, HN, YouTube in last 30 days |
| tool-humanizer | 1.0.0 | tool | Strip AI writing patterns (10 categories, 3 modes: quick/standard/deep) |
| research-competitors | 1.0.0 | research | Competitor messaging, pricing, and positioning analysis with gap detection |

---

## Context Loading

Each skill declares its own context needs in `SKILL.md` frontmatter:

```yaml
context_loads:
  - brand/voice.md
  - brand/audience.md
  - context/USER.md
```

Only load what the active skill asks for. Never preload all brand files.

---

## Output Standards

### Level 1 - Quick Output
Single files go to `projects/{category}-{type}/`. Example: `projects/content-blog-post/`.

### Level 2 - Structured Output
Multi-file deliverables go to `projects/briefs/{name}/`. Example: `projects/briefs/q3-launch/`.

### Level 3 - Client Output
Client work goes to `clients/{slug}/projects/`. Same structure as above, scoped to the client.

Always include a `_metadata.json` in Level 2+ outputs:

```json
{
  "created": "2026-05-04",
  "skill": "content-blog-post",
  "status": "draft",
  "description": "Q3 product launch blog post"
}
```

---

## Building New Skills

### Directory Structure

```
skills/{skill-name}/
  SKILL.md          # Frontmatter + instructions (required)
  prompt.md         # The main prompt template (required)
  examples/         # Example inputs/outputs (optional)
  lib/              # Helper scripts if needed (optional)
```

### SKILL.md Frontmatter

```yaml
---
name: content-blog-post
version: 1.0.0
category: content
description: Write SEO-optimized blog posts with brand voice
triggers:
  - "write a blog post"
  - "draft a post about"
context_loads:
  - brand/voice.md
  - brand/audience.md
  - context/USER.md
inputs:
  - topic (required)
  - keywords (optional)
  - target_length (optional, default: 1200)
outputs:
  - markdown draft in projects/content-blog-post/
---
```

### Registration Checklist

1. Skill directory exists in `skills/`
2. `SKILL.md` has valid frontmatter with all required fields
3. `prompt.md` exists and references input variables with `{variable}` syntax
4. Skill is listed in the Skill Registry table in this file
5. If the skill needs API keys, they're documented in `.env.example`

---

## Graceful Degradation

RobOS works at every context level:

- **Zero config**: No brand files, no USER.md filled in. Skills still work with generic defaults.
- **Partial config**: Some brand files filled in. Skills use what's available, skip what's not.
- **Full config**: Everything filled in. Skills produce fully branded, personalized output.

Never error out because a context file is empty. Use sensible defaults and note what would
improve with more context.

---

## Protected Files

These files are never overwritten by updates or scripts:

- `context/USER.md`
- `context/learnings.md`
- `context/memory/*`
- `brand/*`
- `clients/*`
- `projects/*`
- `cron/jobs/*`
- `.env`
