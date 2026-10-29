---
node_type: decision
title: Existing harnesses instead of our own agent
description: "Paddock is a shell and infrastructure around existing agents (Codex, OpenCode, Hermes), not a new agent engine."
service: harness
status: active
updated: 2026-10-29
links:
  relates_to: [../reference/harness-protocol.md]
---

# Existing harnesses instead of our own agent

**Decision.** Do not write an agent loop. Take a harness as is (currently Codex app-server)
and add what the terminal lacks: web access, multiple panes, isolation, a proxy,
shared skills. Further harnesses plug in through an adapter to the common web UI protocol.

**Why.** Harnesses evolve quickly on their own (tools, models, context compaction);
our own agent would always be catching up. Paddock's value is in the integration and convenience, not in the agent.
