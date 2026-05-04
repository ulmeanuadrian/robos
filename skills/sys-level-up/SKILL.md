---
name: sys-level-up
version: 1.1.0
category: sys
description: "Asks 5 targeted questions to discover what to automate next. Filters through feasibility gate to only suggest what robOS can actually deliver."
triggers:
  - "level up"
  - "ce sa automatizez"
  - "imbunatateste"
  - "urmatorul pas"
  - "what should I automate"
  - "what's next"
  - "help me improve"
  - "find automation opportunities"
negative_triggers:
  - "level up a skill"
  - "upgrade"
  - "update"
context_loads:
  - context/USER.md (reads)
  - context/priorities.md (reads)
  - connections.md (reads)
  - context/learnings.md (reads)
  - skills/_catalog/catalog.json (reads)
inputs: []
outputs:
  - 3 concrete suggestions (skill to build, skill to install, or connection to add)
  - Optionally: new skill created via sys-skill-builder
---

# Step 1: Set Context

Read `context/USER.md`, `context/priorities.md`, and `connections.md` silently to understand what the user does, what they're working on, and what tools they already have connected.

If any of these files are missing or empty, note the gap but don't block -- you can still ask the questions.

# Step 2: Ask the 5 Discovery Questions

Ask each question one at a time. Wait for the answer before proceeding.

**Q1: Repetition detector**
"Walk me through this past week. What did you do 3 or more times?"

**Q2: Drudgery detector**
"Was there anything that felt manual, boring, or copy-paste? Something where you thought 'there has to be a better way'?"

**Q3: Smart intern test**
"Was there anything a smart intern could handle -- but you did yourself because explaining it would take longer than doing it?"

**Q4: Bottleneck detector**
"If 10x more work landed on your desk Monday, what would break first?"

**Q5: Growth lever**
"What would get you 10 more clients (or 10x output) tomorrow if it ran on autopilot?"

# Step 3: Analyze Answers

Map each answer to one of three action types:

1. **Build a custom skill** -- if the task is specific to their workflow and no existing skill covers it
2. **Install a catalog skill** -- if an uninstalled skill from `skills/_catalog/catalog.json` matches
3. **Add a connection** -- if the bottleneck is about tool access, not process

For each answer, assess:
- **Frequency**: how often does this happen? (daily > weekly > monthly)
- **Time cost**: how long does it take? (hours > minutes)
- **AI leverage %**: what percentage can AI handle? (90% = great, 10% = not worth it)

# Step 3b: Feasibility Gate

Before presenting suggestions, filter each candidate through this gate:

**PASS** -- present to user:
- Can be solved with a SKILL.md file using existing connections and context
- Can be solved by installing a catalog skill
- Can be solved by adding ONE API key to .env

**DEFER** -- move to parking lot, do not present as actionable suggestion:
- Requires new paid infrastructure the user doesn't have
- Requires >2 hours of manual human setup before AI can help
- Requires access to systems robOS cannot reach (internal company tools, physical processes)
- Requires multiple humans to coordinate (team workflows, approvals from others)

For each DEFERRED item, log to `context/priorities.md` under Parking lot:
"[sys-level-up {date}] {task description} - Blocat de: {what's needed first}"

If all 5 answers produce DEFERRED suggestions, say:
"Raspunsurile tale indica procese care necesita setup suplimentar inainte de automatizare. Cel mai aproape de actionabil: {best candidate}. Vrei sa pregatim terenul pentru el?"

# Step 4: Present 3 Suggestions

Rank by: frequency * time_cost * leverage_percentage. Present the top 3:

```
Suggestion #1: {title}
Type: Build skill / Install "{skill-name}" / Connect {tool}
From: Q{n} -- "{brief quote from their answer}"
Why: You do this {frequency}, it takes {time}, and AI can handle ~{leverage}% of it.
Next step: {exact action -- "Say 'build a skill for X'" or "Run: bash scripts/add-skill.sh {name}"}

Suggestion #2: ...
Suggestion #3: ...
```

# Step 5: Offer to Act

Ask: "Want me to act on any of these right now? I can build a skill, install one from the catalog, or help you connect a tool."

If yes:
- For "build a skill": invoke `sys-skill-builder` with the task description
- For "install a skill": run `bash scripts/add-skill.sh {name}`
- For "connect a tool": guide them through API key setup and create a reference doc

If no: save the suggestions to `context/learnings.md` under `## sys-level-up` for future reference.

# Step 6: Log

Append to `context/learnings.md` under `## sys-level-up`:
- Date, questions asked, top 3 suggestions
- Which suggestion the user acted on (if any)
- Automation target identified for future sessions
