/**
 * Almacenamiento: deduplicación, fusión, slugs estables, historial de métricas/cambios,
 * tendencias y escritura atómica con protecciones contra borrados masivos.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CatalogSchema, type Catalog, type Tool } from '../src/lib/schema.ts';
import { slugify } from './lib/sanitize.ts';
import { canonicalUrl } from './lib/url.ts';
import type { Draft } from './process.ts';

export const DATA = join(process.cwd(), 'data');

export function readJson<T>(rel: string, fallback: T): T {
  const p = join(DATA, rel);
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as T) : fallback;
}

/** Escritura atómica: archivo temporal + rename (nunca deja JSON a medias). */
export function writeJson(rel: string, value: unknown) {
  const p = join(DATA, rel);
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, p);
}

export function loadCatalog(): Catalog {
  return CatalogSchema.parse(readJson('catalog.json', { version: 1, generatedAt: '1970-01-01', tools: [] }));
}

/* ------------------------------ Deduplicación ------------------------------ */

export function dedupeKeys(t: Pick<Tool, 'id' | 'name' | 'urls' | 'sources'>): string[] {
  const keys = new Set<string>([t.id]);
  for (const s of t.sources) keys.add(`${s.connector === 'awesome-list' || s.connector === 'rss' ? 'web' : s.connector}:${s.externalId}`);
  const gh = t.urls.github?.match(/github\.com\/([^/]+\/[^/?#]+)/i)?.[1];
  if (gh) keys.add(`github:${gh.toLowerCase()}`);
  const hf = t.urls.huggingface?.match(/huggingface\.co\/spaces\/([^/]+\/[^/?#]+)/i)?.[1];
  if (hf) keys.add(`huggingface:${hf.toLowerCase()}`);
  if (t.urls.official) {
    const cu = canonicalUrl(t.urls.official);
    if (cu) keys.add(`url:${cu}`);
  }
  return [...keys];
}

export const nameKey = (name: string) => `name:${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

export class CatalogIndex {
  private byKey = new Map<string, Tool>();
  constructor(public tools: Tool[]) {
    for (const t of tools) this.index(t);
  }
  index(t: Tool) {
    for (const k of dedupeKeys(t)) this.byKey.set(k, t);
    this.byKey.set(nameKey(t.name), t);
  }
  /** Busca un duplicado por claves verificables; el nombre solo cuenta si además coincide el dominio o el repo. */
  find(d: Draft): Tool | undefined {
    for (const k of d.canonicalKeys) {
      const hit = this.byKey.get(k);
      if (hit) return hit;
    }
    const byName = this.byKey.get(nameKey(d.name));
    if (byName && d.urls.official && byName.urls.official) {
      const host = (u: string) => new URL(u).hostname.replace(/^www\./, '');
      if (host(d.urls.official) === host(byName.urls.official)) return byName;
    }
    return undefined;
  }
  slugTaken(slug: string) {
    return this.tools.some((t) => t.slug === slug);
  }
}

export function assignSlug(d: Draft, idx: CatalogIndex): string {
  const base = slugify(d.name) || slugify(d.id.split(':').pop() ?? 'tool') || 'tool';
  if (!idx.slugTaken(base)) return base;
  const owner = d.urls.github?.match(/github\.com\/([^/]+)/i)?.[1] ?? d.urls.huggingface?.match(/spaces\/([^/]+)/)?.[1];
  if (owner) {
    const s = slugify(`${base}-${owner}`);
    if (!idx.slugTaken(s)) return s;
  }
  for (let i = 2; i < 1000; i++) if (!idx.slugTaken(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now()}`;
}

/* ------------------------------ Fusión / cambios ------------------------------ */

const CONTENT_FIELDS = ['name', 'description.original', 'categories', 'platforms', 'pricing', 'license.spdx', 'urls.official', 'urls.download', 'localExecution', 'offline'] as const;

function get(o: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((a, k) => (a && typeof a === 'object' ? (a as Record<string, unknown>)[k] : undefined), o);
}

export function diffFields(a: Tool, b: Draft): string[] {
  return CONTENT_FIELDS.filter((f) => JSON.stringify(get(a, f)) !== JSON.stringify(get(b, f)));
}

/**
 * Fusiona un borrador re-verificado con la ficha existente.
 * Conserva identidad (id, slug, fecha de alta) y traducciones si el texto original no cambió.
 */
export function mergeTool(existing: Tool, d: Draft, today: string): { tool: Tool; changed: string[] } {
  const changed = diffFields(existing, d);
  const sameDesc = existing.description.original === d.description.original;
  const sameFeatures = JSON.stringify(existing.features.original) === JSON.stringify(d.features.original);
  const sameReqs = JSON.stringify(existing.requirements.original) === JSON.stringify(d.requirements.original);
  const sources = [...existing.sources];
  for (const s of d.sources) if (!sources.some((x) => x.connector === s.connector && x.externalId === s.externalId)) sources.push(s);
  const isCurated = existing.sources.some((s) => s.connector === 'curated');
  const tool: Tool = {
    ...existing,
    // Las fichas curadas mantienen nombre editorial; el resto se actualiza desde su fuente.
    name: isCurated ? existing.name : d.name,
    description: sameDesc ? existing.description : d.description,
    categories: d.categories,
    tags: d.tags,
    platforms: d.platforms,
    license: d.license,
    pricing: d.pricing,
    localExecution: d.localExecution,
    offline: d.offline,
    urls: { ...existing.urls, ...Object.fromEntries(Object.entries(d.urls).filter(([, v]) => v)) } as Tool['urls'],
    logo: d.logo ?? existing.logo,
    screenshots: d.screenshots.length ? d.screenshots : existing.screenshots,
    features: sameFeatures ? existing.features : d.features,
    requirements: sameReqs ? existing.requirements : d.requirements,
    dates: {
      ...existing.dates,
      sourceUpdated: d.dates.sourceUpdated ?? existing.dates.sourceUpdated,
      lastVerified: today,
      lastChangeDetected: changed.length ? today : existing.dates.lastChangeDetected,
    },
    sources,
    provenance: { ...existing.provenance, ...d.provenance },
    metrics: d.metrics.length ? d.metrics : existing.metrics,
    validation: { ...d.validation, consecutiveFailures: 0 },
  };
  return { tool, changed };
}

/* ------------------------------ Historial y tendencias ------------------------------ */

export type MetricHistory = Record<string, Record<string, [string, number][]>>;

export function recordMetrics(history: MetricHistory, tool: Tool, keepDays = 120) {
  for (const m of tool.metrics) {
    if (m.kind === 'github_forks') continue;
    const series = (history[tool.id] ??= {})[m.kind] ??= [];
    const last = series[series.length - 1];
    if (last && last[0] === m.at) last[1] = m.value;
    else series.push([m.at, m.value]);
    const cutoff = new Date(Date.parse(m.at) - keepDays * 86_400_000).toISOString().slice(0, 10);
    while (series.length && series[0][0] < cutoff) series.shift();
  }
}

export interface Trend { id: string; kind: 'github_stars' | 'hf_likes'; delta: number; from: number; to: number; days: number; rate: number }

/**
 * Tendencias = crecimiento en la ventana de 7 días (mín. minDays de historial).
 * Se ordena por crecimiento relativo amortiguado para no favorecer solo a los proyectos enormes.
 * Solo se comparan métricas del mismo tipo.
 */
export function computeTrends(history: MetricHistory, publishedIds: Set<string>, today: string, minDays = 7, limit = 24): Trend[] {
  const out: Trend[] = [];
  const t = Date.parse(today);
  for (const [id, kinds] of Object.entries(history)) {
    if (!publishedIds.has(id)) continue;
    for (const [kind, series] of Object.entries(kinds)) {
      if (series.length < 2) continue;
      const last = series[series.length - 1];
      if (t - Date.parse(last[0]) > 3 * 86_400_000) continue;
      const target = Date.parse(last[0]) - 7 * 86_400_000;
      const base = [...series].reverse().find(([d]) => Date.parse(d) <= target);
      if (!base) continue;
      const days = Math.round((Date.parse(last[0]) - Date.parse(base[0])) / 86_400_000);
      if (days < minDays) continue;
      const delta = last[1] - base[1];
      const minDelta = kind === 'hf_likes' ? 5 : 15;
      if (delta < minDelta) continue;
      out.push({ id, kind: kind as Trend['kind'], delta, from: base[1], to: last[1], days, rate: delta / Math.sqrt(base[1] + 50) });
    }
  }
  return out.sort((a, b) => b.rate - a.rate).slice(0, limit);
}

/* ------------------------------ Relacionadas ------------------------------ */

export function computeRelated(tools: Tool[], limit = 6) {
  const published = tools.filter((t) => t.validation.status === 'published');
  for (const t of published) {
    t.related = published
      .filter((o) => o.id !== t.id)
      .map((o) => ({ o, s: o.categories.filter((c) => t.categories.includes(c) && c !== 'other').length * 2 + o.platforms.filter((p) => t.platforms.includes(p)).length * 0.25 }))
      .filter((x) => x.s >= 2)
      .sort((a, b) => b.s - a.s || a.o.name.localeCompare(b.o.name))
      .slice(0, limit)
      .map((x) => x.o.id);
  }
}
