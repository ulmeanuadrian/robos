#!/usr/bin/env bash
set -euo pipefail

ROBOS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== RobOS Setup ==="
echo ""

# Check Node.js version
if ! command -v node &>/dev/null; then
    echo "ERROR: Node.js is not installed. RobOS requires Node >= 20."
    echo "Install it from https://nodejs.org or via nvm."
    exit 1
fi

NODE_MAJOR=$(node -v | sed 's/^v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
    echo "ERROR: Node.js $(node -v) detected. RobOS requires Node >= 20."
    echo "Upgrade via: nvm install 20 && nvm use 20"
    exit 1
fi

echo "[OK] Node.js $(node -v)"

# Install dependencies
if [ -d "$ROBOS_ROOT/centre" ] && [ -f "$ROBOS_ROOT/centre/package.json" ]; then
    echo ""
    echo "Installing Command Centre dependencies..."
    cd "$ROBOS_ROOT/centre"
    npm install --production --silent
    echo "[OK] Dependencies installed"

    # Initialize database
    if [ -f "$ROBOS_ROOT/centre/scripts/init-db.js" ]; then
        echo ""
        echo "Initializing database..."
        node "$ROBOS_ROOT/centre/scripts/init-db.js"
        echo "[OK] Database ready"
    fi
else
    echo ""
    echo "[SKIP] centre/ not found -- Command Centre will be set up separately"
fi

# Copy .env if needed
if [ ! -f "$ROBOS_ROOT/.env" ]; then
    cp "$ROBOS_ROOT/.env.example" "$ROBOS_ROOT/.env"
    echo "[OK] Created .env from template (edit it to add your API keys)"
else
    echo "[OK] .env already exists"
fi

# Collect user info
echo ""
echo "--- User Profile ---"
echo ""

read -rp "Your name: " user_name
read -rp "Your business/project: " user_business

if [ -n "$user_name" ]; then
    cat > "$ROBOS_ROOT/context/USER.md" <<USEREOF
# User Profile

Name: ${user_name}
Business: ${user_business}

## Preferences
(Claude will learn your preferences as you work together)
USEREOF
    echo ""
    echo "[OK] Wrote context/USER.md"
else
    echo ""
    echo "[SKIP] No name provided -- edit context/USER.md manually"
fi

# Ensure memory directory exists
mkdir -p "$ROBOS_ROOT/context/memory"

# Done
echo ""
echo "==================================="
echo " RobOS is ready."
echo ""
echo " Next steps:"
echo "   1. Edit .env with your API keys"
echo "   2. Fill in brand/ files for better output"
echo "   3. Run: ./scripts/start.sh"
echo "   4. Or just open Claude Code in this directory"
echo "==================================="
