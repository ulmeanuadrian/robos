---
name: tool-humanizer
version: 1.0.0
category: tool
description: "Strip AI writing patterns from text. Detects and fixes 10 pattern categories across 3 modes: quick (obvious fixes), standard (full scan with scoring), and deep (voice-matched rewrite)."
triggers:
  - "umanizeaza"
  - "fa-l natural"
  - "sterge pattern AI"
  - "suna prea AI"
  - "curata textul"
  - "humanize this"
  - "make this sound human"
  - "remove AI patterns"
  - "AI detection"
negative_triggers:
  - "voce de brand"
  - "pozitionare"
  - "tradu"
  - "brand voice"
  - "positioning"
  - "translate"
context_loads:
  - brand/voice.md (reads, only in deep mode)
  - context/learnings.md (section tool-humanizer)
inputs:
  - text (required: the text to humanize, pasted or file path)
  - mode (optional: quick | standard | deep, default: standard)
outputs:
  - Cleaned text (returned inline or saved to original file)
  - Pattern report (standard and deep modes)
---

# Pattern Detection Library

Scan for these 10 pattern categories. Each has specific indicators:

## Pattern 1: Em Dash Overuse
- **Detect**: More than 1 em dash per 300 words
- **Fix**: Replace with commas, periods, parentheses, or restructure the sentence
- **Example**: "The tool -- which was built last year -- is fast" becomes "The tool (built last year) is fast" or split into two sentences

## Pattern 2: Rule of Three Repetition
- **Detect**: "X, Y, and Z" pattern appearing more than twice in the text
- **Fix**: Vary list lengths (2 items, 4 items, or rewrite as separate sentences)
- **Example**: "fast, reliable, and scalable" + "simple, elegant, and powerful" -- rewrite at least one

## Pattern 3: Inflated Symbolism
- **Detect**: Phrases like "tapestry of", "landscape of", "journey through", "fabric of", "beacon of", "mosaic of", "symphony of", "dance between", "gateway to", "cornerstone of", "pillar of"
- **Fix**: Replace with plain language or delete entirely
- **Example**: "the ever-evolving landscape of digital marketing" becomes "digital marketing"

## Pattern 4: Corporate Buzzwords
- **Detect**: "leverage", "synergy", "paradigm", "holistic", "ecosystem", "streamline", "optimize", "empower", "innovative", "cutting-edge", "best-in-class", "scalable", "robust", "seamless", "unlock"
- **Fix**: Replace with specific, concrete language
- **Example**: "leverage our robust ecosystem" becomes "use our tools"

## Pattern 5: Hedging Language
- **Detect**: "it's worth noting that", "it's important to remember", "it should be mentioned", "interestingly enough", "needless to say", "as a matter of fact", "when it comes to", "at the end of the day", "in terms of"
- **Fix**: Delete the hedge, start with the actual point
- **Example**: "It's worth noting that prices increased 12%" becomes "Prices increased 12%"

## Pattern 6: Promotional Superlatives
- **Detect**: "groundbreaking", "revolutionary", "game-changing", "world-class", "next-generation", "state-of-the-art", "unparalleled", "unprecedented", "transformative", "disruptive"
- **Fix**: Replace with evidence or specifics
- **Example**: "our groundbreaking solution" becomes "our solution (used by 3,000 teams)"

## Pattern 7: Predictable Structure
- **Detect**: Every paragraph is 3-4 sentences. Every section follows the same pattern (statement, explanation, example). Lists always have 3 items.
- **Fix**: Vary paragraph lengths (1 sentence, then 5 sentences, then 2). Mix formats. Let some sections be short, others long.

## Pattern 8: Negative Parallelism
- **Detect**: "not X but Y", "less about X, more about Y", "it's not just X, it's Y", "beyond X lies Y", "not merely X but rather Y"
- **Fix**: State what it IS directly, without the contrast crutch
- **Example**: "It's not just a tool, it's a partner" becomes "It's a partner in your workflow"

## Pattern 9: Conjunctive Phrase Abuse
- **Detect**: "moreover", "furthermore", "additionally", "in addition", "consequently", "subsequently", "nevertheless", "nonetheless" appearing more than once per 500 words
- **Fix**: Use simple connectors ("and", "but", "so", "then") or restructure to eliminate the need for a connector
- **Example**: "Furthermore, the data shows..." becomes "The data also shows..." or just start a new paragraph

## Pattern 10: Vague Attributions
- **Detect**: "experts say", "studies show", "research suggests", "many believe", "it is widely known", "according to sources", "professionals agree"
- **Fix**: Name the expert, cite the study, or remove the attribution if you can't back it up
- **Example**: "Studies show that 73% of marketers..." becomes "A 2025 HubSpot survey found that 73% of marketers..."

---

# Step 1: Receive Text

Accept text as:
- Pasted directly in the message
- File path (read the file)
- Output from another skill (called as post-processing)

Determine mode: `quick`, `standard`, or `deep`. Default to `standard` if not specified.

# Step 2: Quick Mode

Scan for Patterns 1, 3, 4, 5, and 6 only. These are the most obvious AI tells.

For each detection, flag the phrase, apply the fix, move on. Return cleaned text with no report.

# Step 3: Standard Mode

Scan for all 10 patterns. For each:

1. Count occurrences
2. Flag each instance with line reference
3. Apply fixes
4. Generate a pattern report:

```
Pattern Report:
- Em dashes: 4 found, 3 fixed (kept 1 that was stylistically appropriate)
- Rule of three: 2 found, 1 fixed
- Inflated symbolism: 0 found
- Corporate buzzwords: 3 found, 3 fixed
- Hedging: 5 found, 5 fixed
- Superlatives: 1 found, 1 fixed
- Structure: Paragraph variation added
- Negative parallelism: 0 found
- Conjunctive abuse: 2 found, 2 fixed
- Vague attributions: 1 found, 1 fixed

AI-pattern score: Before 7.2/10, After 2.1/10
(Lower is more human. Target: under 3.0)
```

Return cleaned text + pattern report.

# Step 4: Deep Mode

Requires `brand/voice.md`. If not available, fall back to standard mode.

1. Run the full standard scan first
2. Then rewrite to match the voice profile in `brand/voice.md`:
   - Match sentence rhythm patterns from voice.md
   - Use vocabulary from voice.md's approved list
   - Apply tone and personality traits
   - Adjust formality level
3. Compare the rewrite against the voice profile's "NOT this" examples
4. Generate an extended report including voice match score

# Step 5: Return Result and Log

- If called inline (user pasted text): return the cleaned text directly
- If called on a file: offer to overwrite or save as a new file
- If called by another skill: return the cleaned text to the calling skill

Append to `context/learnings.md` under `## tool-humanizer`: mode used, top patterns detected, before/after score, date completed.
