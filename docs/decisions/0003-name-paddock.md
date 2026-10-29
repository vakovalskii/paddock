---
node_type: decision
title: The name — Paddock
description: "Why the project is called Paddock and not codex-hub."
service: _platform
status: active
updated: 2026-10-29
---

# The name — Paddock

There will be several harnesses, so the name should not be about Codex. A paddock is the enclosure at a racecourse:
everyone has their own stall (container), the horses (harnesses) can be swapped, and there is one grandstand (the web UI).
The compose project is `paddock` (formerly `codex-hub`), harness services are `harness-<user>` (formerly `codex-<user>`).
The working directory on the server is still `~/codex-hub`; it will be renamed when moving to the new harness layout,
so as not to disturb the running instance.
