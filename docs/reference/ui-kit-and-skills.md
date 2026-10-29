---
node_type: reference
title: UI kit and agent skills for a polished interface
description: "Which agent skills make UI alignment better, which UI kit to adopt for Next 16 + React 19 + Tailwind v4 + assistant-ui, and how to check layout automatically."
service: web
status: active
updated: 2026-10-29
---

# UI kit and agent skills for a polished interface

Paddock's web UI (`web/`) is Next 16.4 + React 19.3 + Tailwind 4.3 + `@assistant-ui/react` 0.15. It is about 3.7k lines of hand-rolled components with tokens in `web/app/globals.css` and no component library. Tooltips are native `title=` attributes, and the dialogs, menus and popovers are custom. The stars and dates below were pulled from the GitHub API on 2026-10-29. Every other fact links to the primary source it came from. Anything marked *unverified* is not confirmed.

## Recommendation

**UI kit: shadcn/ui on the Base UI base, as the primary kit.** Add assistant-ui's own shadcn registry components only where they help.

- **It is the default now.** Since 2026-07-02, new shadcn projects use Base UI by default and Radix is still supported ([changelog](https://github.com/shadcn-ui/ui/blob/main/apps/v4/content/docs/changelog/2026-07-base-ui-default.mdx)). Base UI is stable: 1.0 shipped on 2025-12-11 and the current release is 1.9.0 from 2026-10-09 ([releases](https://base-ui.com/react/overview/releases)).
- **It is built for Paddock's exact stack.** shadcn targets Tailwind v4 and React 19, and its theming uses CSS variables with `@theme inline`, OKLCH and `data-slot` hooks ([tailwind-v4 doc](https://ui.shadcn.com/docs/tailwind-v4)).
- **The agent owns the code.** Components are copied in as source, so the coding agent can read and edit them. That fits Paddock's self-modifying setup, described in `web/AGENTS.md`.
- **It speaks assistant-ui's format.** assistant-ui ships its components as a shadcn registry. `base-*` styles get Base UI-flavoured components ([assistant-ui install](https://www.assistant-ui.com/docs/installation)).
- **It now covers agent UIs.** shadcn added chat components in June 2026: MessageScroller, Message, Bubble and Attachment ([changelog](https://github.com/shadcn-ui/ui/blob/main/apps/v4/content/docs/changelog/2026-06-chat-components.mdx)). In October 2026 it added Trace, Code Block and 21 "AI Elements" patterns covering tool calls, reasoning, plans and subagents ([changelog](https://github.com/shadcn-ui/ui/blob/main/apps/v4/content/docs/changelog/2026-10-ai-elements.mdx)). These are close to what `tools.tsx` and `messages.tsx` render today.
- **It ships its own agent skill.** shadcn has an official skill, covered in the skills section below.

**Skills to install (top 6):**

| # | Skill | Why for Paddock |
|---|---|---|
| 1 | **shadcn skill** (`npx skills add shadcn/ui`) | Sets the house rules: semantic tokens, `gap` instead of `space-*`, `size-*`, no manual z-index on overlays, correct composition. It is the biggest lever on consistency once shadcn is adopted. |
| 2 | **Vercel `web-design-guidelines`** (already in `~/.claude/skills`) | Gives a review pass with `file:line` findings on a11y, focus, forms, typography and layout. |
| 3 | **Impeccable** (`pbakaus/impeccable`) | Its `layout`, `polish`, `audit` and `critique` commands plus 62 deterministic "slop" rules make it the best general UI-polish toolkit. It supports Codex too, which matters because the agent inside Paddock is Codex. |
| 4 | **Vercel `react-best-practices` + `composition-patterns`** | Good React and Next code hygiene. Not visual, but it keeps the component code that the visual work depends on clean. |
| 5 | **`page-layout-check`** (Valera's own, `~/.claude/skills/page-layout-check`) **or** Anthropic `webapp-testing` | Checks the result with numbers in a real browser: overflow, overlap and off-screen elements at several widths. |
| 6 | **Anthropic `frontend-design`** | Use it only for new surfaces such as the login and landing pages. It pushes toward a "distinctive identity", which works against a dense dev-tool UI, so keep it off for routine work. |

**Do not install** the big "taste" packs (`taste-skill`, `ui-ux-pro-max`) on this repo. They are tuned for marketing pages and art direction, not dense tooling, and they overlap with Impeccable. Install them only if a landing page gets built.

## A. Agent skills and rule packs for UI quality

| Skill / pack | What it does | Format | License | Popularity (2026-10-29) | Link |
|---|---|---|---|---|---|
| **shadcn skill** | Runs `shadcn info --json` for project context. Enforces styling, forms and composition rules, each paired with an incorrect and a correct example. Knows the CLI, registries, presets and the differences between Base UI, Radix and Aria. | SKILL.md + `rules/` + MCP (`shadcn mcp`) | MIT (repo) | shadcn-ui/ui 126.9k★ | [SKILL.md](https://github.com/shadcn-ui/ui/blob/main/skills/shadcn/SKILL.md), [docs](https://ui.shadcn.com/docs/skills), [MCP](https://ui.shadcn.com/docs/mcp) |
| shadcn `migrate-radix-to-base` | A skill for moving shadcn components from Radix to Base UI. | SKILL.md | MIT | same repo | [repo dir](https://github.com/shadcn-ui/ui/tree/main/skills/migrate-radix-to-base) |
| **Vercel web-design-guidelines** | Fetches the latest Web Interface Guidelines and reviews the given files, reporting `file:line` violations. | SKILL.md (rules are fetched live) | MIT (README) | agent-skills 33.2k★; guidelines 1.1k★ | [skill](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines), [guidelines](https://github.com/vercel-labs/web-interface-guidelines) |
| Vercel react-best-practices, composition-patterns | React and Next performance and composition rules, prioritised by impact. | SKILL.md | MIT | same repo | [agent-skills](https://github.com/vercel-labs/agent-skills) |
| **Impeccable** | 24 commands: steer (`layout`, `typeset`, `quieter`), review (`critique`, `audit` ranked P0–P3), finish (`polish`, `harden`, `adapt`), plus `live` in-browser variants. Adds 62 deterministic anti-slop rules and the context files `PRODUCT.md` and `DESIGN.md`. Works with Claude Code, Codex, Cursor and others. | Skill + CLI (`npx impeccable install`) | Apache-2.0 | 93.5k★ | [repo](https://github.com/pbakaus/impeccable) |
| **Anthropic frontend-design** | Sets aesthetic direction, typography and anti-template rules. Aimed at distinctive pages. | SKILL.md | Apache-2.0 (LICENSE.txt in the skill dir) | anthropics/skills 184.6k★ | [SKILL.md](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md) |
| Anthropic webapp-testing | Writes Python Playwright scripts against a local app: screenshots, browser logs, behaviour checks. Includes a server-lifecycle helper. | SKILL.md + scripts | Apache-2.0 *(assumed same as frontend-design, unverified)* | same repo | [skill](https://github.com/anthropics/skills/tree/main/skills/webapp-testing) |
| Anthropic theme-factory | Applies preset themes to artifacts. Low value for an app that already has tokens. | SKILL.md | see repo | same repo | [skill](https://github.com/anthropics/skills/tree/main/skills/theme-factory) |
| taste-skill | Art direction, reference images and a browser check, aimed at "non-generic AI pages". | Skills | MIT | 104.8k★ | [repo](https://github.com/Leonxlnx/taste-skill) |
| UI UX Pro Max | A searchable design database (79 styles, 192 rules) with a Python search CLI. | Skill + CLI | MIT | 142.2k★ | [repo](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) |
| HeroUI `agents-md` | Downloads the HeroUI v3 docs into the project for agents to read. | AGENTS.md | Apache-2.0 | heroui 31.1k★ | [README](https://github.com/heroui-inc/heroui) |
| `page-layout-check` (local) | Headless Chrome at 1440, 1024 and 420 px. Flags horizontal scroll, off-viewport elements, text wider than its box, overlapping siblings and SVG label collisions. Exits 1 when it finds problems. | SKILL.md + `check.py` | private | n/a | `~/.claude/skills/page-layout-check/SKILL.md` |

**Where to find more:** [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) (78.2k★), [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) (56.8k★), [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) (36.5k★) and [travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills) (15.6k★, last push 2026-04). The installer is [vercel-labs/skills](https://github.com/vercel-labs/skills) (`npx skills add …`, 37.1k★).

**Install-count caveat:** third-party skill directories report wildly different install counts. Use GitHub stars or the primary repo instead.

## B. UI kits for React 19 + Tailwind v4

| Kit | Tailwind v4 / React 19 / Next 16 | A11y base | Theming | Copy-in (agent-editable) | Fits assistant-ui | License / cost | Popularity |
|---|---|---|---|---|---|---|---|
| **shadcn/ui** | yes / yes / yes ([tw4](https://ui.shadcn.com/docs/tailwind-v4), [react-19](https://github.com/shadcn-ui/ui/blob/main/apps/v4/content/docs/(root)/react-19.mdx)) | Base UI (default), Radix or React Aria, chosen per project ([aria](https://github.com/shadcn-ui/ui/blob/main/apps/v4/content/docs/changelog/2026-07-react-aria.mdx)) | CSS vars in `:root`/`.dark` with `@theme inline` | yes, the CLI copies source | native: assistant-ui ships as a shadcn registry | MIT, free | 126.9k★ |
| **Base UI** (primitives) | unstyled, works with any Tailwind / React 19 | own primitives, from the creators of Radix and Floating UI | n/a (unstyled) | npm package, unstyled | indirect, through shadcn base styles | MIT | 11.3k★, v1.9.0 |
| Radix Primitives | unstyled; shadcn now uses the unified `radix-ui` package ([changelog](https://github.com/shadcn-ui/ui/blob/main/apps/v4/content/docs/changelog/2026-02-radix-ui.mdx)) | Radix | n/a | npm | assistant-ui's non-`base` styles are Radix-flavoured | MIT | 19.4k★, maintained by WorkOS |
| Radix Themes | ships its own CSS rather than Tailwind utilities, so it fights a Tailwind codebase | Radix | own token system | npm, not copy-in | poor fit | MIT | 8.8k★, last push 2026-04-11 |
| coss ui (formerly Origin UI) | Base UI + Tailwind, copy-paste | Base UI | shadcn-style vars | yes | yes (same model as shadcn) | MIT (README; GitHub detects "Other") | 10.8k★ ([repo](https://github.com/cosscom/ui)). Origin UI is a legacy snapshot there. |
| HeroUI v3 | Tailwind v4, React 19, Next ([README](https://github.com/heroui-inc/heroui)) | React Aria | CSS vars | npm package with a compound API, not copy-in | separate design system, so assistant-ui would be restyled twice | Apache-2.0 | 31.1k★ |
| React Aria Components | unstyled, with Tailwind examples and a shadcn CLI path ([getting started](https://react-aria.adobe.com/getting-started)) | React Aria (strongest a11y) | n/a | examples copy-in | through the shadcn `--base aria` option | Apache-2.0 | react-spectrum 16k★ |
| Ark UI | unstyled; first-party styling is Panda CSS (Park UI), and Tailwind styling comes from a third party (Tark UI) | Zag state machines | n/a | npm | weak, nothing assistant-ui-specific | MIT | 5.4k★ |
| Tremor | Tailwind + Radix, copy-paste, dashboards and charts | Radix | Tailwind | yes | ok for charts only | Apache-2.0 | 3.7k★, **last push 2025-10-10 (stale)** |
| Catalyst (Tailwind Plus) | Tailwind Labs kit on Headless UI, copy-in *(Tailwind v4 support unverified; the product page is behind a login)* | Headless UI | Tailwind | yes | no registry | paid: $149 alone or included in Tailwind Plus $299 one-time ([search snippet of tailwindcss.com/plus](https://tailwindcss.com/plus/templates/catalyst), *unverified*) | n/a |
| assistant-ui registry | `thread`, `thread-list`, `markdown-text`, `reasoning`, `tool-fallback`, `tool-group`, `attachment`, `tooltip-icon-button`… ([install](https://www.assistant-ui.com/docs/installation)) | follows the chosen shadcn base | shadcn tokens | yes | it *is* assistant-ui | MIT | 12.8k★ |

**Why not the others.** HeroUI and Radix Themes are opinionated npm design systems, so the agent cannot edit their internals the way it can edit copied source. Ark's ecosystem centres on Panda. Tremor has stalled. Catalyst costs money and has no registry or CLI. React Aria has the best accessibility, but shadcn already offers it as a base option. That means choosing shadcn does not rule out React Aria later.

### Migration sketch for Paddock

0. **Init without nuking the theme.** Run `npx shadcn@latest init` with a Base UI style and dark mode only. Then map Paddock's tokens onto shadcn names in `globals.css`. Watch for two name collisions:
   - Paddock's `--accent` is the orange brand colour, while shadcn's `--accent` is a hover background. Paddock's accent becomes shadcn's `--primary`, and shadcn's `--accent` becomes `--panel-2`.
   - Paddock's `--muted` is a text colour, while shadcn's `--muted` is a background. Paddock's `--muted` becomes `--muted-foreground`.

   The remaining mappings are `--bg`→`--background`, `--fg`→`--foreground`, `--panel`→`--card`/`--popover`, `--border`→`--border`/`--input` and `--accent` (orange)→`--ring`. Keep the extra status colours (`--blue`, `--teal`, `--pink`, `--green`, `--yellow`, `--red`) as custom tokens. Base the column mapping on [theming](https://ui.shadcn.com/docs/theming); the token names above are my mapping, not shadcn's.
1. **Tooltip.** Replace the roughly 60 native `title=` attributes across `chat`, `pane`, `sidebar` and `tools` with `Tooltip`. Do this first: it is low risk, visible everywhere and fixes keyboard and focus behaviour.
2. **Dialog / Sheet.** Swap the settings modal (`settings.tsx`, 612 lines) and the account / 2FA modal (`account.tsx`). These carry the most a11y debt (focus trap, Esc, required `DialogTitle`). Lay out the settings sections with `Tabs` + `Field`/`FieldGroup`.
3. **DropdownMenu / Select / Combobox.** Rebuild the model picker (`model-picker.tsx`) on `Select`, or on `Combobox` if the model list grows. Use `DropdownMenu` for the per-thread actions in `sidebar.tsx`.
4. **Popover.** Use it for status-bar details (`status-bar.tsx`) and for any hover cards in `side-panel.tsx`.
5. **Toast.** Add the new Base UI `Toast` for deploy, rollback and copy feedback ([changelog](https://github.com/shadcn-ui/ui/blob/main/apps/v4/content/docs/changelog/2026-07-toast.mdx)).
6. **Form inputs.** Move login, TOTP and settings inputs to `Input`, `InputGroup`, `Field` and `InputOTP`.
7. **Later, optional.** Try shadcn `Trace` + `CodeBlock` as the renderer for tool calls and reasoning in `tools.tsx` and `messages.tsx`. Or pull assistant-ui's `tool-group` / `reasoning` from its registry.

**Keep hand-rolled:** the split-pane layout (`pane.tsx`), the files panel and side panel, the image editor, the status bar layout, markdown rendering (`markdown.tsx` with rehype-highlight), and the assistant-ui primitive wiring in `chat.tsx`. These are product-specific, and a kit adds nothing there. Restyle them with the shared tokens only.

## C. Automatic layout and alignment checks

| Tool | What it catches | Mode | License | Link |
|---|---|---|---|---|
| **Playwright `toHaveScreenshot()`** | Pixel diffs against a baseline. Supports masks and `stylePath` to hide volatile parts. Run it in the same OS and container as the baseline, because rendering differs per platform. | CI (fits the existing compose; run in Docker) | Apache-2.0 | [docs](https://playwright.dev/docs/test-snapshots) |
| Playwright `toMatchAriaSnapshot()` | Structural regressions in the accessibility tree. Not pixels, so it is stable across fonts. | CI | Apache-2.0 | [docs](https://playwright.dev/docs/aria-snapshots) |
| **@axe-core/playwright** | WCAG violations (contrast, labels, roles) inside Playwright tests. | CI | MPL-2.0 (axe-core) | [package](https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright), [axe-core](https://github.com/dequelabs/axe-core) 7.7k★ |
| **page-layout-check** (local skill) | Overflow, overlap, off-viewport elements and text wider than its box, measured numerically at three widths. | Agent | private | `~/.claude/skills/page-layout-check/` |
| Playwright MCP | Lets an agent drive the browser through accessibility snapshots, with optional `vision` screenshots. | Agent (MCP) | Apache-2.0 | [repo](https://github.com/microsoft/playwright-mcp) 38.8k★ |
| Chrome DevTools MCP | Lets an agent take screenshots, inspect network and run performance traces in a real Chrome. | Agent (MCP) | Apache-2.0 | [repo](https://github.com/ChromeDevTools/chrome-devtools-mcp) 54.4k★ |
| Storybook + Chromatic | Per-component visual diffs, with a hosted review UI. | CI + SaaS (paid tiers) | MIT (Storybook / CLI) | [storybook](https://github.com/storybookjs/storybook) 91.4k★, [chromatic-cli](https://github.com/chromaui/chromatic-cli) |
| Argos | Open-source visual review platform with a Playwright integration. | CI + SaaS or self-host | MIT | [repo](https://github.com/argos-ci/argos) |
| reg-suit | Self-hosted visual regression that compares images and stores them in S3/GCS. | CI | MIT | [repo](https://github.com/reg-viz/reg-suit) |
| Lost Pixel | **Archived on GitHub**. Do not adopt. | n/a | MIT | [repo](https://github.com/lost-pixel/lost-pixel) |

**Minimal setup for Paddock.** Add one Playwright spec that logs in as the test user and screenshots a few states: the empty thread, a thread with a tool call, the settings modal and the model picker open. Run each state at 1440 and 420 px, then run `@axe-core/playwright` on the same pages. Execute it inside the compose network so the fonts and OS match the baseline. The agent runs `page-layout-check` plus `web-design-guidelines` after every UI change, before the deploy step in `web/AGENTS.md`. Skip Storybook until there is a real component library worth isolating.
