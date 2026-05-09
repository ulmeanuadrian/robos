#!/usr/bin/env bash
# Thin wrapper — delega la cross-platform add-skill.js
exec node "$(dirname "$0")/add-skill.js" "$@"
