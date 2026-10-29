// Отрисовка сообщений: пузырь пользователя с правкой, ответ с markdown, карточки инструментов, подвал «модель · время».
import { useEffect, useState } from "react";
import {
  ActionBarPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  useAuiState,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import type { ServerRequest } from "@/lib/codex-client";
import { fmtDuration } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { ToolArgs, TurnMeta } from "@/lib/messages";
import { Icon, type IconName } from "./icons";
import { Markdown } from "./markdown";
import { LocalImage } from "./local-image";

const iconBtn = "rounded-md p-1.5 text-[var(--faint)] hover:bg-[var(--panel)] hover:text-[var(--fg)]";

export function UserMessage() {
  return (
    <MessagePrimitive.Root className="group flex flex-col items-end gap-1">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--panel-2)] px-4 py-2.5 leading-relaxed">
        <MessagePrimitive.Parts components={{ Image: UserImage }} />
      </div>
      <ActionBarPrimitive.Root hideWhenRunning autohide="never" className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <ActionBarPrimitive.Edit className={iconBtn} title={t("Edit and resend")}>
          <Icon name="pencil" size={14} />
        </ActionBarPrimitive.Edit>
        <ActionBarPrimitive.Copy className={iconBtn} title={t("Copy")}>
          <Icon name="copy" size={14} />
        </ActionBarPrimitive.Copy>
      </ActionBarPrimitive.Root>
    </MessagePrimitive.Root>
  );
}

// Вставленная пользователем картинка (localImage) — миниатюра из файла харнесса.
function UserImage({ image }: { image: string }) {
  return <div className="mb-1.5"><LocalImage path={image} size="sm" /></div>;
}

export function UserEditComposer() {
  return (
    <ComposerPrimitive.Root className="ml-auto w-full max-w-[85%] rounded-2xl border border-[var(--accent)]/50 bg-[var(--panel)] p-2 shadow-[0_0_0_4px_rgb(255_138_61/0.08)]">
      <ComposerPrimitive.Input autoFocus className="max-h-72 w-full resize-none bg-transparent px-2 py-1.5 leading-relaxed outline-none" />
      <div className="flex items-center justify-between gap-2 px-1 pt-1">
        <span className="text-xs text-[var(--faint)]">{t("History after this message will be discarded")}</span>
        <div className="flex gap-1.5">
          <ComposerPrimitive.Cancel className="rounded-lg px-3 py-1 text-sm text-[var(--muted)] hover:bg-[var(--panel-2)]">{t("Cancel")}</ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send className="rounded-lg bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] px-3 py-1 text-sm font-medium text-black">
            {t("Send")}
          </ComposerPrimitive.Send>
        </div>
      </div>
    </ComposerPrimitive.Root>
  );
}

export function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="group space-y-2.5">
      <MessagePrimitive.Parts components={{ Text, Reasoning, tools: { Fallback: ToolCard } }} />
      <AssistantFooter />
    </MessagePrimitive.Root>
  );
}

function AssistantFooter() {
  const meta = useAuiState((s) => s.message.metadata.custom) as TurnMeta;
  const running = useAuiState((s) => s.message.status?.type === "running");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [running]);

  const elapsed = running ? (meta.startedAt ? now - meta.startedAt : null) : meta.durationMs ?? null;
  // Скорость генерации: выходные токены / время от первого токена до конца хода без инструментов (shell, картинки).
  // Ожидание первого токена не считаем — иначе короткий ответ показывает «1 tok/s». Есть только у ходов, увиденных вживую.
  const toolMs = useAuiState((s) => s.message.content.reduce((t, p) => t + (p.type === "tool-call" ? ((p.args as unknown as ToolArgs).durationMs ?? 0) : 0), 0));
  const genMs = meta.ttftMs != null && meta.durationMs ? meta.durationMs - meta.ttftMs - toolMs : 0;
  const ttft = meta.ttftMs ?? null;
  const speed = !running && meta.outTokens && meta.outTokens >= 20 && genMs > 500 ? Math.round(meta.outTokens / (genMs / 1000)) : null;

  return (
    <div className="flex items-center gap-2 font-mono text-[11.5px] text-[var(--faint)]">
      {running && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />}
      {meta.model && <span className="text-[var(--muted)]">{meta.model}</span>}
      {meta.effort && <span>{meta.effort}</span>}
      {elapsed != null && <span className={running ? "text-[var(--accent)]" : ""}>{fmtDuration(elapsed)}</span>}
      {ttft != null && <span title={t("time to first token: from sending to the start of the model's reply")}>TTFT {fmtDuration(ttft)}</span>}
      {speed != null && <span title={t("{n} output tokens in {time}, excluding tools", { n: meta.outTokens ?? 0, time: fmtDuration(genMs) })}>{speed} tok/s</span>}
      <ActionBarPrimitive.Root hideWhenRunning autohide="never" className="ml-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <ActionBarPrimitive.Copy className={iconBtn} title={t("Copy reply")}>
          <Icon name="copy" size={14} />
        </ActionBarPrimitive.Copy>
        <ActionBarPrimitive.Reload className={iconBtn} title={t("Regenerate")}>
          <Icon name="refresh" size={14} />
        </ActionBarPrimitive.Reload>
      </ActionBarPrimitive.Root>
    </div>
  );
}

function Text({ text }: { text: string }) {
  return <Markdown text={text} />;
}

function Reasoning({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="flex gap-2 text-[13.5px] italic leading-relaxed text-[var(--muted)]">
      <Icon name="sparkle" size={14} className="mt-1 shrink-0 text-[var(--accent)]/70" />
      <div className="whitespace-pre-wrap">{text}</div>
    </div>
  );
}

const toolLook: Record<ToolArgs["kind"], { icon: IconName; label: string; tint: string }> = {
  shell: { icon: "terminal", label: "Shell", tint: "var(--accent)" },
  read: { icon: "file", label: "Read", tint: "var(--blue)" },
  search: { icon: "search", label: "Search", tint: "var(--blue)" },
  list: { icon: "list", label: "List", tint: "var(--blue)" },
  patch: { icon: "diff", label: "Edit", tint: "var(--teal)" },
  mcp: { icon: "plug", label: "MCP", tint: "var(--pink)" },
  web: { icon: "globe", label: "Web", tint: "var(--yellow)" },
  tool: { icon: "wrench", label: "Tool", tint: "var(--pink)" },
  agent: { icon: "sparkle", label: "Agent", tint: "var(--teal)" },
};

function ToolCard({ args, argsText, result, isError }: ToolCallMessagePartProps) {
  const [open, setOpen] = useState(false);
  const a = args as unknown as ToolArgs;
  const look = toolLook[a.kind] ?? toolLook.tool;
  const out = typeof result === "string" ? result : result == null ? "" : JSON.stringify(result, null, 2);
  const pending = result === undefined;
  const detail = a.kind === "shell" || a.kind === "patch" ? "" : argsText;
  // Картинки, сохранённые командой paddock-images («saved: /путь.png»), видны сразу, без раскрытия карточки.
  // Только у команд и MCP: в выводе чтения файла (тот же SKILL.md) «saved: /…png» — пример, а не картинка.
  const images = a.kind === "shell" || a.kind === "mcp" ? [...out.matchAll(/saved: (\/\S+\.(?:png|jpe?g|webp))/gi)].map((m) => m[1]) : [];

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel)]/60 text-[13px]">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-[var(--panel)]">
        <Icon name={look.icon} size={14} style={{ color: look.tint }} className="shrink-0" />
        <span className="shrink-0 font-medium" style={{ color: look.tint }}>{a.verb ?? look.label}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-[var(--fg)]/85">{a.title}</span>
        {a.links && a.links.length > 0 && <span className="shrink-0 font-mono text-[11px] text-[var(--faint)]">{t("{n} results", { n: a.links.length })}</span>}
        {!!a.durationMs && <span className="shrink-0 font-mono text-[11px] text-[var(--faint)]">{fmtDuration(a.durationMs)}</span>}
        <span className="shrink-0">
          {pending ? (
            <span className="block h-3 w-3 animate-spin rounded-full border-[1.5px] border-[var(--faint)] border-t-[var(--accent)]" />
          ) : isError ? (
            <span className="text-[var(--red)]">✗</span>
          ) : (
            <Icon name="check" size={14} className="text-[var(--green)]" />
          )}
        </span>
        <Icon name="chevron" size={14} className={`shrink-0 text-[var(--faint)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-[var(--border)] p-2">
          {images.map((p) => <LocalImage key={p} path={p} size="sm" />)}
        </div>
      )}
      {open && (
        <div className="max-h-[28rem] overflow-auto border-t border-[var(--border)] bg-[var(--bg)]/60 p-3 font-mono text-[12px] leading-relaxed">
          {a.links ? (
            <WebResults links={a.links} />
          ) : (
            <>
          {detail && <div className="mb-2 whitespace-pre-wrap text-[var(--muted)]">$ {detail}</div>}
          {a.kind === "shell" && <div className="mb-2 whitespace-pre-wrap text-[var(--accent)]">$ {argsText}</div>}
          {a.diff ? <Diff text={out} /> : <pre className="whitespace-pre-wrap break-words">{out || (pending ? "…" : t("(empty)"))}</pre>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function WebResults({ links }: { links: NonNullable<ToolArgs["links"]> }) {
  if (links.length === 0) return <div className="text-[var(--faint)]">{t("nothing found")}</div>;
  return (
    <div className="space-y-2 font-sans text-[13px]">
      {links.map((l, i) => (
        <div key={i} className="min-w-0">
          {l.url ? (
            <a href={l.url} target="_blank" rel="noreferrer noopener" className="block truncate font-medium text-[var(--fg)] hover:text-[var(--accent)]">{l.title || l.url}</a>
          ) : (
            <div className="truncate text-[var(--muted)]">{l.title}</div>
          )}
          {(l.domain || l.url) && <div className="truncate font-mono text-[11px] text-[var(--teal)]">{l.domain ?? l.url}</div>}
          {l.snippet && <div className="line-clamp-2 text-xs text-[var(--muted)]">{l.snippet}</div>}
        </div>
      ))}
    </div>
  );
}

function Diff({ text }: { text: string }) {
  return (
    <pre className="whitespace-pre-wrap break-words">
      {text.split("\n").map((l, i) => {
        const c = l.startsWith("+") && !l.startsWith("+++") ? "text-[var(--green)] bg-[var(--green)]/5"
          : l.startsWith("-") && !l.startsWith("---") ? "text-[var(--red)] bg-[var(--red)]/5"
          : l.startsWith("@@") ? "text-[var(--blue)]" : "text-[var(--muted)]";
        return <div key={i} className={c}>{l || " "}</div>;
      })}
    </pre>
  );
}

// Запросы харнесса к пользователю: разрешить команду/правку, ответить на вопрос MCP-сервера (elicitation).
export function Approval({ req, onAnswer }: { req: ServerRequest; onAnswer: (r: ServerRequest, result: unknown) => void }) {
  const p = req.params ?? {};
  if (req.method === "mcpServer/elicitation/request") return <Elicitation req={req} onAnswer={onAnswer} />;
  const what = p.command ?? p.reason ?? req.method;
  const known = req.method === "item/commandExecution/requestApproval" || req.method === "item/fileChange/requestApproval";
  const btn = "rounded-lg border border-[var(--border)] px-3 py-1 hover:bg-[var(--panel)]";
  return (
    <div className="rounded-xl border border-[var(--yellow)]/40 bg-[var(--yellow)]/[0.06] p-3 text-sm">
      <div className="mb-2 font-medium text-[var(--yellow)]">{t("Codex is asking for permission")}</div>
      <pre className="mb-3 overflow-auto font-mono text-xs whitespace-pre-wrap">{what}</pre>
      {known ? (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => onAnswer(req, { decision: "accept" })} className="rounded-lg bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] px-3 py-1 font-medium text-black">{t("Allow")}</button>
          <button onClick={() => onAnswer(req, { decision: "acceptForSession" })} className={btn}>{t("For this session")}</button>
          <button onClick={() => onAnswer(req, { decision: "decline" })} className={btn}>{t("Deny")}</button>
        </div>
      ) : (
        <p className="text-xs text-[var(--muted)]">{t("The UI doesn't support “{method}” requests yet — Codex can add it itself.", { method: req.method })}</p>
      )}
    </div>
  );
}

// MCP elicitation: сообщение + простая форма по requestedSchema (флажки, списки, строки, числа) или ссылка.
function Elicitation({ req, onAnswer }: { req: ServerRequest; onAnswer: (r: ServerRequest, result: unknown) => void }) {
  const p = req.params ?? {};
  const props: Record<string, any> = p.requestedSchema?.properties ?? {};
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(Object.entries(props).map(([k, s]) => [k, s.default ?? (s.type === "boolean" ? false : s.enum?.[0] ?? "")])),
  );
  const reply = (action: "accept" | "decline" | "cancel") => onAnswer(req, { action, content: action === "accept" ? values : null, _meta: null });
  const field = "rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs";
  return (
    <div className="rounded-xl border border-[var(--yellow)]/40 bg-[var(--yellow)]/[0.06] p-3 text-sm">
      <div className="mb-1 font-medium text-[var(--yellow)]">{t("Question from tool")} <span className="font-mono">{p.serverName}</span></div>
      <div className="mb-3 whitespace-pre-wrap text-[13px]">{p.message}</div>
      {p.mode === "url" && <a href={p.url} target="_blank" rel="noreferrer noopener" className="mb-3 block font-mono text-xs text-[var(--accent)] underline">{p.url}</a>}
      {Object.keys(props).length > 0 && (
        <div className="mb-3 space-y-2">
          {Object.entries(props).map(([k, s]) => (
            <label key={k} className="flex items-center gap-2 text-xs">
              <span className="min-w-28 text-[var(--muted)]">{s.title ?? k}</span>
              {s.type === "boolean" ? (
                <input type="checkbox" checked={!!values[k]} onChange={(e) => setValues({ ...values, [k]: e.target.checked })} className="accent-[var(--accent)]" />
              ) : s.enum || s.oneOf ? (
                <select value={String(values[k])} onChange={(e) => setValues({ ...values, [k]: e.target.value })} className={field}>
                  {(s.enum ?? s.oneOf.map((o: any) => o.const)).map((v: string, i: number) => <option key={v} value={v}>{s.enumNames?.[i] ?? s.oneOf?.[i]?.title ?? v}</option>)}
                </select>
              ) : (
                <input value={String(values[k] ?? "")} type={s.type === "number" || s.type === "integer" ? "number" : "text"}
                  onChange={(e) => setValues({ ...values, [k]: s.type === "number" || s.type === "integer" ? Number(e.target.value) : e.target.value })} className={`${field} flex-1`} />
              )}
            </label>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => reply("accept")} className="rounded-lg bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] px-3 py-1 font-medium text-black">{t("Allow")}</button>
        <button onClick={() => reply("decline")} className="rounded-lg border border-[var(--border)] px-3 py-1 hover:bg-[var(--panel)]">{t("Deny")}</button>
      </div>
    </div>
  );
}
