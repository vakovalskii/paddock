import { t } from "./i18n";

export const fmtTokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));

export function fmtDuration(ms: number): string {
  if (ms < 1000) return t("{n} ms", { n: ms });
  const s = ms / 1000;
  if (s < 60) return t("{n} s", { n: s.toFixed(s < 10 ? 1 : 0) });
  const m = Math.floor(s / 60);
  return t("{m} min {s} s", { m, s: Math.round(s % 60) });
}

// 10080 → "7d", 300 → "5h"
export function fmtWindow(mins: number | null): string {
  if (!mins) return "";
  if (mins % 1440 === 0) return `${mins / 1440}d`;
  if (mins % 60 === 0) return `${mins / 60}h`;
  return `${mins}m`;
}

// Время до сброса лимита: "4d", "3h", "25m"
export function fmtUntil(unixSec: number | null): string {
  if (!unixSec) return "";
  const mins = Math.max(0, Math.round((unixSec * 1000 - Date.now()) / 60000));
  if (mins >= 1440) return `${Math.round(mins / 1440)}d`;
  if (mins >= 60) return `${Math.round(mins / 60)}h`;
  return `${mins}m`;
}

export function dayGroup(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = (today.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000;
  if (diff <= 0) return t("Today");
  if (diff === 1) return t("Yesterday");
  if (diff < 7) return t("This week");
  if (diff < 31) return t("This month");
  return t("Earlier");
}
