#!/usr/bin/env bash
set -euo pipefail

ROBOS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CATALOG="$ROBOS_ROOT/skills/_catalog"
SKILLS_DIR="$ROBOS_ROOT/skills"

usage() {
    echo "Folosire: add-skill.sh <skill-name>"
    echo ""
    echo "Instaleaza un skill din catalog in skills/."
    echo ""
    echo "Skills disponibile:"
    if [ -d "$CATALOG" ]; then
        for d in "$CATALOG"/*/; do
            [ -d "$d" ] || continue
            name=$(basename "$d")
            [ "$name" = "starter-packs" ] && continue
            desc=""
            if [ -f "$d/SKILL.md" ]; then
                desc=$(grep -m1 "^description:" "$d/SKILL.md" 2>/dev/null | sed 's/^description: *//;s/^"//;s/"$//' || echo "")
            fi
            installed=""
            [ -d "$SKILLS_DIR/$name" ] && installed=" [instalat]"
            echo "  $name${desc:+ -- $desc}${installed}"
        done
    else
        echo "  (catalogul e gol)"
    fi
    exit 1
}

[ $# -lt 1 ] && usage

SKILL_NAME="$1"
SKILL_SRC="$CATALOG/$SKILL_NAME"
SKILL_DST="$SKILLS_DIR/$SKILL_NAME"

# Validare
if [ ! -d "$SKILL_SRC" ]; then
    # Distinguish "doesn't exist anywhere" from "declared as planned in catalog.json".
    # If catalog.json declares it with "status": "planned", say so honestly.
    if command -v node &>/dev/null; then
        # Run node from $ROBOS_ROOT so relative path works on both Unix and Windows
        # (bash on Windows reports CATALOG as /c/... which Node can't resolve directly).
        STATUS=$(cd "$ROBOS_ROOT" && node -e "
            const fs=require('fs');
            const cat=JSON.parse(fs.readFileSync('skills/_catalog/catalog.json','utf-8'));
            const s=(cat.skills||[]).find(x => x.name === '$SKILL_NAME');
            console.log(s ? (s.status || 'available-but-no-source') : 'unknown');
        " 2>/dev/null || echo "unknown")
    else
        STATUS="unknown"
    fi
    if [ "$STATUS" = "planned" ]; then
        echo "Skill-ul '$SKILL_NAME' e PLANIFICAT dar nu are source pe disk inca."
        echo "Vezi catalog.json — feature pe roadmap, nu instalabil acum."
        exit 1
    fi
    echo "EROARE: Skill-ul '$SKILL_NAME' nu exista in catalog."
    echo "Ruleaza: ./scripts/list-skills.sh ca sa vezi ce e disponibil."
    exit 1
fi

if [ ! -f "$SKILL_SRC/SKILL.md" ]; then
    echo "EROARE: $SKILL_SRC/SKILL.md lipseste. Catalogul e corupt."
    exit 1
fi

if [ -d "$SKILL_DST" ]; then
    echo "Skill-ul '$SKILL_NAME' e deja instalat."
    echo "Pentru reinstalare: ./scripts/remove-skill.sh $SKILL_NAME"
    exit 0
fi

# Copiaza skill-ul
cp -r "$SKILL_SRC" "$SKILL_DST"
echo "[OK] Instalat: $SKILL_NAME"

# Regenereaza skills/_index.json (single source of truth)
if command -v node &>/dev/null; then
    node "$ROBOS_ROOT/scripts/rebuild-index.js"
fi

echo ""
echo "Skill-ul '$SKILL_NAME' e gata. Rulezi cu trigger-ul natural sau '$SKILL_NAME' direct."
