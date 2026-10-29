// Строка состояния под полем ввода — как statusline в Claude Code:
// модель │ папка (ветка) │ заполненность контекста │ кеш │ недельный лимит.
import type { ReactNode } from "react";
import { fmtTokens, fmtUntil, fmtWindow } from "@/lib/format";
import { t, locale } from "@/lib/i18n";

export type TokenUsage = {
  total: { totalTokens: number; inputTokens: number; cachedInputTokens: number; outputTokens: number };
  last: { totalTokens: number; inputTokens: number; cachedInputTokens: number; outputTokens: number };
  modelContextWindow: number | null;
};
type Window = { usedPercent: number; windowDurationMins: number | null; resetsAt: number | null };
export type RateLimits = { primary: Window | null; secondary: Window | null };

const Sep = () => <span className="text-[var(--faint)]">│</span>;

export function StatusBar({ model, effort, cwd, branch, usage, limits, connected, extra }: {
  model: string | null;
  effort: string | null;
  cwd: string | null;
  branch: string | null;
  usage: TokenUsage | null;
  limits: RateLimits | null;
  connected: boolean;
  extra?: ReactNode;
}) {
  const used = usage?.last.totalTokens ?? 0;
  const window = usage?.modelContextWindow ?? null;
  const pct = window ? Math.min(100, (used / window) * 100) : 0;
  const cache = usage && usage.last.inputTokens > 0 ? Math.round((usage.last.cachedInputTokens / usage.last.inputTokens) * 100) : null;

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-1 font-mono text-[11.5px] text-[var(--muted)]">
      <span className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-[var(--green)] shadow-[0_0_6px_var(--green)]" : "bg-[var(--red)]"}`} />
        <span className="text-[var(--fg)]">{model ?? "—"}</span>
        {effort && <span className="text-[var(--faint)]">{effort}</span>}
      </span>
      {cwd && (
        <>
          <Sep />
          <span>
            <span className="text-[var(--blue)]">{cwd.replace(/^\/workspace\/?/, "~/") || "~/"}</span>
            {branch && <span className="text-[var(--teal)]"> ({branch})</span>}
          </span>
        </>
      )}
      {usage && (
        <>
          <Sep />
          <span className="flex items-center gap-1.5" title={window ? t("{used} of {total} tokens in context", { used: used.toLocaleString(locale()), total: window.toLocaleString(locale()) }) : t("{used} tokens in context", { used: used.toLocaleString(locale()) })}>
            {window && (
              <span className="relative h-2 w-14 overflow-hidden rounded-sm bg-[var(--panel-2)]">
                <span className="absolute inset-y-0 left-0 rounded-sm bg-[repeating-linear-gradient(90deg,var(--pink)_0_3px,transparent_3px_4px)]" style={{ width: `${pct}%` }} />
              </span>
            )}
            <span className="text-[var(--pink)]">
              {fmtTokens(used)}
              {window && `/${fmtTokens(window)}`}
            </span>
          </span>
          {cache !== null && (
            <>
              <Sep />
              <span title={t("share of input served from cache in the last request")}>
                cache <span className="text-[var(--green)]">{cache}%</span>{" "}
                <span className="text-[var(--green)]">↓{fmtTokens(usage.last.cachedInputTokens)}</span>{" "}
                <span className="text-[var(--yellow)]">+{fmtTokens(usage.last.outputTokens)}</span>
              </span>
            </>
          )}
        </>
      )}
      {limits?.primary && (
        <>
          <Sep />
          <span title={t("ChatGPT subscription limit")}>
            {fmtWindow(limits.primary.windowDurationMins)}:<span className="text-[var(--pink)]">{Math.round(limits.primary.usedPercent)}%</span>
            {limits.primary.resetsAt && <span className="text-[var(--faint)]">({fmtUntil(limits.primary.resetsAt)})</span>}
          </span>
        </>
      )}
      {extra && (
        <>
          <Sep />
          {extra}
        </>
      )}
    </div>
  );
}
