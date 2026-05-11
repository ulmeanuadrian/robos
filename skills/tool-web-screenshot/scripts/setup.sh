#!/usr/bin/env bash
# Setup script for tool-web-screenshot
# Ensures uv and Playwright chromium are available

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

# --- Python 3 ---
command -v python3 >/dev/null 2>&1 || fail "python3 not found. Install Python 3.10+ first."
ok "python3 found: $(python3 --version)"

# --- uv ---
if ! command -v uv >/dev/null 2>&1; then
  echo "Installing uv..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi
command -v uv >/dev/null 2>&1 || fail "uv installation failed"
ok "uv found: $(uv --version)"

# --- Playwright chromium ---
# Only install if not already present
PLAYWRIGHT_BROWSERS="$HOME/Library/Caches/ms-playwright"
if [ -d "$PLAYWRIGHT_BROWSERS" ] && ls "$PLAYWRIGHT_BROWSERS"/chromium-* >/dev/null 2>&1; then
  ok "Playwright chromium already installed"
else
  echo "Installing Playwright chromium (~200MB)..."
  uv run --with playwright python3 -m playwright install chromium
  ok "Playwright chromium installed"
fi

echo ""
echo "tool-web-screenshot setup complete."
