---
name: brand-voice
version: 1.0.0
category: brand
description: "Extract or build a brand voice profile through 4 modes: import existing guidelines, extract from content, build via interview, or auto-scrape from URL."
triggers:
  - "brand voice"
  - "writing style"
  - "how should we sound"
  - "tone of voice"
  - "analyze my content"
  - "voice guide"
  - "define our voice"
  - "brand tone"
negative_triggers:
  - "positioning"
  - "audience research"
  - "keyword"
  - "competitor analysis"
context_loads:
  - brand/voice.md (writes)
  - brand/samples.md (writes)
  - brand/positioning.md (summary)
  - brand/audience.md (summary)
  - context/learnings.md (section brand-voice)
inputs:
  - mode (optional: import | extract | build | auto-scrape -- auto-detected if not specified)
  - source_urls (optional: URLs for extract/auto-scrape modes)
  - guidelines_doc (optional: path or pasted text for import mode)
outputs:
  - brand/voice.md (6-dimension voice profile)
  - brand/samples.md (3-5 example outputs)
---

# Step 1: Load Existing Brand Context

Read `brand/positioning.md` and `brand/audience.md` if they have content (not just template headers). Summarize each in 2-3 bullet points for internal reference. If empty, note that voice will be built without positioning/audience constraints -- flag this in the output as a recommendation to fill later.

# Step 2: Determine Mode

Detect mode from user input:

- **Import**: User says "here are our guidelines" or pastes/links a brand doc
- **Extract**: User provides URLs or docs containing their existing published content
- **Build**: User says "from scratch" or "help me figure out our voice" or no source material exists
- **Auto-Scrape**: User provides a URL and says "analyze this site" or "scrape this"

If ambiguous, ask ONE question: "Do you have existing content I should analyze, or are we building this from scratch?"

# Step 3: Execute Mode

## Import Mode
1. Parse the provided guidelines document
2. Map every statement to one of the 6 dimensions (Tone, Vocabulary, Sentence Rhythm, Personality Traits, Formatting Preferences, Confidence Zones)
3. Identify gaps -- dimensions not covered by the source doc
4. For each gap, infer from available information or ask a targeted question

## Extract Mode
1. Read/fetch 5-10 pieces of existing content from provided sources
2. For each piece, note: sentence length average, tone markers, vocabulary patterns, formatting choices
3. Find the consistent patterns across pieces (the "real" voice vs one-off variations)
4. Synthesize into the 6 dimensions

## Build Mode
Ask these questions in 2-3 batches (not all at once):

**Batch 1 -- Identity:**
1. If your brand were a person at a dinner party, how would they talk?
2. Name 3 brands whose tone you admire. What specifically do you like about each?
3. What words or phrases should NEVER appear in your content?

**Batch 2 -- Style:**
4. Short and punchy, or detailed and thorough? Pick one, then tell me where the exception is.
5. Do you use humor? If yes, what kind -- dry, self-deprecating, playful?
6. How technical can you get before you lose your audience?
7. Emoji, exclamation marks, ALL CAPS -- what's the policy?

**Batch 3 -- Authority:**
8. What topics can you speak on with absolute confidence?
9. What topics do you defer to others on?
10. When you disagree with industry consensus, do you say so directly or diplomatically?

After each batch, summarize what you've heard back to the user for confirmation before proceeding.

## Auto-Scrape Mode
1. Use WebFetch to pull 5-8 pages from the provided URL (home, about, blog posts, product pages)
2. Run the same analysis as Extract Mode on the scraped content
3. Present findings to the user: "Here's what I'm seeing in your existing content. Does this match your intent, or is this what you want to move away from?"
4. Adjust based on feedback

# Step 4: Write brand/voice.md

Fill in all 6 sections with specific, actionable guidance. Each section must include:
- A clear directive (not just a label)
- 1-2 concrete examples showing the voice in action
- A "NOT this" example showing what to avoid

Do NOT leave any section as placeholder text. If information is insufficient for a section, write the best version possible and add a `<!-- NEEDS REVIEW: ... -->` comment.

# Step 5: Write brand/samples.md

Generate 3-5 sample outputs that demonstrate the voice:
1. A social media post (short-form)
2. A blog intro paragraph (mid-form)
3. An email to a customer (interpersonal)
4. A product description or landing page snippet (sales)
5. An error message or edge case (micro-copy) -- optional

Each sample should be labeled with which voice dimensions it demonstrates.

# Step 6: Log Learnings

Append to `context/learnings.md` under a `## brand-voice` section:
- Mode used
- Key decisions made (e.g., "chose informal over formal because...")
- Any gaps flagged for future review
- Date completed
