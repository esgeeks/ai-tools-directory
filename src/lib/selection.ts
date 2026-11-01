/**
 * Favoritos y comparador persistidos en localStorage (sin cuentas).
 * La lógica recibe un Storage inyectable para poder probarla sin navegador.
 */

export const FAVORITES_KEY = 'aitd:favorites:v1';
export const COMPARE_KEY = 'aitd:compare:v1';
export const COMPARE_MAX = 4;
export const COMPARE_MIN = 2;

export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function read(store: KV, key: string): string[] {
  try {
    const raw = store.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Sanea lo leído: solo slugs válidos y únicos.
    return [...new Set(parsed.filter((s): s is string => typeof s === 'string' && SLUG.test(s)))];
  } catch {
    return [];
  }
}

function write(store: KV, key: string, values: string[]): void {
  try {
    store.setItem(key, JSON.stringify(values));
  } catch {
    /* almacenamiento lleno o bloqueado: se ignora sin romper la página */
  }
}

export class Selection {
  constructor(private store: KV) {}

  favorites(): string[] {
    return read(this.store, FAVORITES_KEY);
  }
  isFavorite(slug: string): boolean {
    return this.favorites().includes(slug);
  }
  toggleFavorite(slug: string): boolean {
    if (!SLUG.test(slug)) return false;
    const favs = this.favorites();
    const on = !favs.includes(slug);
    write(this.store, FAVORITES_KEY, on ? [...favs, slug] : favs.filter((s) => s !== slug));
    return on;
  }
  clearFavorites(): void {
    this.store.removeItem(FAVORITES_KEY);
  }

  compare(): string[] {
    return read(this.store, COMPARE_KEY).slice(0, COMPARE_MAX);
  }
  inCompare(slug: string): boolean {
    return this.compare().includes(slug);
  }
  /** Devuelve 'added' | 'removed' | 'full' (ya hay 4) | 'invalid'. */
  toggleCompare(slug: string): 'added' | 'removed' | 'full' | 'invalid' {
    if (!SLUG.test(slug)) return 'invalid';
    const list = this.compare();
    if (list.includes(slug)) {
      write(this.store, COMPARE_KEY, list.filter((s) => s !== slug));
      return 'removed';
    }
    if (list.length >= COMPARE_MAX) return 'full';
    write(this.store, COMPARE_KEY, [...list, slug]);
    return 'added';
  }
  clearCompare(): void {
    this.store.removeItem(COMPARE_KEY);
  }
  canCompare(): boolean {
    return this.compare().length >= COMPARE_MIN;
  }
}

/** Almacén en memoria (pruebas o navegadores sin localStorage). */
export class MemoryKV implements KV {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}
