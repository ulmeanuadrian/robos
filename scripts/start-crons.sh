#!/usr/bin/env bash
set -euo pipefail

ROBOS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_DIR="$ROBOS_ROOT/cron/status"
PID_FILE="$PID_DIR/daemon.pid"
JOBS_DIR="$ROBOS_ROOT/cron/jobs"

mkdir -p "$PID_DIR"

# Check if already running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
        echo "Cron daemon is already running (PID $OLD_PID)"
        exit 0
    else
        rm -f "$PID_FILE"
    fi
fi

# Count jobs
job_count=0
if [ -d "$JOBS_DIR" ]; then
    job_count=$(find "$JOBS_DIR" -name "*.json" -type f 2>/dev/null | wc -l)
fi

if [ "$job_count" -eq 0 ]; then
    echo "Niciun job cron gasit in cron/jobs/."
    echo "Creeaza un fisier job. Exemplu:"
    echo ""
    echo '  {'
    echo '    "name": "daily-blog-post",'
    echo '    "schedule": "0 9 * * 1-5",'
    echo '    "skill": "content-blog-post",'
    echo '    "args": {"topic": "auto"},'
    echo '    "enabled": true'
    echo '  }'
    echo ""
    echo "Salveaza in: cron/jobs/daily-blog-post.json"
    exit 1
fi

# Start Node.js cron daemon in background
DAEMON_SCRIPT="$ROBOS_ROOT/centre/scripts/cron-daemon.js"

if [ ! -f "$DAEMON_SCRIPT" ]; then
    echo "ERROR: $DAEMON_SCRIPT not found. Run setup.sh first."
    exit 1
fi

nohup node "$DAEMON_SCRIPT" > "$ROBOS_ROOT/cron/logs/daemon-$(date +%Y-%m-%d).log" 2>&1 &

echo "Stop with: ./scripts/stop-crons.sh"
