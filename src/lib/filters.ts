/**
 * Búsqueda, filtros y ordenación. Funciones puras: se usan en el navegador (explorador)
 * y en las pruebas. Dentro de un grupo los valores se combinan con OR; entre grupos, con AND.
 */

export interface IndexItem {
  slug: string;
  name: string;
  description: string;
  categories: string[];
  /** Etiquetas de categorías en el idioma de la página (para la búsqueda). */
  categoryLabels: string[];
  tags: string[];
  platforms: string[];
  pricing: string;
  openSource: boolean | null;
  local: boolean | null;
  offline: boolean | null;
  added: string;
  updated: string | null;
  verified: string;
  logo: string | null;
  source: string;
  url: string;
  sponsored: boolean;
}

export type SortKey = 'relevance' | 'added' | 'updated' | 'name';

export interface FilterState {
  q: string;
  categories: string[];
  platforms: string[];
  pricing: string[];
  openSource: boolean;
  local: boolean;
  offline: boolean;
  /** Días desde la incorporación (0 = sin límite). */
  addedWithin: number;
  /** Días desde la última actividad comprobada (0 = sin límite). */
  updatedWithin: number;
  sort: SortKey;
}

export const DEFAULT_STATE: FilterState = {
  q: '',
  categories: [],
  platforms: [],
  pricing: [],
  openSource: false,
  local: false,
  offline: false,
  addedWithin: 0,
  updatedWithin: 0,
  sort: 'added',
};

const DAY = 86_400_000;
const ALLOWED_WINDOWS = [0, 7, 30, 90];

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Puntuación de búsqueda: 0 = no coincide. Todos los términos deben aparecer en algún campo. */
export function searchScore(item: IndexItem, query: string): number {
  const terms = normalizeText(query).split(' ').filter((t) => t.length > 0);
  if (terms.length === 0) return 1;
  const name = normalizeText(item.name);
  const desc = normalizeText(item.description);
  const meta = normalizeText([...item.categoryLabels, ...item.tags, ...item.platforms].join(' '));
  let score = 0;
  for (const term of terms) {
    let s = 0;
    if (name === term) s = 12;
    else if (name.startsWith(term)) s = 8;
    else if (name.includes(term)) s = 6;
    if (meta.includes(term)) s = Math.max(s, 4);
    if (desc.includes(term)) s = Math.max(s, 2);
    if (s === 0) return 0;
    score += s;
  }
  return score;
}

function within(dateIso: string | null, days: number, now: number): boolean {
  if (!days) return true;
  if (!dateIso) return false;
  const t = Date.parse(dateIso);
  return !Number.isNaN(t) && now - t <= days * DAY;
}

export function applyFilters(items: IndexItem[], state: FilterState, now = Date.now()): IndexItem[] {
  return items.filter((it) => {
    if (state.categories.length && !state.categories.some((c) => it.categories.includes(c))) return false;
    if (state.platforms.length && !state.platforms.some((p) => it.platforms.includes(p))) return false;
    if (state.pricing.length && !state.pricing.includes(it.pricing)) return false;
    // Solo pasan los valores confirmados (true). null = desconocido = no pasa.
    if (state.openSource && it.openSource !== true) return false;
    if (state.local && it.local !== true) return false;
    if (state.offline && it.offline !== true) return false;
    if (!within(it.added, state.addedWithin, now)) return false;
    if (!within(it.updated, state.updatedWithin, now)) return false;
    return true;
  });
}

const byDateDesc = (a: string | null, b: string | null) => (b ?? '').localeCompare(a ?? '');

export function sortItems(items: IndexItem[], sort: SortKey, query = ''): IndexItem[] {
  const arr = [...items];
  switch (sort) {
    case 'name':
      return arr.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    case 'updated':
      return arr.sort((a, b) => byDateDesc(a.updated, b.updated) || a.name.localeCompare(b.name));
    case 'relevance':
      if (query.trim()) {
        return arr
          .map((it) => ({ it, s: searchScore(it, query) }))
          .sort((a, b) => b.s - a.s || byDateDesc(a.it.added, b.it.added))
          .map((x) => x.it);
      }
      return arr.sort((a, b) => byDateDesc(a.added, b.added) || a.name.localeCompare(b.name));
    case 'added':
    default:
      return arr.sort((a, b) => byDateDesc(a.added, b.added) || a.name.localeCompare(b.name));
  }
}

/** Pipeline completo: búsqueda → filtros → orden. */
export function query(items: IndexItem[], state: FilterState, now = Date.now()): IndexItem[] {
  const searched = state.q.trim() ? items.filter((it) => searchScore(it, state.q) > 0) : items;
  const filtered = applyFilters(searched, state, now);
  const sort = state.q.trim() && state.sort === 'added' ? 'relevance' : state.sort;
  return sortItems(filtered, sort, state.q);
}

const list = (v: string | null) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
const days = (v: string | null) => {
  const n = Number(v);
  return ALLOWED_WINDOWS.includes(n) ? n : 0;
};

/** Lee el estado desde la URL (?q=&cat=&plat=&price=&os=1&local=1&offline=1&added=30&updated=7&sort=). */
export function parseState(params: URLSearchParams, allowed?: { categories: string[]; platforms: string[]; pricing: string[] }): FilterState {
  const keep = (vals: string[], ok?: string[]) => (ok ? vals.filter((v) => ok.includes(v)) : vals);
  const sort = params.get('sort') as SortKey | null;
  return {
    q: (params.get('q') ?? '').slice(0, 120),
    categories: keep(list(params.get('cat')), allowed?.categories),
    platforms: keep(list(params.get('plat')), allowed?.platforms),
    pricing: keep(list(params.get('price')), allowed?.pricing),
    openSource: params.get('os') === '1',
    local: params.get('local') === '1',
    offline: params.get('offline') === '1',
    addedWithin: days(params.get('added')),
    updatedWithin: days(params.get('updated')),
    sort: sort && ['relevance', 'added', 'updated', 'name'].includes(sort) ? sort : 'added',
  };
}

export function serializeState(state: FilterState): URLSearchParams {
  const p = new URLSearchParams();
  if (state.q.trim()) p.set('q', state.q.trim());
  if (state.categories.length) p.set('cat', state.categories.join(','));
  if (state.platforms.length) p.set('plat', state.platforms.join(','));
  if (state.pricing.length) p.set('price', state.pricing.join(','));
  if (state.openSource) p.set('os', '1');
  if (state.local) p.set('local', '1');
  if (state.offline) p.set('offline', '1');
  if (state.addedWithin) p.set('added', String(state.addedWithin));
  if (state.updatedWithin) p.set('updated', String(state.updatedWithin));
  if (state.sort !== 'added') p.set('sort', state.sort);
  return p;
}
