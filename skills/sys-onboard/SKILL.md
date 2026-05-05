---
name: sys-onboard
version: 1.0.0
category: sys
description: "Interactive onboarding that populates all brand and context files in under 15 minutes. Selects a starter pack, personalizes it through a 5-question interview, and runs one skill live so the user sees real output on day one."
triggers:
  - "ajuta-ma sa incep"
  - "configurare"
  - "pornire"
  - "onboard me"
  - "onboarding"
  - "set up my AIOS"
  - "get started"
  - "I just cloned this"
  - "help me set up"
  - "first time setup"
negative_triggers:
  - "onboard a client"
  - "client onboarding"
  - "set up a new client"
context_loads:
  - context/USER.md (writes)
  - brand/voice.md (writes)
  - brand/audience.md (writes)
  - brand/positioning.md (writes)
  - brand/samples.md (writes)
  - context/priorities.md (writes, new file)
  - connections.md (writes, new file in root)
  - context/learnings.md (section sys-onboard)
inputs:
  - starter_pack (optional: consultant, agency, ecommerce, creator)
outputs:
  - Populated brand/ files (voice.md, audience.md, positioning.md)
  - context/USER.md with real profile
  - context/priorities.md with current goals
  - connections.md with tool inventory
  - One completed skill run in projects/
---

# Step 0: Check If Already Onboarded

Read `brand/voice.md`. If it contains real content (not just template comments), say:

"Looks like you've already been onboarded -- brand/voice.md has content. Want to re-run onboarding from scratch (will overwrite brand/ files), or would you rather run /audit to see where to improve?"

If the user wants to continue, proceed. Otherwise, stop.

# Step 1: Starter Pack Selection

Say:

"Let's get you set up. First -- what type of work do you do? Pick the closest match:"

```
1. Consultant / Coach  -- solo expert selling knowledge and services
2. Agency              -- team of 2-10 doing client work (marketing, dev, creative)
3. E-commerce          -- selling physical or digital products online
4. Creator             -- content-first business (YouTube, newsletter, courses)
5. Other               -- I'll describe it
```

**If 1-4:** Copy the matching starter pack files from `skills/_catalog/starter-packs/{type}/` to `brand/`:
- `voice.md` -> `brand/voice.md`
- `audience.md` -> `brand/audience.md`
- `positioning.md` -> `brand/positioning.md`

Tell the user: "Loaded the {type} starter pack into brand/. We'll personalize it now."

**If 5 (Other):** Ask "Describe your business in 2-3 sentences" and create minimal brand files from that description. Use the consultant pack as the structural template but rewrite content to match their description.

# Step 2: Personalization Interview

Ask these 5 questions one at a time. Wait for each answer before asking the next.

**Q1: Identity**
"What's your name, your business name, and what do you do in one sentence?"

-> Write answer to `context/USER.md`:
```markdown
# User Profile

Name: {name}
Business: {business_name}
Role: {what they do}
Onboarded: {YYYY-MM-DD}
Starter pack: {type selected}
```

**Q2: Voice calibration**
"Paste one or two things you've written recently -- an email, a post, anything. Don't edit them. I need your real voice."

-> Analyze the samples for: sentence length, vocabulary level, formality, personality markers, favorite phrases.
-> Update `brand/voice.md`: adjust Tone, Vocabulary (add their actual preferred phrases), Sentence Rhythm, and Personality Traits sections based on what you observe. Keep the starter pack structure but merge their real patterns in.
-> Save the raw samples to `brand/samples.md`.

**Q3: Priorities**
"What are your 2-3 biggest priorities for the next 90 days?"

-> Create `context/priorities.md`:
```markdown
# Current Priorities

Updated: {YYYY-MM-DD}
Quarter: {current quarter}

## Active priorities
1. {priority 1}
2. {priority 2}
3. {priority 3}

## Parking lot
(Things that matter but not this quarter)
```

**Q4: Tools**
"What tools do you use daily for work? Think: email, project management, calendar, CRM, social media, analytics, file storage."

-> Create `connections.md` in the project root:
```markdown
# Connections

Last updated: {YYYY-MM-DD}

## Connected
(None yet -- set up API keys in .env and integrations below)

## Planned
| Tool | Domain | Connection type | Status |
|------|--------|----------------|--------|
| {tool1} | {comms/tasks/calendar/revenue/customer/meetings/knowledge} | API / MCP / CLI | not connected |
| {tool2} | ... | ... | ... |
```

Map each tool to one of the 7 tier-1 domains: revenue, customer, calendar, comms, tasks, meetings, knowledge.

**Q5: First automation target**
"What's one task you do repeatedly that feels boring or manual? Something you'd love to hand off."

-> Save the answer. You'll use this in Step 4.

# Step 3: Refine Brand Context

Now that you have their voice samples and business description, review the brand files:

1. Re-read `brand/audience.md` -- update Demographics, Pain Points, and Aspirations sections to match their specific business (not the generic starter pack version).
2. Re-read `brand/positioning.md` -- update One-Liner and Value Proposition to reflect what they actually said about their business.
3. Do NOT run full web research or competitor analysis here -- that's what brand-positioning and research-competitors skills are for. Just personalize the starter pack content.

# Step 4: First Win

Based on the starter pack type and Q5 answer, run ONE skill live:

| Pack | Default skill | Why |
|------|--------------|-----|
| consultant | brand-positioning | They need to articulate their angle |
| agency | research-competitors | They need to know their market |
| ecommerce | content-copywriting | They need product copy |
| creator | content-repurpose | They have content to atomize |
| other | sys-goal-breakdown | Universal value |

Tell the user: "Let's put this to work right now. I'm going to run {skill} with your real context."

Execute the skill. Save output to `projects/`.

This is the moment the user sees robOS produce real, personalized value.

# Step 5: Score and Next Steps

Calculate a rough 4C score:

- **Context**: USER.md filled (5) + voice.md personalized (5) + audience.md customized (5) + positioning.md customized (5) + priorities.md created (5) = /25
- **Connections**: count planned connections from connections.md. Score = min(count * 4, 25). If zero tools listed: 0/25.
- **Capabilities**: count installed skills in `skills/` (not _catalog). Score = min(count * 2, 25).
- **Cadence**: any cron jobs active? Any memory files from previous days? Score starts at 0/25 for new users.

Report:

```
robOS Score: {total}/100

Context:     {score}/25  {status}
Connections: {score}/25  {status}
Capabilities:{score}/25  {status}
Cadence:     {score}/25  {status}

Next steps to level up:
1. {highest-leverage gap}
2. {second gap}
3. Run /audit anytime to see your updated score
```

# Step 6: Log

Append to `context/learnings.md` under `## sys-onboard`:
- Date, starter pack chosen, 4C score at completion
- First skill run result (which skill, output location)
- User's automation target from Q5 (for future skill building)
