/**
 * Resolución de URLs sueltas (listas, feeds, lista curada) en candidatos:
 * GitHub → API de GitHub; Hugging Face Space → API de HF; otro sitio → metadatos de la página oficial.
 */
import { httpGet } from '../lib/http.ts';
import { parsePage } from '../lib/html.ts';
import { githubRepoFromUrl, hfSpaceFromUrl, safeUrl } from '../lib/url.ts';
import { enrichRepo, fetchRepo, repoCandidate } from './github.ts';
import { fetchSpace, spaceCandidate } from './huggingface.ts';
import type { Candidate, ConnectorContext } from './types.ts';

export async function fetchOfficialPage(url: string) {
  const res = await httpGet(url, { respectRobots: true, maxBytes: 1_500_000, timeoutMs: 15_000, retries: 1, minIntervalMs: 1500, headers: { Accept: 'text/html,application/xhtml+xml' } });
  const ctype = res.headers.get('content-type') ?? '';
  if (!res.ok || (ctype && !/html/i.test(ctype))) return { status: res.status, finalUrl: res.url, error: res.error ?? (res.ok ? 'no HTML' : `HTTP ${res.status}`), page: null };
  return { status: res.status, finalUrl: res.url, error: null, page: parsePage(res.text, res.url) };
}

export async function resolveUrl(
  ctx: ConnectorContext,
  rawUrl: string,
  meta: { connector: string; name?: string; description?: string; hint?: string; via: string },
): Promise<Candidate | null> {
  const url = safeUrl(rawUrl, { allowHttp: true });
  if (!url) return null;
  const repo = githubRepoFromUrl(url);
  if (repo) {
    if (ctx.known.has(`github:${repo.toLowerCase()}`)) return null;
    const r = await fetchRepo(ctx, repo);
    if (!r.data) return null;
    await enrichRepo(ctx, r.data);
    const c = repoCandidate(r.data, ctx, meta.via);
    c.hint = meta.hint;
    return c;
  }
  const space = hfSpaceFromUrl(url);
  if (space) {
    if (ctx.known.has(`huggingface:${space.toLowerCase()}`)) return null;
    const s = await fetchSpace(space);
    return s.data ? spaceCandidate(s.data, ctx, meta.via) : null;
  }
  const id = new URL(url).hostname.replace(/^www\./, '') + new URL(url).pathname.replace(/\/+$/, '');
  if (ctx.known.has(`web:${id.toLowerCase()}`)) return null;
  const p = await fetchOfficialPage(url);
  return {
    connector: meta.connector,
    externalId: id.toLowerCase(),
    sourceUrl: url,
    retrievedAt: ctx.now.toISOString(),
    name: meta.name ?? p.page?.title ?? '',
    description: meta.description || p.page?.description || '',
    homepage: url,
    page: p.page ? { ...p.page, status: p.status, finalUrl: p.finalUrl } : { title: '', description: '', ogImage: null, icon: null, lang: null, text: '', links: [], status: p.status, finalUrl: p.finalUrl },
    via: meta.via,
    hint: meta.hint,
  };
}
