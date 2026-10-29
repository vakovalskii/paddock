// Цепочка внешних прокси в egress (gost). Морда читает и меняет её через API gost; пароли наружу не отдаёт.
import { request as httpRequest } from "node:http";
import { connect as tlsConnect } from "node:tls";
import { auth, codexUserOf } from "./auth";

const api = process.env.GOST_API ?? "http://egress:18080/api";
const basic = "Basic " + Buffer.from(`${process.env.GOST_API_USER ?? ""}:${process.env.GOST_API_PASS ?? ""}`).toString("base64");
const CHAIN = "upstream";

export type ProxyNode = { name: string; addr: string; username: string; hasPassword: boolean };
export type ProxyInput = { name: string; addr: string; username: string; password: string };

async function gost(path: string, init: RequestInit = {}) {
  const r = await fetch(`${api}${path}`, { ...init, headers: { authorization: basic, "content-type": "application/json" } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`gost ${path}: ${r.status} ${body.msg ?? ""}`);
  return body;
}

// Только админы (ADMIN_USERS=valera,...) и только со своего домена.
export async function requireAdmin(req: Request): Promise<Response | null> {
  const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const admins = (process.env.ADMIN_USERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!admins.includes(codexUserOf(session.user.email))) return Response.json({ error: "forbidden" }, { status: 403 });
  if (req.method !== "GET" && req.headers.get("origin") !== process.env.PUBLIC_URL) return Response.json({ error: "bad origin" }, { status: 403 });
  return null;
}

async function readChain(): Promise<any> {
  return (await gost(`/config/chains/${CHAIN}`)).data;
}

export async function listNodes(): Promise<{ nodes: ProxyNode[]; strategy: string | null }> {
  const chain = await readChain();
  const hop = chain.hops?.[0] ?? {};
  return {
    strategy: hop.selector?.strategy ?? null,
    nodes: (hop.nodes ?? []).map((n: any) => ({
      name: n.name,
      addr: n.addr,
      username: n.connector?.auth?.username ?? "",
      hasPassword: !!n.connector?.auth?.password,
    })),
  };
}

// Новый список узлов: порядок = приоритет (fifo). Пустой пароль у существующего узла = оставить прежний.
export async function saveNodes(input: ProxyInput[]) {
  if (input.length === 0) throw new Error("at least one proxy is needed, otherwise Codex has no network");
  const names = new Set<string>();
  for (const n of input) {
    if (!/^[\w-]{1,40}$/.test(n.name)) throw new Error(`name "${n.name}": latin letters, digits, - and _ only`);
    if (names.has(n.name)) throw new Error(`name "${n.name}" is used twice`);
    names.add(n.name);
    if (!/^[\w.-]+:\d{1,5}$/.test(n.addr)) throw new Error(`address "${n.addr}": expected host:port`);
  }
  const chain = await readChain();
  const hop = chain.hops?.[0] ?? { name: "hop-0" };
  const old = new Map<string, any>((hop.nodes ?? []).map((n: any) => [n.name, n]));
  hop.nodes = input.map((n) => {
    const prev = old.get(n.name)?.connector?.auth;
    const password = n.password || (prev?.username === n.username ? prev?.password : "") || "";
    return {
      name: n.name,
      addr: n.addr,
      connector: { type: "http", ...(n.username ? { auth: { username: n.username, password } } : {}) },
      dialer: { type: "tcp" },
    };
  });
  chain.hops = [hop];
  await gost(`/config/chains/${CHAIN}`, { method: "PUT", body: JSON.stringify(chain) });
  await syncProbes(hop.nodes);
  await gost("/config?format=yaml", { method: "POST" }); // сохранить в gost.yaml, чтобы пережило рестарт
}

// Пробные входы: на каждый прокси свой порт в egress (18100+i) с цепочкой из одного этого узла.
// Через них морда меряет каждый прокси отдельно — пароли остаются в gost, наружу не уходят.
// Порты живут только в сети core, как и основной :8080: агент через них попадёт лишь в тот же прокси.
const PROBE_PORT = 18100;
export async function syncProbes(nodes?: any[]) {
  nodes ??= (await readChain()).hops?.[0]?.nodes ?? [];
  const cfg = (await gost("/config")).data ?? (await gost("/config"));
  for (const sv of cfg.services ?? []) if (sv.name.startsWith("probe-")) await gost(`/config/services/${sv.name}`, { method: "DELETE" });
  for (const ch of cfg.chains ?? []) if (ch.name.startsWith("probe-")) await gost(`/config/chains/${ch.name}`, { method: "DELETE" });
  for (const [i, n] of nodes!.entries()) {
    await gost("/config/chains", { method: "POST", body: JSON.stringify({ name: `probe-${n.name}`, hops: [{ name: "hop-0", nodes: [n] }] }) });
    await gost("/config/services", {
      method: "POST",
      body: JSON.stringify({ name: `probe-${n.name}`, addr: `:${PROBE_PORT + i}`, handler: { type: "http", chain: `probe-${n.name}` }, listener: { type: "tcp" } }),
    });
  }
}

// Куда ходят агенты: Codex по подписке — chatgpt.com, по ключу — api.openai.com, NeuralDeep — api.neuraldeep.ru.
export const ENDPOINTS = [
  { id: "chatgpt", host: "chatgpt.com", path: "/backend-api/codex/responses" },
  { id: "openai", host: "api.openai.com", path: "/v1/models" },
  { id: "neuraldeep", host: "api.neuraldeep.ru", path: "/v1/models" },
] as const;
export type Probe = { ms: number | null; status: number | null; state: "ok" | "blocked" | "dead" };

// Без ключа любой из этих API отвечает 401/404/405 — значит, дошли. 403 — блок по региону, ошибка соединения — прокси мёртв.
async function probe(port: number, host: string, path: string): Promise<Probe> {
  const started = Date.now();
  try {
    const r = await viaEgress(host, path, {}, port, 10000);
    return { ms: Date.now() - started, status: r.status, state: r.status === 403 ? "blocked" : "ok" };
  } catch {
    return { ms: null, status: null, state: "dead" };
  }
}

export type NetReport = {
  checkedAt: number;
  chain: Record<string, Probe>;
  proxies: { name: string; results: Record<string, Probe> }[];
  exit: { country: string | null; org: string | null; ms: number } | null;
};
let netCache: { at: number; report: Promise<NetReport> } | null = null;
export function netReport(force = false): Promise<NetReport> {
  if (!force && netCache && Date.now() - netCache.at < 60_000) return netCache.report;
  const report = (async () => {
    const nodes: any[] = (await readChain()).hops?.[0]?.nodes ?? [];
    const cfg = (await gost("/config")).data ?? (await gost("/config"));
    if ((cfg.services ?? []).filter((x: any) => x.name.startsWith("probe-")).length !== nodes.length) await syncProbes(nodes);
    const row = async (port: number) => Object.fromEntries(await Promise.all(ENDPOINTS.map(async (e) => [e.id, await probe(port, e.host, e.path)] as const)));
    const [chain, proxies, exit] = await Promise.all([
      row(8080),
      Promise.all(nodes.map(async (n, i) => ({ name: n.name as string, results: await row(PROBE_PORT + i) }))),
      checkExit().then(({ country, org, ms }) => ({ country, org, ms })).catch(() => null),
    ]);
    return { checkedAt: Date.now(), chain, proxies, exit };
  })();
  netCache = { at: Date.now(), report };
  report.catch(() => (netCache = null));
  return report;
}

// HTTPS-запрос наружу через egress:8080 (CONNECT): у морды нет прямого выхода в интернет.
export function viaEgress(host: string, path: string, headers: Record<string, string> = {}, port = 8080, timeoutMs = 15000): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { req.destroy(); reject(new Error(`timeout ${timeoutMs / 1000} s`)); }, timeoutMs);
    const req = httpRequest({ host: "egress", port, method: "CONNECT", path: `${host}:443` });
    req.on("connect", (res, socket) => {
      if (res.statusCode !== 200) { clearTimeout(timer); return reject(new Error(`egress answered ${res.statusCode}`)); }
      const tls = tlsConnect({ socket, servername: host }, () => {
        const extra = Object.entries(headers).map(([k, v]) => `${k}: ${v}\r\n`).join("");
        // HTTP/1.0 — ответ без chunked, читаем до закрытия соединения
        tls.write(`GET ${path} HTTP/1.0\r\nHost: ${host}\r\nAccept: application/json\r\n${extra}\r\n`);
      });
      let raw = "";
      tls.setEncoding("utf8");
      tls.on("data", (d) => (raw += d));
      tls.on("end", () => {
        clearTimeout(timer);
        const status = Number(raw.slice(9, 12));
        resolve({ status, body: raw.slice(raw.indexOf("\r\n\r\n") + 4) });
      });
      tls.on("error", (e) => { clearTimeout(timer); reject(e); });
    });
    req.on("error", (e) => { clearTimeout(timer); reject(e); });
    req.end();
  });
}

// Какой IP видит интернет и сколько занял путь через цепочку.
export async function checkExit(): Promise<{ ip: string; country: string | null; org: string | null; ms: number }> {
  const started = Date.now();
  const r = await viaEgress("ipinfo.io", "/json");
  const j = JSON.parse(r.body);
  return { ip: j.ip, country: j.country ?? null, org: j.org ?? null, ms: Date.now() - started };
}
