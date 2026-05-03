---
name: content-copywriting
version: 1.0.0
category: content
description: "Persuasive copy for landing pages, sales pages, emails, ads, and social posts. Picks framework based on format and audience awareness level, scores on 7 dimensions, and runs humanizer pass."
triggers:
  - "write copy"
  - "landing page copy"
  - "sales page"
  - "help me sell"
  - "make this convert"
  - "ad copy"
  - "email copy"
  - "headline"
  - "tagline"
  - "CTA"
negative_triggers:
  - "blog post"
  - "SEO article"
  - "repurpose"
  - "social posts from"
context_loads:
  - brand/voice.md (reads)
  - brand/audience.md (reads)
  - brand/positioning.md (reads)
  - context/learnings.md (section content-copywriting)
inputs:
  - format (required: landing-page | sales-page | email | ad | social | headline)
  - product_or_offer (required: what we're selling)
  - audience (optional: overrides brand/audience.md if provided)
  - awareness_level (optional: 1-5, auto-detected if not specified)
outputs:
  - Copy draft in projects/content-copywriting/
  - Score card (7 dimensions)
---

# Step 1: Load Brand Context

Read `brand/voice.md`, `brand/audience.md`, and `brand/positioning.md`. Summarize each in 2-3 bullets for internal reference. If any file is empty, proceed with generic defaults and note what would improve with more context.

Read `context/learnings.md` section `## content-copywriting` for past feedback and adjustments.

# Step 2: Determine Format

Detect from user input which format they need:

- **Landing page**: Hero headline, subhead, benefits, social proof, CTA
- **Sales page**: Long-form, story-driven, multiple CTAs, objection handling
- **Email**: Subject line, preview text, body, CTA
- **Ad**: Platform-specific (Google: headline + descriptions, Meta: primary text + headline, LinkedIn: intro text + headline)
- **Social**: Single post, platform-native
- **Headline**: Standalone headline/tagline generation (10+ variants)

If ambiguous, ask ONE question: "What format do you need -- landing page, email, ad, or something else?"

# Step 3: Establish Awareness Level

Rate the target audience on the Eugene Schwartz awareness scale:

1. **Unaware** -- Don't know they have a problem
2. **Problem-aware** -- Know the problem, don't know solutions exist
3. **Solution-aware** -- Know solutions exist, don't know your product
4. **Product-aware** -- Know your product, haven't bought yet
5. **Most aware** -- Know your product well, need a reason to act now

If the user didn't specify, infer from context. State your assumption and let the user correct it.

# Step 4: Pick Framework

Select the copy framework based on format + awareness level:

| Awareness | Short-form (ads, social) | Mid-form (email, landing) | Long-form (sales page) |
|-----------|------------------------|--------------------------|----------------------|
| 1 (Unaware) | Pattern interrupt + curiosity | Before-After-Bridge | Story-led |
| 2 (Problem) | PAS (Problem-Agitate-Solve) | PAS expanded | Problem-Mechanism-Solution |
| 3 (Solution) | AIDA | Feature-Advantage-Benefit | Comparison + proof |
| 4 (Product) | Social proof + urgency | Objection handling | Case study narrative |
| 5 (Most aware) | Direct offer + deadline | Reminder + bonus stack | Risk reversal + scarcity |

State the chosen framework and why before writing.

# Step 5: Write the Copy

Follow the selected framework. For each section:

1. Write the hook/headline first -- generate 5 variants, pick the strongest
2. Build the body following the framework structure
3. Write 3 CTA variants (soft, medium, direct)
4. Add micro-copy where relevant (button text, caption, PS line)

Rules:
- Lead with the reader's situation, not the product
- One idea per sentence, one argument per paragraph
- Specificity beats generality ("47% faster" beats "much faster")
- Use the vocabulary from `brand/voice.md` if available
- No filler. Every sentence must earn its place.

# Step 6: Score on 7 Dimensions

Rate the draft 1-10 on each dimension:

1. **Clarity** -- Can someone understand the offer in 5 seconds?
2. **Persuasion** -- Does it make the reader want to act?
3. **Brand alignment** -- Does it sound like the brand?
4. **Specificity** -- Are claims concrete or vague?
5. **Emotion** -- Does it connect to a felt need or desire?
6. **Urgency** -- Is there a reason to act now?
7. **Readability** -- Short sentences, active voice, scannable?

If any dimension scores below 6, revise that aspect before delivering.

# Step 7: Humanizer Pass

Run the draft through the `tool-humanizer` skill (standard mode) if installed. If not installed, manually check for:

- Em dash overuse
- Repeated "rule of three" patterns
- Corporate buzzwords ("leverage", "synergy", "unlock")
- Hedging language ("it's worth noting")
- Promotional superlatives ("groundbreaking", "revolutionary")
- Predictable paragraph structure

Fix any detected patterns.

# Step 8: Save Output

Save to `projects/content-copywriting/{date}-{format}-{slug}.md` with:

- The final copy
- Score card
- Framework used and rationale
- Variants (headlines, CTAs)

# Step 9: Log Learnings

Append to `context/learnings.md` under `## content-copywriting`:
- Format and framework used
- Score card summary
- Any user feedback received
- Date completed
