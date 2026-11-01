import type { APIRoute } from 'astro';
import { site } from '../config/site.ts';
import { CATEGORIES } from '../config/taxonomy.ts';
import { path, absolute, type RouteKey } from '../i18n/routes.ts';
import { getTools, isIndexable, toolsInCategory, getLastRun } from '../lib/catalog.ts';

/** Sitemap con alternativas hreflang. Excluye páginas noindex (fichas pobres, categorías vacías, favoritos, comparador). */
export const GET: APIRoute = () => {
  const lastmod = getLastRun()?.finishedAt?.slice(0, 10);
  type Entry = { es: string; en: string; lastmod?: string; okEs: boolean; okEn: boolean };
  const entries: Entry[] = [];
  const both = (key: RouteKey, slugEs?: string, slugEn?: string, extra: Partial<Entry> = {}) =>
    entries.push({ es: path('es', key, slugEs), en: path('en', key, slugEn ?? slugEs), okEs: true, okEn: true, lastmod, ...extra });
  both('home');
  both('categories');
  for (const c of CATEGORIES) {
    const ok = toolsInCategory(c.id).length >= site.thresholds.categoryIndexMin;
    if (ok) both('category', c.slug.es, c.slug.en);
  }
  for (const k of ['methodology', 'legal', 'privacy'] as const) both(k);
  for (const t of getTools()) {
    both('tool', t.slug, t.slug, { lastmod: t.dates.lastVerified.slice(0, 10), okEs: isIndexable(t, 'es'), okEn: isIndexable(t, 'en') });
  }
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const urls: string[] = [];
  for (const e of entries) {
    const alts = [e.okEs && `<xhtml:link rel="alternate" hreflang="es" href="${esc(absolute(e.es))}"/>`, e.okEn && `<xhtml:link rel="alternate" hreflang="en" href="${esc(absolute(e.en))}"/>`, e.okEs && `<xhtml:link rel="alternate" hreflang="x-default" href="${esc(absolute(e.es))}"/>`].filter(Boolean).join('');
    for (const [loc, ok] of [[e.es, e.okEs], [e.en, e.okEn]] as const) {
      if (!ok) continue;
      urls.push(`<url><loc>${esc(absolute(loc))}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}${alts}</url>`);
    }
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
