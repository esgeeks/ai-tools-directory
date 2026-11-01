/**
 * Feeds RSS/Atom autorizados (configurables). Cada elemento solo aporta una URL candidata,
 * que se verifica contra su fuente original como cualquier otro candidato.
 */
import { XMLParser } from 'fast-xml-parser';
import { httpGet } from '../lib/http.ts';
import { cleanName, cleanText } from '../lib/sanitize.ts';
import { resolveUrl } from './web.ts';
import type { Candidate, Connector } from './types.ts';

export interface RssConfig {
  enabled: boolean;
  feeds: { url: string; titlePrefixStrip?: string }[];
  maxNew: number;
}

export interface FeedItem {
  title: string;
  link: string;
  description: string;
}

export function parseFeed(xml: string): FeedItem[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', processEntities: true, htmlEntities: true });
  const doc = parser.parse(xml);
  const asArray = <T>(x: T | T[] | undefined): T[] => (Array.isArray(x) ? x : x ? [x] : []);
  const text = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'object' && v && '#text' in v ? String((v as Record<string, unknown>)['#text']) : '');
  const rss = asArray(doc?.rss?.channel?.item).map((i: Record<string, unknown>) => ({ title: text(i.title), link: text(i.link), description: text(i.description) }));
  const atom = asArray(doc?.feed?.entry).map((e: Record<string, unknown>) => {
    const links = asArray(e.link as Record<string, string> | Record<string, string>[]);
    const alt = links.find((l) => !l['@rel'] || l['@rel'] === 'alternate') ?? links[0];
    return { title: text(e.title), link: alt?.['@href'] ?? '', description: text(e.summary ?? e.content) };
  });
  return [...rss, ...atom].filter((i) => i.link);
}

export const rssConnector: Connector<RssConfig> = {
  id: 'rss',
  async run(ctx, cfg) {
    const out: Candidate[] = [];
    for (const feed of cfg.feeds) {
      const res = await httpGet(feed.url, { maxBytes: 2_000_000, retries: 2, minIntervalMs: 2000, headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml' } });
      if (!res.ok) {
        ctx.error('rss', `${feed.url}: ${res.error ?? `HTTP ${res.status}`}`);
        continue;
      }
      let items: FeedItem[] = [];
      try {
        items = parseFeed(res.text);
      } catch (e) {
        ctx.error('rss', `${feed.url}: XML inválido`);
        continue;
      }
      ctx.log(`rss: ${feed.url} → ${items.length} elementos`);
      for (const it of items) {
        if (out.length >= cfg.maxNew) break;
        let title = cleanName(it.title);
        if (feed.titlePrefixStrip) title = title.replace(new RegExp(`^${feed.titlePrefixStrip}`, 'i'), '').trim();
        const name = title.split(/\s[-–—:]\s/)[0].slice(0, 60);
        const tagline = title.includes(' – ') || title.includes(' - ') || title.includes(': ') ? title.split(/\s[-–—:]\s/).slice(1).join(' ') : '';
        try {
          const c = await resolveUrl(ctx, it.link, { connector: 'rss', name, description: cleanText(tagline || it.description, 300), via: feed.url });
          if (c) out.push(c);
        } catch (e) {
          ctx.error('rss', `${it.link}: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
    return out;
  },
};
