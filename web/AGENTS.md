# Paddock web — instructions for the agent

This is the web UI through which the user talks to you. You are allowed to change it.

## Stack
Next.js (App Router) + assistant-ui + Better Auth (SQLite). Entry point: `server.ts` — HTTP plus the `/ws/codex` WebSocket bridge to your app-server. App-server protocol: `codex app-server generate-ts --out /tmp/ts`.

- `components/chat.tsx` — chat, thread list, tool and approval cards
- `lib/codex-client.ts` — JSON-RPC client; `lib/messages.ts` — turns events into messages
- `lib/auth.ts`, `app/login` — login; there is no sign-up

## How to deploy
1. Edit files in this folder.
2. Check the build locally: `npm ci && npm run build` (npm goes through the proxy, that is expected).
3. Request a deploy: `date +%s > .deploy-request`.
4. After 1–3 minutes, check `.deploy-status`: `deployed …`, `build FAILED …` or `rolled back …`.

The supervisor only switches traffic to a build that started and answers on `/login`. If something breaks, the previous version stays live, so the user does not lose the connection to you.

## Do not
- Remove the session or Origin check in `server.ts`, or expose capability tokens to the browser.
- Enable sign-up.
