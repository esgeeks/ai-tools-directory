/**
 * Conector Hugging Face Spaces (API pública /api/spaces). Solo Spaces: los modelos y datasets
 * independientes no se consultan. Se exige que el Space esté en ejecución (runtime RUNNING).
 */
import { httpGet, httpJson } from '../lib/http.ts';
import type { Candidate, Connector, ConnectorContext, HfSpaceData } from './types.ts';

const API = 'https://huggingface.co/api/spaces';
const EXPAND = ['author', 'cardData', 'createdAt', 'lastModified', 'likes', 'private', 'runtime', 'sdk', 'tags', 'disabled', 'models'];

interface SpaceJson {
  id: string;
  likes?: number;
  sdk?: string;
  tags?: string[];
  private?: boolean;
  disabled?: boolean;
  lastModified?: string;
  createdAt?: string;
  runtime?: { stage?: string };
  models?: string[];
  cardData?: { title?: string; short_description?: string; license?: string; emoji?: string; models?: string[] };
}

export function spaceToData(s: SpaceJson): HfSpaceData {
  return {
    id: s.id,
    title: s.cardData?.title ?? null,
    shortDescription: s.cardData?.short_description ?? null,
    models: [...new Set([...(s.models ?? []), ...(s.cardData?.models ?? [])])].filter((m) => typeof m === 'string').slice(0, 10),
    readme: null,
    sdk: s.sdk ?? null,
    runtimeStage: s.runtime?.stage ?? null,
    likes: s.likes ?? 0,
    lastModified: s.lastModified ?? null,
    createdAt: s.createdAt ?? null,
    tags: s.tags ?? [],
    license: s.cardData?.license ?? null,
    private: s.private ?? false,
    disabled: s.disabled ?? false,
  };
}

function expandQs(): string {
  return EXPAND.map((e) => `expand[]=${e}`).join('&');
}

export async function fetchSpace(id: string): Promise<{ status: number; data: HfSpaceData | null }> {
  const r = await httpJson<SpaceJson>(`${API}/${id}?${expandQs()}`, { minIntervalMs: 600 });
  return { status: r.status, data: r.ok && r.data ? spaceToData(r.data) : null };
}

/** README del Space (texto después del bloque YAML). */
async function fetchReadme(id: string): Promise<string | null> {
  const r = await httpGet(`https://huggingface.co/spaces/${id}/raw/main/README.md`, { maxBytes: 40_000, minIntervalMs: 600, retries: 1 });
  if (!r.ok) return null;
  return r.text.replace(/^---[\s\S]*?---\s*/, '');
}

export function spaceCandidate(d: HfSpaceData, ctx: ConnectorContext, via: string): Candidate {
  return {
    connector: 'huggingface',
    externalId: d.id.toLowerCase(),
    sourceUrl: `https://huggingface.co/spaces/${d.id}`,
    retrievedAt: ctx.now.toISOString(),
    name: d.title || d.id.split('/')[1],
    description: d.shortDescription ?? '',
    homepage: `https://huggingface.co/spaces/${d.id}`,
    hf: d,
    via,
  };
}

export interface HfConfig {
  enabled: boolean;
  queries: { search?: string; sort: string; limit: number; filter?: string }[];
  minLikes: number;
  maxNew: number;
}

export const huggingfaceConnector: Connector<HfConfig> = {
  id: 'huggingface',
  async run(ctx, cfg) {
    const found = new Map<string, HfSpaceData & { via: string }>();
    for (const q of cfg.queries) {
      const params = new URLSearchParams({ sort: q.sort, direction: '-1', limit: String(q.limit) });
      if (q.search) params.set('search', q.search);
      if (q.filter) params.set('filter', q.filter);
      const url = `${API}?${params}&${expandQs()}`;
      const res = await httpJson<SpaceJson[]>(url, { minIntervalMs: 1000, retries: 2 });
      if (!res.ok || !Array.isArray(res.data)) {
        ctx.error('huggingface', `Consulta ${params}: ${res.error}`);
        continue;
      }
      for (const s of res.data) if (!found.has(s.id.toLowerCase())) found.set(s.id.toLowerCase(), { ...spaceToData(s), via: params.toString() });
      ctx.log(`huggingface: ${params} → ${res.data.length}`);
    }
    const fresh = [...found.values()].filter((d) => !ctx.known.has(`huggingface:${d.id.toLowerCase()}`) && !d.private && !d.disabled && d.likes >= cfg.minLikes);
    const out: Candidate[] = [];
    for (const d of fresh.slice(0, cfg.maxNew)) {
      d.readme = await fetchReadme(d.id);
      out.push(spaceCandidate(d, ctx, d.via));
    }
    ctx.log(`huggingface: ${found.size} encontrados, ${fresh.length} nuevos, ${out.length} enriquecidos`);
    return out;
  },
};
