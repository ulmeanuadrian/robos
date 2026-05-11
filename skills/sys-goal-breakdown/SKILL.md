---
name: sys-goal-breakdown
version: 1.0.0
category: sys
description: "Breaks a goal into actionable tasks. Classifies into 3 levels (single task, planned project, multi-phase GSD), creates briefs, and tracks tasks."
triggers:
  - "sparge in pasi"
  - "planifica asta"
  - "breakdown task"
  - "ce pasi am"
  - "din ce e format"
  - "descompune"
  - "break this down"
  - "plan this out"
  - "scope this work"
  - "decompose this"
  - "what are the steps"
negative_triggers:
  - "analiza date"
  - "break down analytics"
  - "plan a blog post"
  - "planifica un articol"
context_loads:
  - projects/briefs/ (reads directory)
  - context/memory/YYYY-MM-DD.md (writes)
  - context/learnings.md (section sys-goal-breakdown)
inputs:
  - goal (required: what the user wants to accomplish)
  - deadline (optional: when it needs to be done)
  - constraints (optional: budget, tools, team size)
outputs:
  - Task list (Level 1)
  - projects/briefs/{slug}/brief.md (Level 2+)
  - projects/briefs/{slug}/.planning/ (Level 3)
tier: core
---

# Step 1: Capture the Goal

Get the goal from the user's message. If vague, ask ONE clarifying question to scope it:
- "What does done look like for this?"
- "Is there a deadline driving this?"

Do not ask more than one question. Work with what you have and refine as you go.

# Step 2: Classify the Level

Evaluate the goal against these criteria:

**Level 1 -- Single Task**
- Can be done in one session (< 2 hours)
- No dependencies on external people or systems
- Single deliverable
- Examples: "write an email", "fix this bug", "create a social post"

**Level 2 -- Planned Project**
- Takes 2-5 sessions
- Has multiple deliverables or sequential steps
- May need external input at some point
- Examples: "launch a landing page", "write a 5-part blog series", "set up analytics"

**Level 3 -- GSD Multi-Phase**
- Takes 5+ sessions or spans multiple weeks
- Has phases with dependencies between them
- Involves research, building, testing, and launching
- Examples: "rebrand the company", "build and launch a product", "create a content engine"

Tell the user: "This is a Level {N} -- {label}. Here's how I'd break it down."

# Step 3: Level 1 -- Create Task Directly

For single tasks:

1. Write a clear task description: what to do, what "done" looks like
2. Identify the skill to use (if one exists)
3. List any context or inputs needed before starting
4. Add to today's memory file under `### Goal`
5. Start working immediately unless the user wants to discuss first

Output format:
```
Task: {description}
Skill: {skill-name or "base knowledge"}
Inputs needed: {list}
Estimated time: {range}
```

# Step 4: Level 2 -- Create Project Brief

1. Create `projects/briefs/{slug}/` directory
2. Write `brief.md` with sections: **Goal** (one sentence), **Deliverables** (numbered list), **Tasks** (numbered, sequenced by dependency), **Acceptance Criteria** (3-5 checkboxes), **Constraints** (deadline, dependencies, budget)
3. Each task entry must have: Skill (skill-name or "base knowledge"), Inputs, Output, Depends on
4. Present the brief: "Here's the plan. Want to adjust anything before we start?"
5. After confirmation, start with the first task that has no dependencies

# Step 5: Level 3 -- Create Phased Plan

Do everything from Level 2, plus:

1. Create `projects/briefs/{slug}/.planning/` directory
2. Write `phases.md` -- each phase has: name, week range, goal, task references from brief.md, and a gate (what must be true before moving to next phase)
3. Write `risks.md` -- table with: Risk, Likelihood (H/M/L), Impact (H/M/L), Mitigation
4. For each phase, identify what can be parallelized, the critical path, and external dependency lead times
5. Present the full plan with phases and ask for confirmation

# Step 6: Track in Memory

Add to today's `context/memory/YYYY-MM-DD.md`:

- Under `### Goal`: the project goal
- Under `### Decisions`: the level classification and reasoning
- Under `### Open Threads`: tasks not yet started, next actions

# Step 7: Log Learnings

Append to `context/learnings.md` under `## sys-goal-breakdown`:
- Goal classified and at what level
- Any patterns (e.g., "user's goals tend to be Level 2, could default to project brief format")
- Date completed
