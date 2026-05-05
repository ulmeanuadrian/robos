#!/usr/bin/env bash
set -euo pipefail

ROBOS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_DIR="$ROBOS_ROOT/.command-centre"
PID_FILE="$PID_DIR/server.pid"

# Sursa .env (inainte de PORT, ca .env sa poata override-ui)
if [ -f "$ROBOS_ROOT/.env" ]; then
    set -a
    source "$ROBOS_ROOT/.env"
    set +a
fi

# PORT: env CLI > .env > default 3001 (3000 e folosit de multe dev servers)
export PORT="${PORT:-3001}"

# Verifica daca ruleaza deja
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        echo "Command Centre deja ruleaza (PID $OLD_PID)"
        echo "URL: http://localhost:${PORT}"
        exit 0
    else
        rm -f "$PID_FILE"
    fi
fi

# Verifica centre
if [ ! -f "$ROBOS_ROOT/centre/server.js" ]; then
    echo "EROARE: centre/server.js lipseste."
    echo "Ruleaza ./scripts/setup.sh inainte."
    exit 1
fi

# Build daca dist/ lipseste
if [ ! -d "$ROBOS_ROOT/centre/dist" ]; then
    echo "Build dashboard (prima rulare)..."
    cd "$ROBOS_ROOT/centre" && npx astro build 2>/dev/null
    cd "$ROBOS_ROOT"
fi

# Porneste serverul
mkdir -p "$PID_DIR"
nohup node "$ROBOS_ROOT/centre/server.js" > "$PID_DIR/server.log" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"

echo "Command Centre porneste (PID $SERVER_PID)..."
echo "Log: .command-centre/server.log"

# Health check — astept serverul sa raspunda
READY=0
for i in $(seq 1 15); do
    if curl -s -o /dev/null -w '' "http://localhost:${PORT}" 2>/dev/null; then
        READY=1
        break
    fi
    sleep 1
done

if [ "$READY" -eq 1 ]; then
    echo "[OK] Command Centre ruleaza la http://localhost:${PORT}"
    # Deschide browser (best effort)
    if command -v xdg-open &>/dev/null; then
        xdg-open "http://localhost:${PORT}" 2>/dev/null || true
    elif command -v open &>/dev/null; then
        open "http://localhost:${PORT}" 2>/dev/null || true
    elif command -v cmd.exe &>/dev/null; then
        cmd.exe /c start "http://localhost:${PORT}" 2>/dev/null || true
    fi
else
    echo "ATENTIE: Serverul nu a raspuns in 15 secunde."
    echo "Verifica logul: cat .command-centre/server.log"
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
        echo "EROARE: Procesul a murit. Ultimele 10 linii:"
        tail -10 "$PID_DIR/server.log" 2>/dev/null || true
        rm -f "$PID_FILE"
        exit 1
    fi
fi
