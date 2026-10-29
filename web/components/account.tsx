// Аккаунт ChatGPT, под которым работает Codex: план, лимиты подписки, бесплатные сбросы, расход токенов по дням.
import { useEffect, useRef, useState } from "react";
import { fmtTokens, fmtUntil, fmtWindow } from "@/lib/format";
import { Icon } from "./icons";
import { t, locale } from "@/lib/i18n";

type Window = { usedPercent: number; windowDurationMins: number | null; resetsAt: number | null };
export type Snapshot = {
  limitId: string | null;
  limitName: string | null;
  primary: Window | null;
  secondary: Window | null;
  credits: { hasCredits: boolean; unlimited: boolean; balance: string | null } | null;
  planType: string | null;
  rateLimitReachedType: string | null;
};
export type AccountInfo = {
  email: string | null;
  plan: string | null;
  limits: Record<string, Snapshot>;
  resets: { id: string; title: string | null; expiresAt: number | null }[];
};
type Usage = {
  summary: { lifetimeTokens: number | null; peakDailyTokens: number | null; currentStreakDays: number | null; longestStreakDays: number | null };
  dailyUsageBuckets: { startDate: string; tokens: number }[] | null;
};

const windowName = (w: Window) => (w.windowDurationMins === 10080 ? t("week") : w.windowDurationMins === 300 ? t("5 hours") : fmtWindow(w.windowDurationMins));

// Полоса заполнения лимита; ближе к концу краснеет, и это дублируется словом, а не только цветом.
function Meter({ w, compact }: { w: Window; compact?: boolean }) {
  const pct = Math.min(100, Math.max(0, w.usedPercent));
  const tone = pct >= 90 ? "var(--red)" : pct >= 70 ? "var(--yellow)" : "var(--accent)";
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-[var(--muted)]">
          {windowName(w)}
          {pct >= 90 && <span className="ml-1.5 text-[var(--red)]">{t("almost used up")}</span>}
        </span>
        <span className="font-mono">
          <span className="text-[var(--fg)]">{Math.round(pct)}%</span>
          {w.resetsAt && <span className="text-[var(--faint)]"> · {t("resets")} {compact ? fmtUntil(w.resetsAt) : new Date(w.resetsAt * 1000).toLocaleString(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--panel-2)]">
        <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, background: tone }} />
      </div>
    </div>
  );
}

// Токены по дням за последние 30 дней: один ряд, один цвет, высота = объём, подсказка при наведении.
function DailyBars({ buckets }: { buckets: { startDate: string; tokens: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const days: { date: string; tokens: number }[] = [];
  const byDate = new Map(buckets.map((b) => [b.startDate, Number(b.tokens)]));
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    days.push({ date: d, tokens: byDate.get(d) ?? 0 });
  }
  const max = Math.max(1, ...days.map((d) => d.tokens));
  const h = hover == null ? null : days[hover];
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="text-[var(--muted)]">{t("Tokens, last 30 days")}</span>
        <span className="font-mono text-[var(--faint)]">
          {h ? `${new Date(h.date).toLocaleDateString(locale(), { day: "numeric", month: "short" })}: ${fmtTokens(h.tokens)}` : t("peak {n}", { n: fmtTokens(max) })}
        </span>
      </div>
      <div className="flex h-14 items-end gap-[2px] border-b border-[var(--border)]" onMouseLeave={() => setHover(null)}>
        {days.map((d, i) => (
          <div key={d.date} className="flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)}>
            <div
              className="w-full rounded-t-[3px]"
              style={{
                height: d.tokens ? `${Math.max(4, (d.tokens / max) * 100)}%` : 0,
                background: "var(--accent)",
                opacity: hover == null || hover === i ? 1 : 0.45,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// a*******@example.com — почту аккаунта на экране не светим.
export const maskEmail = (e: string) => e.replace(/^(.)(.*)(@.*)$/, (_, a, mid, dom) => a + "*".repeat(Math.max(3, mid.length)) + dom);

// Русские ключи для t(): переводятся при показе.
const outcomes: Record<string, string> = {
  reset: "Limit reset",
  nothingToReset: "Nothing to reset — the limit isn't used",
  noCredit: "No resets available",
  alreadyRedeemed: "This reset has already been used",
};

export function AccountCard({ info, loadUsage, resetLimits }: {
  info: AccountInfo | null;
  loadUsage: () => Promise<Usage | null>;
  resetLimits: (creditId: string) => Promise<string>;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [resetMsg, setResetMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const main = info?.limits.codex ?? Object.values(info?.limits ?? {})[0];
  const windows = [main?.primary, main?.secondary].filter(Boolean) as Window[];

  useEffect(() => {
    if (!open) return;
    loadUsage().then(setUsage).catch(() => {});
    // Клик мимо панель не закрывает — её можно держать открытой рядом с выбором модели.
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector("[data-picker-open]") && setOpen(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open, loadUsage]);

  if (!info) return null;
  const others = Object.entries(info.limits).filter(([id]) => id !== (main?.limitId ?? "codex"));

  return (
    <div ref={ref} className="relative px-3 pb-2">
      <button onClick={() => setOpen((o) => !o)} className="w-full space-y-2 rounded-xl border border-[var(--border)] bg-[var(--panel)]/60 p-3 text-left hover:bg-[var(--panel)]">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-[var(--fg)]">{t("Codex limits")}</span>
          {info.plan && <span className="rounded-md bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] px-1.5 py-px font-mono text-[10.5px] font-semibold text-black">{info.plan}</span>}
        </div>
        {windows.map((w, i) => <Meter key={i} w={w} compact />)}
        {windows.length === 0 && <div className="text-xs text-[var(--faint)]">{t("no data")}</div>}
      </button>

      {open && (
        <div className="absolute bottom-full left-3 right-3 z-30 mb-2 space-y-4 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-2xl shadow-black/50 md:left-full md:right-auto md:bottom-0 md:mb-0 md:ml-2 md:w-80">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-[var(--faint)]">{t("ChatGPT account")}</span>
              <button onClick={() => setOpen(false)} title={t("Close")} className="rounded-md p-1 text-[var(--faint)] hover:bg-[var(--panel-2)] hover:text-[var(--fg)]">
                <Icon name="plus" size={14} className="rotate-45" />
              </button>
            </div>
            <div className="mt-0.5 truncate font-mono text-[13px]">{info.email ? maskEmail(info.email) : "—"}</div>
            <div className="text-xs text-[var(--muted)]">{t("plan")} <span className="font-mono text-[var(--accent)]">{info.plan ?? "—"}</span></div>
          </div>

          <div className="space-y-3">
            {windows.map((w, i) => <Meter key={i} w={w} />)}
            {others.map(([id, s]) => (
              <div key={id} className="space-y-2">
                <div className="text-xs text-[var(--muted)]">{s.limitName ?? id}</div>
                {[s.primary, s.secondary].filter(Boolean).map((w, i) => <Meter key={i} w={w as Window} />)}
              </div>
            ))}
            {main?.rateLimitReachedType && <div className="text-xs text-[var(--red)]">{t("Limit reached: {type}", { type: main.rateLimitReachedType })}</div>}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-[var(--panel-2)] p-2">
              <div className="text-[var(--faint)]">{t("Free resets")}</div>
              <div className="font-mono text-base text-[var(--fg)]">{info.resets.length}</div>
              {info.resets[0]?.expiresAt && <div className="text-[var(--faint)]">{t("next expires in {time}", { time: fmtUntil(info.resets[0].expiresAt) })}</div>}
              {info.resets.length > 0 && !confirm && (
                <button onClick={() => { setConfirm(true); setResetMsg(""); }} className="mt-1.5 rounded-md border border-[var(--accent)]/50 px-2 py-0.5 text-[var(--accent)] hover:bg-[var(--accent)]/10">
                  {t("Apply")}
                </button>
              )}
            </div>
            <div className="rounded-lg bg-[var(--panel-2)] p-2">
              <div className="text-[var(--faint)]">{t("Credits")}</div>
              <div className="font-mono text-base text-[var(--fg)]">{main?.credits?.unlimited ? "∞" : main?.credits?.balance ?? "0"}</div>
            </div>
          </div>

          {confirm && (
            <div className="space-y-2 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/[0.06] p-2.5 text-xs">
              <div>{windows[0]
                ? t("Reset Codex limits now ({pct}% used)? Resets are single-use — the one expiring soonest is spent.", { pct: Math.round(windows[0].usedPercent) })
                : t("Reset Codex limits now? Resets are single-use — the one expiring soonest is spent.")}</div>
              <div className="flex gap-1.5">
                <button disabled={busy} onClick={async () => {
                  setBusy(true);
                  try { setResetMsg(t(outcomes[await resetLimits(info.resets[0].id)] ?? "Done")); }
                  catch (e) { setResetMsg(e instanceof Error ? e.message : t("Failed")); }
                  setBusy(false);
                  setConfirm(false);
                }} className="rounded-md bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] px-2.5 py-1 font-medium text-black disabled:opacity-50">
                  {busy ? "…" : t("Reset")}
                </button>
                <button onClick={() => setConfirm(false)} className="rounded-md px-2.5 py-1 text-[var(--muted)] hover:bg-[var(--panel-2)]">{t("Cancel")}</button>
              </div>
            </div>
          )}
          {resetMsg && <div className="text-xs text-[var(--green)]">{resetMsg}</div>}

          {usage ? (
            <div className="space-y-3">
              {usage.dailyUsageBuckets && <DailyBars buckets={usage.dailyUsageBuckets} />}
              <div className="grid grid-cols-3 gap-2 text-xs">
                {[
                  [t("total"), usage.summary.lifetimeTokens != null ? fmtTokens(Number(usage.summary.lifetimeTokens)) : "—"],
                  [t("daily peak"), usage.summary.peakDailyTokens != null ? fmtTokens(Number(usage.summary.peakDailyTokens)) : "—"],
                  [t("day streak"), `${usage.summary.currentStreakDays ?? 0} / ${usage.summary.longestStreakDays ?? 0}`],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[var(--faint)]">{k}</div>
                    <div className="font-mono text-[var(--fg)]">{v}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-[var(--faint)]">
              <Icon name="refresh" size={12} className="animate-spin" /> {t("loading usage…")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
