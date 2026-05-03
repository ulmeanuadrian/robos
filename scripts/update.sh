#!/usr/bin/env bash
set -euo pipefail

ROBOS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROBOS_ROOT"

echo "=== RobOS Update ==="
echo ""

# Protected files/dirs that must never be overwritten
PROTECTED=(
    "context/USER.md"
    "context/learnings.md"
    "context/memory"
    "brand"
    "clients"
    "projects"
    "cron/jobs"
    ".env"
)

# Check for uncommitted user changes in protected paths
HAS_CHANGES=0
for p in "${PROTECTED[@]}"; do
    if [ -e "$p" ] && ! git diff --quiet -- "$p" 2>/dev/null; then
        HAS_CHANGES=1
    fi
done

if [ "$HAS_CHANGES" -eq 1 ]; then
    echo "[INFO] You have local changes in protected files (this is normal)."
    echo "       These will NOT be overwritten by the update."
    echo ""
fi

# Store current centre hash to detect changes
CENTRE_HASH_BEFORE=""
if [ -d "centre" ]; then
    CENTRE_HASH_BEFORE=$(git log -1 --format="%H" -- centre/ 2>/dev/null || echo "")
fi

# Pull latest
echo "Pulling latest changes..."
git pull --ff-only || {
    echo ""
    echo "ERROR: Could not fast-forward. You may have local commits."
    echo "Resolve manually with: git rebase origin/main"
    exit 1
}

echo "[OK] Code updated"

# Check if centre changed
CENTRE_HASH_AFTER=""
if [ -d "centre" ]; then
    CENTRE_HASH_AFTER=$(git log -1 --format="%H" -- centre/ 2>/dev/null || echo "")
fi

if [ "$CENTRE_HASH_BEFORE" != "$CENTRE_HASH_AFTER" ] && [ -d "centre" ]; then
    echo ""
    echo "Command Centre was updated. Reinstalling dependencies..."
    cd "$ROBOS_ROOT/centre"
    npm install --production --silent
    cd "$ROBOS_ROOT"
    echo "[OK] Dependencies updated"

    # Check if server is running and needs restart
    PID_FILE="$ROBOS_ROOT/.command-centre/server.pid"
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        echo ""
        echo "[NOTE] Command Centre is running. Restart it to pick up changes:"
        echo "       ./scripts/stop.sh && ./scripts/start.sh"
    fi
fi

# Detect new skills in catalog
if [ -d "skills/_catalog" ]; then
    NEW_SKILLS=()
    for skill_dir in skills/_catalog/*/; do
        skill_name=$(basename "$skill_dir")
        if [ ! -d "skills/$skill_name" ]; then
            NEW_SKILLS+=("$skill_name")
        fi
    done

    if [ ${#NEW_SKILLS[@]} -gt 0 ]; then
        echo ""
        echo "New skills available in catalog:"
        for s in "${NEW_SKILLS[@]}"; do
            desc=""
            if [ -f "skills/_catalog/$s/SKILL.md" ]; then
                desc=$(grep -m1 "^description:" "skills/_catalog/$s/SKILL.md" 2>/dev/null | sed 's/^description: *//' || echo "")
            fi
            echo "  - $s${desc:+ -- $desc}"
        done
        echo ""
        echo "Install with: ./scripts/add-skill.sh <skill-name>"
    fi
fi

echo ""
echo "=== Update complete ==="
