import type { APIRoute } from 'astro';
import { site, type Locale } from '../../config/site.ts';
import { getTools, toIndexItem } from '../../lib/catalog.ts';

export function getStaticPaths() {
  return site.locales.map((lang) => ({ params: { lang } }));
}

/** Índice compacto para buscador, explorador y favoritos. */
export const GET: APIRoute = ({ params }) => {
  const lang = params.lang as Locale;
  const items = getTools().map((t) => toIndexItem(t, lang));
  return new Response(JSON.stringify({ lang, count: items.length, items }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
