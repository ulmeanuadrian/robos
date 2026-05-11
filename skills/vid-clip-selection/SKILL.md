---
name: vid-clip-selection
version: 1.0.0
category: vid
description: "Analizeaza transcripturi video long-form sa identifice, scoreze si extraga cele mai bune clip-uri short-form. Framework de scoring 5-categorii (Hook Strength, Value Delivery, Clarity, Shareability, Completeness). Fuzzy matching pentru timestamps."
triggers:
  - "selecteaza clipuri"
  - "gaseste cele mai bune clipuri"
  - "clip selection"
  - "extrage shorts din transcript"
  - "analizeaza transcript pentru clipuri"
  - "ce clipuri sa extrag"
  - "select clips"
  - "find best clips"
  - "extract shorts from transcript"
  - "analyze transcript for clips"
negative_triggers:
  - "render video"
  - "reframe"
  - "edit subtitles"
context_loads:
  - context/learnings.md (section vid-clip-selection)
  - skills/vid-clip-selection/references/ (scoring + selection framework)
inputs:
  - transcript (required: path la SRT sau JSON word-level)
  - source_video (required: path video original pentru reframe step)
  - count (optional: numar clipuri target, default 7)
  - duration_range (optional: "min-max" seconds, default "45-90")
  - focus (optional: topics prioritare)
outputs:
  - clip_definitions.json (cu timestamps + scoring per clip)
  - selection-report.md (raport human-readable)
runtime_dependencies:
  - python: ">=3.11"
  - "rapidfuzz>=3.0.0"
tier: video-producer
---

# Clip Selection Engine

Transcript-based clip selection: parseaza transcripturi word-level, identifica cele mai bune momente short-form, scoreaza cu framework 5-categorii, rezolva la timestamps exact, hand-off la reframe + edit.

# Prerequisites

```bash
pip install -r skills/vid-clip-selection/lib/clip_extractor/requirements.txt
```

Cere: `rapidfuzz>=3.0.0` (fuzzy matching).

# 8-Phase Workflow

## Phase 0: Context

1. Read acest skill file
2. Read `references/selection-framework.md` si `references/scoring-framework.md`
3. Confirma parametrii cu user (skip in pipeline mode):
   - Transcript file path (.srt sau .json)
   - Source video path (pentru reframe)
   - Clip count target (default 7)
   - Duration range (default 45-90s)
   - Focus areas / topics

**Pipeline mode**: cand invocat de `00-longform-to-shortform` sau alt orchestrator, toate parametrii pass programmatic. Skip user confirm.

## Phase 1: Parse

```bash
PYTHONPATH="skills/vid-clip-selection/lib" python -m clip_extractor select parse --transcript "PATH_TO_SRT"
```

## Phase 2-7: Selection + Scoring

Citeste `references/scoring-framework.md` — 5 categorii:
1. **Hook Strength** — primele 3 secunde retin atentia?
2. **Value Delivery** — payoff clar in 15-30s?
3. **Clarity** — standalone fara context?
4. **Shareability** — viral trigger (surprize, contrarian, emotion)?
5. **Completeness** — start-end natural, NU cut mid-thought?

Viral scoring suplimentar: 6 categorii (hook type, cascade, retention curve, loop potential, platform fit, share trigger).

Duration aware:
- TikTok: 45-60s sweet spot
- Instagram Reels: 30-90s
- YouTube Shorts: 15-60s

## Phase 8: Output

Genereaza `clip_definitions.json`:
```json
[
  {
    "id": "clip_01",
    "start_seconds": 124.5,
    "end_seconds": 173.2,
    "duration": 48.7,
    "score": 8.5,
    "hook_strength": 9,
    "value_delivery": 8,
    "clarity": 9,
    "shareability": 8,
    "completeness": 9,
    "title": "...",
    "transcript_excerpt": "..."
  }
]
```

Plus `selection-report.md` human-readable cu rationale per clip.

# Rules

- **Mereu citeste framework references** inainte de scoring — NU scoring intuitiv
- **Duration range respectat strict** — NU clipuri sub 30s sau peste 120s
- **Cap pe count target** — daca user cere 7, returneaza top 7 (NU 8-10)
- **Pipeline mode**: skip user confirm, totul programmatic

# Self-Update

Daca user-ul flag-eaza issue — clipuri proaste, scoring inaccurate, duration off — actualizeaza `# Rules`.
