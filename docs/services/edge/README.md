---
node_type: service
title: edge — entry point
description: "nginx 1.27: the only published port (127.0.0.1:8088 by default), WebSocket upgrade through to the web UI."
service: edge
status: active
updated: 2026-10-29
links:
  documents: [../../../edge/nginx.conf]
---

# edge — entry point

`EDGE_BIND` in `.env` decides which address to listen on (default `127.0.0.1`; from outside, use an SSH tunnel).
Public access: a domain + HTTPS on an external nginx/Traefik, and `PUBLIC_URL=https://…` in `secrets/web.env`
(the Origin check depends on it). See roadmap 3.10.
