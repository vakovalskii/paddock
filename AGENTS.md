# Paddock — for agents

Entry point to the project knowledge base: [docs/README.md](docs/README.md) (OntoShip: read the folder index first, then the document).
What to do next: [docs/plans/roadmap.md](docs/plans/roadmap.md). Update an item's status in the same commit as the code.

- Web UI: `web/` (it has its own self-deploy instructions in `web/AGENTS.md`).
- Secrets live only in `secrets/` (in `.gitignore`). Docs say *where* a secret lives, never its value.
- After changing the web UI, `tests/ui-tour.mjs` and `tests/grid-edges.mjs` must pass.
- New document: frontmatter with `node_type`, a line in its folder's `README.md`, and at least one link.
