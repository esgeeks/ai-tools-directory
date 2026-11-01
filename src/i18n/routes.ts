import { site, type Locale } from '../config/site.ts';

/** Segmentos de URL localizados (URLs limpias por idioma). */
export const SEGMENTS = {
  tool: { es: 'herramientas', en: 'tools' },
  categories: { es: 'categorias', en: 'categories' },
  favorites: { es: 'favoritos', en: 'favorites' },
  compare: { es: 'comparar', en: 'compare' },
  methodology: { es: 'metodologia', en: 'methodology' },
  legal: { es: 'aviso-legal', en: 'legal' },
  privacy: { es: 'privacidad', en: 'privacy' },
} as const;

export type RouteKey = 'home' | keyof typeof SEGMENTS | 'category';

const base = site.basePath.replace(/\/$/, '');

/** Ruta relativa al dominio, siempre con barra final. */
export function path(lang: Locale, key: RouteKey, slug?: string): string {
  let p: string;
  switch (key) {
    case 'home':
      p = `/${lang}/`;
      break;
    case 'tool':
      p = `/${lang}/${SEGMENTS.tool[lang]}/${slug}/`;
      break;
    case 'category':
      p = `/${lang}/${SEGMENTS.categories[lang]}/${slug}/`;
      break;
    default:
      p = `/${lang}/${SEGMENTS[key][lang]}/`;
  }
  return `${base}${p}`;
}

export function absolute(p: string): string {
  return `${site.url}${p}`;
}

export function otherLocale(lang: Locale): Locale {
  return lang === 'es' ? 'en' : 'es';
}

export function asset(p: string): string {
  return `${base}${p.startsWith('/') ? p : `/${p}`}`;
}
