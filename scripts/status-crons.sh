#!/usr/bin/env bash
set -euo pipefail

ROBOS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$ROBOS_ROOT/cron/status/daemon.pid"
DB_PATH="$ROBOS_ROOT/data/robos.db"

echo "=== robOS Cron Status ==="
echo ""

# Status daemon
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
        echo "Daemon: RULEAZA (PID $PID)"
    else
        echo "Daemon: OPRIT (PID file vechi)"
    fi
else
    echo "Daemon: OPRIT"
fi

echo ""

if [ ! -f "$DB_PATH" ]; then
    echo "EROARE: $DB_PATH nu exista. Ruleaza ./scripts/setup.sh inainte."
    exit 1
fi

# Listare joburi din DB cu ultima rulare
echo "JOBURI:"
echo "---"

JOBS=$(sqlite3 -separator $'\t' "$DB_PATH" "
    SELECT
        j.slug,
        j.name,
        j.schedule,
        j.active,
        COALESCE((SELECT result FROM cron_runs WHERE jobSlug = j.slug ORDER BY startedAt DESC LIMIT 1), '-'),
        COALESCE((SELECT startedAt FROM cron_runs WHERE jobSlug = j.slug ORDER BY startedAt DESC LIMIT 1), '-')
    FROM cron_jobs j
    ORDER BY j.name
" 2>/dev/null || echo "")

if [ -z "$JOBS" ]; then
    echo "  (niciun job in DB)"
    echo ""
    echo "Adauga: din dashboard (tab Schedule) sau prin fisier JSON in cron/jobs/"
    exit 0
fi

count=0
while IFS=$'\t' read -r slug name schedule active last_result last_run; do
    [ -z "$slug" ] && continue
    count=$((count + 1))
    icon="ON "
    [ "$active" = "0" ] && icon="OFF"
    printf "  [%s] %-25s  schedule: %-15s  ultima: %s (%s)\n" "$icon" "$name" "$schedule" "$last_result" "$last_run"
done <<< "$JOBS"

echo ""
echo "Total: $count job(uri)"
