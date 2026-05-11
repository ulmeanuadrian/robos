# Illustration Overlay Reference

## moments.json Config Format

The `overlay_illustrations.sh` script reads a JSON config describing when and where each illustration panel appears.

```json
{
  "moments": [
    {
      "time": 1.37,
      "duration": 3.5,
      "image": "01.png",
      "label": "Million Tokens",
      "position": "lower-right"
    },
    {
      "time": 37.07,
      "duration": 3.5,
      "image": "02.png",
      "label": "Context Rot",
      "position": "upper-right"
    }
  ]
}
```

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `time` | float | Start time in seconds (from transcript word timestamps) |
| `duration` | float | How long the panel is visible (default: 3.5s) |
| `image` | string | Filename of the illustration PNG (relative to working dir) |
| `label` | string | Caption text rendered below the image panel |
| `position` | string | One of: `lower-right`, `upper-right`, `lower-left`, `upper-left`, `center` |

## Position Options

On a 1080x1920 9:16 canvas, panels are anchored to corners or center with consistent padding:

| Position | Anchor | X offset | Y offset |
|----------|--------|----------|----------|
| `lower-right` | bottom-right | -20px | -200px (above subtitle band) |
| `upper-right` | top-right | -20px | +80px |
| `lower-left` | bottom-left | +20px | -200px |
| `upper-left` | top-left | +20px | +80px |
| `center` | center | 0 | 0 |

`lower-right` and `upper-right` are preferred for 9:16 content — they don't overlap the speaker's face when framing is left-biased.

## Panel Sizing

Illustration panels on a 1080x1920 canvas:

- **Image area:** 400x400px (square PNG, auto-scaled)
- **Panel width:** 440px (image + 20px padding each side)
- **Label:** rendered in 28px Montserrat below image, max 2 lines
- **Panel height:** 400px image + ~60px label area = ~460px total
- **Background:** semi-transparent dark card (`rgba(0,0,0,0.72)`, 12px corner radius)

## Fade Timing

Each panel fades in and out smoothly:

- **Fade in:** 0.3s (starts at `time`)
- **Hold:** `duration` - 0.6s
- **Fade out:** 0.3s

Implemented via FFmpeg `fade` filter on the overlay stream before compositing.

## Identifying Good Illustration Moments

When generating the `moments.json` from a transcript, select timestamps where:

1. **Concept introductions** — first mention of a key term or idea (`time` = word start)
2. **High-energy claims** — superlatives, numbers, surprising facts
3. **Metaphors or analogies** — visual concepts the audience would benefit from seeing
4. **Transitions** — topic shifts where a visual anchor helps retention

**Spacing rule:** Keep at least 5 seconds between panel start times to avoid visual clutter. Aim for 4-8 panels per 60-second clip.

**Prompt strategy for viz-image-gen:** Use the label text plus surrounding transcript context as the image prompt. Request a flat-color illustration style with a transparent or white background for clean compositing.

Example prompt: `"Flat illustration of a million tokens filling a context window, minimal style, white background"`

## overlay_illustrations.sh Usage

```bash
bash .claude/skills/00-longform-to-shortform/skill-pack/tools/overlay_illustrations.sh \
  input.mp4 \
  output.mp4 \
  --config moments.json
```

The script reads `moments.json`, builds an FFmpeg filter graph with one overlay per moment, and outputs the final MP4. Images must be present at the paths specified in the config before the script runs.
