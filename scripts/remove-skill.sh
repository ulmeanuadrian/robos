#!/usr/bin/env bash
set -euo pipefail

ROBOS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_DIR="$ROBOS_ROOT/skills"

usage() {
    echo "Folosire: remove-skill.sh <skill-name>"
    echo ""
    echo "Sterge un skill instalat."
    echo ""
    echo "Skills instalate:"
    for d in "$SKILLS_DIR"/*/; do
        [ -d "$d" ] || continue
        name=$(basename "$d")
        [ "$name" = "_catalog" ] && continue
        echo "  $name"
    done
    exit 1
}

[ $# -lt 1 ] && usage

SKILL_NAME="$1"
SKILL_DIR="$SKILLS_DIR/$SKILL_NAME"

if [ "$SKILL_NAME" = "_catalog" ]; then
    echo "EROARE: Nu poti sterge catalogul."
    exit 1
fi

if [ ! -d "$SKILL_DIR" ]; then
    echo "EROARE: Skill-ul '$SKILL_NAME' nu e instalat."
    exit 1
fi

# Confirmare
read -rp "Stergem skill-ul '$SKILL_NAME'? (y/N) " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Anulat."
    exit 0
fi

# Sterge directorul
rm -rf "$SKILL_DIR"
echo "[OK] Sters: $SKILL_NAME"

# Regenereaza skills/_index.json
if command -v node &>/dev/null; then
    node "$ROBOS_ROOT/scripts/rebuild-index.js"
fi
