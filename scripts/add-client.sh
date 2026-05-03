#!/usr/bin/env bash
set -euo pipefail

ROBOS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLIENTS_DIR="$ROBOS_ROOT/clients"

usage() {
    echo "Usage: add-client.sh <client-slug> [client-name]"
    echo ""
    echo "Create a new client workspace."
    echo ""
    echo "  client-slug   Lowercase, hyphens only (e.g., acme-corp)"
    echo "  client-name   Display name (optional, defaults to slug)"
    echo ""
    echo "Existing clients:"
    for d in "$CLIENTS_DIR"/*/; do
        [ -d "$d" ] || continue
        echo "  $(basename "$d")"
    done 2>/dev/null || echo "  (none)"
    exit 1
}

[ $# -lt 1 ] && usage

SLUG="$1"
CLIENT_NAME="${2:-$SLUG}"
CLIENT_DIR="$CLIENTS_DIR/$SLUG"

# Validate slug
if [[ ! "$SLUG" =~ ^[a-z0-9][a-z0-9-]*[a-z0-9]$ ]] && [[ ! "$SLUG" =~ ^[a-z0-9]$ ]]; then
    echo "ERROR: Invalid slug '$SLUG'. Use lowercase letters, numbers, and hyphens."
    exit 1
fi

if [ -d "$CLIENT_DIR" ]; then
    echo "ERROR: Client '$SLUG' already exists at $CLIENT_DIR"
    exit 1
fi

# Create workspace
mkdir -p "$CLIENT_DIR"/{brand,context,projects,cron/jobs}

# Brand files (empty templates)
for f in voice.md audience.md positioning.md samples.md assets.md; do
    cp "$ROBOS_ROOT/brand/$f" "$CLIENT_DIR/brand/$f" 2>/dev/null || \
    echo "# $(echo "$f" | sed 's/\.md//' | sed 's/^./\U&/')" > "$CLIENT_DIR/brand/$f"
done

# Context files
cat > "$CLIENT_DIR/context/USER.md" <<EOF
# Client Profile

Name: ${CLIENT_NAME}
Slug: ${SLUG}
Created: $(date +%Y-%m-%d)

## Notes
(Add client-specific context here)
EOF

cat > "$CLIENT_DIR/context/learnings.md" <<EOF
# Learnings - ${CLIENT_NAME}

## General
(Cross-skill insights for this client go here)
EOF

mkdir -p "$CLIENT_DIR/context/memory"

# Client CLAUDE.md
cat > "$CLIENT_DIR/CLAUDE.md" <<EOF
# Client: ${CLIENT_NAME}

When working on this client, load context from this directory instead of the root:
- Brand files: clients/${SLUG}/brand/
- User context: clients/${SLUG}/context/USER.md
- Memory: clients/${SLUG}/context/memory/
- Output: clients/${SLUG}/projects/

Root-level SOUL.md and skills still apply. Only brand/context is overridden.
EOF

echo "[OK] Created client workspace: $CLIENT_DIR"
echo ""
echo "Structure:"
echo "  $CLIENT_DIR/"
echo "    brand/          -- Client brand files"
echo "    context/         -- Client context and memory"
echo "    projects/        -- Client deliverables"
echo "    cron/jobs/       -- Client-specific scheduled jobs"
echo "    CLAUDE.md        -- Client-specific instructions"
echo ""
echo "Next: Fill in brand/ files for this client."
