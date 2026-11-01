/**
 * Acceso al catálogo en tiempo de construcción (Astro). Lee los JSON de /data,
 * los valida con el esquema y expone utilidades para las páginas.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CatalogSchema, type Tool } from './schema.ts';
import { CATEGORIES, categoryById } from '../config/taxonomy.ts';
import { site, type Locale } from '../config/site.ts';
import type { IndexItem } from './filters.ts';
import { path } from '../i18n/routes.ts';

const DATA_DIR = join(process.cwd(), 'data');

function readJson<T>(file: string, fallback: T): T {
  const p = join(DATA_DIR, file);
  if (!existsSync(p)) return fallback;
  return JSON.parse(readFileSync(p, 'utf8')) as T;
}

let cache: Tool[] | null = null;

/** Solo herramientas publicadas (validación superada). */
export function getTools(): Tool[] {
  if (cache) return cache;
  const raw = readJson('catalog.json', { version: 1, generatedAt: '1970-01-01', tools: [] });
  const catalog = CatalogSchema.parse(raw);
  cache = catalog.tools.filter((t) => t.validation.status === 'published');
  return cache;
}

export function getTool(slug: string): Tool | undefined {
  return getTools().find((t) => t.slug === slug);
}

export interface RunReport {
  finishedAt: string;
  ok: boolean;
  discovered: number;
  admitted: number;
  rejected: number;
  review: number;
  updated: number;
  translationsPending: number;
  sourceErrors: Record<string, string[]>;
}
export function getLastRun(): RunReport | null {
  return readJson<RunReport | null>('runs/latest.json', null);
}

export interface TrendEntry {
  id: string;
  kind: 'github_stars' | 'hf_likes';
  delta: number;
  from: number;
  to: number;
  days: number;
}
export function getTrends(): TrendEntry[] {
  return readJson<{ trends: TrendEntry[] }>('trends.json', { trends: [] }).trends;
}

/** Descripción para un idioma, con el estado de traducción para avisarlo en la interfaz. */
export function describe(tool: Tool, lang: Locale): { text: string; status: 'original' | 'machine' | 'fallback' } {
  const d = tool.description;
  if (d.originalLang === lang) return { text: d.original, status: 'original' };
  const translated = d[lang];
  const st = d.status[lang];
  if (translated && (st === 'machine' || st === 'original')) return { text: translated, status: st === 'original' ? 'original' : 'machine' };
  return { text: d.original, status: 'fallback' };
}

export function categoryLabel(id: string, lang: Locale): string {
  return categoryById(id)?.label[lang] ?? id;
}

export function isNew(tool: Tool, now = Date.now()): boolean {
  return now - Date.parse(tool.dates.added) <= site.thresholds.newDays * 86_400_000;
}

/** Ficha indexable: descripción suficiente (en su idioma o traducción fiable) y al menos una plataforma. */
export function isIndexable(tool: Tool, lang: Locale): boolean {
  const d = describe(tool, lang);
  if (d.status === 'fallback' && tool.description.originalLang !== 'unknown') return false;
  return d.text.length >= site.thresholds.toolIndexMinDescription && tool.platforms.length > 0;
}

export function sourceLabel(tool: Tool, lang: Locale): string {
  const c = tool.sources[0]?.connector ?? 'unknown';
  const curated = lang === 'es' ? 'Sitio oficial (curada)' : 'Official site (curated)';
  return ({ github: 'GitHub', huggingface: 'Hugging Face', curated, 'awesome-list': 'GitHub', rss: 'RSS' } as Record<string, string>)[c] ?? c;
}

export function lastActivity(tool: Tool): string | null {
  const a = tool.dates.sourceUpdated;
  const b = tool.dates.lastChangeDetected;
  if (a && b) return a > b ? a : b;
  return a ?? b ?? null;
}

export function toIndexItem(tool: Tool, lang: Locale): IndexItem {
  const d = describe(tool, lang);
  return {
    slug: tool.slug,
    name: tool.name,
    description: d.text.length > 240 ? `${d.text.slice(0, 237).trimEnd()}…` : d.text,
    categories: tool.categories,
    categoryLabels: tool.categories.map((c) => categoryLabel(c, lang)),
    tags: tool.tags.slice(0, 8),
    platforms: tool.platforms,
    pricing: tool.pricing,
    openSource: tool.license.openSource,
    local: tool.localExecution,
    offline: tool.offline,
    added: tool.dates.added,
    updated: lastActivity(tool),
    verified: tool.dates.lastVerified,
    logo: tool.logo?.url ?? null,
    source: sourceLabel(tool, lang),
    url: path(lang, 'tool', tool.slug),
    sponsored: site.monetization.sponsoredTools.enabled && tool.sponsored,
  };
}

export function toolsInCategory(id: string): Tool[] {
  return getTools().filter((t) => t.categories.includes(id));
}

export function categoriesWithCounts() {
  const tools = getTools();
  return CATEGORIES.map((c) => ({ ...c, count: tools.filter((t) => t.categories.includes(c.id)).length }));
}

export function relatedTools(tool: Tool, limit = 4): Tool[] {
  const all = getTools();
  const explicit = tool.related.map((id) => all.find((t) => t.id === id)).filter((t): t is Tool => !!t);
  if (explicit.length >= limit) return explicit.slice(0, limit);
  const scored = all
    .filter((t) => t.id !== tool.id && !explicit.includes(t))
    .map((t) => ({ t, s: t.categories.filter((c) => tool.categories.includes(c) && c !== 'other').length * 2 + t.platforms.filter((p) => tool.platforms.includes(p)).length * 0.25 }))
    .filter((x) => x.s >= 2)
    .sort((a, b) => b.s - a.s || a.t.name.localeCompare(b.t.name));
  return [...explicit, ...scored.map((x) => x.t)].slice(0, limit);
}
