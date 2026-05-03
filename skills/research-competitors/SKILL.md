---
name: research-competitors
version: 1.0.0
category: research
description: "Analyze competitor messaging, positioning, and pricing. Scrapes competitor sites, builds a comparison matrix, identifies market gaps, and recommends differentiators."
triggers:
  - "competitor analysis"
  - "analyze competitors"
  - "what are they saying"
  - "competitive landscape"
  - "how do they position"
  - "compare us to"
  - "competitor research"
negative_triggers:
  - "trending"
  - "what's hot"
  - "brand voice"
  - "write copy"
context_loads:
  - brand/positioning.md (reads, for comparison baseline)
  - brand/audience.md (reads, for overlap detection)
  - brand/voice.md (summary, for tone comparison)
  - context/learnings.md (section research-competitors)
inputs:
  - competitors (required: 3-5 URLs or company names)
  - focus (optional: messaging | pricing | features | audience | all, default: all)
  - our_url (optional: your own site for direct comparison)
outputs:
  - Competitor analysis in projects/research-competitors/
---

# Step 1: Gather Competitor URLs

If the user provided company names instead of URLs, search for them:

- WebSearch: `{company name} official site`
- Confirm the correct URL before proceeding

Target pages to analyze per competitor:
1. Homepage (messaging, hero, value proposition)
2. About page (story, team, mission)
3. Pricing page (model, tiers, anchoring)
4. Product/features page (what they emphasize)
5. Blog (topics covered, tone, frequency)

If a page doesn't exist, note it and move on.

# Step 2: Scrape and Extract

For each competitor, use WebFetch on the target pages. Extract:

### Messaging
- **Headline**: The main H1/hero text
- **Value proposition**: The core promise in 1 sentence
- **Supporting claims**: The 3-5 points they emphasize below the fold
- **Social proof type**: Logos, testimonials, case studies, numbers
- **CTA language**: What their buttons say

### Audience Signals
- **Who they address**: Pronouns used ("you" vs "your team"), job titles mentioned
- **Pain points referenced**: What problems they name
- **Sophistication level**: Technical jargon level, assumed knowledge
- **Industry focus**: Verticals they call out

### Pricing
- **Model**: Freemium, flat rate, per-seat, usage-based, custom
- **Tiers**: Number and names
- **Anchor price**: The most promoted tier
- **Free trial or demo**: Yes/no, gated or ungated

### Tone
- **Formality**: Casual, professional, corporate, playful
- **Personality markers**: Humor, urgency, authority, empathy
- **Vocabulary patterns**: Repeated phrases, branded terms

# Step 3: Build Comparison Matrix

Create a table comparing all competitors (and your brand if `our_url` provided):

| Dimension | Competitor A | Competitor B | Competitor C | You |
|-----------|-------------|-------------|-------------|-----|
| Headline | ... | ... | ... | ... |
| Value prop | ... | ... | ... | ... |
| Target audience | ... | ... | ... | ... |
| Pricing model | ... | ... | ... | ... |
| Key differentiator | ... | ... | ... | ... |
| Tone | ... | ... | ... | ... |
| Social proof | ... | ... | ... | ... |

# Step 4: Identify Patterns and Gaps

Analyze the matrix for:

- **Messaging overlaps**: Where competitors say the same thing (the "sea of sameness" to avoid)
- **Underserved angles**: Topics, audiences, or benefits no competitor emphasizes
- **Pricing gaps**: Price points or models not covered, over-served or under-served segments
- **Audience mismatches**: Disconnect between who they claim to serve vs actual content signals

# Step 5: Recommend Differentiators

Based on the gaps, suggest 3-5 positioning moves:

For each recommendation:
1. **The gap**: What's missing in the market
2. **Evidence**: Why you believe this gap exists (data from the analysis)
3. **How to claim it**: Specific messaging, positioning, or feature angle
4. **Risk**: What could go wrong or why competitors might have avoided this angle

Rank recommendations by impact (high/medium/low) and effort (high/medium/low).

# Step 6: Write the Report

Structure:

```markdown
# Competitor Analysis: {your brand vs competitors}
**Date**: {date} | **Competitors analyzed**: {count}

## Executive Summary
3-5 bullets: the most important findings.

## Competitor Matrix
[The comparison table from Step 3]

## Messaging Map
How competitors position relative to each other on 2 key axes.

## Key Findings
Sea of sameness, gaps, pricing landscape, audience alignment.

## Recommended Differentiators
[Ranked recommendations from Step 5]

## Per-Competitor Deep Dives
Full extracted data per competitor with strengths and weaknesses.

## Sources
Full list of pages analyzed with URLs.
```

# Step 7: Save and Log

Save to `projects/research-competitors/{date}-{slug}/`: `analysis.md` (full report), `matrix.md` (comparison table), `raw/` (per-competitor data).

Append to `context/learnings.md` under `## research-competitors`: competitors analyzed, key differentiator identified, gaps found, date completed.
