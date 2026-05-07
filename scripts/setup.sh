#!/usr/bin/env bash
# robOS setup — bash wrapper. Delega la scripts/setup.js (cross-platform).
set -euo pipefail

ROBOS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OS="$(uname -s 2>/dev/null || echo unknown)"

if ! command -v node >/dev/null 2>&1; then
    echo "EROARE: Node.js nu e instalat. robOS necesita Node >= 20." >&2
    case "$OS" in
        Darwin) echo "Ruleaza: brew install node" >&2 ;;
        Linux)  echo "Ruleaza: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs" >&2 ;;
        *)      echo "Descarca de la: https://nodejs.org" >&2 ;;
    esac
    exit 1
fi

exec node "$ROBOS_ROOT/scripts/setup.js" "$@"
