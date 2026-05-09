#!/usr/bin/env bash
# Thin wrapper — delega la cross-platform stop-crons.js
exec node "$(dirname "$0")/stop-crons.js" "$@"
