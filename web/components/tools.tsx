// Вкладка «Инструменты»: CLI-инструменты Paddock (реестр web/tools/) и все скиллы харнесса с вкл/выкл.
// Плюс поповер «что доступно в этой сессии» для статус-бара окна чата.
import { useEffect, useMemo, useState } from "react";
import { installTool, localized, listSkills, loadRegistry, removeTool, setSkillEnabled, toolBin, toolState, type Skill, type Tool, type ToolState } from "@/lib/tools";
import { t } from "@/lib/i18n";
import { Icon } from "./icons";

type Request = (method: string, params: unknown) => Promise<any>;

const field = "w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50";
const primary = "rounded-lg bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] px-3 py-1.5 text-sm font-medium text-black disabled:opacity-40";
const scopeLabel: Record<string, string> = { user: "personal", repo: "project", system: "system", admin: "admin" };

export function ToolsTab({ request }: { request: Request }) {
  const [tools, setTools] = useState<Tool[] | null>(null);
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [error, setError] = useState("");

  const reloadSkills = (force = false) => listSkills(request, "/workspace", force).then(setSkills).catch((e) => setError(e.message));
  useEffect(() => {
    loadRegistry().then(setTools).catch((e) => setError(e.message));
    reloadSkills();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const paddockSkills = new Set(tools?.map((t) => t.skill));
  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--muted)]">
        {t("A Paddock tool is a command plus a skill that tells the agent when to call it. Every harness and every model has a shell, so tools don't depend on Codex or on the provider.")}
      </p>
      {error && <p className="text-sm text-[var(--red)]">{error}</p>}

      <section className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--faint)]">{t("Paddock tools")}</h3>
        {!tools && !error && <p className="text-sm text-[var(--faint)]">{t("reading registry…")}</p>}
        {tools?.map((t) => <ToolCard key={t.id} tool={t} request={request} onChange={() => reloadSkills(true)} />)}
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="flex-1 text-xs font-medium uppercase tracking-wide text-[var(--faint)]">{t("Skills in the harness")}</h3>
          <button onClick={() => reloadSkills(true)} className="rounded-md p-1 text-[var(--muted)] hover:bg-[var(--panel-2)]" title={t("Reload from disk")}>
            <Icon name="refresh" size={13} />
          </button>
        </div>
        {!skills && !error && <p className="text-sm text-[var(--faint)]">{t("reading skills…")}</p>}
        {skills && skills.length === 0 && <p className="text-sm text-[var(--faint)]">{t("no skills")}</p>}
        {skills && groupSkills(skills, paddockSkills).map((g) => (
          <SkillGroup key={g.title} title={g.title} skills={g.skills} open={g.open}
            toggle={(list, on) => Promise.all(list.map((x) => setSkillEnabled(request, x, on))).then(() => reloadSkills(true)).catch((err) => setError(err.message))} />
        ))}
        <p className="text-xs text-[var(--faint)]">{t("Project skills (the")} <span className="font-mono">.codex/skills</span> {t("folder in the repo) show up in that project's chat pane, via the badge under the input.")}</p>
      </section>
    </div>
  );
}

// Группы: Paddock, свои, по плагину (префикс до «:» — openai-templates и т. п.), системные. Большие плагинные — свёрнуты.
function groupSkills(skills: Skill[], paddock: Set<string>) {
  const groups = new Map<string, Skill[]>();
  const add = (k: string, s: Skill) => groups.set(k, [...(groups.get(k) ?? []), s]);
  for (const s of skills) {
    if (paddock.has(s.name)) add("Paddock", s);
    else if (s.name.includes(":")) add(s.name.split(":")[0], s);
    else add(scopeLabel[s.scope] ? `${scopeLabel[s.scope][0].toUpperCase()}${scopeLabel[s.scope].slice(1)}` : s.scope, s);
  }
  const order = (t: string) => (t === "Paddock" ? 0 : t === "Personal" ? 1 : t === "Project" ? 2 : t === "System" ? 9 : 5);
  return [...groups.entries()]
    .map(([title, list]) => ({ title, skills: list, open: order(title) < 5 }))
    .sort((a, b) => order(a.title) - order(b.title) || a.title.localeCompare(b.title));
}

function SkillGroup({ title, skills, open, toggle }: { title: string; skills: Skill[]; open: boolean; toggle: (list: Skill[], on: boolean) => void }) {
  const on = skills.filter((s) => s.enabled).length;
  return (
    <details open={open} className="group/g overflow-hidden rounded-xl border border-[var(--border)]">
      <summary className="flex cursor-pointer list-none items-center gap-2 bg-[var(--panel-2)] px-3 py-2 text-sm">
        <Icon name="chevron" size={12} className="-rotate-90 text-[var(--faint)] transition-transform group-open/g:rotate-0" />
        <span className="flex-1 font-medium">{t(title)}</span>
        <span className="font-mono text-[11px] text-[var(--faint)]">{on}/{skills.length}</span>
        <input type="checkbox" checked={on === skills.length} ref={(el) => { if (el) el.indeterminate = on > 0 && on < skills.length; }}
          onClick={(e) => e.stopPropagation()} onChange={(e) => toggle(skills, e.target.checked)} title={t("Enable / disable the whole group")} className="h-4 w-4 accent-[var(--accent)]" />
      </summary>
      <div className="divide-y divide-[var(--border)]">
        {skills.map((s) => (
          <label key={s.path} className="flex items-start gap-3 px-3 py-2 text-sm">
            <input type="checkbox" checked={s.enabled} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" onChange={(e) => toggle([s], e.target.checked)} />
            <span className="min-w-0 flex-1">
              <span className="font-mono text-[13px]">{s.name.includes(":") ? s.name.split(":").slice(1).join(":") : s.name}</span>
              <span className="block truncate text-xs text-[var(--muted)]" title={s.description}>{s.description}</span>
            </span>
          </label>
        ))}
      </div>
    </details>
  );
}

function ToolCard({ tool, request, onChange }: { tool: Tool; request: Request; onChange: () => void }) {
  const [st, setSt] = useState<ToolState | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [needKey, setNeedKey] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    toolState(request, tool).then((s) => {
      setSt(s);
      setEnabled(s.installed);
      setSettings(s.settings);
    });
    if (tool.needs === "neuraldeep")
      request("config/read", {}).then((r) => setNeedKey(!r.config?.model_providers?.neuraldeep?.experimental_bearer_token)).catch(() => {});
  }, [request, tool]);

  if (!st) return <div className="rounded-xl bg-[var(--panel-2)] p-3 text-sm text-[var(--faint)]">{localized(tool.name)}…</div>;
  const dirty = enabled !== st.installed || (enabled && (st.outdated || JSON.stringify(settings) !== JSON.stringify(st.settings)));
  const set = (patch: Record<string, unknown>) => { setSettings({ ...settings, ...patch }); setStatus(null); };

  const apply = async () => {
    setBusy(true);
    setStatus(null);
    try {
      if (enabled) {
        if (needKey) throw new Error(t("connect a key in the NeuralDeep tab first"));
        await installTool(request, tool, settings);
        if (tool.id === "images") await cleanupLegacyImages(request);
      } else await removeTool(request, tool);
      setSt({ installed: enabled, outdated: false, settings });
      setStatus({ ok: true, text: enabled ? t("Done, applies to new turns") : t("Disabled") });
      onChange();
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : t("failed") });
    }
    setBusy(false);
  };

  return (
    <div className="space-y-3 rounded-xl bg-[var(--panel-2)] p-3">
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); setStatus(null); }} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
        <span className="min-w-0 flex-1">
          <span className="font-medium">{localized(tool.name)}</span>
          <span className="ml-2 font-mono text-[11px] text-[var(--faint)]">{tool.skill}</span>
          <span className="block text-xs text-[var(--muted)]">{localized(tool.description)}</span>
        </span>
        <span className={`text-xs ${st.installed ? (st.outdated ? "text-[var(--yellow)]" : "text-[var(--green)]") : "text-[var(--faint)]"}`}>
          {st.installed ? (st.outdated ? t("update available") : t("installed")) : t("off")}
        </span>
      </label>
      {needKey && <p className="text-xs text-[var(--red)]">{t("NeuralDeep key not connected — see the NeuralDeep tab")}</p>}
      {tool.id === "images" && (
        <div className={`grid gap-3 sm:grid-cols-2 ${enabled ? "" : "pointer-events-none opacity-40"}`}>
          <label className="space-y-1.5">
            <span className="text-xs text-[var(--muted)]">{t("Default aspect ratio")}</span>
            <select value={settings.aspect ?? "1:1"} onChange={(e) => set({ aspect: e.target.value })} className={field}>
              {["1:1", "4:3", "3:4", "16:9", "9:16"].map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-3 self-end pb-2 text-sm">
            <input type="checkbox" checked={settings.allowEdit === true} onChange={(e) => set({ allowEdit: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
            {t("Allow image editing")}
          </label>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button onClick={apply} disabled={!dirty || busy} className={primary}>{busy ? "…" : st.outdated && enabled === st.installed ? t("Update") : t("Apply")}</button>
        {status && <span className={`text-sm ${status.ok ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{status.text}</span>}
        <span className="flex-1" />
        {st.installed && <span className="truncate font-mono text-[11px] text-[var(--faint)]" title={toolBin(tool)}>{toolBin(tool).replace(/^\/home\/codex/, "~")}</span>}
      </div>
    </div>
  );
}

// Ранние версии ставили картинки как MCP-сервер и клали файлы прямо в ~/.codex/paddock — убираем, чтобы модель не путалась.
async function cleanupLegacyImages(request: Request) {
  await request("config/batchWrite", { edits: [{ keyPath: "mcp_servers.paddock_images", value: null, mergeStrategy: "replace" }], reloadUserConfig: true }).catch(() => {});
  for (const f of ["images-mcp.mjs", "paddock-images.mjs", "images.json"]) await request("fs/remove", { path: `/home/codex/.codex/paddock/${f}`, force: true }).catch(() => {});
}

// Что доступно агенту в этом окне: включённые скиллы для папки чата и установленные инструменты Paddock.
// «Использован» — агент в этом чате читал SKILL.md или запускал команду инструмента.
export function SessionTools({ request, cwd, commands }: { request: Request; cwd: string; commands: string[] }) {
  const [open, setOpen] = useState(false);
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);

  useEffect(() => {
    let alive = true;
    listSkills(request, cwd).then((s) => alive && setSkills(s.filter((x) => x.enabled))).catch(() => alive && setSkills([]));
    loadRegistry().then(async (all) => {
      const st = await Promise.all(all.map((t) => toolState(request, t)));
      if (alive) setTools(all.filter((_, i) => st[i].installed));
    }).catch(() => {});
    return () => { alive = false; };
  }, [request, cwd, open]);

  const used = useMemo(() => {
    const u = new Set<string>();
    for (const c of commands) {
      for (const s of skills ?? []) if (c.includes(s.path) || c.includes(`/skills/${s.name}/`)) u.add(`s:${s.name}`);
      for (const t of tools) if (c.includes(t.bin)) u.add(`t:${t.id}`);
    }
    return u;
  }, [commands, skills, tools]);

  if (!skills) return null;
  return (
    <span className="relative">
      <button onClick={() => setOpen((o) => !o)} className="rounded px-1 hover:bg-[var(--panel-2)] hover:text-[var(--fg)]" title={t("Skills and tools in this chat")}>
        <span className="text-[var(--yellow)]">⚡</span> {skills.length} skills · {tools.length} cli{used.size > 0 && <span className="text-[var(--green)]"> · {used.size} used</span>}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 max-h-80 w-80 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--panel)] p-2 text-[12px] shadow-2xl shadow-black/60" onMouseLeave={() => setOpen(false)}>
          <div className="px-1 pb-1 text-[11px] uppercase tracking-wide text-[var(--faint)]">CLI Paddock</div>
          {tools.length === 0 && <div className="px-1 pb-1 text-[var(--faint)]">{t("none — enable them in Settings → Tools")}</div>}
          {tools.map((t) => (
            <div key={t.id} className="flex items-center gap-2 px-1 py-0.5">
              <span className={used.has(`t:${t.id}`) ? "text-[var(--green)]" : "text-[var(--faint)]"}>{used.has(`t:${t.id}`) ? "●" : "○"}</span>
              <span className="flex-1 truncate">{t.bin.replace(/\.mjs$/, "")}</span>
              <span className="text-[var(--faint)]">{localized(t.name)}</span>
            </div>
          ))}
          <div className="px-1 pb-1 pt-2 text-[11px] uppercase tracking-wide text-[var(--faint)]">{t("Skills")}</div>
          {skills.map((s) => (
            <div key={s.path} className="flex items-center gap-2 px-1 py-0.5" title={s.description}>
              <span className={used.has(`s:${s.name}`) ? "text-[var(--green)]" : "text-[var(--faint)]"}>{used.has(`s:${s.name}`) ? "●" : "○"}</span>
              <span className="flex-1 truncate">{s.name}</span>
              <span className="text-[var(--faint)]">{t(scopeLabel[s.scope] ?? s.scope)}</span>
            </div>
          ))}
          <div className="px-1 pt-2 text-[11px] text-[var(--faint)]">{t("● — used in this chat")}</div>
        </div>
      )}
    </span>
  );
}
