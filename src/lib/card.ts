/**
 * Renderizado de tarjetas de herramienta como HTML escapado.
 * Única fuente para el servidor (Astro) y el cliente (explorador, favoritos),
 * así ambas vistas son idénticas. Todo texto externo pasa por escapeHtml.
 */
import type { IndexItem } from './filters.ts';
import { escapeHtml, monogram, svg } from './icons.ts';

export interface CardLabels {
  newBadge: string;
  compare: string;
  favorite: string;
  open: string; // contiene {name}
  source: string;
  verified: string; // contiene {date}
  pricing: Record<string, string>;
  platforms: Record<string, string>;
  openSource: string;
  local: string;
  sponsored: string;
  locale: string;
}

const PRICE_CLASS: Record<string, string> = { free: 'tag-green', freemium: 'tag-cyan', paid: 'tag-muted', unverified: 'tag-muted' };

export function fmtDate(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function renderLogo(item: Pick<IndexItem, 'name' | 'logo'>, size = 46): string {
  const m = monogram(item.name);
  const style = `background:${m.bg};color:${m.fg};width:${size}px;height:${size}px`;
  if (item.logo) {
    // Si la imagen falla, el contenedor conserva el monograma de respaldo.
    return `<span class="mono" style="${style}" data-letter="${escapeHtml(m.letter)}"><img src="${escapeHtml(item.logo)}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-fallback></span>`;
  }
  return `<span class="mono" style="${style}" aria-hidden="true">${escapeHtml(m.letter)}</span>`;
}

export function renderCard(item: IndexItem, l: CardLabels, opts: { isNew?: boolean; extra?: string } = {}): string {
  const name = escapeHtml(item.name);
  const slug = escapeHtml(item.slug);
  const cats = item.categoryLabels.slice(0, 2).map((c) => `<span class="tag">${escapeHtml(c)}</span>`).join('');
  const price = `<span class="tag ${PRICE_CLASS[item.pricing] ?? 'tag-muted'}">${escapeHtml(l.pricing[item.pricing] ?? item.pricing)}</span>`;
  const os = item.openSource === true ? `<span class="tag tag-green">${escapeHtml(l.openSource)}</span>` : '';
  const local = item.local === true ? `<span class="tag tag-cyan">${escapeHtml(l.local)}</span>` : '';
  const sp = item.sponsored ? `<span class="tag tag-sponsored">${escapeHtml(l.sponsored)}</span>` : '';
  const plats = item.platforms
    .map((p) => `<span title="${escapeHtml(l.platforms[p] ?? p)}">${svg(p, 'h-[15px] w-[15px]')}<span class="sr-only">${escapeHtml(l.platforms[p] ?? p)}</span></span>`)
    .join('');
  return `<article class="card" data-slug="${slug}">
${opts.isNew ? `<span class="badge-new">${escapeHtml(l.newBadge)}</span>` : ''}
<div class="flex items-start gap-[13px]">
  ${renderLogo(item)}
  <div class="min-w-0 flex-1">
    <h3 class="text-[17px] font-semibold leading-tight"><a class="stretched hover:text-cyan" href="${escapeHtml(item.url)}" aria-label="${escapeHtml(l.open.replace('{name}', item.name))}">${name}</a></h3>
    <div class="mt-1 text-xs text-muted">${escapeHtml(l.source)}: ${escapeHtml(item.source)} · ${escapeHtml(l.verified.replace('{date}', fmtDate(item.verified, l.locale)))}</div>
  </div>
  <button type="button" class="fav-btn above" data-fav="${slug}" aria-pressed="false" aria-label="${escapeHtml(l.favorite)}: ${name}">${svg('heart')}</button>
</div>
<p class="card-desc">${escapeHtml(item.description)}</p>
<div class="flex flex-wrap gap-1.5">${sp}${cats}${price}${os}${local}</div>
<div class="mt-auto flex items-center gap-2.5 border-t border-line pt-3.5 text-[12.5px] text-muted">
  <span class="flex gap-[7px]">${plats}</span>
  <label class="above ml-auto flex cursor-pointer select-none items-center gap-1.5"><input type="checkbox" class="accent-cyan" data-cmp="${slug}"> ${escapeHtml(l.compare)}</label>
</div>
${opts.extra ?? ''}
</article>`;
}
