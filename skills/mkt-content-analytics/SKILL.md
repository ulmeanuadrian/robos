---
name: mkt-content-analytics
version: 1.0.0
category: content
description: "Retrieve si analizeaza performance social media via Zernio MCP. Verifica post performance, ofera improvement suggestions, compara metrici across platforms (YouTube, LinkedIn, Instagram, Twitter)."
triggers:
  - "verifica analytics"
  - "review performance post"
  - "cum a mers ultimul post"
  - "compara posturi"
  - "ce functioneaza"
  - "analytics youtube"
  - "analytics linkedin"
  - "improvement suggestions"
  - "check analytics"
  - "analyze performance"
negative_triggers:
  - "creeaza post"
  - "publica"
  - "draft"
context_loads:
  - context/learnings.md (section mkt-content-analytics)
inputs:
  - platform (optional: youtube | linkedin | instagram | twitter | tiktok, default = all)
  - limit (optional: numar posts, default 10)
  - period (optional: 7d | 30d | 90d, default 30d)
outputs:
  - Markdown report (return inline, NU saved file)
secrets_required:
  - ZERNIO_API_KEY
tier: social-publisher
---

# Content Analytics

Retrieve analytics pentru posts logged si ofera recomandari improvement data-driven.

# Quick Commands

- "Verifica YouTube analytics" — performance video-uri recente
- "Cum a mers ultimul post?" — analiza most recent post
- "Compara posts" — side-by-side performance
- "Ce functioneaza?" — identifica top-performing content patterns

# Workflow

## Step 1: List logged posts

```
mcp__zernio__posts_list cu:
  status: "published"
  limit: 10
```

## Step 2: Fetch analytics

```
mcp__zernio__analytics_get_analytics cu:
  platform: "youtube" (sau linkedin, instagram, twitter)
  limit: 50
  sort_by: "date"
  order: "desc"
```

## Step 3: Calculate metrics per platform

**YouTube**:
- Views, watch time, retention
- CTR (impressions → views)
- Average view duration vs video length
- Subscribers gained per video

**LinkedIn**:
- Impressions, unique reach
- Engagement rate (likes + comments + reshares / impressions)
- Profile views post-publish
- Followers gained per post

**Instagram**:
- Reach, impressions
- Engagement rate (likes + comments + saves + shares / reach)
- Profile visits, follows
- Story-vs-feed performance

**Twitter/X**:
- Impressions, engagement rate
- Replies vs retweets vs likes ratio
- Profile visits
- Followers gained

## Step 4: Identify patterns

Top 20% performers vs bottom 20%:
- **Topic categories** — care subiecte trag?
- **Format** — image vs video vs carousel vs text-only
- **Length** — optimal range per platforma
- **Posting time** — windows de engagement maxim
- **Hooks** — primele 3 secunde / prima linie

## Step 5: Generate recommendations

Format:
```
# Analytics Report — {Period}

## Top Performers
1. {post title} — {key metric} ({improvement vs avg})

## Bottom Performers
1. {post title} — {what went wrong}

## Patterns identified
- Topic X performs Y% better
- Format Z generates 3x engagement
- Posting at HH:MM gets +N% reach

## Recommendations
1. Lean into {topic / format}
2. Test {hypothesis}
3. Drop {underperforming category}
```

## Step 6: Log learnings

Append la `context/learnings.md` sub `## mkt-content-analytics`:
- Data analysis run
- Patterns identified
- Recommendations made
- (At next session) Verify recommendations were applied + outcome

# Rules

- **NICIODATA inventa metrici** — daca Zernio nu intoarce data, spune explicit
- **Pattern detection NECESITA minim 10 posts** — sub 10, "insufficient data"
- **Compare like-with-like** — NU compara YouTube video cu LinkedIn text post
- **Time period explicit** — clar in raport ce range analizat

# Self-Update

Daca user-ul flag-eaza issue — metrici gresit, pattern inventat — actualizeaza `# Rules`.
