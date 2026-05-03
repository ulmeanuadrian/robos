#!/usr/bin/env bash
set -euo pipefail

ROBOS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$ROBOS_ROOT/.command-centre/server.pid"

if [ ! -f "$PID_FILE" ]; then
    echo "Command Centre is not running (no PID file)"
    exit 0
fi

PID=$(cat "$PID_FILE")

if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "Command Centre stopped (PID $PID)"
else
    echo "Command Centre was not running (stale PID $PID)"
fi

rm -f "$PID_FILE"
