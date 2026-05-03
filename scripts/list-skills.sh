#!/usr/bin/env bash
set -euo pipefail

ROBOS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CATALOG="$ROBOS_ROOT/skills/_catalog"
SKILLS_DIR="$ROBOS_ROOT/skills"

echo "=== RobOS Skills ==="
echo ""

# List installed skills
echo "INSTALLED:"
installed_count=0
for d in "$SKILLS_DIR"/*/; do
    [ -d "$d" ] || continue
    name=$(basename "$d")
    [ "$name" = "_catalog" ] && continue
    installed_count=$((installed_count + 1))

    version=""
    desc=""
    if [ -f "$d/SKILL.md" ]; then
        version=$(grep -m1 "^version:" "$d/SKILL.md" 2>/dev/null | sed 's/^version: *//' || echo "")
        desc=$(grep -m1 "^description:" "$d/SKILL.md" 2>/dev/null | sed 's/^description: *//' || echo "")
    fi

    echo "  $name${version:+ v$version}${desc:+ -- $desc}"
done

if [ "$installed_count" -eq 0 ]; then
    echo "  (none)"
fi

echo ""

# List available (not installed) from catalog
echo "AVAILABLE (not installed):"
available_count=0
if [ -d "$CATALOG" ]; then
    for d in "$CATALOG"/*/; do
        [ -d "$d" ] || continue
        name=$(basename "$d")

        # Skip if already installed
        [ -d "$SKILLS_DIR/$name" ] && continue
        available_count=$((available_count + 1))

        version=""
        desc=""
        if [ -f "$d/SKILL.md" ]; then
            version=$(grep -m1 "^version:" "$d/SKILL.md" 2>/dev/null | sed 's/^version: *//' || echo "")
            desc=$(grep -m1 "^description:" "$d/SKILL.md" 2>/dev/null | sed 's/^description: *//' || echo "")
        fi

        echo "  $name${version:+ v$version}${desc:+ -- $desc}"
    done
fi

if [ "$available_count" -eq 0 ]; then
    echo "  (none)"
fi

echo ""
echo "Install: ./scripts/add-skill.sh <name>"
echo "Remove:  ./scripts/remove-skill.sh <name>"
