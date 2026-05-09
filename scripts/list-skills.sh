#!/usr/bin/env bash
# Thin wrapper — delega la cross-platform list-skills.js
exec node "$(dirname "$0")/list-skills.js" "$@"
