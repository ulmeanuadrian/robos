#!/usr/bin/env bash
set -euo pipefail

ROBOS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_DIR="$ROBOS_ROOT/skills"
AGENTS_FILE="$ROBOS_ROOT/AGENTS.md"

usage() {
    echo "Usage: remove-skill.sh <skill-name>"
    echo ""
    echo "Remove an installed skill."
    echo ""
    echo "Installed skills:"
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
    echo "ERROR: Cannot remove the catalog."
    exit 1
fi

if [ ! -d "$SKILL_DIR" ]; then
    echo "ERROR: Skill '$SKILL_NAME' is not installed."
    exit 1
fi

# Confirm
read -rp "Remove skill '$SKILL_NAME'? (y/N) " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

# Remove directory
rm -rf "$SKILL_DIR"
echo "[OK] Removed skill: $SKILL_NAME"

# Remove from registry in AGENTS.md
if [ -f "$AGENTS_FILE" ]; then
    sed -i "/^| ${SKILL_NAME} |/d" "$AGENTS_FILE"
    echo "[OK] Removed from skill registry"
fi
