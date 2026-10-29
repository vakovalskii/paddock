---
node_type: index
title: docs — Paddock knowledge base
description: "Entry point to the documentation: architecture, harnesses, services, decisions, runbooks, plan."
service: _platform
status: active
updated: 2026-10-29
---

# docs — Paddock knowledge base

Organized the [OntoShip](https://github.com/vakovalskii/ontoship) way: markdown + a `README` index in every folder + git.
Every document has frontmatter with `node_type`; links are typed.

- [reference/architecture.md](reference/architecture.md) — how the pieces connect, isolation, where state lives
- [reference/harness-protocol.md](reference/harness-protocol.md) — the web UI protocol, adapters, switching harnesses
- [services/](services/README.md) — one folder per service: web, egress, harness, edge
- [decisions/](decisions/README.md) — architecture decision records (ADR)
- [ops/](ops/README.md) — deploy, new user, gotchas
- [plans/roadmap.md](plans/roadmap.md) — what is done, what is in progress, what is next
