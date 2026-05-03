---
name: research-trending
version: 1.0.0
category: research
description: "Research what is trending in the last 30 days across Reddit, Twitter/X, Hacker News, YouTube, and industry blogs. Extracts discussions, pain points, opinions, and content gaps."
triggers:
  - "research"
  - "what's trending"
  - "what are people saying about"
  - "trending in"
  - "last 30 days"
  - "dig into"
  - "what's hot in"
  - "pulse check on"
negative_triggers:
  - "brand voice"
  - "positioning"
  - "write copy"
  - "competitor analysis"
  - "analyze competitors"
context_loads:
  - brand/audience.md (summary, for relevance filtering)
  - context/learnings.md (section research-trending)
inputs:
  - topic (required: niche, keyword, or industry)
  - timeframe (optional: defaults to 30 days)
  - focus (optional: pain points | opportunities | opinions | all)
outputs:
  - Research brief in projects/research-trending/
---

# Step 1: Define Search Scope

Take the user's topic and expand it into 3-5 search queries:

- Base query: `{topic}`
- Pain point query: `{topic} problems frustrations`
- Opinion query: `{topic} unpopular opinion hot take`
- Trend query: `{topic} 2026 trends new`
- Comparison query: `{topic} vs alternative`

If `brand/audience.md` exists, filter for relevance to the target audience.

# Step 2: Search Reddit

Run 2-3 WebSearch queries:

- `site:reddit.com {topic}` (filter to recent)
- `site:reddit.com {topic} advice help`
- `site:reddit.com {topic} rant frustration`

For each relevant thread, extract:
- Thread title and subreddit
- Top 3-5 comments by engagement
- Recurring complaints or praise
- Questions asked repeatedly

Target: 5-10 high-signal threads.

# Step 3: Search Twitter/X

Run 2-3 WebSearch queries:

- `{topic} trending discussion site:twitter.com OR site:x.com`
- `{topic} thread site:twitter.com OR site:x.com`
- `{topic} take site:twitter.com OR site:x.com`

Extract:
- Popular tweets and threads
- Engagement metrics where visible
- Common opinions (consensus vs contrarian)
- Influencer takes vs community takes

# Step 4: Search Hacker News and Industry Sources

Run searches:

- `site:news.ycombinator.com {topic}`
- `{topic} blog post 2026`
- `{topic} analysis report`

Extract:
- HN discussion themes and top comments
- Blog posts with unique angles
- Reports or data cited
- YouTube videos gaining traction (titles, view counts)

# Step 5: Synthesize Findings

Organize raw data into categories:

### Top Discussions (ranked by engagement)
For each: source, title, key point, engagement indicator, link

### Common Pain Points
List the problems people mention most. Group by theme. Note frequency.

### Popular Opinions
What does the majority think? What's the consensus?

### Contrarian Takes
What goes against the mainstream? Who's saying it? Is it gaining traction?

### Data Points
Specific numbers, stats, research cited in discussions.

### Content Gaps
Topics people ask about but nobody answers well. Questions without good resources. Underserved angles.

# Step 6: Write Research Brief

Structure the output:

```markdown
# Trending Research: {topic}
**Period**: Last 30 days | **Sources**: {count} threads/articles

## Executive Summary
3-5 bullet points capturing the most important findings.

## Key Findings
Ranked by signal strength (engagement + recurrence):
1. Finding with supporting evidence
2. Finding with supporting evidence
...

## Pain Points
Grouped by theme, with representative quotes.

## Opportunities
Content gaps and underserved angles, each with:
- The gap
- Evidence it exists
- Suggested content format to fill it

## Contrarian Takes
Opinions gaining traction that go against consensus.

## Raw Sources
Full list of sources consulted with links and key excerpt.
```

# Step 7: Save and Log

Save to `projects/research-trending/{date}-{slug}/`: `brief.md` (full research brief) and `sources.md` (raw source list with links).

Append to `context/learnings.md` under `## research-trending`: topic researched, source count, key insight (one sentence), platforms with strongest signal, date completed.
