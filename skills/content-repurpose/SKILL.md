---
name: content-repurpose
version: 1.0.0
category: content
description: "Turn one piece of content into platform-native posts for LinkedIn, Twitter/X, Instagram, TikTok, YouTube, Threads, Bluesky, and Reddit. Extracts core atoms and adapts format, tone, and hooks per platform."
triggers:
  - "transforma in social"
  - "fa posturi din asta"
  - "calendar content"
  - "fa un thread"
  - "post LinkedIn din"
  - "adapteaza pentru"
  - "repurpose this"
  - "turn this into social posts"
  - "social posts from"
negative_triggers:
  - "scrie copy"
  - "landing page"
  - "sales page"
  - "articol"
  - "blog post"
  - "SEO article"
context_loads:
  - brand/voice.md (reads)
  - brand/audience.md (summary)
  - context/learnings.md (section content-repurpose)
inputs:
  - source (required: URL, file path, or pasted text)
  - platforms (optional: comma-separated list, defaults to all)
  - angle (optional: specific angle or hook to emphasize)
outputs:
  - Per-platform files in projects/content-repurpose/
---

# Step 1: Read Source Content

Accept the source in any format:

- **URL**: Fetch the page content using WebFetch. Extract the main body text, stripping nav/footer/sidebar.
- **File path**: Read the local file.
- **Pasted text**: Use as-is.

If the source is too short (under 100 words), ask: "This is pretty brief. Do you have a longer version, or should I work with this?"

# Step 2: Extract Content Atoms

Break the source into 3-5 "atoms" -- the smallest standalone units of value:

1. **Key insight** -- The one thing someone should remember
2. **Data point** -- A specific number, stat, or result
3. **Quotable line** -- A sentence that works on its own
4. **Story beat** -- A mini-narrative (before/after, challenge/solution)
5. **Contrarian take** -- An opinion that goes against conventional wisdom

List the atoms before proceeding. Let the user confirm or adjust.

# Step 3: Platform Adaptation

For each selected platform, create a native post:

## LinkedIn
- Format: Professional storytelling, 1200-1500 characters
- Structure: Hook line (bold or provocative), 2-3 short paragraphs, takeaway, soft CTA
- Line breaks between every 1-2 sentences
- No hashtags in body, 3-5 hashtags at the end
- Tone: Authoritative but personal, first-person experience

## Twitter/X
- Two versions: single tweet (under 280 chars) AND thread (3-7 tweets)
- Thread structure: Hook tweet, supporting points (one per tweet), final tweet with CTA
- Use numbers and line breaks for scannability
- Tone: Punchy, direct, conversational

## Instagram
- Carousel script: slide 1 (hook), slides 2-6 (key points), slide 7 (CTA)
- Caption: 2200 char max, hook in first line, CTA, 20-30 hashtags in first comment
- Tone: Visual-first thinking, short punchy phrases per slide

## TikTok
- Script format: Hook (first 3 seconds), Problem, Solution, Proof, CTA
- Under 60 seconds reading time
- Hook must create curiosity or pattern interrupt
- Tone: Casual, direct, fast-paced

## YouTube
- Two versions: Community post (short teaser) AND video description (if video exists)
- Community: 500 chars, question or poll format
- Tone: Conversational, encourage comments

## Threads
- Format: Similar to Twitter but slightly longer, 500 char limit
- Single post or mini-thread (2-3 posts)
- Tone: Casual, conversational, less polished than LinkedIn

## Bluesky
- Format: Under 300 chars, single post
- Tone: Tech-savvy, conversational
- Use alt-text references if linking images

## Reddit
- Format: Self-post with genuine value, NOT promotional
- Lead with the insight, bury any self-promotion
- Write as if answering someone's question
- Tone: Genuine, slightly informal, helpful
- Suggest 2-3 relevant subreddits

# Step 4: Quality Check

For each platform post, verify:

- [ ] Respects character/length limits
- [ ] Hook is in the first line/3 seconds
- [ ] CTA is platform-appropriate (not "buy now" on Reddit)
- [ ] Tone matches the platform culture
- [ ] No cross-platform copy-paste (each post is native)
- [ ] Brand voice maintained within platform constraints

# Step 5: Save Output

Save each platform post to `projects/content-repurpose/{date}-{slug}/`:

- `linkedin.md`
- `twitter.md`
- `instagram.md`
- `tiktok.md`
- `youtube.md`
- `threads.md`
- `bluesky.md`
- `reddit.md`
- `_source.md` (original content reference)
- `_atoms.md` (extracted atoms)

Only create files for platforms the user selected.

# Step 6: Log Learnings

Append to `context/learnings.md` under `## content-repurpose`:
- Source type and length
- Platforms generated
- Atoms extracted
- Any user feedback
- Date completed
