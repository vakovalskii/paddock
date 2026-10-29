---
node_type: gotcha
title: Gotchas
description: "What has already broken: binary WS frames, duplicate threads after revert, devDependencies in the build, password autofill, hydration, tests and uppercase."
service: _platform
status: active
updated: 2026-10-29
---

# Gotchas

- **app-server silently ignores binary WS frames.** `ws` yields a Buffer, and `send(Buffer)` sends a binary frame → the bridge passes `{ binary: isBinary }` explicitly (`web/server.ts`).
- **After `thread/revert`, `thread/list` returns the thread twice** (codex 0.165) — the web UI dedupes by id.
- **The build fails without devDependencies** — the supervisor runs `npm ci --include=dev`.
- **An email like `valera@hub` fails better-auth validation** — we use `@hub.local`.
- **Password managers fill the login into the first text field on the page** (the chat search) when they see a password field → password forms have a hidden `autocomplete="username"` field, and search has `type=search autocomplete=off`.
- **React #418 (hydration)**: the layout comes from localStorage on first render → the workspace is rendered client-side only.
- **Node `fetch` ignores `HTTPS_PROXY`** — outbound requests from the web UI go via CONNECT to egress (`viaEgress`), from the harness via curl.
- **Tests: `innerText` respects `text-transform: uppercase`** — compare case-insensitively.
- **Codex sessions are never cleaned up automatically** — see roadmap 3.6.
