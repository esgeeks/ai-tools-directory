import type { Locale } from '../config/site.ts';
import { PLATFORMS, PRICING } from '../config/taxonomy.ts';
import { t } from '../i18n/ui.ts';
import type { CardLabels } from './card.ts';

export function cardLabels(lang: Locale): CardLabels {
  return {
    newBadge: t(lang, 'card.new'),
    compare: t(lang, 'card.compare'),
    favorite: t(lang, 'card.favorite'),
    open: t(lang, 'card.open'),
    source: t(lang, 'card.source'),
    verified: t(lang, 'card.verified'),
    pricing: Object.fromEntries(PRICING.map((p) => [p.id, p.label[lang]])),
    platforms: Object.fromEntries(PLATFORMS.map((p) => [p.id, p.label[lang]])),
    openSource: t(lang, 'filters.openSource'),
    local: t(lang, 'filters.local'),
    sponsored: lang === 'es' ? 'Patrocinado' : 'Sponsored',
    locale: lang === 'es' ? 'es-419' : 'en-US',
  };
}
