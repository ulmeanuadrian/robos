#!/usr/bin/env bash
set -euo pipefail

ROBOS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$ROBOS_ROOT/cron/status/daemon.pid"

if [ ! -f "$PID_FILE" ]; then
    echo "Cron daemon is not running (no PID file)"
    exit 0
fi

PID=$(cat "$PID_FILE")

if kill -0 "$PID" 2>/dev/null; then
    # Kill the daemon and any child processes
    kill -- -"$PID" 2>/dev/null || kill "$PID" 2>/dev/null || true
    echo "Cron daemon stopped (PID $PID)"
else
    echo "Cron daemon was not running (stale PID $PID)"
fi

rm -f "$PID_FILE"
