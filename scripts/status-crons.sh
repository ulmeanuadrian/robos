#!/usr/bin/env bash
set -euo pipefail

ROBOS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$ROBOS_ROOT/cron/status/daemon.pid"
STATUS_DIR="$ROBOS_ROOT/cron/status"
JOBS_DIR="$ROBOS_ROOT/cron/jobs"

echo "=== RobOS Cron Status ==="
echo ""

# Daemon status
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo "Daemon: RUNNING (PID $PID)"
    else
        echo "Daemon: STOPPED (stale PID file)"
    fi
else
    echo "Daemon: STOPPED"
fi

echo ""

# Job listing
echo "JOBS:"
echo "---"

job_count=0
if [ -d "$JOBS_DIR" ]; then
    for job_file in "$JOBS_DIR"/*.json; do
        [ -f "$job_file" ] || continue
        job_count=$((job_count + 1))

        name=$(python3 -c "import json; print(json.load(open('$job_file'))['name'])" 2>/dev/null || echo "$(basename "$job_file" .json)")
        schedule=$(python3 -c "import json; print(json.load(open('$job_file'))['schedule'])" 2>/dev/null || echo "?")
        skill=$(python3 -c "import json; print(json.load(open('$job_file')).get('skill', '-'))" 2>/dev/null || echo "-")
        enabled=$(python3 -c "import json; print(json.load(open('$job_file')).get('enabled', True))" 2>/dev/null || echo "True")

        status_icon="ON "
        [[ "$enabled" == "False" || "$enabled" == "false" ]] && status_icon="OFF"

        # Check last run
        last_run="-"
        status_file="$STATUS_DIR/${name}.status"
        if [ -f "$status_file" ]; then
            last_run=$(python3 -c "import json; print(json.load(open('$status_file')).get('last_run', '-'))" 2>/dev/null || echo "-")
        fi

        printf "  [%s] %-25s  %-15s  schedule: %s  last: %s\n" "$status_icon" "$name" "$skill" "$schedule" "$last_run"
    done
fi

if [ "$job_count" -eq 0 ]; then
    echo "  (no jobs configured)"
fi

echo ""
echo "Total: $job_count job(s)"
