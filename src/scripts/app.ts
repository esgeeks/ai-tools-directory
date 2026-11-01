/**
 * Script global (todas las páginas): favoritos, comparador, menú móvil y respaldo de logos.
 * Usa delegación de eventos para que funcione también con tarjetas renderizadas por el explorador.
 */
import { Selection, MemoryKV, type KV } from '../lib/selection.ts';

function storage(): KV {
  try {
    const k = '__aitd_test__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch {
    return new MemoryKV();
  }
}

export const selection = new Selection(storage());

interface ClientStrings {
  cmpLimit: string;
  cmpBar: string;
  favorite: string;
  unfavorite: string;
}
export const strings: ClientStrings & Record<string, unknown> = JSON.parse(document.getElementById('client-i18n')?.textContent ?? '{}');

let toastTimer: number | undefined;
export function toast(msg: string) {
  const el = document.querySelector<HTMLElement>('[data-toast]');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), 3200);
}

/** Refleja el estado guardado en todos los botones y contadores visibles. */
export function syncSelectionUI(root: ParentNode = document) {
  const favs = new Set(selection.favorites());
  const cmp = new Set(selection.compare());
  root.querySelectorAll<HTMLButtonElement>('[data-fav]').forEach((b) => {
    const on = favs.has(b.dataset.fav ?? '');
    b.setAttribute('aria-pressed', String(on));
    const name = b.getAttribute('aria-label')?.split(': ').slice(1).join(': ') ?? '';
    b.setAttribute('aria-label', `${on ? strings.unfavorite : strings.favorite}${name ? `: ${name}` : ''}`);
  });
  root.querySelectorAll<HTMLInputElement>('[data-cmp]').forEach((c) => (c.checked = cmp.has(c.dataset.cmp ?? '')));
  document.querySelectorAll<HTMLElement>('[data-fav-count]').forEach((el) => {
    el.textContent = String(favs.size);
    el.hidden = favs.size === 0;
  });
  document.querySelectorAll<HTMLElement>('[data-cmp-count]').forEach((el) => {
    el.textContent = String(cmp.size);
    el.hidden = cmp.size === 0;
  });
  const bar = document.querySelector<HTMLElement>('[data-cmp-bar]');
  if (bar) {
    const onComparePage = document.body.dataset.page === 'compare';
    bar.hidden = cmp.size === 0 || onComparePage;
    const txt = bar.querySelector('[data-cmp-text]');
    if (txt) txt.textContent = strings.cmpBar.replace('{n}', String(cmp.size));
  }
}

document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const fav = target.closest<HTMLElement>('[data-fav]');
  if (fav) {
    e.preventDefault();
    selection.toggleFavorite(fav.dataset.fav ?? '');
    syncSelectionUI();
    document.dispatchEvent(new CustomEvent('selection:change'));
    return;
  }
  if (target.closest('[data-cmp-clear]')) {
    selection.clearCompare();
    syncSelectionUI();
    document.dispatchEvent(new CustomEvent('selection:change'));
  }
});

document.addEventListener('change', (e) => {
  const input = (e.target as HTMLElement).closest<HTMLInputElement>('[data-cmp]');
  if (!input) return;
  const r = selection.toggleCompare(input.dataset.cmp ?? '');
  if (r === 'full') {
    input.checked = false;
    toast(strings.cmpLimit);
  }
  syncSelectionUI();
  document.dispatchEvent(new CustomEvent('selection:change'));
});

// Sincroniza entre pestañas.
window.addEventListener('storage', () => syncSelectionUI());

// Respaldo de logos: si una imagen externa falla, se muestra el monograma.
document.addEventListener(
  'error',
  (e) => {
    const img = e.target as HTMLElement;
    if (img instanceof HTMLImageElement && img.hasAttribute('data-fallback')) {
      const parent = img.parentElement;
      if (parent) parent.textContent = parent.dataset.letter ?? '';
    }
  },
  true,
);

export function fixBrokenLogos(root: ParentNode = document) {
  root.querySelectorAll<HTMLImageElement>('img[data-fallback]').forEach((img) => {
    if (img.complete && img.naturalWidth === 0) {
      const parent = img.parentElement;
      if (parent) parent.textContent = parent.dataset.letter ?? '';
    }
  });
}
fixBrokenLogos();

// Menú móvil.
const menuBtn = document.querySelector<HTMLButtonElement>('[data-menu-open]');
const menu = document.getElementById('mobile-menu');
menuBtn?.addEventListener('click', () => {
  if (!menu) return;
  const open = menu.hidden;
  menu.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
});

syncSelectionUI();
