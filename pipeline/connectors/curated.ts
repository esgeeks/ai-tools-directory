/**
 * Lista curada (sources/curated.json): herramientas comerciales o sin repositorio,
 * identificadas por su URL oficial. Las afirmaciones editoriales se confirman contra el sitio oficial.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { httpGet } from '../lib/http.ts';
import { cleanText } from '../lib/sanitize.ts';
import { safeUrl } from '../lib/url.ts';
import { fetchOfficialPage } from './web.ts';
import type { Candidate, Connector, CuratedClaims } from './types.ts';

export interface CuratedEntry extends CuratedClaims {
  name: string;
  url: string;
}

export interface CuratedConfig {
  enabled: boolean;
  file: string;
  /** Máximo de entradas nuevas por ejecución. */
  maxNew: number;
}

export const curatedConnector: Connector<CuratedConfig> = {
  id: 'curated',
  async run(ctx, cfg) {
    const entries = JSON.parse(readFileSync(join(process.cwd(), cfg.file), 'utf8')) as { tools: CuratedEntry[] };
    const out: Candidate[] = [];
    for (const e of entries.tools) {
      if (out.length >= cfg.maxNew) break;
      const url = safeUrl(e.url);
      if (!url) {
        ctx.error('curated', `URL inválida: ${e.url}`);
        continue;
      }
      const id = (new URL(url).hostname.replace(/^www\./, '') + new URL(url).pathname.replace(/\/+$/, '')).toLowerCase();
      if (ctx.known.has(`curated:${id}`)) continue;
      const p = await fetchOfficialPage(url);
      if (p.error) ctx.log(`curated: ${e.name} → ${p.error}`);
      let pricingPage: Candidate['pricingPage'] = null;
      const pricingUrl = e.pricingUrl ? safeUrl(e.pricingUrl) : null;
      if (pricingUrl) {
        const r = await httpGet(pricingUrl, { respectRobots: true, maxBytes: 1_500_000, retries: 1, minIntervalMs: 1500 });
        pricingPage = { status: r.status, url: pricingUrl, text: r.ok ? cleanText(r.text, 30_000) : '' };
      }
      out.push({
        connector: 'curated',
        externalId: id,
        sourceUrl: url,
        retrievedAt: ctx.now.toISOString(),
        name: e.name,
        description: e.description ?? p.page?.description ?? '',
        homepage: url,
        page: p.page ? { ...p.page, status: p.status, finalUrl: p.finalUrl } : { title: '', description: '', ogImage: null, icon: null, lang: null, text: '', links: [], status: p.status, finalUrl: p.finalUrl },
        pricingPage,
        claims: e,
        via: cfg.file,
      });
    }
    ctx.log(`curated: ${out.length} entradas nuevas procesadas`);
    return out;
  },
};
