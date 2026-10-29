# tests

End-to-end tests with puppeteer-core against a running instance (needs Chrome; `CHROME=` sets the path, macOS default otherwise).

| file | what | run |
|---|---|---|
| `ui-tour.mjs` | 18 steps across the whole UI: login, answer, edit, model picker, tool cards, limits, folders, every settings tab, files panel, layouts; screenshots; archives its test chats | `HUB_PASS=… node tests/ui-tour.mjs /tmp/tour` |
| `grid-edges.mjs` | pane grid edge cases: splitter clamps 20/80, double-click, drag while answering, drop outside, 4→1→4, Alt+N, reload, close, 1280×720; bottom-right pane keeps a pasted message in view | `HUB_PASS=… node tests/grid-edges.mjs` |
| `images-and-screens.mjs` | Tools tab enables image generation, the agent draws a picture, thumbnail and lightbox, session tools popover, tokens/s; spends one NeuralDeep generation | `HUB_PASS=… node tests/images-and-screens.mjs /tmp/shots` |
| `two-factor.mjs` | 2FA: enable with QR (TOTP computed from the secret like Authy), login asks for a code, wrong code rejected, right code lets in; disables it back | `HUB_PASS=… node tests/two-factor.mjs` |
| `composer.mjs` | composer: pasted image opens the editor (draw, crop, rotate, undo), the image is sent and shown; long pastes collapse into a chip; reply-to-selection quote | `HUB_PASS=… node tests/composer.mjs` |
| `slash.mjs` | slash commands: the `/` hint list with arrow/Tab completion, `/help`, `!shell`, `/rename`, `/status`, `/diff`, `/fork`, `/compact`, `/new`; one model turn | `HUB_PASS=… node tests/slash.mjs` |
| `agents.mjs` | agents across panes: enables the Agents tool, one pane asks the other for a fact with `paddock-agents send --wait`; checks the answer, "from agent" in the receiver, the "Message to" card, both panes idle | `HUB_PASS=… node tests/agents.mjs /tmp/agents.png` |
| `destructive-approval.mjs` | the agent is told to `rm` a file: an approval card must appear (execpolicy rules), the test denies it, the file survives | `HUB_PASS=… node tests/destructive-approval.mjs` |
| `layout.mjs` | `?chat=<id>` follows the active chat and opens it from a link, the chat list collapses (remembered) and slides over on mobile, the side panel resizes and remembers its width | `HUB_PASS=… node tests/layout.mjs` |
| `lost-messages.mjs` | a link to a chat the server no longer has: the pane says so, the next message starts a new chat and stays visible | `HUB_PASS=… node tests/lost-messages.mjs` |
| `readme-screens.mjs` | README screenshots from existing chats, no new generations | `HUB_PASS=… node tests/readme-screens.mjs docs/img` |

`HUB_URL` (default `http://localhost:8088`; behind a domain the UI only accepts its own `PUBLIC_URL` origin), `HUB_EMAIL` (default `valera@hub.local`).
