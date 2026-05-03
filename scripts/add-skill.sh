#!/usr/bin/env bash
set -euo pipefail

ROBOS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CATALOG="$ROBOS_ROOT/skills/_catalog"
SKILLS_DIR="$ROBOS_ROOT/skills"
AGENTS_FILE="$ROBOS_ROOT/AGENTS.md"

usage() {
    echo "Usage: add-skill.sh <skill-name>"
    echo ""
    echo "Install a skill from the catalog into active skills."
    echo ""
    echo "Available skills:"
    if [ -d "$CATALOG" ]; then
        for d in "$CATALOG"/*/; do
            [ -d "$d" ] || continue
            name=$(basename "$d")
            desc=""
            if [ -f "$d/SKILL.md" ]; then
                desc=$(grep -m1 "^description:" "$d/SKILL.md" 2>/dev/null | sed 's/^description: *//' || echo "")
            fi
            installed=""
            [ -d "$SKILLS_DIR/$name" ] && installed=" [installed]"
            echo "  $name${desc:+ -- $desc}${installed}"
        done
    else
        echo "  (catalog is empty)"
    fi
    exit 1
}

[ $# -lt 1 ] && usage

SKILL_NAME="$1"
SKILL_SRC="$CATALOG/$SKILL_NAME"
SKILL_DST="$SKILLS_DIR/$SKILL_NAME"

# Validate
if [ ! -d "$SKILL_SRC" ]; then
    echo "ERROR: Skill '$SKILL_NAME' not found in catalog."
    echo "Run: ./scripts/list-skills.sh to see available skills."
    exit 1
fi

if [ -d "$SKILL_DST" ]; then
    echo "Skill '$SKILL_NAME' is already installed."
    echo "To reinstall, remove it first: ./scripts/remove-skill.sh $SKILL_NAME"
    exit 0
fi

# Copy skill
cp -r "$SKILL_SRC" "$SKILL_DST"
echo "[OK] Installed skill: $SKILL_NAME"

# Update registry in AGENTS.md
if [ -f "$SKILL_DST/SKILL.md" ]; then
    version=$(grep -m1 "^version:" "$SKILL_DST/SKILL.md" 2>/dev/null | sed 's/^version: *//' || echo "0.0.0")
    category=$(grep -m1 "^category:" "$SKILL_DST/SKILL.md" 2>/dev/null | sed 's/^category: *//' || echo "unknown")
    desc=$(grep -m1 "^description:" "$SKILL_DST/SKILL.md" 2>/dev/null | sed 's/^description: *//' || echo "")

    # Append to registry table (before the empty line after the table header)
    if grep -q "^| Skill | Version | Category | Description |" "$AGENTS_FILE" 2>/dev/null; then
        # Add row after the separator line
        sed -i "/^|-------|---------|----------|-------------|$/a | ${SKILL_NAME} | ${version} | ${category} | ${desc} |" "$AGENTS_FILE"
        echo "[OK] Updated skill registry in AGENTS.md"
    fi
fi

echo ""
echo "Skill '$SKILL_NAME' is ready to use."
