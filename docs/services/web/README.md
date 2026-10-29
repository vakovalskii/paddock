---
node_type: service
title: web — the web UI
description: "Next.js + assistant-ui: chat panes, statusline, settings; server.ts holds the WS bridge to harnesses; supervisor.sh builds and switches versions."
service: web
status: active
updated: 2026-10-29
links:
  documents: [../../../web]
  relates_to: [../../reference/architecture.md, ../../ops/deploy.md]
---

# web — the web UI

| file | what |
|---|---|
| `web/server.ts` | HTTP + `/ws/codex`: checks the cookie session and Origin; the user's token is added server-side |
| `web/components/chat.tsx` | workspace: connection, sidebar, 1/2/4 layout, drag and drop, borders, files |
| `web/components/pane.tsx` | a single pane: thread, turns, editing, model, composer, statusline |
| `web/lib/messages.ts` | harness events → messages and tool cards |
| `web/components/settings.tsx` | account, NeuralDeep, Codex, proxy, password (images — in progress) |
| `web/lib/proxy.ts` | gost API (admin only), outbound requests through egress |
| `web/tools/` | registry of Paddock tools (CLI + skill); the web UI installs them into the harness, see `web/tools/README.md` |
| `web/lib/turn-meta.ts` | `turn_meta` table in `/data/auth.db`: model, TTFT, tok/s, last usage of a turn |
| `web/supervisor.sh` | builds next to the old version, switches only when `/login` is alive, rolls back |

The admin is set by `ADMIN_USERS` in `secrets/web.env`. Deploy: [ops/deploy.md](../../ops/deploy.md).
