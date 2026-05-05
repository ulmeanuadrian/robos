#!/usr/bin/env bash
set -euo pipefail

ROBOS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROBOS_ROOT"

echo "=== robOS Update ==="
echo ""

# Fisiere/dir protejate care nu se rescriu niciodata
PROTECTED=(
    "context/USER.md"
    "context/learnings.md"
    "context/memory"
    "brand"
    "clients"
    "projects"
    "cron/jobs"
    "data"
    ".env"
)

# Verifica modificari ne-comise in fisierele protejate
HAS_CHANGES=0
for p in "${PROTECTED[@]}"; do
    if [ -e "$p" ] && ! git diff --quiet -- "$p" 2>/dev/null; then
        HAS_CHANGES=1
    fi
done

if [ "$HAS_CHANGES" -eq 1 ]; then
    echo "[INFO] Ai modificari locale in fisiere protejate (e normal)."
    echo "       NU vor fi suprascrise de update."
    echo ""
fi

# Stocheaza hash-ul curent al centre/ pentru detectie schimbari
CENTRE_HASH_BEFORE=""
if [ -d "centre" ]; then
    CENTRE_HASH_BEFORE=$(git log -1 --format="%H" -- centre/ 2>/dev/null || echo "")
fi

# Backup DB inainte de update
DB_FILE="$ROBOS_ROOT/data/robos.db"
if [ -f "$DB_FILE" ]; then
    cp "$DB_FILE" "${DB_FILE}.bak-$(date +%Y%m%d-%H%M%S)"
    echo "[OK] DB backup facut"
fi

# Pull
echo "Trag ultimele modificari..."
git pull --ff-only || {
    echo ""
    echo "EROARE: Nu pot face fast-forward. Probabil ai commit-uri locale."
    echo "Rezolva manual cu: git rebase origin/main"
    exit 1
}

echo "[OK] Cod actualizat"

# Verifica daca centre/ s-a schimbat
CENTRE_HASH_AFTER=""
if [ -d "centre" ]; then
    CENTRE_HASH_AFTER=$(git log -1 --format="%H" -- centre/ 2>/dev/null || echo "")
fi

if [ "$CENTRE_HASH_BEFORE" != "$CENTRE_HASH_AFTER" ] && [ -d "centre" ]; then
    echo ""
    echo "Command Centre s-a actualizat. Reinstalare dependinte..."
    cd "$ROBOS_ROOT/centre"
    npm install --production --silent
    cd "$ROBOS_ROOT"
    echo "[OK] Dependinte actualizate"

    # Verifica daca serverul ruleaza si trebuie restartat
    PID_FILE="$ROBOS_ROOT/.command-centre/server.pid"
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        echo ""
        echo "[NOTE] Command Centre ruleaza. Restarteaza-l pentru noile modificari:"
        echo "       ./scripts/stop.sh && ./scripts/start.sh"
    fi
fi

# Regenereaza skills/_index.json (in caz ca s-au schimbat skills)
if [ -f "$ROBOS_ROOT/scripts/rebuild-index.js" ]; then
    node "$ROBOS_ROOT/scripts/rebuild-index.js"
fi

# Detecteaza skills noi in catalog
if [ -d "skills/_catalog" ]; then
    NEW_SKILLS=()
    for skill_dir in skills/_catalog/*/; do
        skill_name=$(basename "$skill_dir")
        [ "$skill_name" = "starter-packs" ] && continue
        if [ ! -d "skills/$skill_name" ]; then
            NEW_SKILLS+=("$skill_name")
        fi
    done

    if [ ${#NEW_SKILLS[@]} -gt 0 ]; then
        echo ""
        echo "Skills noi in catalog:"
        for s in "${NEW_SKILLS[@]}"; do
            desc=""
            if [ -f "skills/_catalog/$s/SKILL.md" ]; then
                desc=$(grep -m1 "^description:" "skills/_catalog/$s/SKILL.md" 2>/dev/null | sed 's/^description: *//;s/^"//;s/"$//' || echo "")
            fi
            echo "  - $s${desc:+ -- $desc}"
        done
        echo ""
        echo "Instalare: ./scripts/add-skill.sh <nume>"
    fi
fi

echo ""
echo "=== Update gata ==="
