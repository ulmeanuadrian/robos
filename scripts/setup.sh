#!/usr/bin/env bash
set -euo pipefail

ROBOS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== robOS Setup ==="
echo ""

# Verifica Node.js
if ! command -v node &>/dev/null; then
    echo "EROARE: Node.js nu e instalat. robOS necesita Node >= 20."
    echo "Instaleaza de la https://nodejs.org sau prin nvm."
    exit 1
fi

NODE_MAJOR=$(node -v | sed 's/^v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
    echo "EROARE: Detectat Node.js $(node -v). robOS necesita Node >= 20."
    echo "Upgrade prin: nvm install 20 && nvm use 20"
    exit 1
fi

echo "[OK] Node.js $(node -v)"

# Verifica Claude CLI
if command -v claude &>/dev/null; then
    echo "[OK] Claude CLI gasit"
else
    echo ""
    echo "ATENTIE: Claude CLI nu e in PATH."
    echo "  robOS functioneaza optim cu Claude Code instalat."
    echo "  Instalare: https://docs.anthropic.com/en/docs/claude-code"
    echo "  Cron-ul nu va functiona fara el."
    echo ""
fi

# Instaleaza dependintele
if [ -d "$ROBOS_ROOT/centre" ] && [ -f "$ROBOS_ROOT/centre/package.json" ]; then
    echo ""
    echo "Instalez dependintele Command Centre..."
    cd "$ROBOS_ROOT/centre"
    npm install --silent
    echo "[OK] Dependinte instalate"

    # Build dashboard
    echo ""
    echo "Build dashboard..."
    npx astro build --silent 2>/dev/null || npx astro build
    echo "[OK] Dashboard built"

    # Initializare DB
    if [ -f "$ROBOS_ROOT/centre/scripts/init-db.js" ]; then
        echo ""
        echo "Initializez baza de date..."
        if ! node "$ROBOS_ROOT/centre/scripts/init-db.js"; then
            echo "EROARE: Initializarea DB-ului a esuat."
            exit 1
        fi
        DB_PATH="$ROBOS_ROOT/data/robos.db"
        if [ ! -f "$DB_PATH" ]; then
            echo "EROARE: Fisierul DB nu s-a creat la $DB_PATH"
            exit 1
        fi
        echo "[OK] DB gata"
    fi
else
    echo ""
    echo "[SKIP] centre/ nu exista — Command Centre se va seta separat"
fi

# Genereaza skills/_index.json
if [ -f "$ROBOS_ROOT/scripts/rebuild-index.js" ]; then
    echo ""
    echo "Generez skills/_index.json..."
    node "$ROBOS_ROOT/scripts/rebuild-index.js"
fi

# Copiaza .env daca lipseste
if [ ! -f "$ROBOS_ROOT/.env" ]; then
    cp "$ROBOS_ROOT/.env.example" "$ROBOS_ROOT/.env"
    echo "[OK] Creat .env din template (editeaza-l pentru chei API)"
else
    echo "[OK] .env deja exista"
fi

# Strange info user
echo ""
echo "--- Profilul userului ---"
echo ""

read -rp "Numele tau: " user_name
read -rp "Business / proiect: " user_business

if [ -n "$user_name" ]; then
    cat > "$ROBOS_ROOT/context/USER.md" <<USEREOF
# Profil User

Nume: ${user_name}
Business: ${user_business}

## Preferinte
(Claude isi va invata preferintele tale pe masura ce lucrati impreuna)
USEREOF
    echo ""
    echo "[OK] Scris context/USER.md"
else
    echo ""
    echo "[SKIP] Fara nume — editeaza context/USER.md manual"
fi

# Asigura directorul de memorie
mkdir -p "$ROBOS_ROOT/context/memory"

# Done
echo ""
echo "==================================="
echo " robOS e gata."
echo ""
echo " Pasi urmatori:"
echo "   1. Editeaza .env cu cheile tale API"
echo "   2. Completeaza brand/ pentru output mai bun"
echo "   3. Ruleaza: ./scripts/start.sh"
echo "   4. Sau deschide Claude Code in acest director"
echo "==================================="
