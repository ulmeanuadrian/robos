---
name: content-blog-post
version: 1.0.0
category: content
description: "Write SEO-optimized blog posts matched to brand voice. Includes keyword research, competitive gap analysis, structured outline, humanizer pass, and full meta tag generation."
triggers:
  - "write a blog post"
  - "draft a post about"
  - "SEO article"
  - "blog about"
  - "write an article"
  - "blog post about"
negative_triggers:
  - "social post"
  - "landing page"
  - "email"
  - "ad copy"
  - "repurpose"
context_loads:
  - brand/voice.md (reads)
  - brand/audience.md (reads)
  - brand/positioning.md (summary)
  - context/learnings.md (section content-blog-post)
inputs:
  - topic (required)
  - keywords (optional: target keywords, auto-researched if not provided)
  - target_length (optional: word count, default 1200)
  - intent (optional: informational | commercial | transactional | navigational)
outputs:
  - Blog post draft in projects/content-blog-post/
  - SEO metadata (title tag, meta description, slug)
---

# Step 1: Load Brand Context

Read `brand/voice.md` and `brand/audience.md`. Summarize each in 2-3 bullets. If empty, proceed with neutral professional tone and note what would improve.

Read `context/learnings.md` section `## content-blog-post` for past adjustments.

# Step 2: Get Topic and Keywords

If the user provided keywords, use them. If not:

1. Take the topic and generate 5-8 keyword variations (long-tail, question-based, comparison)
2. Present to user for confirmation
3. Select primary keyword (1) and secondary keywords (3-5)

Classify search intent:
- **Informational**: "how to", "what is", "guide", "tips"
- **Commercial**: "best", "review", "comparison", "vs"
- **Transactional**: "buy", "pricing", "discount", "signup"
- **Navigational**: brand-specific searches

# Step 3: Research Top Results

Use WebSearch to check the top 5-10 results for the primary keyword:

1. Note the common angles (what everyone covers)
2. Note the gaps (what nobody covers well)
3. Note content formats (listicle, how-to, deep dive, case study)
4. Note average word count of top results

Identify your angle: pick a gap or a stronger take on a common angle.

# Step 4: Build Outline

Create a structured outline:

```
H1: [Title with primary keyword naturally placed]
  Intro (100-150 words): Hook, context, what reader will learn
  H2: [Section 1] (200-300 words)
    H3: [Subsection if needed]
  H2: [Section 2] (200-300 words)
  H2: [Section 3] (200-300 words)
  H2: [Section 4] (200-300 words)
  Conclusion (100-150 words): Summary, CTA, next steps
```

Rules for the outline:
- H1 contains primary keyword, reads naturally
- H2s cover distinct subtopics, at least one includes a secondary keyword
- Each section has a clear purpose (teach, prove, compare, apply)
- Total word count targets match user's request

Present the outline for approval before writing.

# Step 5: Write the Draft

Follow the approved outline. For each section:

1. Open with a hook or transition from the previous section
2. Make one clear point per paragraph (3-5 sentences)
3. Use examples, data, or analogies to support claims
4. Place keywords naturally -- never force them
5. Vary sentence length (short sentences for emphasis, longer for explanation)
6. Use subheadings, bullet points, and bold text for scannability

Keyword placement targets:
- Primary keyword: title, first 100 words, 1-2 H2s, conclusion
- Secondary keywords: distributed across sections, no stuffing
- Keyword density: 0.5-1.5% for primary, lower for secondary

# Step 6: Internal Link Suggestions

Scan `projects/` for existing content that could be linked:

- Find 2-4 relevant existing pieces
- Suggest anchor text and placement
- If no existing content found, skip silently

# Step 7: Generate SEO Metadata

- **Title tag**: Under 60 characters, includes primary keyword, compelling
- **Meta description**: Under 155 characters, includes primary keyword, has a CTA or value prop
- **Slug**: Under 75 characters, lowercase, hyphens, primary keyword present
- **Suggested alt text**: For any images that should be added

# Step 8: Score the Draft

Rate on these dimensions:

1. **Readability** -- Flesch score target: 60-70 for general, 40-50 for technical
2. **Keyword integration** -- Natural placement, appropriate density
3. **Structure** -- Clear hierarchy, scannable, logical flow
4. **Brand voice** -- Matches voice.md guidelines
5. **Value density** -- Every section teaches or proves something

Revise any dimension scoring below 6/10.

# Step 9: Humanizer Pass

Run through `tool-humanizer` (standard mode) if installed. If not, manually check for AI writing patterns and fix them.

# Step 10: Save and Log

Save to `projects/content-blog-post/{date}-{slug}.md` with the full draft, SEO metadata block, internal link suggestions, score card, and outline used.

Append to `context/learnings.md` under `## content-blog-post`: topic, primary keyword, angle chosen, word count delivered, score summary, date completed.
