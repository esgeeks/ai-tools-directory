/**
 * Listas públicas "awesome" en GitHub. Solo se procesan listas cuya licencia (verificada por la API)
 * permite reutilizar el contenido. Se usan exclusivamente como fuente de candidatos:
 * cada enlace se verifica de nuevo contra su fuente original.
 */
import { httpGet, httpJson } from '../lib/http.ts';
import { cleanName, cleanText } from '../lib/sanitize.ts';
import { resolveUrl } from './web.ts';
import type { Candidate, Connector } from './types.ts';

export interface AwesomeConfig {
  enabled: boolean;
  lists: { repo: string; path?: string }[];
  allowedLicenses: string[];
  maxNew: number;
}

export interface ListLink {
  name: string;
  url: string;
  description: string;
}

/** Extrae entradas del tipo "- [Nombre](url) - descripción". */
export function parseAwesomeMarkdown(md: string): ListLink[] {
  const out: ListLink[] = [];
  for (const line of md.split(/\r?\n/)) {
    const m = line.match(/^\s*[-*]\s+\[([^\]]{1,80})\]\((https?:\/\/[^)\s]+)\)\s*(?:[-–—:]\s*(.*))?$/);
    if (!m) continue;
    const name = cleanName(m[1]);
    const description = cleanText(m[3] ?? '', 300);
    if (!name || /^(back to top|contents|table of contents)$/i.test(name)) continue;
    out.push({ name, url: m[2], description });
  }
  return out;
}

export const awesomeConnector: Connector<AwesomeConfig> = {
  id: 'awesome-list',
  async run(ctx, cfg) {
    const out: Candidate[] = [];
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    for (const list of cfg.lists) {
      if (ctx.budget.githubCalls < 2) break;
      ctx.budget.githubCalls -= 1;
      // La licencia se verifica con la API de búsqueda (devuelve license.spdx_id).
      const meta = await httpJson<{ items: { full_name: string; license: { spdx_id: string } | null; archived: boolean }[] }>(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(`repo:${list.repo}`)}`, { headers, minIntervalMs: 2200 });
      const repo = meta.data?.items?.[0];
      const spdx = repo?.license?.spdx_id ?? null;
      if (!meta.ok || !repo || !spdx || !cfg.allowedLicenses.includes(spdx)) {
        ctx.error('awesome-list', `${list.repo}: licencia no permitida o no verificable (${spdx ?? meta.error ?? 'sin datos'})`);
        continue;
      }
      const raw = await httpGet(`https://raw.githubusercontent.com/${list.repo}/HEAD/${list.path ?? 'README.md'}`, { maxBytes: 1_500_000, minIntervalMs: 500 });
      if (!raw.ok) {
        ctx.error('awesome-list', `${list.repo}: no se pudo leer (${raw.status || raw.error})`);
        continue;
      }
      const links = parseAwesomeMarkdown(raw.text);
      ctx.log(`awesome-list: ${list.repo} (${spdx}) → ${links.length} enlaces`);
      for (const l of links) {
        if (out.length >= cfg.maxNew) break;
        try {
          // El texto de la lista no se publica: solo sirve como pista de clasificación.
          const c = await resolveUrl(ctx, l.url, { connector: 'awesome-list', name: l.name, description: '', hint: l.description, via: `https://github.com/${list.repo}` });
          if (c) out.push(c);
        } catch (e) {
          ctx.error('awesome-list', `${l.url}: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
    return out;
  },
};
