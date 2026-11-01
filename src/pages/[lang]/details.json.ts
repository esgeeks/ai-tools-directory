import type { APIRoute } from 'astro';
import { site, type Locale } from '../../config/site.ts';
import { PLATFORMS, PRICING } from '../../config/taxonomy.ts';
import { getTools, describe } from '../../lib/catalog.ts';
import { path } from '../../i18n/routes.ts';

export function getStaticPaths() {
  return site.locales.map((lang) => ({ params: { lang } }));
}

/** Datos ampliados para el comparador (solo campos verificados). */
export const GET: APIRoute = ({ params }) => {
  const lang = params.lang as Locale;
  const items = getTools().map((t) => {
    const d = describe(t, lang).text;
    return {
      slug: t.slug,
      name: t.name,
      url: path(lang, 'tool', t.slug),
      logo: t.logo?.url ?? null,
      description: d.length > 320 ? `${d.slice(0, 317).trimEnd()}…` : d,
      platforms: t.platforms.map((p) => PLATFORMS.find((x) => x.id === p)?.label[lang] ?? p),
      pricing: PRICING.find((x) => x.id === t.pricing)?.label[lang] ?? t.pricing,
      license: t.license.name ?? t.license.spdx,
      local: t.localExecution,
      offline: t.offline,
      features: t.features,
      links: { official: t.urls.official, github: t.urls.github, download: t.urls.download, huggingface: t.urls.huggingface },
      verified: t.dates.lastVerified,
    };
  });
  return new Response(JSON.stringify({ lang, items }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
