#!/usr/bin/env bash
# Thin wrapper — delega la cross-platform status-crons.js
exec node "$(dirname "$0")/status-crons.js" "$@"
