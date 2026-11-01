/**
 * Conector GitHub Search API. Usa el token de GitHub Actions (GITHUB_TOKEN) si existe;
 * sin token funciona con el límite público (más bajo). Respeta X-RateLimit-* y presupuestos por ejecución.
 */
import { httpGet, httpJson } from '../lib/http.ts';
import type { Candidate, Connector, ConnectorContext, GithubData } from './types.ts';

const API = 'https://api.github.com';

function headers(): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

interface RepoJson {
  full_name: string;
  html_url: string;
  description: string | null;
  homepage: string | null;
  topics?: string[];
  license: { spdx_id: string | null; name: string | null } | null;
  archived: boolean;
  disabled?: boolean;
  fork: boolean;
  is_template?: boolean;
  pushed_at: string | null;
  created_at: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  owner: { avatar_url: string | null };
}

/** Límites por recurso de la API (core y search tienen cuotas distintas). */
const rate: Record<string, { remaining: number; reset: number }> = {};
function trackRate(h: Headers) {
  const r = Number(h.get('x-ratelimit-remaining'));
  const reset = Number(h.get('x-ratelimit-reset'));
  const res = h.get('x-ratelimit-resource') ?? 'core';
  if (Number.isFinite(r)) rate[res] = { remaining: r, reset: Number.isFinite(reset) ? reset * 1000 : 0 };
}
export function githubRateRemaining() {
  return rate.core?.remaining ?? Infinity;
}

function canSpend(ctx: ConnectorContext, n = 1): boolean {
  if (ctx.budget.githubCalls < n || (rate.core && rate.core.remaining < 50)) return false;
  ctx.budget.githubCalls -= n;
  return true;
}

/** Si se agotó la cuota de búsqueda, espera al reinicio (máx. 65 s) en lugar de insistir. */
async function waitForSearch(): Promise<boolean> {
  const s = rate.search;
  if (!s || s.remaining > 0) return true;
  const wait = s.reset - Date.now() + 1000;
  if (wait > 65_000) return false;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  return true;
}

export function repoToData(r: RepoJson): GithubData {
  const spdx = r.license?.spdx_id && r.license.spdx_id !== 'NOASSERTION' ? r.license.spdx_id : null;
  return {
    fullName: r.full_name,
    description: r.description ?? '',
    homepage: r.homepage || null,
    topics: r.topics ?? [],
    license: { spdx, name: spdx ? r.license?.name ?? null : null },
    archived: r.archived,
    disabled: r.disabled ?? false,
    fork: r.fork,
    isTemplate: r.is_template ?? false,
    pushedAt: r.pushed_at,
    createdAt: r.created_at,
    stars: r.stargazers_count,
    forks: r.forks_count,
    ownerAvatar: r.owner?.avatar_url ?? null,
    language: r.language,
    readme: null,
    release: null,
  };
}

/** README (texto, máx. 60 KB) y última release (nombres de binarios). 2 llamadas. */
export async function enrichRepo(ctx: ConnectorContext, data: GithubData): Promise<GithubData> {
  // README desde raw.githubusercontent.com (no consume cuota de la API); respaldo: API.
  const raw = await httpGet(`https://raw.githubusercontent.com/${data.fullName}/HEAD/README.md`, { maxBytes: 60_000, minIntervalMs: 150, retries: 1 });
  if (raw.ok) data.readme = raw.text;
  else if (canSpend(ctx)) {
    const r = await httpGet(`${API}/repos/${data.fullName}/readme`, { headers: { ...headers(), Accept: 'application/vnd.github.raw' }, maxBytes: 60_000, minIntervalMs: 250, retries: 1 });
    trackRate(r.headers);
    data.readme = r.ok ? r.text : null;
  }
  if (canSpend(ctx)) {
    const rel = await httpJson<{ tag_name: string; published_at: string | null; html_url: string; assets: { name: string }[]; draft: boolean; prerelease: boolean }>(
      `${API}/repos/${data.fullName}/releases/latest`, { headers: headers(), minIntervalMs: 250, retries: 1 });
    trackRate(rel.headers);
    if (rel.ok && rel.data && !rel.data.draft) {
      data.release = { tag: rel.data.tag_name, publishedAt: rel.data.published_at, assets: rel.data.assets.map((a) => a.name).slice(0, 60), url: rel.data.html_url };
    }
  }
  return data;
}

/** Datos actuales de un repo (re-verificación diaria). */
export async function fetchRepo(ctx: ConnectorContext, fullName: string): Promise<{ status: number; data: GithubData | null }> {
  if (!canSpend(ctx)) return { status: -1, data: null };
  const r = await httpJson<RepoJson>(`${API}/repos/${fullName}`, { headers: headers(), minIntervalMs: 250 });
  trackRate(r.headers);
  return { status: r.status, data: r.ok && r.data ? repoToData(r.data) : null };
}

export function repoCandidate(data: GithubData, ctx: ConnectorContext, via: string): Candidate {
  return {
    connector: 'github',
    externalId: data.fullName.toLowerCase(),
    sourceUrl: `https://github.com/${data.fullName}`,
    retrievedAt: ctx.now.toISOString(),
    name: data.fullName.split('/')[1],
    description: data.description,
    homepage: data.homepage,
    github: data,
    via,
  };
}

export interface GithubConfig {
  enabled: boolean;
  queries: string[];
  perQuery: number;
  /** Máximo de repos nuevos a enriquecer por ejecución. */
  maxNew: number;
}

function expandDates(q: string, now: Date): string {
  return q.replace(/\{(\d+)d\}/g, (_, n) => new Date(now.getTime() - Number(n) * 86_400_000).toISOString().slice(0, 10));
}

export const githubConnector: Connector<GithubConfig> = {
  id: 'github',
  async run(ctx, cfg) {
    const found = new Map<string, GithubData & { via: string }>();
    for (const raw of cfg.queries) {
      if (!canSpend(ctx) || !(await waitForSearch())) {
        ctx.error('github', 'Presupuesto o límite de API agotado; se omiten consultas restantes.');
        break;
      }
      const q = expandDates(raw, ctx.now);
      const url = `${API}/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${cfg.perQuery}`;
      // La API de búsqueda permite 30 solicitudes/minuto autenticadas: 2,2 s entre consultas.
      const res = await httpJson<{ items: RepoJson[] }>(url, { headers: headers(), minIntervalMs: 2200, retries: 2 });
      trackRate(res.headers);
      if (!res.ok || !res.data) {
        ctx.error('github', `Consulta "${q}": ${res.error}`);
        continue;
      }
      for (const item of res.data.items) {
        const key = item.full_name.toLowerCase();
        if (!found.has(key)) found.set(key, { ...repoToData(item), via: q });
      }
      ctx.log(`github: "${q}" → ${res.data.items.length}`);
    }
    // Filtro barato antes de gastar cuota en README/releases.
    const fresh = [...found.values()]
      .filter((d) => !ctx.known.has(`github:${d.fullName.toLowerCase()}`) && !d.archived && !d.fork && !d.isTemplate && !d.disabled)
      .sort((a, b) => b.stars - a.stars);
    const out: Candidate[] = [];
    for (const d of fresh.slice(0, cfg.maxNew)) {
      await enrichRepo(ctx, d);
      out.push(repoCandidate(d, ctx, d.via));
    }
    ctx.log(`github: ${found.size} encontrados, ${fresh.length} nuevos, ${out.length} enriquecidos`);
    return out;
  },
};
