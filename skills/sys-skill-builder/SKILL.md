---
name: sys-skill-builder
version: 1.0.0
category: sys
description: "Creates new skills for RobOS. Walks through purpose, triggers, reference materials, drafts SKILL.md with proper frontmatter, creates directory structure, and validates with a test run."
triggers:
  - "create a skill"
  - "build a skill"
  - "new skill"
  - "make a skill"
  - "add a skill"
  - "skill builder"
negative_triggers:
  - "install a skill"
  - "update a skill"
  - "remove a skill"
context_loads:
  - skills/_catalog/catalog.json (reads)
  - context/learnings.md (section sys-skill-builder)
inputs:
  - skill_idea (required: what the skill should do)
  - references (optional: URLs, docs, or example outputs)
outputs:
  - skills/{skill-name}/SKILL.md
  - skills/{skill-name}/references/ (if reference materials provided)
  - Updated skills/_catalog/catalog.json
---

# Step 1: Gather Requirements

Ask these questions (skip any already answered in the initial request):

1. **What does the skill do?** One sentence. If the user gives a paragraph, distill it to one sentence and confirm.
2. **What triggers it?** What would someone say to invoke this skill? Get 3-6 natural language triggers.
3. **What should it NOT do?** Negative triggers -- what similar-sounding requests should NOT activate this skill?
4. **What context does it need?** Which brand/ or context/ files should be loaded when this skill runs?
5. **What does it output?** Files, messages, API calls -- what's the tangible deliverable?

# Step 2: Collect Reference Materials

Ask: "Do you have any reference materials? This could be: URLs to examples of good output, documents showing the methodology, or sample inputs/outputs."

If provided:
- For URLs: use WebFetch to pull content, save key excerpts to `skills/{name}/references/`
- For documents: save to `skills/{name}/references/`
- For examples: save as `skills/{name}/references/example-input.md` and `skills/{name}/references/example-output.md`

If none provided, proceed -- reference materials are optional.

# Step 3: Determine Category and Name

Assign a category prefix based on what the skill does:
- `brand-` for brand/voice/identity work
- `content-` for writing/editing/publishing
- `research-` for web research and analysis
- `sys-` for system operations and maintenance
- `tool-` for external API integrations

Construct the name: `{category}-{descriptive-slug}`. Keep it under 25 characters.

Check `skills/_catalog/catalog.json` -- if a similar skill already exists, tell the user and ask if they want to extend the existing one or create a new one.

# Step 4: Draft SKILL.md

Write the SKILL.md with:

**Frontmatter** (all fields required):
- `name`: the skill name
- `version`: start at 1.0.0
- `category`: one of the valid prefixes
- `description`: under 1024 characters, clear and specific
- `triggers`: 3-6 natural language phrases
- `negative_triggers`: 2-4 phrases that should NOT trigger this skill
- `context_loads`: list of files to load, with (reads), (writes), (summary), or (section name) annotations
- `inputs`: required and optional parameters with defaults
- `outputs`: what the skill produces and where

**Body** (step-by-step instructions):
- Use `# Step N: Title` format
- Each step must be actionable -- "do X" not "consider X"
- Include decision points with clear criteria
- Include specific prompts for user interaction (exact questions to ask)
- Include output format specifications (what the deliverable looks like)
- Keep total SKILL.md under 150 lines

# Step 5: Create Directory Structure

```
skills/{skill-name}/
  SKILL.md
  references/    (only if reference materials were provided)
```

Write all files to disk.

# Step 6: Register the Skill

Update `skills/_catalog/catalog.json`:
- Add the new skill entry with `"core": false, "installed": true`

Update the Skill Registry table in `AGENTS.md`:
- Add a row: `| {name} | {version} | {category} | {one-line description} |`

# Step 7: Test Run

Tell the user: "The skill is built. Let me test it with a sample prompt."

Simulate a trigger phrase and walk through Steps 1-3 of the new skill mentally. Check:
- Does the context loading make sense?
- Are the questions clear and non-overlapping?
- Does the output format match what was specified?
- Are there any missing steps?

Report: "Tested with '{sample trigger}'. [Passed / Found issue: ...]"

If issues found, fix them immediately and re-test.

# Step 8: Log Learnings

Append to `context/learnings.md` under `## sys-skill-builder`:
- Skill created: name, category, purpose
- Any patterns noticed (reusable across future skills)
- Date completed
