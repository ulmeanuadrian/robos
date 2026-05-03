#!/usr/bin/env bash
set -euo pipefail

ROBOS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_DIR="$ROBOS_ROOT/.command-centre"
PID_FILE="$PID_DIR/server.pid"

# Source .env if it exists (before setting PORT so .env can override)
if [ -f "$ROBOS_ROOT/.env" ]; then
    set -a
    source "$ROBOS_ROOT/.env"
    set +a
fi

# PORT: CLI env > .env > default 3000
export PORT="${PORT:-3000}"

# Check if already running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        echo "Command Centre is already running (PID $OLD_PID)"
        echo "URL: http://localhost:${PORT}"
        exit 0
    else
        rm -f "$PID_FILE"
    fi
fi

# Check if centre exists
if [ ! -f "$ROBOS_ROOT/centre/server.js" ]; then
    echo "ERROR: centre/server.js not found."
    echo "Run ./scripts/setup.sh first."
    exit 1
fi

# Build if dist/ is missing
if [ ! -d "$ROBOS_ROOT/centre/dist" ]; then
    echo "Building dashboard (first run)..."
    cd "$ROBOS_ROOT/centre" && npx astro build 2>/dev/null
    cd "$ROBOS_ROOT"
fi

# Start server
mkdir -p "$PID_DIR"
nohup node "$ROBOS_ROOT/centre/server.js" > "$PID_DIR/server.log" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"

echo "Command Centre started (PID $SERVER_PID)"
echo "URL: http://localhost:${PORT}"
echo "Log: .command-centre/server.log"

# Open browser (best effort)
sleep 1
if command -v xdg-open &>/dev/null; then
    xdg-open "http://localhost:${PORT}" 2>/dev/null || true
elif command -v open &>/dev/null; then
    open "http://localhost:${PORT}" 2>/dev/null || true
fi
