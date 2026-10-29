#!/bin/sh
set -e
# The base config is copied only on first start: after that config.toml lives on the volume and is edited by hand or by codex.
[ -f "$CODEX_HOME/config.toml" ] || cp /opt/codex/config.toml "$CODEX_HOME/config.toml"
# Approval rules for destructive commands are Paddock's, so they are refreshed on every start.
mkdir -p "$CODEX_HOME/rules"
cp /opt/codex/paddock.rules "$CODEX_HOME/rules/paddock.rules"
exec "$@"
