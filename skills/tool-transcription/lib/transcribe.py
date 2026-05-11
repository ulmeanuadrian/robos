# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "whisperx",
#   "torch",
# ]
# ///
"""Transcribe a local video or audio file using WhisperX.

Two output modes:
  --output=markdown     Clean markdown with frontmatter (default).
                        Use for content pipelines that just need the text.
  --output=words-json   JSON with word-level timestamps after WhisperX
                        alignment. Use for subtitling, video editing, or
                        any pipeline that needs precise timing.
"""

import argparse
import json
import re
import sys
from pathlib import Path
from datetime import datetime


SUPPORTED_VIDEO = {".mp4", ".mov", ".webm", ".mkv", ".avi"}
SUPPORTED_AUDIO = {".mp3", ".wav", ".m4a", ".flac", ".ogg"}
SUPPORTED = SUPPORTED_VIDEO | SUPPORTED_AUDIO


def slugify(text: str, max_len: int = 40) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:max_len].rstrip("-")


def source_type(file_path: Path) -> str:
    return "local_video" if file_path.suffix.lower() in SUPPORTED_VIDEO else "local_audio"


def transcribe(file_path: Path, model_name: str, language: str | None, device: str, batch_size: int) -> tuple[list[dict], str]:
    import whisperx

    compute_type = "float16" if device == "cuda" else "int8"
    model_kwargs = {"compute_type": compute_type}
    if language:
        model_kwargs["language"] = language

    print("  [1/3] Loading model...", file=sys.stderr)
    model = whisperx.load_model(model_name, device, **model_kwargs)

    audio = whisperx.load_audio(str(file_path))

    print("  [2/3] Transcribing...", file=sys.stderr)
    transcribe_kwargs = {"batch_size": batch_size}
    if language:
        transcribe_kwargs["language"] = language
    result = model.transcribe(audio, **transcribe_kwargs)

    detected_language = result.get("language", language or "unknown")

    print(f"  [3/3] Aligning (language: {detected_language})...", file=sys.stderr)
    model_a, metadata = whisperx.load_align_model(language_code=detected_language, device=device)
    result = whisperx.align(result["segments"], model_a, metadata, audio, device)

    return result["segments"], detected_language


def segments_to_text(segments: list[dict]) -> str:
    lines = []
    prev = None
    for seg in segments:
        text = seg.get("text", "").strip()
        if not text or text == prev:
            continue
        lines.append(text)
        prev = text
    return " ".join(lines)


def segments_to_words_json(segments: list[dict]) -> dict:
    """Flatten WhisperX alignment output to {words: [{start, end, word}, ...]}.

    Words missing the 'start' key (rare; happens when the aligner couldn't
    place a word) are skipped — downstream tools (ASS subtitling, clip
    selection) need timing for every entry.
    """
    words = []
    for seg in segments:
        for w in seg.get("words", []):
            if "start" not in w or "end" not in w:
                continue
            words.append({
                "start": float(w["start"]),
                "end": float(w["end"]),
                "word": str(w.get("word", "")).strip(),
            })
    return {"words": words}


def main():
    parser = argparse.ArgumentParser(description="Transcribe local video/audio with WhisperX")
    parser.add_argument("--file", required=True, help="Path to video or audio file")
    parser.add_argument("--model", default="small", choices=["tiny", "base", "small", "medium", "large-v3"])
    parser.add_argument("--language", default=None, help="Language code (e.g. pt, en). Auto-detected if omitted.")
    parser.add_argument("--device", default="cpu", choices=["cpu", "cuda"])
    parser.add_argument("--batch-size", type=int, default=16, help="Batch size for transcription (higher = faster on GPU)")
    parser.add_argument("--output-dir", default=None, help="Output directory")
    parser.add_argument(
        "--output",
        default="markdown",
        choices=["markdown", "words-json"],
        help="markdown (default) writes a clean .md with frontmatter; "
             "words-json writes a .json with word-level timestamps.",
    )
    args = parser.parse_args()

    file_path = Path(args.file).resolve()
    if not file_path.exists():
        print(f"Error: file not found: {file_path}", file=sys.stderr)
        sys.exit(1)
    if file_path.suffix.lower() not in SUPPORTED:
        print(f"Error: unsupported format '{file_path.suffix}'. Supported: {', '.join(sorted(SUPPORTED))}", file=sys.stderr)
        sys.exit(1)

    today = datetime.now().date().isoformat()
    # Default output dir differs per mode: markdown lands in the social
    # content's inspiration folder; words-json lands in the longform
    # pipeline's transcripts folder. Caller can override with --output-dir.
    if args.output_dir:
        output_dir = Path(args.output_dir)
    elif args.output == "words-json":
        output_dir = Path(f"projects/sys-longform-to-shortform/{today}/transcripts")
    else:
        output_dir = Path(f"projects/sys-social-content/{today}/logs/inspiration")
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Transcribing: {file_path.name}  model={args.model}  device={args.device}  output={args.output}", file=sys.stderr)
    segments, detected_language = transcribe(file_path, args.model, args.language, args.device, args.batch_size)

    date_str = datetime.now().strftime("%Y-%m-%d")
    slug = slugify(file_path.stem)

    if args.output == "words-json":
        out_path = output_dir / f"{date_str}-{slug}.json"
        payload = segments_to_words_json(segments)
        # Include lightweight provenance alongside the words array so
        # downstream tools don't have to look up the source file.
        payload["meta"] = {
            "source_type": source_type(file_path),
            "source_path": str(file_path),
            "transcribed_at": date_str,
            "model": args.model,
            "language": detected_language,
        }
        out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    else:
        full_text = segments_to_text(segments)
        out_path = output_dir / f"{date_str}-{slug}.md"
        content = f"""---
source_type: {source_type(file_path)}
source_path: {file_path}
transcribed_at: {date_str}
model: {args.model}
language: {detected_language}
---

## Transcript

{full_text}
"""
        out_path.write_text(content, encoding="utf-8")

    print(str(out_path))


if __name__ == "__main__":
    main()
