// Composer commands, like the Codex CLI's: "/name args" runs a harness action instead of sending a message,
// "!command" runs a shell command in the chat. The list drives both the hint popup and /help.
import { t } from "./i18n";

export type SlashCommand = { name: string; args?: string; description: () => string };

export const COMMANDS: SlashCommand[] = [
  { name: "new", description: () => t("new chat in the same folder") },
  { name: "compact", description: () => t("compress the conversation to free context") },
  { name: "review", args: "[focus]", description: () => t("review uncommitted changes, optionally with a focus") },
  { name: "diff", description: () => t("show git status and diff of the folder") },
  { name: "init", description: () => t("create AGENTS.md with instructions for this folder") },
  { name: "rename", args: "<name>", description: () => t("rename this chat") },
  { name: "fork", description: () => t("copy this chat into a new one and continue there") },
  { name: "goal", args: "<objective> | clear", description: () => t("set or clear the chat's goal") },
  { name: "status", description: () => t("model, folder, context and limits") },
  { name: "help", description: () => t("list commands") },
];

// "/rev" → matching commands for the popup; null when the text is not a command being typed.
export function suggest(text: string): SlashCommand[] | null {
  const m = text.match(/^\/(\S*)$/);
  if (!m) return null;
  const hits = COMMANDS.filter((c) => c.name.startsWith(m[1].toLowerCase()));
  return hits.length ? hits : null;
}

export function parse(text: string): { name: string; arg: string } | null {
  const m = text.trim().match(/^\/(\S+)(?:\s+([\s\S]*))?$/);
  if (!m || !COMMANDS.some((c) => c.name === m[1].toLowerCase())) return null;
  return { name: m[1].toLowerCase(), arg: (m[2] ?? "").trim() };
}

export const INIT_PROMPT =
  "Create an AGENTS.md file in the current folder for future agents working here: what the project is, how to build, " +
  "run and test it, the layout of the code, conventions you can see in it, and anything that is easy to get wrong. " +
  "Read the code first; keep it short and factual. If AGENTS.md already exists, improve it instead.";
