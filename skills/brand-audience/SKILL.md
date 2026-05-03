---
name: brand-audience
version: 1.0.0
category: brand
description: "Build an Ideal Customer Profile through founder interview or competitor/market research. Outputs a structured audience document with demographics, psychographics, pain points, and buying triggers."
triggers:
  - "target audience"
  - "buyer persona"
  - "ideal customer"
  - "ICP"
  - "who am I selling to"
  - "customer avatar"
  - "audience research"
  - "who is my customer"
negative_triggers:
  - "brand voice"
  - "tone of voice"
  - "positioning"
  - "competitor landscape"
context_loads:
  - brand/audience.md (writes)
  - brand/positioning.md (summary)
  - brand/voice.md (summary)
  - context/learnings.md (section brand-audience)
inputs:
  - mode (optional: interview | research -- auto-detected if not specified)
  - source_urls (optional: competitor sites, review pages, social links for research mode)
  - product_description (optional: what the business sells)
outputs:
  - brand/audience.md (structured ICP document)
---

# Step 1: Load Existing Brand Context

Read `brand/positioning.md` and `brand/voice.md` if populated. Extract relevant context:
- From positioning: what category, what value proposition, who it's for
- From voice: what tone implies about the audience (formal = enterprise, casual = consumer, etc.)

If both are empty, proceed without -- but note that audience research done in isolation may need revisiting after positioning is defined.

# Step 2: Determine Mode

- **Interview**: Default when user is the founder/operator and can answer questions about their customers
- **Research**: When user provides competitor URLs, review sites, or says "figure it out from the market"

If unclear, ask: "Do you want me to interview you about your best customers, or should I research the market from public sources?"

# Step 3: Execute Mode

## Interview Mode

Ask in 2 batches. Summarize after each batch before continuing.

**Batch 1 -- Who Are They:**
1. Describe your best customer -- the one you'd clone if you could. What do they do? How old are they? Where do they live?
2. What were they doing/using before they found you?
3. What was the moment they realized they needed what you sell?
4. What exact words did they use when they first described their problem to you?

**Batch 2 -- How They Buy:**
5. Where do they hang out online? Which platforms, communities, newsletters?
6. What content format do they actually consume -- long reads, short videos, podcasts, tweets?
7. What objections come up before they buy? What almost stops them?
8. How aware are they of solutions like yours? (Never heard of it / Know the category / Comparing options / Ready to buy)
9. What makes them finally pull the trigger?
10. After they buy, what's the first thing they notice or comment on?

After both batches, synthesize and present back: "Here's the profile I'm building. What's wrong or missing?"

## Research Mode

1. Use WebSearch to find 3-5 competitor sites, review platforms, and community discussions in the space
2. Use WebFetch to pull content from each source
3. Extract audience signals:
   - From competitor sites: who they're talking to (language, imagery, pricing tier)
   - From reviews: what customers praise, complain about, and wish for
   - From communities: how people describe their problems in their own words
4. Cross-reference signals to find the consistent patterns
5. Present findings with confidence levels: "High confidence: they're SMB owners. Medium confidence: mostly 30-45 age range."

# Step 4: Write brand/audience.md

Fill all 8 sections with specific, usable content:

**Demographics** -- Age range, location, job title/role, company size (if B2B), income bracket (if B2C). Be specific: "SaaS founders with 5-20 employees" not "business owners."

**Psychographics** -- Values, beliefs about their industry, how they see themselves. What do they identify as? What community do they belong to?

**Pain Points** -- Top 3-5 problems ranked by intensity. Use their actual language where possible, not polished marketing-speak. Format: the pain + why existing solutions fail them.

**Aspirations** -- Where they want to be in 6-12 months. What does success look like in concrete terms? What would they brag about to peers?

**Content Consumption Habits** -- Specific platforms, time of day, format preferences. "Scrolls LinkedIn at 7am, listens to podcasts during commute, reads newsletters at lunch" level of detail.

**Language & Words They Use** -- Actual phrases, jargon level, terms of art. Include 5-10 verbatim phrases they'd use to describe their problem. Note any words that would make them tune out.

**Awareness Level** -- Where most of the audience sits on the awareness spectrum (Unaware / Problem-Aware / Solution-Aware / Product-Aware / Most Aware). Note the distribution.

**Buying Triggers** -- The specific events, moments, or conditions that move them from "interested" to "buying." Time-based triggers, pain-threshold triggers, social triggers.

# Step 5: Log Learnings

Append to `context/learnings.md` under `## brand-audience`:
- Mode used and sources analyzed
- Confidence level in the profile (high/medium/low per section)
- Open questions that need validation (talk to real customers, run a survey, etc.)
- Date completed
