#!/usr/bin/env bash
set -euo pipefail

ROBOS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLIENTS_DIR="$ROBOS_ROOT/clients"

usage() {
    echo "Folosire: add-client.sh <client-slug> [nume-afisat]"
    echo ""
    echo "Creeaza un workspace nou de client."
    echo ""
    echo "  client-slug   Lowercase, doar liniute (ex: acme-corp)"
    echo "  nume-afisat   Numele afisat (optional, default = slug)"
    echo ""
    echo "Clienti existenti:"
    for d in "$CLIENTS_DIR"/*/; do
        [ -d "$d" ] || continue
        echo "  $(basename "$d")"
    done 2>/dev/null || echo "  (niciunul)"
    exit 1
}

[ $# -lt 1 ] && usage

SLUG="$1"
CLIENT_NAME="${2:-$SLUG}"
CLIENT_DIR="$CLIENTS_DIR/$SLUG"

# Valideaza slug
if [[ ! "$SLUG" =~ ^[a-z0-9][a-z0-9-]*[a-z0-9]$ ]] && [[ ! "$SLUG" =~ ^[a-z0-9]$ ]]; then
    echo "EROARE: Slug invalid '$SLUG'. Foloseste lowercase, cifre si liniute."
    exit 1
fi

if [ -d "$CLIENT_DIR" ]; then
    echo "EROARE: Clientul '$SLUG' deja exista la $CLIENT_DIR"
    exit 1
fi

# Creeaza workspace
mkdir -p "$CLIENT_DIR"/{brand,context,projects,cron/jobs}

# Fisiere de brand (template-uri din root, sau create goale)
for f in voice.md audience.md positioning.md samples.md; do
    if [ -f "$ROBOS_ROOT/brand/$f" ]; then
        cp "$ROBOS_ROOT/brand/$f" "$CLIENT_DIR/brand/$f"
    else
        title=$(echo "$f" | sed 's/\.md//' | sed 's/^./\U&/')
        echo "# $title" > "$CLIENT_DIR/brand/$f"
    fi
done

# Fisiere context
cat > "$CLIENT_DIR/context/USER.md" <<EOF
# Profil Client

Nume: ${CLIENT_NAME}
Slug: ${SLUG}
Creat: $(date +%Y-%m-%d)

## Note
(Adauga context specific clientului aici)
EOF

cat > "$CLIENT_DIR/context/learnings.md" <<EOF
# Learnings — ${CLIENT_NAME}

## General
(Insights cross-skill pentru acest client)
EOF

mkdir -p "$CLIENT_DIR/context/memory"

# CLAUDE.md specific clientului
cat > "$CLIENT_DIR/CLAUDE.md" <<EOF
# Client: ${CLIENT_NAME}

Cand lucrezi la acest client, incarca contextul de aici, nu din root:
- Brand files: clients/${SLUG}/brand/
- User context: clients/${SLUG}/context/USER.md
- Memory: clients/${SLUG}/context/memory/
- Output: clients/${SLUG}/projects/

SOUL.md si skills din root raman valide. Doar brand/context se schimba.
EOF

echo "[OK] Workspace client creat: $CLIENT_DIR"
echo ""
echo "Structura:"
echo "  $CLIENT_DIR/"
echo "    brand/          — Fisiere brand client"
echo "    context/        — Context si memorie client"
echo "    projects/       — Livrabile client"
echo "    cron/jobs/      — Joburi cron specifice clientului"
echo "    CLAUDE.md       — Instructiuni client-specific"
echo ""
echo "Pas urmator: completeaza brand/ pentru acest client."
