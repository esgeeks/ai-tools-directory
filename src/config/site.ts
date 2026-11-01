/**
 * Configuración central de marca y sitio.
 * Cambia aquí el nombre, el dominio, los colores o la monetización sin tocar componentes.
 */
export const site = {
  /** Nombre visible de la marca. */
  name: 'AI Tools Directory',
  /** Logotipo textual: la segunda parte se pinta con degradado. */
  logo: { primary: 'AI Tools', accent: 'Directory' },
  /** URL pública canónica (sin barra final). Debe coincidir con public/CNAME. */
  url: 'https://tools.iathink.com',
  /** Ruta base si el sitio vive en una subcarpeta (p. ej. '/ai-tools-directory'). Con dominio propio: '/'. */
  basePath: '/',
  /** Repositorio público para enlaces de "Sugerir herramienta" y metodología. */
  repo: 'https://github.com/esgeeks/ai-tools-directory',
  /** Blog o sitio hermano (enlace en el pie). */
  parentSite: { name: 'IAThink', url: 'https://iathink.com/' },
  defaultLocale: 'es' as const,
  locales: ['es', 'en'] as const,
  /** Paleta de marca. También expuesta como variables CSS en src/styles/global.css. */
  colors: {
    bg: '#090B18',
    bg2: '#11152A',
    surface: '#191D38',
    cyan: '#00DDF5',
    fuchsia: '#F535CF',
    violet: '#865DFF',
    text: '#F5F7FF',
    muted: '#A8B0CB',
  },
  /** Umbrales editoriales. */
  thresholds: {
    /** Días durante los que una herramienta cuenta como "nueva". */
    newDays: 14,
    /** Días de historial de métricas necesarios para mostrar tendencias. */
    trendMinHistoryDays: 7,
    /** Mínimo de herramientas para que una página de categoría sea indexable. */
    categoryIndexMin: 3,
    /** Caracteres mínimos de descripción para que una ficha sea indexable. */
    toolIndexMinDescription: 80,
  },
  /**
   * Monetización futura. Todo desactivado en la v1.
   * Al activarse, los elementos patrocinados y los enlaces comerciales se etiquetan de forma visible.
   */
  monetization: {
    ads: { enabled: false, provider: null as string | null },
    affiliateLinks: { enabled: false, rel: 'sponsored nofollow noopener' },
    sponsoredTools: { enabled: false },
    featuredPlacements: { enabled: false },
  },
} as const;

export type Locale = (typeof site.locales)[number];
