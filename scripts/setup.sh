#!/usr/bin/env bash
# robOS setup — bash wrapper. Delega la scripts/setup.js (cross-platform).
# Daca nu ai bash (Windows fara WSL/Git Bash), ruleaza direct: node scripts/setup.js
set -euo pipefail

ROBOS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! command -v node &>/dev/null; then
    echo "EROARE: Node.js nu e instalat. robOS necesita Node >= 20."
    echo "Instaleaza de la https://nodejs.org"
    exit 1
fi

exec node "$ROBOS_ROOT/scripts/setup.js" "$@"
