// UI language without a library: the key is the English string as written in the code, Russian translations
// live in lib/i18n/*.ts by area. Placeholders are {name}: t("{n} actions", { n: 3 }). No translation → English.
// Language: the switch in the sidebar or on the login page (localStorage paddock.lang), default — the browser language.
import { store } from "./store";
import chat from "./i18n/chat";
import panels from "./i18n/panels";
import settings from "./i18n/settings";

export type Lang = "ru" | "en";
const ru: Record<string, string> = { ...chat, ...panels, ...settings };

function detect(): Lang {
  if (typeof window === "undefined") return "en";
  const saved = store.get<Lang | null>("paddock.lang", null);
  if (saved === "ru" || saved === "en") return saved;
  return navigator.language?.toLowerCase().startsWith("ru") ? "ru" : "en";
}

let lang: Lang = detect();
export const getLang = () => lang;
export const locale = () => (lang === "en" ? "en-GB" : "ru");

// Switching the language re-renders everything — a reload is simpler than threading the language through context.
export function setLang(l: Lang) {
  store.set("paddock.lang", l);
  lang = l;
  window.location.reload();
}

export function t(s: string, vars?: Record<string, string | number>): string {
  let out = lang === "ru" ? (ru[s] ?? s) : s;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
  return out;
}
