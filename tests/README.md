# tests

End-to-end tests with puppeteer-core in headless Chrome against a running instance (needs Chrome; `CHROME=` sets the path, macOS default otherwise).

Run everything and get a summary:

```bash
HUB_URL=https://… HUB_EMAIL=test@hub.local HUB_PASS=… \
HUB_SELECTION='{"model":"qwen3.8-27b","provider":"neuraldeep","effort":""}' node tests/run-all.mjs   # --quick skips image generation and agents; or name suites
```

Use a dedicated test user: suites create and archive chats, toggle tools and settings, and spend model turns. `lib.mjs` holds the shared login and wait helpers for the newer suites.

| file | what | run |
|---|---|---|
| `ui-tour.mjs` | 18 steps across the whole UI: login, answer, edit, model picker, tool cards, limits, folders, every settings tab, files panel, layouts; screenshots; archives its test chats | `HUB_PASS=… node tests/ui-tour.mjs /tmp/tour` |
| `grid-edges.mjs` | pane grid edge cases: splitter clamps 20/80, double-click, drag while answering, drop outside, 4→1→4, Alt+N, reload, close, 1280×720; bottom-right pane keeps a pasted message in view | `HUB_PASS=… node tests/grid-edges.mjs` |
| `images.mjs` | Images tool on, the agent draws a picture with `paddock-images`: thumbnail in the answer, opens large, statusbar marks the CLI as used, tok/s; one NeuralDeep generation | `HUB_PASS=… node tests/images.mjs /tmp/image.png` |
| `two-factor.mjs` | 2FA: enable with QR (TOTP computed from the secret like Authy), login asks for a code, wrong code rejected, right code lets in; disables it back | `HUB_PASS=… node tests/two-factor.mjs` |
| `composer.mjs` | composer: pasted image opens the editor (draw, crop, rotate, undo), the image is sent and shown; long pastes collapse into a chip; reply-to-selection quote | `HUB_PASS=… node tests/composer.mjs` |
| `slash.mjs` | slash commands: the `/` hint list with arrow/Tab completion, `/help`, `!shell`, `/rename`, `/status`, `/diff`, `/fork`, `/compact`, `/new`; one model turn | `HUB_PASS=… node tests/slash.mjs` |
| `agents.mjs` | agents across panes: enables the Agents tool, one pane asks the other for a fact with `paddock-agents send --wait`; checks the answer, "from agent" in the receiver, the "Message to" card, both panes idle | `HUB_PASS=… node tests/agents.mjs /tmp/agents.png` |
| `destructive-approval.mjs` | the agent is told to `rm` its own test files: Deny keeps the file, Allow deletes it, "For this session" deletes it and a different `rm` still asks (execpolicy rules); files made and checked with `!touch` / `!test` | `HUB_PASS=… node tests/destructive-approval.mjs` |
| `resilience.mjs` | network drops mid-turn and comes back: the full answer arrives without a reload, once; Stop interrupts and the chat keeps working; TTFT and model under answers survive a reload; phone width end to end | `HUB_PASS=… node tests/resilience.mjs` |
| `workspace.mjs` | sidebar search and archive, layout snapshots (save, change, restore, delete), every Settings tab, Codex settings saved and read back, language EN ↔ RU | `HUB_PASS=… node tests/workspace.mjs` |
| `layout.mjs` | `?chat=<id>` follows the active chat and opens it from a link, the chat list collapses (remembered) and slides over on mobile, the side panel resizes and remembers its width | `HUB_PASS=… node tests/layout.mjs` |
| `lost-messages.mjs` | a link to a chat the server no longer has: the pane says so, the next message starts a new chat and stays visible | `HUB_PASS=… node tests/lost-messages.mjs` |
| `readme-screens.mjs` | README screenshots from existing chats, no new generations | `HUB_PASS=… node tests/readme-screens.mjs docs/img` |

`HUB_URL` (default `http://localhost:8088`; behind a domain the UI only accepts its own `PUBLIC_URL` origin), `HUB_EMAIL` (default `valera@hub.local`; use a test user), `HUB_SELECTION` (model for new chats), `HUB_LANG` (`en` by default in the newer suites).
