# Selection Framework — Stage 1: Identifying Best Moments

You are analyzing a long-form video transcript to identify the best short-form clips (45-90 seconds each). Your job is to find moments that can stand alone as compelling, self-contained short videos.

## What Makes a Great Clip

### Must-Have Qualities
1. **Strong opening** — First 3 seconds must hook the viewer. Look for: shocking stats, bold claims, relatable pain points, curiosity gaps, pattern interrupts
2. **Self-contained value** — The clip must make sense WITHOUT the surrounding context. A viewer who has never seen the full video should understand and benefit
3. **Natural boundaries** — Start at the beginning of a sentence/thought. End after a complete conclusion, punchline, or call-to-action. Never cut mid-sentence
4. **Single clear message** — Each clip should deliver exactly ONE takeaway. Multi-topic segments need to be split or trimmed

### Scoring Categories (0-20 each, max 100)
| Category | 18-20 | 14-17 | 10-13 | 0-9 |
|----------|-------|-------|-------|-----|
| **Hook Strength** | Impossible to scroll past. Shocking stat, bold claim, visual hook | Strong opener, clear pain point or curiosity | Decent opener but takes >3s to engage | Weak/boring start, no reason to keep watching |
| **Value Delivery** | Actionable framework, step-by-step, "I need to save this" | Teaches something useful, gives insight | Some value but surface-level | No clear value, just talking |
| **Clarity** | Crystal clear single message, zero confusion | Clear message with minor tangents | Message present but takes work to extract | Confusing, multiple topics, rambling |
| **Shareability** | "I need to send this to someone" moment | Would get saves, maybe shares | Interesting but not share-worthy | No reason to share |
| **Completeness** | Perfect start + end, feels like it was always a short | Clean start and end, minor rough edges | Starts or ends slightly awkwardly | Clearly ripped from longer content |

## Selection Rules

1. **Target count**: Extract the number of clips specified (default: 7)
2. **Duration**: Each clip should be 45-90 seconds. Shorter clips (30-45s) are acceptable if the moment is exceptionally strong
3. **No overlap**: Clips should not share significant content. Minor 2-3 second overlap is acceptable
4. **Variety**: Aim for a mix of categories (educational, tactical, story, etc.)
5. **Prioritize hooks**: When in doubt between two similar moments, pick the one with the stronger first 3 seconds

## Anchor Word Rules

For each clip, provide **two anchor phrases** that locate it precisely in the transcript:

- **`srt_start_words`**: 5-8 consecutive words from where the clip should BEGIN
- **`srt_end_words`**: 5-8 consecutive words from where the clip should END
- Words must be **EXACT verbatim quotes** from the transcript — copy-paste, don't paraphrase
- Include punctuation exactly as it appears
- Choose distinctive words, not common phrases like "and then we" or "so basically"
- If possible, anchor on proper nouns, numbers, or unique phrases

### Good anchors:
- `"made $90,000 in 90 days reselling the system"` (distinctive number + action)
- `"implement the AIX system into his outreach"` (product name + specific action)

### Bad anchors:
- `"and then he"` (too short, too common)
- `"so basically what happened was"` (filler, appears many times)

## Output Format

For each selected clip, provide:
```json
{
  "id": 1,
  "title": "descriptive-kebab-case-title",
  "srt_start_words": "exact five to eight words from transcript",
  "srt_end_words": "exact five to eight words from transcript",
  "time_start_estimate": 45.0,
  "time_end_estimate": 120.0,
  "hook_summary": "Why this moment hooks viewers in 3 seconds",
  "category": "educational"
}
```

Categories: `educational` | `tactical` | `inspirational` | `personal_story` | `entertaining`

## Platform Duration Targeting

When `target_platform` is set in pipeline config, adjust clip selection duration accordingly.

### Specific Platform Mode

When `target_platform` is set to `youtube`, `tiktok`, or `instagram`, narrow the duration range to that platform's sweet spot (from `platform_durations` in config):

| Platform | Min | Max | Sweet Spot |
|----------|-----|-----|------------|
| youtube | 45s | 60s | 55s |
| tiktok | 15s | 35s | 25s |
| instagram | 30s | 60s | 45s |

Prefer clips whose natural duration lands within `[min_duration, max_duration]`. When trimming is needed to hit the sweet spot, prioritise completeness — never cut mid-thought.

### "all" Mode (Default)

Select 5-7 clips in the standard 45-90s range AND identify 2-3 shorter "TikTok-optimized" clips (15-35s) from different sections of the video (no overlap with main clips). These shorter clips must meet the same hook and completeness standards — they are not just truncated versions.

### best_platform Tagging

Tag every approved clip with a `best_platform` field based on its final duration:

| Duration | best_platform |
|----------|---------------|
| 15-35s | tiktok |
| 36-44s | instagram |
| 45-60s | youtube (or instagram) |
| 61-90s | instagram |

For durations that fit multiple platforms (e.g. 45-60s), use `youtube` as primary. Add the tag to each clip's JSON output alongside the existing fields.

**Reference:** `.claude/skills/viral-short-form-video-master/references/` for current platform sweet spot data.

## Red Flags (Skip These Moments)
- Starts with "um", "so", "anyway" or other filler
- References something shown on screen that won't be visible in the clip
- Inside jokes or references that require full video context
- Technical setup/troubleshooting that isn't educational
- Long pauses or dead air within the clip
- Speaker says "as I mentioned earlier" or "like I said before"

---

## Viral Red Flags

Patterns that indicate low viral potential. These don't disqualify a clip from selection, but flag it for lower priority when ranking:

- **No hook type match**: Generic opener with no recognizable viral hook structure (curiosity, controversy, story, result, fomo, self_id)
- **No loop opportunity**: Clip ends in a way that actively discourages replay — long fade, speaker walks away, or cuts mid-sentence
- **Duration mismatch**: Clip length doesn't fit any platform sweet spot (e.g., 91-120s clips fit nowhere cleanly)
- **No share trigger**: Content is purely informational with no identity, utility, reaction, or recognition trigger
- **Retention cliff**: Long setup before any value delivery — loses viewers before the 8-second algorithm checkpoint
- **Weak cascade**: No visual change or movement in the first 1.3 seconds (static talking-head, black frame, slow zoom)

---

## Hook Type Identification

During Phase 3.5, classify the opening of each clip into exactly one of the 6 proven hook types. Use this to score the **1.3s Hook Type Match** category.

**Step 1:** Read the first 5 words of the clip's opening line.

**Step 2:** Match to the hook type whose defining mechanism is present:

| Hook Type | Defining Mechanism | Trigger Words / Patterns |
|-----------|-------------------|--------------------------|
| `curiosity` | Opens a knowledge gap | "Here's what...", "Nobody talks about...", "The reason why..." |
| `controversy` | Challenges a belief | "...is completely wrong", "Stop doing...", "Everyone says X, but..." |
| `story` | Drops into narrative | "I was...", "Last [time]...", "It started when..." |
| `result` | Shows outcome first | Starts with the conclusion, achievement, or transformation |
| `fomo` | Creates urgency | "Before...", "This won't last...", "Right now..." |
| `self_id` | Mirror trigger | "POV:", "If you're someone who...", "For anyone who..." |

**Step 3:** If ambiguous between two types, score for the weaker one (conservative estimate).

**Step 4:** Output as `hook_type` using snake_case: `curiosity | controversy | story | result | fomo | self_id`
