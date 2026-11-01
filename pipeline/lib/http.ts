/**
 * Cliente HTTP del pipeline: tiempo de espera, reintentos con espera exponencial,
 * respeto de Retry-After, intervalo mínimo por host, límite de tamaño y robots.txt.
 * Nunca intenta eludir bloqueos, autenticación ni límites: si una fuente responde 403/429, se registra y se sigue.
 */
import { site } from '../../src/config/site.ts';

export const USER_AGENT = `AIToolsDirectoryBot/1.0 (+${site.url}/es/metodologia/)`;

export interface FetchOpts {
  method?: 'GET' | 'HEAD';
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  maxBytes?: number;
  /** Intervalo mínimo entre solicitudes al mismo host. */
  minIntervalMs?: number;
  /** Comprobar robots.txt antes de pedir la página (para sitios web, no APIs). */
  respectRobots?: boolean;
}

export interface FetchResult {
  ok: boolean;
  status: number;
  url: string;
  headers: Headers;
  text: string;
  error?: string;
}

const lastHit = new Map<string, number>();
const robotsCache = new Map<string, string[] | null>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function politeWait(host: string, minInterval: number) {
  const last = lastHit.get(host) ?? 0;
  const wait = last + minInterval - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
}

async function readLimited(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    chunks.push(value);
    if (size >= maxBytes) {
      await reader.cancel().catch(() => {});
      break;
    }
  }
  const buf = new Uint8Array(Math.min(size, maxBytes));
  let off = 0;
  for (const c of chunks) {
    const take = Math.min(c.byteLength, buf.byteLength - off);
    buf.set(c.subarray(0, take), off);
    off += take;
    if (off >= buf.byteLength) break;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(buf);
}

/** Reglas Disallow aplicables a nuestro agente (o "*"). null = sin robots.txt accesible (permitido). */
async function robotsFor(origin: string): Promise<string[] | null> {
  if (robotsCache.has(origin)) return robotsCache.get(origin)!;
  let rules: string[] | null = null;
  try {
    const res = await httpGet(`${origin}/robots.txt`, { retries: 0, timeoutMs: 8000, maxBytes: 256_000 });
    if (res.ok) {
      rules = [];
      let applies = false;
      let sawRuleInGroup = false;
      for (const line of res.text.split(/\r?\n/)) {
        const l = line.replace(/#.*/, '').trim();
        const m = l.match(/^([a-z-]+)\s*:\s*(.*)$/i);
        if (!m) continue;
        const key = m[1].toLowerCase();
        const val = m[2].trim();
        if (key === 'user-agent') {
          if (sawRuleInGroup) {
            applies = false;
            sawRuleInGroup = false;
          }
          if (val === '*' || /aitoolsdirectorybot/i.test(val)) applies = true;
        } else if (key === 'disallow') {
          sawRuleInGroup = true;
          if (applies && val) rules.push(val);
        } else if (key === 'allow') {
          sawRuleInGroup = true;
        }
      }
    }
  } catch {
    rules = null;
  }
  robotsCache.set(origin, rules);
  return rules;
}

export async function allowedByRobots(url: string): Promise<boolean> {
  const u = new URL(url);
  const rules = await robotsFor(u.origin);
  if (!rules) return true;
  const p = u.pathname + u.search;
  return !rules.some((r) => {
    const anchored = r.endsWith('$');
    const body = (anchored ? r.slice(0, -1) : r).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${body}${anchored ? '$' : ''}`).test(p);
  });
}

export async function httpGet(url: string, opts: FetchOpts = {}): Promise<FetchResult> {
  const { method = 'GET', headers = {}, timeoutMs = 15_000, retries = 2, maxBytes = 2_000_000, minIntervalMs = 400, respectRobots = false } = opts;
  const host = new URL(url).host;
  if (respectRobots && !(await allowedByRobots(url))) {
    return { ok: false, status: 0, url, headers: new Headers(), text: '', error: 'robots.txt disallow' };
  }
  let attempt = 0;
  let lastErr = '';
  while (attempt <= retries) {
    await politeWait(host, minIntervalMs);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en,es;q=0.8', ...headers },
        redirect: 'follow',
        signal: ctrl.signal,
      });
      const text = method === 'HEAD' ? '' : await readLimited(res, maxBytes);
      clearTimeout(timer);
      const rateLimited = res.status === 429 || (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0');
      if ((rateLimited || res.status >= 500) && attempt < retries) {
        const ra = Number(res.headers.get('retry-after'));
        const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000 - Date.now() + 1000;
        const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : rateLimited && Number.isFinite(reset) && reset > 0 ? reset : 1000 * 2 ** attempt;
        if (wait > 65_000) return { ok: false, status: res.status, url: res.url || url, headers: res.headers, text, error: `límite de solicitudes (espera ${Math.round(wait / 1000)} s)` };
        await sleep(wait);
        attempt++;
        continue;
      }
      return { ok: res.ok, status: res.status, url: res.url || url, headers: res.headers, text };
    } catch (e) {
      clearTimeout(timer);
      lastErr = e instanceof Error ? (e.name === 'AbortError' ? 'timeout' : e.message) : String(e);
      if (attempt < retries) await sleep(1000 * 2 ** attempt);
      attempt++;
    }
  }
  return { ok: false, status: 0, url, headers: new Headers(), text: '', error: lastErr || 'request failed' };
}

export async function httpJson<T>(url: string, opts: FetchOpts = {}): Promise<{ ok: boolean; status: number; data: T | null; error?: string; headers: Headers }> {
  const res = await httpGet(url, { ...opts, headers: { Accept: 'application/json', ...(opts.headers ?? {}) } });
  if (!res.ok) return { ok: false, status: res.status, data: null, error: res.error ?? `HTTP ${res.status}`, headers: res.headers };
  try {
    return { ok: true, status: res.status, data: JSON.parse(res.text) as T, headers: res.headers };
  } catch {
    return { ok: false, status: res.status, data: null, error: 'invalid JSON', headers: res.headers };
  }
}
