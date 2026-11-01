/**
 * Extracción de metadatos de páginas oficiales (sin ejecutar JavaScript ni seguir recursos).
 */
import { cleanText, decodeEntities, stripHtml } from './sanitize.ts';
import { safeUrl } from './url.ts';

export interface PageMeta {
  title: string;
  description: string;
  ogImage: string | null;
  icon: string | null;
  lang: string | null;
  /** Texto visible aproximado (limitado) para buscar evidencia. */
  text: string;
  /** Todos los href absolutos de la página (para detectar enlaces a tiendas). */
  links: string[];
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? '') : null;
}

export function parsePage(html: string, baseUrl: string): PageMeta {
  const head = html.slice(0, 300_000);
  const metas = head.match(/<meta\b[^>]*>/gi) ?? [];
  const meta = (key: string) => {
    for (const tag of metas) {
      const n = (attr(tag, 'name') ?? attr(tag, 'property') ?? '').toLowerCase();
      if (n === key) return attr(tag, 'content');
    }
    return null;
  };
  const resolve = (href: string | null) => {
    if (!href) return null;
    try {
      return safeUrl(new URL(href, baseUrl).toString(), { allowHttp: true });
    } catch {
      return null;
    }
  };
  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '';
  const iconTag = (head.match(/<link\b[^>]*rel\s*=\s*["'][^"']*icon[^"']*["'][^>]*>/gi) ?? [])
    .map((tag) => ({ href: attr(tag, 'href'), sizes: attr(tag, 'sizes') ?? '', rel: (attr(tag, 'rel') ?? '').toLowerCase() }))
    .sort((a, b) => (b.rel.includes('apple') ? 1 : 0) - (a.rel.includes('apple') ? 1 : 0) || parseInt(b.sizes) - parseInt(a.sizes) || 0)[0];
  const links = [...new Set((html.match(/<a\b[^>]*href\s*=\s*["'][^"']+["'][^>]*>/gi) ?? []).map((tag) => resolve(attr(tag, 'href'))).filter((x): x is string => !!x))].slice(0, 800);
  const body = html.replace(/<head[\s\S]*?<\/head>/i, ' ');
  return {
    title: cleanText(meta('og:title') ?? titleTag, 140),
    description: cleanText(meta('description') ?? meta('og:description') ?? meta('twitter:description') ?? '', 500),
    ogImage: resolve(meta('og:image') ?? meta('twitter:image')),
    icon: resolve(iconTag?.href ?? '/favicon.ico'),
    lang: head.match(/<html\b[^>]*\blang\s*=\s*["']?([a-zA-Z-]+)/i)?.[1]?.toLowerCase() ?? null,
    text: cleanText(stripHtml(body), 20_000),
    links,
  };
}
