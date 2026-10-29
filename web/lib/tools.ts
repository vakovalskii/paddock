// Инструменты Paddock (CLI + скилл из web/tools/) и скиллы харнесса: установка через fs API харнесса и чтение состояния.
// От харнесса нужно только: дом (куда класть файлы), fs/* и список скиллов. Для Codex это /home/codex/.codex,
// fs/* app-server'а и skills/list; другой харнесс даст свой адаптер с тем же набором.
type Request = (method: string, params: unknown) => Promise<any>;

import { getLang } from "./i18n";

export const localized = (v: string | Record<string, string>) => (typeof v === "string" ? v : v[getLang()] ?? v.en ?? Object.values(v)[0] ?? "");

export const HARNESS_HOME = "/home/codex/.codex";

// name и description — строка или { en, ru }: плагины пишут на своём языке, морда показывает язык интерфейса.
export type Tool = { id: string; name: string | Record<string, string>; description: string | Record<string, string>; bin: string; skill: string; needs?: string; script: string; skillText: string };
export type Skill = { name: string; description: string; path: string; scope: string; enabled: boolean };
export type ToolState = { installed: boolean; outdated: boolean; settings: Record<string, unknown> };

export const toolDir = (t: { id: string }) => `${HARNESS_HOME}/paddock/tools/${t.id}`;
export const toolBin = (t: { id: string; bin: string }) => `${toolDir(t)}/${t.bin}`;
const skillDir = (t: { skill: string }) => `${HARNESS_HOME}/skills/${t.skill}`;

export const b64 = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};
export const unb64 = (data: string) => new TextDecoder().decode(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));

let registry: Promise<Tool[]> | null = null;
export function loadRegistry(): Promise<Tool[]> {
  registry ??= fetch("/api/tools").then((r) => r.json()).then((r) => r.tools as Tool[]).catch((e) => {
    registry = null;
    throw e;
  });
  return registry;
}

const readText = (request: Request, path: string) => request("fs/readFile", { path }).then((f) => unb64(f.dataBase64), () => null);

// Установлен = есть скилл и команда; устарел = команда или скилл в харнессе не совпадают с реестром (морду обновили).
export async function toolState(request: Request, t: Tool): Promise<ToolState> {
  const [skill, script, settings] = await Promise.all([
    readText(request, `${skillDir(t)}/SKILL.md`),
    readText(request, toolBin(t)),
    readText(request, `${toolDir(t)}/settings.json`),
  ]);
  let parsed = {};
  try {
    parsed = JSON.parse(settings ?? "{}");
  } catch {}
  return { installed: skill != null && script != null, outdated: (script != null && script !== t.script) || (skill != null && skill !== t.skillText.replaceAll("{{BIN}}", toolBin(t))), settings: parsed };
}

export async function installTool(request: Request, t: Tool, settings: Record<string, unknown>) {
  await request("fs/createDirectory", { path: toolDir(t), recursive: true });
  await request("fs/createDirectory", { path: skillDir(t), recursive: true });
  await request("fs/writeFile", { path: toolBin(t), dataBase64: b64(t.script) });
  await request("fs/writeFile", { path: `${toolDir(t)}/settings.json`, dataBase64: b64(JSON.stringify(settings)) });
  await request("fs/writeFile", { path: `${skillDir(t)}/SKILL.md`, dataBase64: b64(t.skillText.replaceAll("{{BIN}}", toolBin(t))) });
  await request("skills/list", { forceReload: true }).catch(() => {});
}

// Installed tools follow the registry: after a Paddock update the harness gets the new command and skill on the
// next connect, with the user's settings kept. Tools the user has not installed are left alone.
export async function refreshTools(request: Request) {
  for (const t of await loadRegistry()) {
    const st = await toolState(request, t);
    if (st.installed && st.outdated) await installTool(request, t, st.settings);
  }
}

// Удаляем только скилл: без него агент про команду не знает, а настройки сохранятся до следующего включения.
export async function removeTool(request: Request, t: Tool) {
  await request("fs/remove", { path: skillDir(t), recursive: true, force: true }).catch(() => {});
  await request("skills/list", { forceReload: true }).catch(() => {});
}

// Скиллы, которые харнесс видит в папке (свои, системные, из репо проекта).
export async function listSkills(request: Request, cwd: string, forceReload = false): Promise<Skill[]> {
  const r = await request("skills/list", { cwds: [cwd], forceReload });
  return (r.data?.[0]?.skills ?? []).map((s: any) => ({ name: s.name, description: s.shortDescription ?? s.description, path: s.path, scope: s.scope, enabled: s.enabled }));
}

export const setSkillEnabled = (request: Request, s: Skill, enabled: boolean) => request("skills/config/write", { path: s.path, enabled });
