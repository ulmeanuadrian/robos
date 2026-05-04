---
name: sys-daily-plan
version: 1.0.0
category: sys
description: "Morning planning skill. Reads recent memory, priorities, and open threads to produce a focused daily plan with 3 priorities and skill suggestions."
triggers:
  - "plan my day"
  - "planifica-mi ziua"
  - "plan de zi"
  - "morning coffee"
  - "daily plan"
  - "what should I focus on"
  - "what's on my plate"
  - "ce am de facut azi"
negative_triggers:
  - "plan a project"
  - "plan a campaign"
  - "quarterly plan"
context_loads:
  - context/priorities.md (reads)
  - context/memory/ (reads last 3 days)
  - connections.md (reads, summary only)
  - context/learnings.md (reads, summary only)
inputs:
  - date (optional, defaults to today)
outputs:
  - Daily plan written to today's memory file
---

# Step 1: Gather Context

Read these files silently:

1. **`context/priorities.md`** -- current quarter goals and active priorities
2. **Last 3 days of memory** -- scan `context/memory/` for the 3 most recent files. Extract:
   - Open Threads (unfinished work)
   - Decisions made (to avoid re-deciding)
   - Deliverables completed (to see momentum)
3. **`connections.md`** -- scan for connected tools (if any, note what data sources are available)

If any file is missing, work with what exists. Don't block on missing context.

# Step 2: Synthesize

Based on what you found, identify:

1. **Carry-overs**: open threads from previous days that need attention
2. **Priority work**: tasks that align with current quarter priorities
3. **Quick wins**: small things that could be done in under 30 minutes

# Step 3: Present the Plan

Output a concise daily plan:

```
Today: {day of week}, {YYYY-MM-DD}

Priorities (pick max 3):
1. {most important -- from open threads or quarter priorities}
   Skill: {suggest a skill if one applies, or "manual work"}
2. {second priority}
   Skill: {suggestion}
3. {third priority or quick win}
   Skill: {suggestion}

Carry-overs from yesterday:
- {open thread 1}
- {open thread 2}

Default shift check:
For priority #1 -- to what extent could AI handle this?
{one sentence assessment with leverage percentage}
```

Keep the plan to under 20 lines. No fluff.

# Step 4: Ask for Adjustments

Say: "This is my suggestion. Want to adjust priorities, add something, or just go with this?"

If the user adjusts, update the plan. If they approve, proceed to Step 5.

# Step 5: Save to Memory

Write the approved plan to today's memory file `context/memory/{YYYY-MM-DD}.md`:

```markdown
## Session {N}

### Goal
{priority 1 from the plan}

### Deliverables
- Daily plan created: {list the 3 priorities}

### Decisions
(will be filled as decisions are made)

### Open Threads
(will be updated at session end)
```

If the file already exists (previous session today), increment the session number.

# Step 6: Kickoff

End with: "Ready to start on #{1 priority}? Or want to run /audit first to check your setup?"

Do not auto-start work. Wait for the user to choose what to do.
