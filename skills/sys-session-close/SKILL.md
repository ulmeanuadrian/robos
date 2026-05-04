---
name: sys-session-close
version: 1.1.0
category: sys
description: "End-of-session wrap-up. Reviews deliverables, checks plan alignment, collects feedback, logs learnings, updates daily memory, and checks for uncommitted changes."
triggers:
  - "thanks"
  - "that's it"
  - "done for today"
  - "bye"
  - "wrap up"
  - "close session"
  - "session done"
  - "signing off"
  - "I'm done"
negative_triggers:
  - "thanks, now"
  - "thanks, also"
  - "thanks, can you"
  - "thanks for that, next"
context_loads:
  - context/memory/YYYY-MM-DD.md (writes)
  - context/learnings.md (appends if feedback given)
inputs: []
outputs:
  - Updated context/memory/YYYY-MM-DD.md
  - Updated context/learnings.md (if feedback given)
---

# Trigger Guard

Before running this skill, check if the "thanks" or similar trigger is actually a session-end signal:

- **IS session-end**: message is standalone ("thanks!", "that's it", "done"), or message ends with a clear farewell
- **NOT session-end**: message continues with another request ("thanks, now do X"), or is mid-conversation acknowledgment ("thanks for that explanation")

If NOT session-end, do not run this skill. Respond normally to whatever follows.

# Step 1: Review What Was Done

Scan today's memory file (`context/memory/YYYY-MM-DD.md`) and the current conversation. Build a list of:

1. **Deliverables** -- Files created, modified, or published. Be specific: file paths, URLs, post titles.
2. **Decisions** -- Choices made during the session. Include the reasoning.
3. **Open threads** -- Anything started but not finished, or explicitly deferred.

If no memory file exists for today, create one now from conversation history.

# Step 1b: Plan vs Reality Check

If today's memory file has a `### Goal` section that was written by sys-daily-plan (contains numbered priorities):

1. Extract the planned priorities (up to 3)
2. Compare against actual deliverables from Step 1
3. For each priority, classify:
   - **DONE** -- deliverable clearly matches the priority
   - **PARTIAL** -- started but not completed
   - **PIVOTED** -- did something different instead (identify what)
   - **SKIPPED** -- not touched at all
4. If any priority is PIVOTED or SKIPPED, note the reason from conversation context (don't ask the user -- infer from what actually happened)
5. Include in the final summary output:
   ```
   Plan alignment: {DONE count}/3 priorities completed
   ```
6. Log to `context/learnings.md` under `## General` ONLY if a pattern emerges (3+ days of same drift type). Single-day pivots are normal and don't need logging.

# Step 2: Ask for Feedback

Ask exactly this: "How did this land? Any adjustments for next time?"

Wait for the user's response. Three possible paths:

**Path A -- Positive or neutral, no changes:**
Note in memory that session went well. Move to Step 4.

**Path B -- Specific feedback given:**
Log the feedback to `context/learnings.md` under the relevant skill section. If the feedback is about general behavior (not a specific skill), log it under `## General`. Move to Step 3.

**Path C -- User skips feedback** (says "nah" or "all good" or similar):
Move to Step 4.

# Step 3: Process Feedback

If feedback was given (Path B):

1. Identify which skill(s) the feedback applies to
2. Open `context/learnings.md`
3. Find or create the `## {skill-name}` section
4. Append a timestamped entry:

```markdown
### YYYY-MM-DD
- Feedback: {what the user said, paraphrased}
- Action: {what should change next time}
```

5. If the feedback implies a skill should be modified, note it in Open Threads rather than editing the skill mid-close.

# Step 4: Finalize Daily Memory

Update `context/memory/YYYY-MM-DD.md` with the final state:

- Ensure `### Goal` reflects what actually happened (may have shifted from initial goal)
- Ensure `### Deliverables` is complete and accurate
- Ensure `### Decisions` captures meaningful choices
- Ensure `### Open Threads` lists anything unfinished or needing follow-up
- If multiple sessions today, increment the `## Session N` header

# Step 5: Check for Uncommitted Changes

Run `git status` in the project root. If there are uncommitted changes:

Tell the user: "There are uncommitted changes: {brief list of files}. Want me to commit these?"

- If yes: stage and commit with a descriptive message
- If no: note in Open Threads that uncommitted changes exist

If git is not initialized or there are no changes, skip silently.

# Step 6: Print Session Summary

Output a 2-3 line summary of what got done. Format:

```
---
Session: {deliverable count} deliverables, {decision count} decisions. Plan alignment: {X}/3.
{One sentence about the most important thing accomplished.}
{One sentence about open threads, if any.}
```

If no daily plan existed (Step 1b didn't apply), omit "Plan alignment" from the output.

Keep it brief. No fanfare, no "great session!" energy. Just the facts.
