#!/usr/bin/env bash
# Thin wrapper — delega la cross-platform add-client.js
exec node "$(dirname "$0")/add-client.js" "$@"
