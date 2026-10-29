---
node_type: decision
title: One harness container per user, outbound only through egress
description: "Why every user gets their own container with danger-full-access inside, instead of a shared agent with a sandbox."
service: harness
status: active
updated: 2026-10-29
links:
  relates_to: [../reference/architecture.md]
---

# One container per user, outbound only through egress

**Decision.** Each user is a separate harness container with their own volumes and token.
Inside, the agent may do anything (`danger-full-access`), because the container itself is the sandbox:
`cap_drop: ALL`, no direct network, the only way out is egress, LAN and host are closed.

**Why.** Sandboxes inside the harness (seatbelt/landlock) get in the way of real work: the agent
needs npm, git, builds. Isolating from the outside is simpler and more reliable. It also gives portability:
a user = a set of volumes.

**Cost.** Resources per container (limit 6 GB / 4 CPU); the shared `core` network is not split yet (roadmap 3.9).
