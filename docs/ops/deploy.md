---
node_type: runbook
title: Bring up and deploy
description: "First launch on a server with docker compose, and deploying a new version of the web UI through the supervisor."
service: _platform
status: active
updated: 2026-10-29
links:
  documents: [../../docker-compose.yml, ../../web/supervisor.sh]
---

# Bring up and deploy

## From scratch

```bash
git clone https://github.com/vakovalskii/paddock && cd paddock
mkdir -p secrets/egress secrets/tokens && chmod 700 secrets
# secrets/egress/gost.yaml — proxy chain (example in docs/services/egress), plus an api block with a password
# secrets/web.env:
#   BETTER_AUTH_SECRET=<openssl rand -hex 32>
#   PUBLIC_URL=http://localhost:8088
#   GOST_API=http://egress:18080/api  GOST_API_USER=hub  GOST_API_PASS=<same as in gost.yaml>
#   ADMIN_USERS=<name>
./add-user.sh <name> --admin
docker compose up -d --build
docker compose exec -w /build/current web npm run create-user -- <name>@hub.local '<password, 12+ chars>'
```

Then log in to ChatGPT from the web UI: Settings → ChatGPT account → "Get code".

## New version of the web UI

```bash
rsync -az --exclude node_modules --exclude .next web/ server:paddock/web/
ssh server 'date +%s > paddock/web/.deploy-request'
ssh server 'cat paddock/web/.deploy-status'   # building → deployed / build FAILED / rolled back
```

The admin's own Codex does the same from inside: the UI sources are mounted for it at `/workspace/paddock-web`.

## Checks

```bash
HUB_PASS=... node tests/ui-tour.mjs /tmp/tour     # 18 steps across the whole web UI
HUB_PASS=... node tests/grid-edges.mjs            # 22 checks of the pane grid
```
