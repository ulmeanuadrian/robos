# Frame Selection Guide

Heuristics for choosing the best frames from scene-detected candidates.

## Selection Criteria

### Prefer frames that show:

1. **Distinct visual states** — UI screens, dashboards, configuration panels, slide titles, code editors, terminal output. Each selected frame should show something visually different from the others.

2. **Demonstrative moments** — Cross-reference the transcript for language like:
   - "as you can see", "let me show you", "this is", "here's the"
   - "notice how", "look at", "on the screen", "this dashboard"
   - "the result is", "it looks like", "here we have"

3. **Topic transitions** — One frame per major topic or section. If the speaker covers 5 topics, aim for at least one frame from each.

4. **Information-dense visuals** — Charts, diagrams, architecture drawings, comparison tables, before/after states.

### Skip frames that show:

1. **Talking head only** — Unless the speaker is the sole visual content (no slides, no screen share)
2. **Near-duplicates** — Two frames of the same UI with minor cursor movement or scroll position changes
3. **Transition artifacts** — Blurred frames, half-loaded screens, fade-in/out moments
4. **Generic content** — Subscribe buttons, intro animations, sponsor segments

## How Many Frames

The right number depends on the video:

| Video type | Typical frame count |
|-----------|-------------------|
| Tutorial with screen share | 5-10 (one per major step) |
| Slide presentation | 3-8 (key slides, skip filler) |
| Product demo | 4-8 (distinct screens/features) |
| Talking head / interview | 2-4 (only when visuals change) |
| Code walkthrough | 5-10 (key code states) |

Never go below 2 or above 10 in the final selection. The candidate pool can be larger (up to 15), but the curated set stays tight.

## Writing Captions

Each selected frame gets a caption that:

- **Describes what the viewer sees** — "The Grafana dashboard showing three panels: request latency (p99), error rate, and throughput over the last 24 hours"
- **Explains why it matters** — "This is the baseline state before the optimization changes are applied"
- **Uses specific language** — Name UI elements, values, labels visible in the frame. Don't say "a screenshot of the app" — say what's in the screenshot.

Keep captions to 1-2 sentences. They should work as alt text and as figure captions in a document.

## Topic-Filtered Selection

When the user requests frames about specific topics (e.g. "screenshots about the architecture", "frames showing the dashboard"):

### How to match topics to frames

1. **Transcript scan first** — search the full transcript for segments where the speaker discusses the requested topic. Build a list of timestamp ranges (start of topic mention to next topic shift).
2. **Visual confirmation** — a frame only qualifies if BOTH conditions are true:
   - Its timestamp falls within or near (within ~30s) a topic-relevant transcript segment
   - Its visual content actually relates to the topic (a talking head during an architecture discussion does NOT count as an architecture frame)
3. **Be literal about topics** — if the user says "architecture", they want architecture diagrams, system overviews, infrastructure visuals. Not someone *talking about* architecture while facing the camera.
4. **Multiple topics** — if the user lists several topics, try to get at least one frame per topic. Label each frame with which topic it matches.
5. **No forced matches** — if a requested topic has no visual representation in the video (e.g. it was only discussed verbally with no screen share), say so explicitly rather than picking an irrelevant frame.

### Topic caption style

When filtering by topic, captions should lead with the topic connection:
- "**Architecture:** Full system diagram showing the three-layer stack — identity, skills, and brand context"
- "**Dashboard:** Command Centre view with 4 active cron jobs and cost tracking"
