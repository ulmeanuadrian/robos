#!/usr/bin/env bash
set -euo pipefail

ROBOS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_DIR="$ROBOS_ROOT/cron/status"
PID_FILE="$PID_DIR/daemon.pid"
DB_PATH="$ROBOS_ROOT/data/robos.db"
SERVER_PID_FILE="$ROBOS_ROOT/.command-centre/server.pid"

mkdir -p "$PID_DIR"

# === Verificari pre-flight ===

if [ ! -f "$DB_PATH" ]; then
    echo "EROARE: $DB_PATH nu exista. Ruleaza ./scripts/setup.sh inainte."
    exit 1
fi

# Daca dashboard-ul ruleaza, scheduler-ul deja e in-process — nu pornim daemon
if [ -f "$SERVER_PID_FILE" ]; then
    SERVER_PID=$(cat "$SERVER_PID_FILE")
    if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
        echo "Dashboard-ul ruleaza (PID $SERVER_PID) — scheduler-ul cron e deja activ in-process."
        echo "Nu trebuie daemon separat. Verifica status: ./scripts/status-crons.sh"
        exit 0
    fi
fi

# Verifica daca daemon standalone deja ruleaza
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
        echo "Daemon standalone deja ruleaza (PID $OLD_PID)"
        exit 0
    else
        rm -f "$PID_FILE"
    fi
fi

DAEMON_SCRIPT="$ROBOS_ROOT/centre/scripts/cron-daemon.js"
if [ ! -f "$DAEMON_SCRIPT" ]; then
    echo "EROARE: $DAEMON_SCRIPT nu exista. Ruleaza ./scripts/setup.sh inainte."
    exit 1
fi

# === Pornire daemon standalone ===

mkdir -p "$ROBOS_ROOT/cron/logs"

JOB_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM cron_jobs WHERE active = 1" 2>/dev/null || echo "0")

nohup node "$DAEMON_SCRIPT" > "$ROBOS_ROOT/cron/logs/daemon-$(date +%Y-%m-%d).log" 2>&1 &

echo "Daemon standalone pornit. ${JOB_COUNT} job(uri) active in DB."
echo ""
echo "Pentru a-l opri: ./scripts/stop-crons.sh"
echo "Pentru status:    ./scripts/status-crons.sh"
echo ""
echo "TIP: daca pornesti dashboard-ul (./scripts/start.sh), scheduler-ul ruleaza in-process — nu e nevoie de daemon separat."
