---
node_type: runbook
title: New user
description: "add-user.sh: container, volumes and token; then the web UI user and ChatGPT login."
service: harness
status: active
updated: 2026-10-29
links:
  documents: [../../add-user.sh, ../../users/_template.yml]
---

# New user

1. `./add-user.sh <name>` (or with `--admin`, so their agent can edit the web UI). The script creates `users/<name>.yml` and a token, and appends the compose file to `.env`.
2. `docker compose up -d harness-<name>` to start the harness container.
3. `docker compose exec -w /build/current web npm run create-user -- <name>@hub.local '<password>'` — the part before `@` links the web UI user to their container.
4. The user logs in and, in Settings, connects ChatGPT (device code) or an API key.
