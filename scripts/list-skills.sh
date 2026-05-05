#!/usr/bin/env bash
set -euo pipefail

ROBOS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CATALOG="$ROBOS_ROOT/skills/_catalog"
SKILLS_DIR="$ROBOS_ROOT/skills"

echo "=== robOS Skills ==="
echo ""

# Skills instalate
echo "INSTALATE:"
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
        desc=$(grep -m1 "^description:" "$d/SKILL.md" 2>/dev/null | sed 's/^description: *//;s/^"//;s/"$//' || echo "")
    fi

    echo "  $name${version:+ v$version}${desc:+ -- $desc}"
done

if [ "$installed_count" -eq 0 ]; then
    echo "  (niciuna)"
fi

echo ""

# Skills disponibile (in catalog dar neinstalate)
echo "DISPONIBILE (neinstalate):"
available_count=0
if [ -d "$CATALOG" ]; then
    for d in "$CATALOG"/*/; do
        [ -d "$d" ] || continue
        name=$(basename "$d")
        [ "$name" = "starter-packs" ] && continue

        # Sari peste cele deja instalate
        [ -d "$SKILLS_DIR/$name" ] && continue
        available_count=$((available_count + 1))

        version=""
        desc=""
        if [ -f "$d/SKILL.md" ]; then
            version=$(grep -m1 "^version:" "$d/SKILL.md" 2>/dev/null | sed 's/^version: *//' || echo "")
            desc=$(grep -m1 "^description:" "$d/SKILL.md" 2>/dev/null | sed 's/^description: *//;s/^"//;s/"$//' || echo "")
        fi

        echo "  $name${version:+ v$version}${desc:+ -- $desc}"
    done
fi

if [ "$available_count" -eq 0 ]; then
    echo "  (niciuna)"
fi

echo ""
echo "Instalare: ./scripts/add-skill.sh <nume>"
echo "Stergere:  ./scripts/remove-skill.sh <nume>"
