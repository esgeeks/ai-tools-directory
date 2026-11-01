import type { APIRoute } from 'astro';
import { absolute, asset } from '../i18n/routes.ts';

export const GET: APIRoute = () =>
  new Response(`User-agent: *\nAllow: /\nDisallow: /es/favoritos/\nDisallow: /en/favorites/\nDisallow: /es/comparar/\nDisallow: /en/compare/\n\nSitemap: ${absolute(asset('/sitemap.xml'))}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
