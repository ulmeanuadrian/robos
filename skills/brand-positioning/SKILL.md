---
name: brand-positioning
version: 1.0.0
category: brand
description: "Find the angle that makes a product or brand stand out. Researches competitors, maps the messaging landscape, generates positioning angles, and recommends the strongest one."
triggers:
  - "positioning"
  - "differentiation"
  - "what's the hook"
  - "USP"
  - "how should I position"
  - "make this stand out"
  - "unique angle"
  - "competitive positioning"
negative_triggers:
  - "brand voice"
  - "tone of voice"
  - "audience research"
  - "buyer persona"
context_loads:
  - brand/positioning.md (writes)
  - brand/voice.md (summary)
  - brand/audience.md (summary)
  - context/learnings.md (section brand-positioning)
inputs:
  - product_description (required: what the business sells)
  - competitors (optional: known competitor names or URLs)
  - constraints (optional: what's off the table for positioning)
outputs:
  - brand/positioning.md (complete positioning document)
---

# Step 1: Load Voice + Audience Context

Read `brand/voice.md` and `brand/audience.md`. Extract:
- From voice: the personality and tone that positioning must be compatible with
- From audience: who we're positioning for, their awareness level, their language

If both are empty, ask the user for a 2-sentence description of what they sell and to whom. Proceed with that.

# Step 2: Gather Product Intel

If not already provided, ask:
1. What do you sell? (product/service, one sentence)
2. Who are your top 3-5 competitors? (names or URLs)
3. What do customers say is the #1 reason they chose you over alternatives?
4. Is there anything you refuse to compete on? (e.g., "we won't be the cheapest")

# Step 3: Research Competitor Messaging

Use WebSearch to find 3-5 competitors (use provided list + discover any missing ones).

For each competitor, use WebFetch to analyze:
- Their homepage headline and subheadline
- Their "About" or "Why us" page
- Their pricing page positioning (premium vs budget vs value)
- 2-3 recent blog posts or social posts for messaging patterns

Build a competitor messaging matrix:

| Competitor | Primary Claim | Target Audience | Tone | Price Position | Key Differentiator |
|-----------|--------------|-----------------|------|----------------|-------------------|

# Step 4: Map the Landscape

From the competitor matrix, identify:
1. **Crowded claims** -- What everyone says ("we're the easiest", "all-in-one", "trusted by X companies")
2. **Underserved angles** -- Positioning spaces no one occupies
3. **False dichotomies** -- Where competitors force an either/or that your product resolves
4. **Category conventions** -- The default assumptions about what products in this space should be

Write a 3-5 sentence landscape summary: "The market is positioned around X. Most players compete on Y. Nobody is talking about Z."

# Step 5: Generate Positioning Angles

Create 3-5 distinct positioning angles. For each angle:

**Name**: A short label (e.g., "The Anti-Enterprise Play", "Category Creator")

**One-Liner**: The brand in one sentence using this angle

**Why It Works**: 2-3 reasons this angle has traction -- what market gap it fills, what audience pain it speaks to

**Risk**: What could go wrong with this positioning -- who it alienates, what it requires to pull off

**Proof Required**: What evidence you'd need to make this positioning credible

Format each angle as a clear block. Number them.

# Step 6: Recommend One Angle

Pick the strongest angle and explain why:
- Alignment with audience (from brand/audience.md)
- Differentiation strength (how far from competitors)
- Credibility (can the brand actually deliver on this claim today?)
- Longevity (will this still work in 12-18 months?)

Present the recommendation, then ask the user: "This is my pick. Want to go with it, or do you want to argue for a different one?"

# Step 7: Write brand/positioning.md

Once the user confirms (or after adjusting based on feedback), fill all sections:

**One-Liner** -- The brand in one sentence. Must pass the "can I say this at a bar" test.

**Value Proposition** -- The core promise expanded to 2-3 sentences. What the brand delivers and why it matters.

**Key Differentiators** -- 3-5 specific things that separate the brand from competitors. Each must be concrete and verifiable, not generic ("great customer support" is banned unless backed by a specific mechanism).

**Competitor Landscape** -- The matrix from Step 3, cleaned up. Include where this brand sits relative to each competitor.

**Category** -- The market category. If creating a new category, define it clearly and explain what adjacent categories it pulls from.

**Proof Points** -- Evidence that backs the positioning. Metrics, testimonials, case studies, technical specs, awards. If none exist yet, write "TO BUILD" items with specific suggestions.

# Step 8: Log Learnings

Append to `context/learnings.md` under `## brand-positioning`:
- Competitors analyzed
- Chosen angle and rationale
- Rejected angles and why
- Proof points that need to be built
- Date completed
