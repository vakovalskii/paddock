---
node_type: plan
title: Paddock — work plan
description: "Everything the owner asked for during the 2026-10-28/29 session: what is done, what is in progress, what is next, in what order and how it is verified."
service: _platform
status: active
updated: 2026-10-29
generated: { by: claude-code/opus-5-5, at: 2026-10-29T06:40:00Z }
links:
  depends_on: [../reference/architecture.md, ../reference/harness-protocol.md]
  part_of: [README.md]
---

# Paddock — work plan

Tracking moved to GitHub issues: https://github.com/vakovalskii/paddock/issues — this file is the narrative plan.

The idea: **a simple solution that brings to the browser the way the owner works in iTerm**:
several agents in parallel, each with its own session, a statusline with all the numbers, quick
actions, no unnecessary abstractions. Each user gets an isolated container
with a harness (currently Codex); there is one web UI. See [architecture.md](../reference/architecture.md).

Statuses: ✅ done and verified · 🟡 in progress · ⬜ not started · ❔ needs the owner's decision.

## 1. Already there (verified e2e: `tests/ui-tour.mjs`, `tests/grid-edges.mjs`)

| what | how verified |
|---|---|
| ✅ Isolation: a container per user, outbound only through the egress proxy, LAN/host closed | manual checks from the container |
| ✅ Password login, no sign-up, Origin/session check on WS, harness tokens never reach the browser | 401/403 checks, tour |
| ✅ Chat: streaming, markdown, code highlighting, tool cards, web search results, diff | tour |
| ✅ Under each answer: model, reasoning effort, turn time (live timer) | tour |
| ✅ Editing a message and "regenerate" (thread/revert) | tour |
| ✅ Model and effort picker; NeuralDeep models by API key (Responses API) | tour, manual test by the owner |
| ✅ Status bar as a statusline: model, folder, context, cache, 7d limit | tour |
| ✅ Subscription limits, free resets (applied after confirmation), usage per day | tour |
| ✅ Settings: ChatGPT login by device code, API key, config.toml, proxy (admin), NeuralDeep, password | tour |
| ✅ Up to 4 chats on screen: drag and drop, borders, Alt+1…4, restored after reload | grid-edges (22 checks) |
| ✅ Changed-files panel (apply_patch): diff and contents | tour |
| ✅ New chat in a workspace folder, folder creation, chat archive | tour |
| ✅ "New version available" banner, self-deploy of the web UI by Codex itself with rollback | manual |

## 2. In progress

| # | task | details | done when |
|---|---|---|---|
| ✅ 2.1 | **Images via CLI** | `paddock-images generate/edit` command (NeuralDeep) + a skill; MCP removed — it does not work with NeuralDeep models, while every harness has a shell. Proxy for the shell via `shell_environment_policy.set` | an image is generated with both gpt and qwen (NeuralDeep), thumbnail in the chat |
| ✅ 2.2 | **Speed and TTFT under each answer, stored server-side** | `TTFT`, `N tok/s` = output tokens / time since the first token excluding tools; `turn_meta` table in the web UI's SQLite, which also keeps the last usage for the status bar after reload | visible under every new answer |
| ✅ 2.3 | **Tool registry (harness-agnostic)** | "Tools" tab in settings: catalog of Paddock CLI tools (images, more later) and skills — installed / enabled, on/off, version. One source in the web UI, installed into **all** of a user's harnesses the same way (file + skill in the harness home) | on/off from the web UI, visible on any harness |
| ✅ 2.4 | **What is active in a session** | in the chat pane (status bar → popover): which skills and CLIs this thread has, which were actually called | each pane has its own list |
| ✅ 2.9 | **Bug: message not visible in the bottom pane** | after opening a chat the pane was scrolled above the bottom and autoscroll did not kick in; also the bubble appeared only after the server replied. Now we stick to the bottom on open and on send, and show the bubble immediately | `tests/grid-edges.mjs` item 12 |
| ⬜ 2.5 | **English** | repo, README and docs in English; UI with an RU/EN switch (i18n dictionary, no libraries); a "how it all works" diagram | everything in EN, switch in settings |
| ✅ 2.6 | **UI rebranding** | "Codex Hub" → "Paddock" in the title, sidebar, login; localStorage keys with migration | "Codex Hub" appears nowhere |
| ⬜ 2.7 | **Screenshots from real sessions** | EN UI: 1 pane, 4 panes, image generation, settings — `tests/readme-screens.mjs` | images in the README |
| ⬜ 2.8 | **Public repo `vakovalskii/paddock`** | fresh history without the old commits (they contained a real proxy IP), secret scan, MIT | repo is public |

## 3. Next — in order

| # | task | details | ❔ |
|---|---|---|---|
| ✅ 3.1 | **Paste an image → editor** | Cmd+V of an image into the input opens a macOS-style editor: pencil, ellipse, rectangle, arrow, text, crop, rotate, undo, 7 colors, Cancel/Done. The result is a thumbnail in the input and in the message; the file goes to `<cwd>/.paddock/uploads/<thread>/`, and the turn gets a `localImage` | |
| ✅ 3.2 | **Reply to selection** | select text in an answer → a "Reply to selection" button inserts a `> …` quote into the input; the selection is also copied to the clipboard (like the quote-reply mod in Claude Code) | |
| ✅ 3.3 | **Collapsing long pastes** | a paste longer than ~10 lines becomes a chip `[Pasted text #N +36 lines]` (expand/remove); the full text goes into the turn — like in Claude Code | |
| ✅ 3.4 | **Right panel "like agentbelt"** | tabs next to "Files": **Network** (each proxy × chatgpt.com / api.openai.com / api.neuraldeep.ru: latency, dead), **Actions** (feed of shell/edit/read/web with counters, filter), **Sessions** (panes and their threads, layout snapshots) | |
| ⬜ 3.5 | **Storage** | a settings tab + a status bar warning when disk is <10% free: disk, service (builds, cache, DB), per user — sessions/archive/workspace/images | |
| ⬜ 3.6 | **Session retention** | auto-archive chats older than N days, delete archive older than M; off by default | N and M |
| ⬜ 3.7 | **Swappable harnesses** | one adapter per harness (Codex, OpenCode, Hermes, PicoClaw, coddy), chosen per chat and switchable on the fly. See [harness-protocol.md](../reference/harness-protocol.md) | what is "coddy"? |
| ⬜ 3.8 | **Mobility** | `paddock export <user>` / `import` of volumes, one command to bring everything up on a new host | |
| ⬜ 3.9 | **Network isolation between users** | a separate network per user; agents talk to each other only through the web UI (a "mailbox") | |
| ⬜ 3.10 | **Public access** | Traefik at the office entry point, domain + HTTPS | Cloudflare token, router access |
| ✅ 3.11 | 2FA (TOTP: Authy etc.) on login | better-auth plugin, QR in settings, backup codes, trusted browser for 30 days; `tests/two-factor.mjs`. Passkey — later | |
| ⬜ 3.12 | Rotation of `~/.codex` (sqlite logs, cache) | together with 3.6 | |
| ⬜ 3.13 | **Keys out of the model's context** | a NeuralDeep model pulled the key out of config.toml by itself and put it into a shell command — it ended up in the session log. Keep the key in a file the agent cannot read, or hand it out through the web UI | how to hide it |

## 4. Positioning: herdr, Orca and what we lack (2026-10-29)

- **herdr** — a terminal multiplexer for agents (tmux for agents, Rust): a PTY per agent, working/blocked/idle statuses, detach/reattach over SSH, a socket API so agents can poke each other. Single user, terminal, Apache-2.0 (AGPL until 2026-07-22).
- **bb** (get-bb/bb) — the closest in architecture: a Node server with a web interface inside a desktop app, harnesses via ACP. But it runs on your own machine; remote access means a tunnel/Tailscale, no containers or proxy. Full breakdown with links: [landscape.md](../reference/landscape.md). What we share is "several chats side by side"; theirs are terminal panes, ours are in the browser and on a server.
- **Orca** — a desktop app for fleet management: a worktree (including over SSH) per task, Runs / Tasks / Dispatches, decision gates, DAG, design mode. The focus is orchestration, not display.
- **Our real difference** — multi-user and isolation as the product: a container per person, a shared proxy, LAN and host closed; everything works from a phone without clients. Neither herdr nor Orca is designed for several people on one instance.

What we lack, to be planned (after 3.x, order to be discussed):

| # | task | from | details |
|---|---|---|---|
| ⬜ 4.1 | **Agent statuses in the sidebar** | herdr | blocked (waiting for approval) / working / done for each chat, visible without opening it; a push to the phone when an agent is waiting |
| ⬜ 4.2 | **Agents poke each other** | herdr (socket API) | through the web UI, not directly (see 3.9 — "mailbox"): agent A gives a task to agent B, the answer comes back to A's chat |
| ⬜ 4.3 | **Queues and dispatches** | Orca (Runs / Tasks / Dispatches) | a task queue per user, dispatched to free chats/harnesses, run history |
| ⬜ 4.4 | **A worktree per task** | Orca | a chat in a separate git worktree inside `workspace-<user>`, merging from the web UI |
| ⬜ 4.5 | **Decision gates** | Orca (decision gates) | a plan step waits for a human "yes" (from the web UI or Telegram), not just for a shell approval |
| ⬜ 4.6 | **Switching harnesses** | — | this is 3.7; without it "multi-harness" exists only in the README |
| ⬜ 4.7 | **Mobile layout, foldable phone** | herdr (working from a phone); Xiaomi 18 Fold | folded — one pane + swipe between chats; unfolded — 2 panes side by side; compact panel and status bar |

## 5. From the launch discussion (2026-10-29, Telegram) and after

The idea in one line: your own web UI, any harness under the hood; the infra (proxy, subscription, 2FA, domain) is part of the solution and installs on any VPS in Russia with a single `docker compose`.

| # | task | details | status |
|---|---|---|---|
| ⬜ 5.1 | **User-written plugins** | today the `web/tools/` registry is built-in only. Plugin format: `tool.json` + CLI + `SKILL.md` (already there) + optionally a right-panel tab (a page in a sandboxed iframe) and a server handler. Install from a git URL or a workspace folder in "Settings → Tools", version, update, removal. A `docs/plugins.md` guide + an example plugin in a separate repo | Refat's question about "building our own plugins" |
| ⬜ 5.2 | **ACP as the main harness protocol** | Agent Client Protocol (Zed): one adapter covers Gemini CLI, Claude Code (via an adapter), Codex (codex-acp), OpenCode and others. "Just a wrapper over ACP/CLI": Codex app-server stays the first adapter, ACP is the second, universal one. See 3.7 | |
| ⬜ 5.3 | **Harness containers attach to any interface** | a harness container is a self-contained building block: isolation, proxy, subscription, ACP/WS entry with a token. Not only Paddock can connect to it, but also Zed, another web UI, a CLI client. A documented container contract (ports, token, volumes, env) + an example of connecting from Zed | |
| ⬜ 5.4 | **Untouchable core + rollback** | the admin's harness may change the web UI however it likes, but there is a core that must not break: login and 2FA, session and Origin checks on WS, network isolation, egress. After a self-deploy the supervisor runs core checks (smoke e2e) and rolls back the build if any fails. Today it rolls back only if the build did not start | partially |
| ✅ 5.5 | **Names in compose** | project `codex-hub` → `paddock`, services `codex-<user>` → `harness-<user>`, volumes `harness-home-<user>`, image `paddock-harness-codex`, the admin's UI sources at `/workspace/paddock-web`. On the server the old volumes are copied into the new ones and kept as a backup | server migrated 2026-10-29, old `codex-hub_*` volumes kept as a backup |
| ⬜ 5.6 | **Multi-user = scaling containers** | one web UI for everyone + one harness container per user (+ infra: egress, edge). README: a "Multi-user" section — resources per user, how to add one, CPU/RAM limits, where it hits the ceiling | |
| ⬜ 5.8 | **Fleet: harnesses on many VPSes, a hub with a permanent address** | the central server (web UI, login/2FA, registry, routing) is the only one with a permanent domain and IP. Runner nodes on any VPS (including ones without a public IP) connect to the hub themselves via an outbound tunnel with a registration token; a node hosts harness containers and its own egress. The hub picks a node for each user: a pool/subset by labels (region, GPU, "Russia only", client), health, load; draining and moving a user between nodes (volume export/import, 3.8). Details in architecture.md, section "Fleet" | |
| ⬜ 5.7 | **Default harness from config** | a new user on NeuralDeep without ChatGPT: the web UI currently picks the model from `model/list` rather than from `model_provider` in config.toml — the test user ends up with a gpt model by default that they have no access to | bug |


## 6. Deferred / outside this repo

- PicoClaw as another harness → part of 3.7.
- Moving all Claude Code memory into an OntoShip knowledge base for Codex (267 files, secret cleanup) — a separate task in the operator's notes.
- A quote-reply hotkey for Codex CLI — a separate mod.

## How we track progress

Each item: code + an e2e check in `tests/` + its line here changes status. Secrets never get into the repo: everything is in `secrets/` (in `.gitignore`); docs only say where a secret lives.
