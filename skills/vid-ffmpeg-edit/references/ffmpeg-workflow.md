# FFmpeg Workflow Reference

## Subtitle Burn Filter Chain

ASS subtitles are burned directly into the video stream using the `ass` filter:

```bash
ffmpeg -i input.mp4 \
  -vf "ass=captions.ass" \
  -c:v libx264 -preset fast -crf 20 \
  -c:a copy \
  output.mp4
```

**Encoder settings:**
- `-c:v libx264` — H.264 video codec (universal compatibility)
- `-preset fast` — good speed/quality balance (~55s per clip)
- `-crf 20` — visually lossless quality (range: 0=best, 51=worst)
- `-c:a copy` — pass audio through without re-encoding

**Performance:** ~55 seconds per 60-second clip.

## ASS Subtitle Format Basics

ASS (Advanced SubStation Alpha) supports rich per-line styling, positioning, and color overrides. Key sections:

```
[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, ...
Style: Default,Montserrat,48,&H00FFFFFF,...

[Events]
Format: Layer, Start, End, Style, Name, MarginV, Effect, Text
Dialogue: 0,0:00:01.37,0:00:04.87,Default,,120,,{\c&H0066FFFF&}highlighted phrase{\r}
```

**Color format:** ASS uses `&HAABBGGRR` (alpha, blue, green, red — reversed from hex).

- White: `&H00FFFFFF`
- Orange highlight `#FF6600` → `&H000066FF`

## words_to_ass.py

Converts word-level JSON to a styled ASS file with phrase grouping and optional highlight.

**Input format:**
```json
{"words": [{"word": "Hello", "start": 0.12, "end": 0.45}, ...]}
```

**Phrase grouping:** Words are grouped into display phrases of 3–6 words, timed to the last word's end timestamp. Each phrase appears as a single subtitle event.

**Highlight logic:** One phrase at a time receives the highlight color override via inline ASS tags (`{\c&H...&}`). The algorithm identifies high-energy or semantically important phrases using heuristic scoring (word length, position, punctuation).

**Hook overlay:** If `--hook-text` is provided, a separate ASS event is inserted at time 0 spanning `--hook-duration` seconds, rendered in a larger font at the top of the frame.

## srt_to_words.py

Converts SRT format to word-level JSON before passing to `words_to_ass.py`.

```bash
python3 .claude/skills/00-longform-to-shortform/skill-pack/tools/srt_to_words.py input.srt --output words.json
```

SRT timestamps are split across words by even duration distribution within each subtitle block. This is an approximation — word-level JSON from Whisper or Groq is always preferred for accurate timing.

## Combined Subtitle + Illustration Pass

When illustrations are used, two sequential FFmpeg calls are made:

```bash
# Pass 1: burn subtitles
ffmpeg -i clip.mp4 -vf "ass=captions.ass" \
  -c:v libx264 -preset fast -crf 20 -c:a copy subtitled.mp4

# Pass 2: overlay illustrations
bash .claude/skills/00-longform-to-shortform/skill-pack/tools/overlay_illustrations.sh subtitled.mp4 final.mp4 --config moments.json
```

A single-pass approach combining both filters is possible but complicates the overlay shell script; two-pass keeps each tool focused and debuggable.
