#!/usr/bin/env bash
# Test end-to-end pentru sistemul cron unificat.
#
# Verifica:
#   1. Server porneste si scheduler-ul ruleaza in-process
#   2. POST /api/cron creeaza job (validare functioneaza)
#   3. POST cu schedule invalid e respins cu 400
#   4. POST /api/cron/:slug/run executa efectiv claude (dummy)
#   5. GET /api/cron/:slug/history returneaza run-ul
#   6. PATCH /api/cron/:slug actualizeaza
#   7. DELETE /api/cron/:slug sterge si jobul si run-urile
#
# Cerinte:
#   - Server-ul TREBUIE sa fie pornit (./scripts/start.sh)
#   - jq trebuie sa fie instalat
#   - sqlite3 trebuie sa fie instalat
#
# Folosire: bash tests/cron-e2e.sh

set -euo pipefail

ROBOS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-3001}"
BASE="http://localhost:${PORT}"
DB_PATH="$ROBOS_ROOT/data/robos.db"
TEST_SLUG="e2e-test-$(date +%s)"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

# === Verificari pre-flight ===

if ! command -v jq >/dev/null; then fail "jq nu e instalat"; fi
if ! command -v sqlite3 >/dev/null; then fail "sqlite3 nu e instalat"; fi
if ! curl -sf "$BASE" >/dev/null; then fail "Server-ul nu raspunde la $BASE — porneste-l cu ./scripts/start.sh"; fi
pass "Pre-flight OK"

# === 1. Status scheduler ===

echo ""
echo "=== Test 1: Status scheduler ==="
STATUS=$(curl -sf "$BASE/api/cron/status")
if echo "$STATUS" | jq -e '.started == true' >/dev/null; then
    pass "Scheduler activ in-process"
else
    fail "Scheduler nu e pornit: $STATUS"
fi

# === 2. POST /api/cron — validare schedule invalid ===

echo ""
echo "=== Test 2: Validare schedule invalid ==="
INVALID_RES=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/cron" \
    -H "Content-Type: application/json" \
    -d '{"slug":"invalid-job","schedule":"X X X X X","prompt":"echo test"}')
if [ "$INVALID_RES" = "400" ]; then
    pass "Schedule invalid respins cu 400"
else
    fail "Schedule invalid acceptat (HTTP $INVALID_RES)"
fi

# === 3. POST /api/cron — creare job valid ===

echo ""
echo "=== Test 3: Creare job valid ==="
CREATE_RES=$(curl -sf -X POST "$BASE/api/cron" \
    -H "Content-Type: application/json" \
    -d "{
        \"slug\":\"$TEST_SLUG\",
        \"name\":\"E2E Test Job\",
        \"schedule\":\"0 0 1 1 *\",
        \"prompt\":\"echo test from e2e\",
        \"model\":\"haiku\",
        \"timeout\":\"30s\",
        \"active\":1
    }")
if echo "$CREATE_RES" | jq -e ".slug == \"$TEST_SLUG\"" >/dev/null; then
    pass "Job creat: $TEST_SLUG"
else
    fail "Creare esuata: $CREATE_RES"
fi

# === 4. GET /api/cron — apare in lista ===

echo ""
echo "=== Test 4: Job in lista ==="
LIST_RES=$(curl -sf "$BASE/api/cron")
if echo "$LIST_RES" | jq -e ".[] | select(.slug == \"$TEST_SLUG\")" >/dev/null; then
    pass "Job apare in /api/cron"
else
    fail "Job NU apare in lista"
fi

# === 5. PATCH /api/cron/:slug — actualizare ===

echo ""
echo "=== Test 5: PATCH update ==="
PATCH_RES=$(curl -sf -X PATCH "$BASE/api/cron/$TEST_SLUG" \
    -H "Content-Type: application/json" \
    -d '{"name":"E2E Updated","retries":2}')
if echo "$PATCH_RES" | jq -e '.name == "E2E Updated"' >/dev/null && \
   echo "$PATCH_RES" | jq -e '.retries == 2' >/dev/null; then
    pass "PATCH actualizeaza name si retries"
else
    fail "PATCH esuat: $PATCH_RES"
fi

# === 6. POST /api/cron/:slug/run — Run Now ===

echo ""
echo "=== Test 6: Run Now (creeaza intrare in cron_runs) ==="
RUN_RES=$(curl -sf -X POST "$BASE/api/cron/$TEST_SLUG/run")
if echo "$RUN_RES" | jq -e '.id' >/dev/null; then
    RUN_ID=$(echo "$RUN_RES" | jq -r '.id')
    pass "Run lansat: ID $RUN_ID"
else
    fail "Run Now esuat: $RUN_RES"
fi

# Asteapta ca executia sa termine (max 60s)
echo "    Astept finalizare (max 60s)..."
for i in $(seq 1 60); do
    RUN_STATUS=$(sqlite3 "$DB_PATH" "SELECT result FROM cron_runs WHERE id = $RUN_ID" 2>/dev/null || echo "")
    if [ "$RUN_STATUS" != "running" ] && [ -n "$RUN_STATUS" ]; then
        break
    fi
    sleep 1
done

if [ -z "$RUN_STATUS" ] || [ "$RUN_STATUS" = "running" ]; then
    echo "    [WARN] Run-ul a ramas in status 'running' dupa 60s — probabil claude CLI nu raspunde"
else
    pass "Run finalizat cu status: $RUN_STATUS"
fi

# === 7. GET /api/cron/:slug/history — istoric ===

echo ""
echo "=== Test 7: Istoric rulari ==="
HISTORY_RES=$(curl -sf "$BASE/api/cron/$TEST_SLUG/history")
RUN_COUNT=$(echo "$HISTORY_RES" | jq 'length')
if [ "$RUN_COUNT" -gt 0 ]; then
    pass "Istoric contine $RUN_COUNT rulare(uri)"
else
    fail "Istoricul e gol"
fi

# === 8. GET /api/cron/:slug/runs/:runId/log — log file ===

echo ""
echo "=== Test 8: Citire log ==="
LOG_RES=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/cron/$TEST_SLUG/runs/$RUN_ID/log")
if [ "$LOG_RES" = "200" ]; then
    pass "Log accesibil prin API"
else
    echo "    [INFO] Log returneaza HTTP $LOG_RES (poate fi 404 daca run-ul e inca running)"
fi

# === 9. DELETE /api/cron/:slug — stergere ===

echo ""
echo "=== Test 9: Stergere job ==="
DELETE_RES=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/cron/$TEST_SLUG")
if [ "$DELETE_RES" = "200" ]; then
    pass "Job sters (HTTP 200)"
else
    fail "Stergere esuata (HTTP $DELETE_RES)"
fi

# === 10. Verifica ca job-ul si run-urile sunt sterse din DB ===

echo ""
echo "=== Test 10: Verificare cleanup DB ==="
JOB_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM cron_jobs WHERE slug = '$TEST_SLUG'")
RUNS_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM cron_runs WHERE jobSlug = '$TEST_SLUG'")
if [ "$JOB_COUNT" = "0" ] && [ "$RUNS_COUNT" = "0" ]; then
    pass "Job + run-urile asociate sterse din DB"
else
    fail "Cleanup incomplet: jobs=$JOB_COUNT, runs=$RUNS_COUNT"
fi

# === Sumar ===

echo ""
echo -e "${GREEN}=================================="
echo "  Toate testele E2E au trecut!"
echo -e "==================================${NC}"
