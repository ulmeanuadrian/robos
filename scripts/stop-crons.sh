#!/usr/bin/env bash
set -euo pipefail

ROBOS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$ROBOS_ROOT/cron/status/daemon.pid"

if [ ! -f "$PID_FILE" ]; then
    echo "Cron daemon nu ruleaza (fara PID file)"
    exit 0
fi

PID=$(cat "$PID_FILE")

if kill -0 "$PID" 2>/dev/null; then
    # Omoara daemonul si proceselor copil
    kill -- -"$PID" 2>/dev/null || kill "$PID" 2>/dev/null || true
    echo "Cron daemon oprit (PID $PID)"
else
    echo "Cron daemon nu rula (PID vechi $PID)"
fi

rm -f "$PID_FILE"
