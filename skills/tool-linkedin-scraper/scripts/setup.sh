#!/bin/bash
# tool-linkedin-scraper setup: detect and install uv
set -e

echo "=== tool-linkedin-scraper: checking dependencies ==="
echo ""

MISSING=0

# ── uv ──────────────────────────────────────────────────────────────────
if command -v uv &>/dev/null; then
    echo "  uv ............ installed ($(uv --version 2>/dev/null || echo 'ok'))"
else
    echo "  uv ............ not found — installing..."
    if command -v brew &>/dev/null; then
        brew install uv
    else
        curl -LsSf https://astral.sh/uv/install.sh | sh
        export PATH="$HOME/.local/bin:$PATH"
    fi

    if command -v uv &>/dev/null; then
        echo "  uv ............ installed"
    else
        echo "  uv ............ FAILED (try: brew install uv)"
        MISSING=1
    fi
fi

echo ""
if [ "$MISSING" -eq 0 ]; then
    echo "=== All dependencies ready ==="
else
    echo "=== Some dependencies failed — see above ==="
    exit 1
fi
