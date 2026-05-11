# Viral Potential Score (VPS) Framework

Scores each clip's algorithmic and psychological viral potential across 6 categories (0-100 total). Runs as Phase 3.5 — after content quality scoring and before the RESOLVE phase.

**Platform Algorithm Data:** Read `.claude/skills/viral-short-form-video-master/references/` for current platform specs.

---

## VPS Categories

### 1. 1.3s Hook Type Match (0-20) — Critical

Does the opening match one of the 6 proven hook types?

| Hook Type | Definition | Example | Best For |
|-----------|-----------|---------|----------|
| `curiosity` | Opens a knowledge gap the viewer must close | "Here's what no one tells you about..." | Educational |
| `controversy` | Challenges a widely-held belief | "[Popular belief] is completely wrong" | Thought leadership |
| `story` | Drops the viewer into a narrative in motion | "I was about to give up when..." | Personal brand |
| `result` | Shows the end result first, then rewinds | [Show outcome, then explain how] | Tutorials |
| `fomo` | Creates urgency or scarcity | "Before this gets removed..." | Time-sensitive |
| `self_id` | Makes viewer instantly see themselves | "POV: You're someone who..." | Niche targeting |

**Scoring rubric:**
- **18-20**: Strong, unambiguous match to a proven hook type. Opens on the hook's defining beat within 1.3 seconds
- **14-17**: Matches a hook type but the opening beat is slightly soft or arrives at 2-3 seconds
- **10-13**: Hook type is identifiable but weak — the opening doesn't commit to it
- **0-9**: No recognizable hook type. Generic opener or starts mid-thought

---

### 2. Hook Success Cascade (0-20) — Critical

Will 65% of viewers watch 10+ seconds? Score the 3-part structure:

1. **Visual grab** — something changes, moves, or appears in frame in the first 1.3 seconds
2. **Value prop** — viewer understands what they'll get by watching within 3 seconds
3. **Curiosity gap** — an open loop that makes stopping feel uncomfortable

**Scoring rubric:**
- **18-20**: All 3 parts are present and strong. Scroll-stop is near-certain
- **14-17**: 2 of 3 parts are strong, third is present but soft
- **10-13**: Only 1-2 parts present, or all 3 present but weak
- **0-9**: No cascade structure. Viewer has no reason to stay past 3 seconds

---

### 3. Retention Curve Shape (0-20) — High

Based on YouTube benchmark data: will this clip achieve 70%+ completion? Does it have dip risk at the IG retention checkpoints?

**Retention checkpoints (IG algorithm watches at):** 3s, 8s, 12s

**YT retention benchmarks:**
- 80-90% average view duration = excellent (top 10% of content)
- 70-80% = strong (triggers recommendation boost)
- Each 10% improvement in retention = ~25% more impressions from algorithm
- Below 50% = suppressed in recommendations

**Scoring rubric:**
- **18-20**: No obvious dip triggers. Pacing is tight, information arrives before the viewer's attention peaks. Strong chance of 80%+ completion
- **14-17**: One soft moment that might cause a dip, but recovery is quick. 70%+ completion likely
- **10-13**: Noticeable slow section or mid-clip lull. Dip risk at 8s or 12s checkpoint
- **0-9**: Multiple lull moments or a pacing issue that will cause most viewers to drop. Below 50% completion likely

---

### 4. Loop & Replay Potential (0-20) — High

Could the ending connect back to the beginning? Is there a "wait, what?" moment that triggers replay?

**Why it matters:** TikTok's algorithm weights replays at 5x completion value. An ending that flows into the beginning creates an infinite-loop pattern that compounds reach.

**Scoring rubric:**
- **18-20**: Ending and beginning could loop naturally (thematic or sonic callback). Has a "wait, what just happened?" moment that demands replay
- **14-17**: Ending doesn't fully loop but delivers a satisfying payoff that makes the clip feel rewatchable
- **10-13**: Ending is clean but forgettable. Viewer moves on after first watch
- **0-9**: Clip ends abruptly or trails off. Actively discourages replay

---

### 5. Platform Duration Fit (0-10) — Medium

Does the clip duration hit a platform sweet spot?

| Platform | Sweet Spot | Notes |
|----------|-----------|-------|
| YouTube Shorts | ~55s | Maximizes watch-time percentage for <60s |
| TikTok | 15-30s | Peak completion rate window |
| Instagram Reels | 30-60s | IG algorithm rewards completion; 60s = max for Reels |

**Scoring rubric:**
- **8-10**: Hits the sweet spot for 2+ platforms simultaneously
- **5-7**: Hits the sweet spot for exactly 1 platform
- **2-4**: Duration is workable for at least 1 platform with minor trimming
- **0-1**: Duration is incompatible with any platform's sweet spot (e.g., 91-120s)

---

### 6. Share/Send Trigger (0-10) — Medium

Is this "send to a friend" content? Instagram's #1 algorithmic signal is sends-per-reach.

**Share trigger patterns:**
- Validates something the viewer already believes (identity affirmation)
- Reveals information a friend "needs to know" (utility share)
- Is so surprising or funny the viewer's first instinct is to tag someone (reaction share)
- Captures an experience so precisely the viewer thinks of a specific person (recognition share)

**Scoring rubric:**
- **8-10**: Clear "I need to send this to [specific person]" energy. Strong share trigger present
- **5-7**: Interesting enough to share but the impulse isn't immediate or specific
- **2-4**: Shareable with effort — viewer might share if asked, but won't spontaneously
- **0-1**: No share trigger. Content is consumed and forgotten

---

## Combined Score Formula

The VPS is additive to the existing content quality score, not a replacement.

```
final_combined_score = (content_quality_total * 0.6) + (viral_total * 0.4)
```

Where:
- `content_quality_total` = sum of the 5-category content scoring (max 100)
- `viral_total` = sum of the 6 VPS categories (max 100)
- `final_combined_score` = the authoritative ranking score for filtering and sorting

---

## Hook Type Identification Rules

When evaluating Phase 3.5, classify the clip's opening into exactly one hook type:

1. Read the first 5 words of the clip
2. Identify the primary mechanism: gap (curiosity), challenge (controversy), narrative entry (story), outcome-first (result), deadline (fomo), or mirror (self_id)
3. If ambiguous between two types, score for the weaker one (conservative estimate)
4. Output the classification as `hook_type` using the snake_case values: `curiosity | controversy | story | result | fomo | self_id`

---

## Viral Red Flags

Patterns that indicate low VPS regardless of content quality:

- **No hook type match**: Generic opener with no recognizable viral hook structure
- **No loop opportunity**: Clip ends in a way that actively discourages replay (long fade, speaker walks away, mid-sentence cut)
- **Duration mismatch**: Clip length doesn't fit any platform's sweet spot (e.g., 91-120s)
- **No share trigger**: Content is purely informational with no identity, utility, reaction, or recognition trigger
- **Retention cliff**: Long setup before any value delivery — loses viewers before the 8s checkpoint
- **Weak cascade**: Visual grab missing from first 1.3s (static frame, talking-head with no movement)

---

## JSON Output Schema

```json
{
  "viral_scores": {
    "hook_type": "curiosity",
    "hook_type_score": 18,
    "hook_cascade_score": 16,
    "retention_curve_score": 17,
    "loop_potential_score": 12,
    "platform_duration_fit": 8,
    "share_trigger_score": 7
  },
  "viral_total": 78,
  "combined_score": 83.2
}
```

Where `combined_score` = `(content_quality_total * 0.6) + (viral_total * 0.4)`.
