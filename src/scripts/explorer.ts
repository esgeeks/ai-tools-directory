/**
 * Explorador: carga el índice JSON del idioma y aplica búsqueda, filtros combinables y orden.
 * El estado vive en la URL (?q=&cat=&plat=…) para poder compartir y volver atrás.
 */
import { DEFAULT_STATE, parseState, query, serializeState, type FilterState, type IndexItem } from '../lib/filters.ts';
import { renderCard, type CardLabels } from '../lib/card.ts';
import { escapeHtml } from '../lib/icons.ts';
import { strings as globalStrings, syncSelectionUI, fixBrokenLogos } from './app.ts';

const PAGE = 24;

interface ExplorerStrings {
  count: string; one: string; empty: string; error: string; retry: string; more: string; clear: string;
  newSlugs: string[];
  allowed: { categories: string[]; platforms: string[]; pricing: string[] };
  labels: Record<string, string>;
}

const root = document.querySelector<HTMLElement>('[data-explorer]');
if (root) init(root);

function init(root: HTMLElement) {
  const s: ExplorerStrings = JSON.parse(root.querySelector('[data-explorer-strings]')?.textContent ?? '{}');
  const cardLabels = globalStrings.cardLabels as CardLabels;
  const form = root.querySelector<HTMLFormElement>('[data-filter-form]')!;
  const results = root.querySelector<HTMLElement>('[data-results]')!;
  const stateBox = root.querySelector<HTMLElement>('[data-state]')!;
  const countEl = root.querySelector<HTMLElement>('[data-result-count]')!;
  const moreBtn = root.querySelector<HTMLButtonElement>('[data-more]')!;
  const sortSel = root.querySelector<HTMLSelectElement>('[data-sort]')!;
  const activeBox = root.querySelector<HTMLElement>('[data-active-filters]')!;
  const aside = root.querySelector<HTMLElement>('[data-filters]')!;
  const searchInputs = document.querySelectorAll<HTMLInputElement>('input[data-search]');
  const newSlugs = new Set(s.newSlugs);

  let items: IndexItem[] = [];
  let state: FilterState = parseState(new URLSearchParams(location.search), s.allowed);
  let shown = PAGE;

  function writeForm() {
    (form.elements.namedItem('cat') as HTMLSelectElement).value = state.categories[0] ?? '';
    form.querySelectorAll<HTMLInputElement>('input[name="plat"]').forEach((i) => (i.checked = state.platforms.includes(i.value)));
    form.querySelectorAll<HTMLInputElement>('input[name="price"]').forEach((i) => (i.checked = state.pricing.includes(i.value)));
    (form.elements.namedItem('os') as HTMLInputElement).checked = state.openSource;
    (form.elements.namedItem('local') as HTMLInputElement).checked = state.local;
    (form.elements.namedItem('offline') as HTMLInputElement).checked = state.offline;
    (form.elements.namedItem('added') as HTMLSelectElement).value = String(state.addedWithin);
    (form.elements.namedItem('updated') as HTMLSelectElement).value = String(state.updatedWithin);
    sortSel.value = state.sort;
    searchInputs.forEach((i) => (i.value = state.q));
  }

  function readForm(): FilterState {
    const cat = (form.elements.namedItem('cat') as HTMLSelectElement).value;
    const checked = (n: string) => [...form.querySelectorAll<HTMLInputElement>(`input[name="${n}"]:checked`)].map((i) => i.value);
    return {
      ...state,
      categories: cat ? [cat] : [],
      platforms: checked('plat'),
      pricing: checked('price'),
      openSource: (form.elements.namedItem('os') as HTMLInputElement).checked,
      local: (form.elements.namedItem('local') as HTMLInputElement).checked,
      offline: (form.elements.namedItem('offline') as HTMLInputElement).checked,
      addedWithin: Number((form.elements.namedItem('added') as HTMLSelectElement).value),
      updatedWithin: Number((form.elements.namedItem('updated') as HTMLSelectElement).value),
      sort: sortSel.value as FilterState['sort'],
    };
  }

  function pushUrl() {
    const qs = serializeState(state).toString();
    history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
  }

  function renderActive() {
    const chips: [string, () => void][] = [];
    if (state.q) chips.push([`“${state.q}”`, () => (state.q = '')]);
    state.categories.forEach((c) => chips.push([s.labels[`cat:${c}`] ?? c, () => (state.categories = state.categories.filter((x) => x !== c))]));
    state.platforms.forEach((p) => chips.push([s.labels[`plat:${p}`] ?? p, () => (state.platforms = state.platforms.filter((x) => x !== p))]));
    state.pricing.forEach((p) => chips.push([s.labels[`price:${p}`] ?? p, () => (state.pricing = state.pricing.filter((x) => x !== p))]));
    if (state.openSource) chips.push([s.labels.os, () => (state.openSource = false)]);
    if (state.local) chips.push([s.labels.local, () => (state.local = false)]);
    if (state.offline) chips.push([s.labels.offline, () => (state.offline = false)]);
    if (state.addedWithin) chips.push([`${s.labels.added}: ${state.addedWithin}d`, () => (state.addedWithin = 0)]);
    if (state.updatedWithin) chips.push([`${s.labels.updated}: ${state.updatedWithin}d`, () => (state.updatedWithin = 0)]);
    activeBox.innerHTML = '';
    chips.forEach(([label, remove]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'rounded-full border border-cyan/25 bg-cyan/10 px-2.5 py-1 text-[12.5px] text-cyan hover:bg-cyan/20';
      b.textContent = `${label} ✕`;
      b.addEventListener('click', () => {
        remove();
        update();
      });
      activeBox.append(b);
    });
  }

  function render() {
    const list = query(items, state);
    countEl.textContent = list.length === 1 ? s.one : s.count.replace('{n}', String(list.length));
    results.innerHTML = list.slice(0, shown).map((it) => renderCard(it, cardLabels, { isNew: newSlugs.has(it.slug) })).join('');
    stateBox.innerHTML = list.length === 0 && items.length > 0
      ? `<div class="panel p-6 text-center text-muted"><p>${escapeHtml(s.empty)}</p><button type="button" class="btn-ghost mt-4" data-reset>${escapeHtml(s.clear)}</button></div>`
      : '';
    moreBtn.hidden = list.length <= shown;
    renderActive();
    syncSelectionUI(results);
    fixBrokenLogos(results);
  }

  function update(resetPage = true) {
    if (resetPage) shown = PAGE;
    writeForm();
    pushUrl();
    render();
  }

  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('change', () => {
    state = readForm();
    update();
  });
  sortSel.addEventListener('change', () => {
    state = readForm();
    update();
  });
  moreBtn.addEventListener('click', () => {
    shown += PAGE;
    render();
  });
  const reset = () => {
    state = { ...DEFAULT_STATE };
    update();
  };
  root.querySelector('[data-filters-clear]')?.addEventListener('click', reset);
  stateBox.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-reset]')) reset();
  });

  // Búsqueda: formularios con input[data-search] (hero) actualizan el explorador sin recargar.
  let debounce: number | undefined;
  searchInputs.forEach((input) => {
    input.addEventListener('input', () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        state = { ...readForm(), q: input.value.slice(0, 120) };
        update();
      }, 180);
    });
    input.form?.addEventListener('submit', (e) => {
      e.preventDefault();
      state = { ...readForm(), q: input.value.slice(0, 120) };
      update();
      document.getElementById('explorar')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
  });

  // Filtros en móvil (panel a pantalla completa).
  const openBtn = root.querySelector<HTMLButtonElement>('[data-filters-open]');
  const setOpen = (open: boolean) => {
    aside.classList.toggle('hidden', !open);
    aside.classList.toggle('block', open);
    openBtn?.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  };
  openBtn?.addEventListener('click', () => setOpen(true));
  root.querySelectorAll('[data-filters-close]').forEach((b) => b.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && aside.classList.contains('block')) setOpen(false);
  });

  async function load() {
    results.setAttribute('aria-busy', 'true');
    const hasSSR = results.children.length > 0;
    if (!hasSSR) results.innerHTML = Array.from({ length: 4 }, () => '<div class="skeleton"></div>').join('');
    stateBox.innerHTML = '';
    try {
      const res = await fetch(root.dataset.src ?? '', { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { items: IndexItem[] };
      items = Array.isArray(data.items) ? data.items : [];
      results.setAttribute('aria-busy', 'false');
      writeForm();
      render();
    } catch {
      results.setAttribute('aria-busy', 'false');
      if (!hasSSR) results.innerHTML = '';
      stateBox.innerHTML = `<div class="panel p-6 text-center text-muted" role="alert"><p>${escapeHtml(s.error)}</p><button type="button" class="btn-ghost mt-4" data-retry>${escapeHtml(s.retry)}</button></div>`;
      stateBox.querySelector('[data-retry]')?.addEventListener('click', load);
    }
  }

  writeForm();
  load();
}
