#!/bin/bash
#
# setup-python.sh — install Python + dependencies pentru tier-urile robOS care le necesita.
#
# Tier mapping:
#   - content-creator → Python 3.11+, ffmpeg, pandoc, Playwright Chromium, uv, yt-dlp
#   - video-producer  → + HandBrake CLI, Node 22+, npx hyperframes
#   - social-publisher → no Python deps
#   - researcher       → uv (pentru tool-linkedin-scraper, research-trending)
#
# Detecteaza platforma (macOS / Linux / WSL) si foloseste package manager-ul adecvat.
# Idempotent: re-rularea nu strica nimic — verifica inainte sa instaleze.
#
# Usage:
#   bash scripts/setup-python.sh                    # auto-detect, install Core deps
#   bash scripts/setup-python.sh --tier=video       # install Video Producer deps
#   bash scripts/setup-python.sh --check            # check ce e instalat, NU instaleaza

set -euo pipefail

TIER="content-creator"
CHECK_ONLY=false

for arg in "$@"; do
  case $arg in
    --tier=*) TIER="${arg#*=}";;
    --check) CHECK_ONLY=true;;
    *) echo "Unknown arg: $arg" && exit 1;;
  esac
done

# Color helpers (POSIX)
ok() { printf "\033[32m✓\033[0m %s\n" "$1"; }
fail() { printf "\033[31m✗\033[0m %s\n" "$1"; }
warn() { printf "\033[33m⚠\033[0m %s\n" "$1"; }
info() { printf "\033[36m→\033[0m %s\n" "$1"; }

# Detect platform
detect_platform() {
  case "$(uname -s)" in
    Darwin*) echo "macos";;
    Linux*)
      if grep -qi microsoft /proc/version 2>/dev/null; then
        echo "wsl"
      else
        echo "linux"
      fi
      ;;
    *) echo "unknown";;
  esac
}

PLATFORM=$(detect_platform)
info "Platform detected: $PLATFORM"
info "Tier: $TIER"
[ "$CHECK_ONLY" = true ] && info "Mode: check only (no install)"

# ─── Python 3.11+ ──────────────────────────────────────────────────────────────
check_python() {
  if command -v python3 >/dev/null 2>&1; then
    PYV=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
    PY_MAJOR=$(echo "$PYV" | cut -d. -f1)
    PY_MINOR=$(echo "$PYV" | cut -d. -f2)
    if [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -ge 11 ]; then
      ok "Python $PYV (>= 3.11)"
      return 0
    else
      fail "Python $PYV — necesita 3.11+"
      return 1
    fi
  else
    fail "Python 3 missing"
    return 1
  fi
}

install_python() {
  info "Installing Python 3.11+..."
  case $PLATFORM in
    macos)
      command -v brew >/dev/null 2>&1 || { fail "brew lipsa — install din https://brew.sh"; return 1; }
      brew install python@3.11 ;;
    linux|wsl)
      if command -v apt >/dev/null 2>&1; then
        sudo apt update && sudo apt install -y python3.11 python3-pip python3-venv
      elif command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y python3.11
      else
        fail "Package manager unsupported. Install Python 3.11+ manual."
        return 1
      fi ;;
    *) fail "Platform $PLATFORM unsupported"; return 1;;
  esac
  ok "Python 3.11+ installed"
}

# ─── ffmpeg ────────────────────────────────────────────────────────────────────
check_ffmpeg() {
  if command -v ffmpeg >/dev/null 2>&1; then
    ok "ffmpeg ($(ffmpeg -version | head -1 | awk '{print $3}'))"
    return 0
  else
    fail "ffmpeg missing"
    return 1
  fi
}

install_ffmpeg() {
  info "Installing ffmpeg..."
  case $PLATFORM in
    macos) brew install ffmpeg ;;
    linux|wsl)
      if command -v apt >/dev/null 2>&1; then
        sudo apt install -y ffmpeg
      elif command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y ffmpeg
      else
        fail "Package manager unsupported"; return 1
      fi ;;
  esac
  ok "ffmpeg installed"
}

# ─── pandoc ────────────────────────────────────────────────────────────────────
check_pandoc() {
  if command -v pandoc >/dev/null 2>&1; then
    ok "pandoc ($(pandoc --version | head -1 | awk '{print $2}'))"
    return 0
  else
    warn "pandoc missing (optional — tool-pdf-generator can use weasyprint fallback)"
    return 1
  fi
}

install_pandoc() {
  info "Installing pandoc..."
  case $PLATFORM in
    macos) brew install pandoc ;;
    linux|wsl)
      if command -v apt >/dev/null 2>&1; then
        sudo apt install -y pandoc
      elif command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y pandoc
      fi ;;
  esac
  ok "pandoc installed"
}

# ─── uv ────────────────────────────────────────────────────────────────────────
check_uv() {
  if command -v uv >/dev/null 2>&1; then
    ok "uv ($(uv --version | awk '{print $2}'))"
    return 0
  else
    fail "uv missing"
    return 1
  fi
}

install_uv() {
  info "Installing uv (Python package manager)..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  # Add to PATH for current session
  export PATH="$HOME/.local/bin:$PATH"
  ok "uv installed"
}

# ─── yt-dlp ────────────────────────────────────────────────────────────────────
check_ytdlp() {
  if command -v yt-dlp >/dev/null 2>&1; then
    ok "yt-dlp ($(yt-dlp --version 2>/dev/null || echo 'installed'))"
    return 0
  else
    fail "yt-dlp missing"
    return 1
  fi
}

install_ytdlp() {
  info "Installing yt-dlp..."
  if command -v pip3 >/dev/null 2>&1; then
    pip3 install --user yt-dlp
  elif command -v uv >/dev/null 2>&1; then
    uv tool install yt-dlp
  else
    fail "pip3 sau uv necesare pentru yt-dlp"
    return 1
  fi
  ok "yt-dlp installed"
}

# ─── HandBrake CLI (Video Producer tier) ───────────────────────────────────────
check_handbrake() {
  if command -v HandBrakeCLI >/dev/null 2>&1; then
    ok "HandBrake CLI"
    return 0
  else
    warn "HandBrake CLI missing (Video Producer tier — needed for video compression)"
    return 1
  fi
}

install_handbrake() {
  info "Installing HandBrake CLI..."
  case $PLATFORM in
    macos) brew install handbrake ;;
    linux|wsl)
      if command -v apt >/dev/null 2>&1; then
        sudo apt install -y handbrake-cli
      elif command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y HandBrake-cli
      fi ;;
  esac
  ok "HandBrake installed"
}

# ─── Node.js 22+ (Video Producer tier) ─────────────────────────────────────────
check_node() {
  if command -v node >/dev/null 2>&1; then
    NODE_MAJOR=$(node --version | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_MAJOR" -ge 22 ]; then
      ok "Node.js $(node --version)"
      return 0
    else
      fail "Node.js $(node --version) — necesita 22+"
      return 1
    fi
  else
    fail "Node.js missing"
    return 1
  fi
}

# ─── Main flow ─────────────────────────────────────────────────────────────────
echo
echo "═══════════════════════════════════════════════════════════════"
echo "  robOS Setup — Tier: $TIER"
echo "═══════════════════════════════════════════════════════════════"
echo

# Core requirements (all tiers cer Python)
echo "── Core Python deps ────────────────────────────────────────"
check_python || ([ "$CHECK_ONLY" = false ] && install_python)
check_uv || ([ "$CHECK_ONLY" = false ] && install_uv)

case $TIER in
  content-creator|video-producer|researcher)
    echo
    echo "── Content/Video tools ──────────────────────────────────────"
    check_ffmpeg || ([ "$CHECK_ONLY" = false ] && install_ffmpeg)
    check_pandoc || ([ "$CHECK_ONLY" = false ] && install_pandoc)
    check_ytdlp || ([ "$CHECK_ONLY" = false ] && install_ytdlp)
    ;;
esac

if [ "$TIER" = "video-producer" ]; then
  echo
  echo "── Video Producer extras ────────────────────────────────────"
  check_handbrake || ([ "$CHECK_ONLY" = false ] && install_handbrake)
  check_node
  if ! check_node; then
    info "Install Node.js 22+ manual:"
    info "  macOS: brew install node"
    info "  Linux: https://nodejs.org/en/download/package-manager/"
  fi
fi

echo
echo "── Per-skill setup scripts ──────────────────────────────────"
info "Skill-urile cu setup propriu vor rula la prima invocare:"
info "  tool-transcription/scripts/setup.sh   → WhisperX (~1.5GB)"
info "  tool-web-screenshot/scripts/setup.sh  → Playwright Chromium (~150MB)"
info "  tool-video-screenshots/scripts/setup.sh → yt-dlp + ffmpeg deps"
info "  viz-excalidraw-diagram/scripts/setup.sh → Playwright Chromium"
info "  viz-image-gen/scripts/setup.sh        → Python packages"

echo
echo "═══════════════════════════════════════════════════════════════"
ok "Setup complete pentru tier '$TIER'"
echo "═══════════════════════════════════════════════════════════════"
echo
echo "Next steps:"
echo "  1. Adauga API keys in .env pentru tier-ul ales"
echo "  2. Ruleaza un skill: ex 'transcribe video.mp4' (tool-transcription)"
echo "  3. Prima rulare per skill descarca modelele necesare (one-time)"
echo
