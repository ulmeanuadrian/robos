#!/usr/bin/env bash
# Thin wrapper — delega la cross-platform start-crons.js
exec node "$(dirname "$0")/start-crons.js" "$@"
