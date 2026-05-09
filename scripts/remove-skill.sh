#!/usr/bin/env bash
# Thin wrapper — delega la cross-platform remove-skill.js
exec node "$(dirname "$0")/remove-skill.js" "$@"
