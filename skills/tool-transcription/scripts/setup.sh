#!/usr/bin/env bash
# tool-transcription setup: ensure ffmpeg + uv are available
# whisperx and torch are installed on-demand via uv run (inline deps in transcribe.py)
set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

echo "=== tool-transcription: checking dependencies ==="
echo ""

# --- uv ---
if ! command -v uv >/dev/null 2>&1; then
  echo "  uv ............ not found — installing..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi
command -v uv >/dev/null 2>&1 || fail "uv installation failed"
ok "uv: $(uv --version)"

# --- ffmpeg (required by whisperx for audio extraction from video) ---
if command -v ffmpeg >/dev/null 2>&1; then
  ok "ffmpeg: $(ffmpeg -version 2>&1 | head -1 | cut -d' ' -f1-3)"
else
  echo "  ffmpeg ........ not found — installing..."
  if command -v brew >/dev/null 2>&1; then
    brew install ffmpeg
  elif command -v apt-get >/dev/null 2>&1; then
    sudo apt-get install -y ffmpeg
  elif command -v choco >/dev/null 2>&1; then
    choco install ffmpeg -y
  else
    fail "ffmpeg not found. Install manually: https://ffmpeg.org/download.html"
  fi
  command -v ffmpeg >/dev/null 2>&1 && ok "ffmpeg installed" || fail "ffmpeg installation failed"
fi

echo ""
echo "=== tool-transcription setup complete ==="
echo "    Note: whisperx + torch (~1.5GB) will be downloaded on first transcription run."
