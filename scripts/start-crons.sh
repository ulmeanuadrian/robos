#!/usr/bin/env bash
set -euo pipefail

ROBOS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_DIR="$ROBOS_ROOT/cron/status"
PID_FILE="$PID_DIR/daemon.pid"
LOG_DIR="$ROBOS_ROOT/cron/logs"
JOBS_DIR="$ROBOS_ROOT/cron/jobs"

mkdir -p "$PID_DIR" "$LOG_DIR"

# Check if already running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
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
    echo "No cron jobs found in cron/jobs/."
    echo "Create a job file first. Example:"
    echo ""
    echo '  {'
    echo '    "name": "daily-blog-post",'
    echo '    "schedule": "0 9 * * 1-5",'
    echo '    "skill": "content-blog-post",'
    echo '    "args": {"topic": "auto"},'
    echo '    "enabled": true'
    echo '  }'
    echo ""
    echo "Save to: cron/jobs/daily-blog-post.json"
    exit 1
fi

# Daemon loop
cron_daemon() {
    local log_file="$LOG_DIR/daemon-$(date +%Y-%m-%d).log"

    echo "[$(date -Iseconds)] Cron daemon started. $job_count job(s) loaded." >> "$log_file"

    while true; do
        local now_minute
        now_minute=$(date +"%M %H %d %m %u")

        for job_file in "$JOBS_DIR"/*.json; do
            [ -f "$job_file" ] || continue

            # Parse job
            local enabled schedule name skill
            enabled=$(python3 -c "import json; print(json.load(open('$job_file')).get('enabled', True))" 2>/dev/null || echo "True")
            [ "$enabled" = "False" ] || [ "$enabled" = "false" ] && continue

            schedule=$(python3 -c "import json; print(json.load(open('$job_file'))['schedule'])" 2>/dev/null || continue)
            name=$(python3 -c "import json; print(json.load(open('$job_file'))['name'])" 2>/dev/null || echo "unknown")
            skill=$(python3 -c "import json; print(json.load(open('$job_file')).get('skill', ''))" 2>/dev/null || echo "")

            # Simple cron matching (minute hour day month weekday)
            local cron_min cron_hr cron_day cron_mon cron_dow
            read -r cron_min cron_hr cron_day cron_mon cron_dow <<< "$schedule"
            local cur_min cur_hr cur_day cur_mon cur_dow
            read -r cur_min cur_hr cur_day cur_mon cur_dow <<< "$now_minute"

            match_field() {
                local pattern="$1" value="$2"
                [ "$pattern" = "*" ] && return 0
                # Strip leading zeros for comparison
                value=$((10#$value))
                if [[ "$pattern" == *"/"* ]]; then
                    local step="${pattern#*/}"
                    [ $((value % step)) -eq 0 ] && return 0
                    return 1
                fi
                [ "$pattern" = "$value" ] && return 0
                return 1
            }

            if match_field "$cron_min" "$cur_min" && \
               match_field "$cron_hr" "$cur_hr" && \
               match_field "$cron_day" "$cur_day" && \
               match_field "$cron_mon" "$cur_mon" && \
               match_field "$cron_dow" "$cur_dow"; then

                local run_log="$LOG_DIR/${name}-$(date +%Y%m%d-%H%M).log"
                echo "[$(date -Iseconds)] Running: $name (skill: $skill)" >> "$log_file"

                # Execute via Claude Code if available, otherwise log
                if command -v claude &>/dev/null && [ -n "$skill" ]; then
                    local args
                    args=$(python3 -c "import json; d=json.load(open('$job_file')); print(json.dumps(d.get('args', {})))" 2>/dev/null || echo "{}")
                    claude -p "Run skill $skill with args: $args" > "$run_log" 2>&1 &
                else
                    echo "[$(date -Iseconds)] SKIPPED: claude CLI not available or no skill defined" >> "$log_file"
                fi

                # Write status
                echo "{\"name\":\"$name\",\"last_run\":\"$(date -Iseconds)\",\"status\":\"triggered\"}" > "$PID_DIR/${name}.status"
            fi
        done

        # Sleep until next minute
        sleep $((60 - $(date +%S)))
    done
}

# Start daemon in background
cron_daemon &
DAEMON_PID=$!
echo "$DAEMON_PID" > "$PID_FILE"

echo "Cron daemon started (PID $DAEMON_PID)"
echo "Jobs loaded: $job_count"
echo "Logs: cron/logs/"
echo ""
echo "Stop with: ./scripts/stop-crons.sh"
