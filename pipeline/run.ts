/**
 * Orquestador diario:
 *   1. captura (conectores) → 2. normalización/verificación/clasificación (process)
 *   → 3. deduplicación y almacenamiento (store) → 4. re-verificación de fichas existentes
 *   → 5. traducción → 6. historial, tendencias y relacionadas → 7. escritura atómica + informe.
 *
 * Uso: tsx pipeline/run.ts [--dry-run] [--no-translate] [--only=github,curated] [--skip-reverify]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CatalogSchema, type Tool } from '../src/lib/schema.ts';
import { site } from '../src/config/site.ts';
import { githubConnector, enrichRepo, fetchRepo, githubRateRemaining, repoCandidate, type GithubConfig } from './connectors/github.ts';
import { huggingfaceConnector, fetchSpace, spaceCandidate, type HfConfig } from './connectors/huggingface.ts';
import { curatedConnector, type CuratedConfig, type CuratedEntry } from './connectors/curated.ts';
import { awesomeConnector, type AwesomeConfig } from './connectors/awesome.ts';
import { rssConnector, type RssConfig } from './connectors/rss.ts';
import { fetchOfficialPage } from './connectors/web.ts';
import type { Candidate, ConnectorContext } from './connectors/types.ts';
import { httpGet } from './lib/http.ts';
import { cleanText } from './lib/sanitize.ts';
import { safeUrl } from './lib/url.ts';
import { processCandidate, type Draft } from './process.ts';
import { argosTranslator, translateTools } from './translate.ts';
import {
  assignSlug, CatalogIndex, computeRelated, computeTrends, dedupeKeys, loadCatalog, mergeTool, readJson, recordMetrics, writeJson, type MetricHistory,
} from './store.ts';

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const NO_TRANSLATE = args.has('--no-translate') || process.env.NO_TRANSLATE === '1';
const ONLY = [...args].find((a) => a.startsWith('--only='))?.slice(7).split(',');
const SKIP_REVERIFY = args.has('--skip-reverify');
const DUMP = [...args].find((a) => a.startsWith('--dump='))?.slice(7);

interface Config {
  limits: { maxAdmissionsPerRun: number; githubCallBudget: number; reverifyPerRun: number; rejectedRetryDays: number; unpublishAfterFailures: number; maxUnpublishRatio: number };
  github: GithubConfig;
  huggingface: HfConfig;
  curated: CuratedConfig;
  'awesome-list': AwesomeConfig;
  rss: RssConfig;
}
type Rejected = Record<string, { at: string; reasons: string[]; name: string; source: string }>;

const startedAt = new Date();
const today = startedAt.toISOString().slice(0, 10);
const logs: string[] = [];
const log = (m: string) => {
  logs.push(m);
  console.log(m);
};
const sourceErrors: Record<string, string[]> = {};
const perSource: Record<string, { candidates: number; admitted: number; review: number; rejected: number; duplicates: number }> = {};
const bump = (s: string, k: keyof (typeof perSource)[string]) => ((perSource[s] ??= { candidates: 0, admitted: 0, review: 0, rejected: 0, duplicates: 0 })[k] += 1);

async function main() {
  const cfg = JSON.parse(readFileSync(join(process.cwd(), 'sources/sources.json'), 'utf8')) as Config;
  const catalog = loadCatalog();
  const previousPublished = catalog.tools.filter((t) => t.validation.status === 'published').length;
  const rejected = readJson<Rejected>('rejected.json', {});
  const history = readJson<MetricHistory>('history/metrics.json', {});
  const changes = readJson<{ events: { date: string; id: string; type: string; fields?: string[] }[] }>('history/changes.json', { events: [] });
  const idx = new CatalogIndex(catalog.tools);

  // Purga rechazos antiguos para darles otra oportunidad.
  const retryCutoff = new Date(startedAt.getTime() - cfg.limits.rejectedRetryDays * 86_400_000).toISOString().slice(0, 10);
  for (const [k, v] of Object.entries(rejected)) if (v.at < retryCutoff) delete rejected[k];

  const known = new Set<string>([...catalog.tools.flatMap((t) => dedupeKeys(t)), ...Object.keys(rejected)]);
  const ctx: ConnectorContext = {
    now: startedAt,
    log,
    known,
    error: (source, msg) => {
      (sourceErrors[source] ??= []).push(msg);
      console.warn(`[${source}] ${msg}`);
    },
    budget: { githubCalls: cfg.limits.githubCallBudget },
  };

  /* ---------------- 1. Captura ---------------- */
  const connectors = [
    [githubConnector, cfg.github],
    [huggingfaceConnector, cfg.huggingface],
    [curatedConnector, cfg.curated],
    [awesomeConnector, cfg['awesome-list']],
    [rssConnector, cfg.rss],
  ] as const;
  const candidates: Candidate[] = [];
  let sourcesOk = 0;
  for (const [conn, c] of connectors) {
    if (!c.enabled || (ONLY && !ONLY.includes(conn.id))) continue;
    try {
      const found = await (conn.run as (ctx: ConnectorContext, c: unknown) => Promise<Candidate[]>)(ctx, c);
      candidates.push(...found);
      for (const f of found) bump(f.connector, 'candidates');
      if (!sourceErrors[conn.id]?.length || found.length) sourcesOk++;
    } catch (e) {
      ctx.error(conn.id, `fallo del conector: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  log(`captura: ${candidates.length} candidatos de ${sourcesOk} fuentes operativas`);

  /* ---------------- 2-3. Verificación, deduplicación y alta ---------------- */
  const drafts: { d: Draft; status: string; reasons: string[]; c: Candidate }[] = [];
  for (const c of candidates) {
    try {
      await precheckHomepage(c);
      const r = processCandidate(c, startedAt);
      drafts.push({ d: r.draft, status: r.status, reasons: r.reasons, c });
    } catch (e) {
      ctx.error(c.connector, `${c.externalId}: error de procesado (${e instanceof Error ? e.message : e})`);
    }
  }
  if (DUMP) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(DUMP, JSON.stringify(drafts.map((x) => ({ status: x.status, reasons: x.reasons, d: x.d })), null, 2));
  }

  // Prioridad de admisión: curadas, luego por métricas públicas (sin exigir mínimo de estrellas).
  const metricOf = (d: Draft) => d.metrics.find((m) => m.kind !== 'github_forks')?.value ?? 0;
  drafts.sort((a, b) => (a.c.connector === 'curated' ? -1 : 0) - (b.c.connector === 'curated' ? -1 : 0) || metricOf(b.d) - metricOf(a.d));

  let admitted = 0, review = 0, rejectedCount = 0, duplicates = 0, deferred = 0;
  const seenThisRun = new CatalogIndex([]);
  for (const { d, status, reasons, c } of drafts) {
    const dup = idx.find(d) ?? seenThisRun.find(d);
    if (dup) {
      duplicates++;
      bump(c.connector, 'duplicates');
      // Fuente adicional para una ficha existente (p. ej. la misma herramienta en GitHub y en la lista curada).
      for (const s of d.sources) if (!dup.sources.some((x) => x.connector === s.connector && x.externalId === s.externalId)) dup.sources.push(s);
      continue;
    }
    if (status === 'rejected') {
      rejectedCount++;
      bump(c.connector, 'rejected');
      rejected[d.id] = { at: today, reasons: reasons.filter((r) => r.startsWith('RECHAZO')).slice(0, 4), name: d.name, source: d.sources[0].url };
      continue;
    }
    if (status === 'published' && admitted >= cfg.limits.maxAdmissionsPerRun) {
      deferred++;
      continue; // se volverá a descubrir en la próxima ejecución
    }
    const tool = { ...d, slug: assignSlug(d, idx) } as Draft & { slug: string };
    delete (tool as Partial<Draft>).canonicalKeys;
    const parsed = CatalogSchema.shape.tools.element.safeParse(tool);
    if (!parsed.success) {
      ctx.error(c.connector, `${d.id}: esquema inválido (${parsed.error.issues[0]?.path.join('.')}: ${parsed.error.issues[0]?.message})`);
      continue;
    }
    catalog.tools.push(parsed.data); // idx.tools es el mismo arreglo: no se duplica
    idx.index(parsed.data);
    seenThisRun.index(parsed.data);
    changes.events.push({ date: today, id: parsed.data.id, type: status === 'published' ? 'added' : 'review' });
    if (status === 'published') {
      admitted++;
      bump(c.connector, 'admitted');
    } else {
      review++;
      bump(c.connector, 'review');
    }
  }
  log(`alta: ${admitted} publicadas, ${review} en revisión, ${rejectedCount} descartadas, ${duplicates} duplicadas, ${deferred} pospuestas por el límite diario`);

  /* ---------------- 4. Re-verificación ---------------- */
  let reverified = 0, updated = 0, unpublished = 0;
  const unpublishedThisRun: Tool[] = [];
  if (!SKIP_REVERIFY) {
    const curatedById = new Map<string, CuratedEntry>();
    const curatedFile = JSON.parse(readFileSync(join(process.cwd(), cfg.curated.file), 'utf8')) as { tools: CuratedEntry[] };
    for (const e of curatedFile.tools) {
      try {
        const u = new URL(e.url);
        curatedById.set(`curated:${(u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/+$/, '')).toLowerCase()}`, e);
      } catch { /* URL inválida: el conector ya lo registra */ }
    }
    const queue = catalog.tools
      .filter((t) => t.dates.added !== today && t.dates.lastVerified !== today)
      .sort((a, b) => a.dates.lastVerified.localeCompare(b.dates.lastVerified))
      .slice(0, cfg.limits.reverifyPerRun);
    for (let i = 0; i < catalog.tools.length; i++) {
      const t = catalog.tools[i];
      if (!queue.includes(t)) continue;
      const r = await reverify(t, ctx, curatedById);
      if (r.kind === 'skip') continue;
      reverified++;
      if (r.kind === 'gone' || (r.kind === 'ok' && r.status !== 'published')) {
        const failures = t.validation.consecutiveFailures + 1;
        const reason = r.kind === 'gone' ? r.reason : r.reasons.join(' | ');
        if (t.validation.status === 'published' && failures >= cfg.limits.unpublishAfterFailures) {
          catalog.tools[i] = { ...t, validation: { ...t.validation, status: 'review', reasons: [`DESPUBLICADA tras ${failures} verificaciones fallidas: ${reason}`], consecutiveFailures: failures } };
          unpublishedThisRun.push(catalog.tools[i]);
          unpublished++;
          changes.events.push({ date: today, id: t.id, type: 'unpublished' });
        } else if (r.kind === 'ok' && t.validation.status === 'review') {
          const m = mergeTool(t, r.draft, today);
          catalog.tools[i] = { ...m.tool, validation: { ...m.tool.validation, status: 'review' } };
        } else {
          catalog.tools[i] = { ...t, validation: { ...t.validation, consecutiveFailures: failures, reasons: [`fallo temporal (${failures}/${cfg.limits.unpublishAfterFailures}): ${reason}`] } };
        }
        continue;
      }
      const m = mergeTool(t, r.draft, today);
      if (t.validation.status === 'review' && m.tool.validation.status === 'published') changes.events.push({ date: today, id: t.id, type: 'published-after-review' });
      if (m.changed.length) {
        updated++;
        changes.events.push({ date: today, id: t.id, type: 'updated', fields: m.changed });
      }
      catalog.tools[i] = m.tool;
    }
    // Protección: si una ejecución despublica demasiado, se revierte (probable fallo de fuente).
    if (unpublished > Math.max(2, previousPublished * cfg.limits.maxUnpublishRatio)) {
      ctx.error('guard', `Se intentó despublicar ${unpublished} herramientas (> ${cfg.limits.maxUnpublishRatio * 100}%). Se revierte por seguridad.`);
      for (const u of unpublishedThisRun) u.validation.status = 'published';
      unpublished = 0;
    }
    log(`re-verificación: ${reverified} comprobadas, ${updated} con cambios, ${unpublished} despublicadas`);
  }

  /* ---------------- 5. Traducción ---------------- */
  const tr = translateTools(catalog.tools.filter((t) => t.validation.status !== 'rejected'), argosTranslator, log, { enabled: !NO_TRANSLATE });
  if (tr.error) (sourceErrors.translation ??= []).push(tr.error);
  log(`traducción: ${tr.translated} completadas, ${tr.failed} fallidas, ${tr.pending} pendientes`);

  /* ---------------- 6. Historial, tendencias, relacionadas ---------------- */
  const published = catalog.tools.filter((t) => t.validation.status === 'published');
  for (const t of published) recordMetrics(history, t);
  const trends = computeTrends(history, new Set(published.map((t) => t.id)), today, site.thresholds.trendMinHistoryDays);
  computeRelated(catalog.tools);
  changes.events = changes.events.slice(-2000);

  /* ---------------- 7. Validación final y escritura ---------------- */
  catalog.generatedAt = today;
  catalog.tools.sort((a, b) => a.id.localeCompare(b.id));
  const ids = new Set(catalog.tools.map((t) => t.id));
  const slugs = new Set(catalog.tools.map((t) => t.slug));
  if (ids.size !== catalog.tools.length || slugs.size !== catalog.tools.length) ctx.error('guard', 'ids o slugs duplicados en el catálogo');
  const valid = CatalogSchema.safeParse(catalog);
  const nowPublished = published.length;
  const guardOk = nowPublished >= Math.floor(previousPublished * (1 - cfg.limits.maxUnpublishRatio));
  const ok = valid.success && guardOk && ids.size === catalog.tools.length && slugs.size === catalog.tools.length;
  if (!valid.success) ctx.error('guard', `catálogo inválido: ${valid.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  if (!guardOk) ctx.error('guard', `publicadas ${previousPublished} → ${nowPublished}: caída excesiva, se conserva el catálogo anterior`);

  const report = {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    ok,
    dryRun: DRY,
    discovered: candidates.length,
    admitted,
    review,
    rejected: rejectedCount,
    duplicates,
    deferred,
    reverified,
    updated,
    unpublished,
    publishedTotal: nowPublished,
    translationsDone: tr.translated,
    translationsFailed: tr.failed,
    translationsPending: catalog.tools.filter((t) => t.validation.status === 'published' && (t.description.status.es === 'pending' || t.description.status.en === 'pending')).length,
    githubRateRemaining: Number.isFinite(githubRateRemaining()) ? githubRateRemaining() : null,
    perSource,
    sourceErrors,
  };
  if (DRY) {
    log(`[dry-run] no se escriben archivos. Informe:\n${JSON.stringify(report, null, 2)}`);
    return;
  }
  const runs = readJson<{ runs: unknown[] }>('runs/history.json', { runs: [] });
  runs.runs = [...runs.runs, report].slice(-90);
  writeJson('runs/history.json', runs);
  writeJson('runs/latest.json', report);
  if (!ok) {
    console.error('Ejecución no válida: se conserva el último catálogo válido.');
    process.exitCode = 2;
    return;
  }
  writeJson('catalog.json', valid.data);
  writeJson('rejected.json', rejected);
  writeJson('history/metrics.json', history);
  writeJson('history/changes.json', changes);
  writeJson('trends.json', { generatedAt: today, basis: 'Crecimiento de estrellas de GitHub / likes de Hugging Face en 7 días según historial propio', trends });
  log(`listo: ${nowPublished} publicadas (antes ${previousPublished}).`);
}

/** Comprueba la homepage declarada en un repo; si no responde, se descarta antes de procesar (no se publica). */
async function precheckHomepage(c: Candidate) {
  const h = c.github?.homepage;
  if (!h) return;
  const url = safeUrl(h, { allowHttp: true });
  if (!url || /(^|\.)github\.com$/i.test(new URL(url).hostname)) {
    c.github!.homepage = null;
    return;
  }
  const r = await httpGet(url, { respectRobots: true, retries: 1, timeoutMs: 12_000, maxBytes: 64_000, minIntervalMs: 800 });
  if (!(r.status >= 200 && r.status < 400)) c.github!.homepage = null;
  else c.github!.homepage = url;
}

type ReverifyResult =
  | { kind: 'skip' }
  | { kind: 'gone'; reason: string }
  | { kind: 'ok'; draft: Draft; status: string; reasons: string[] };

async function reverify(t: Tool, ctx: ConnectorContext, curated: Map<string, CuratedEntry>): Promise<ReverifyResult> {
  const primary = t.sources[0];
  try {
    if (t.id.startsWith('github:')) {
      const r = await fetchRepo(ctx, t.id.slice(7));
      if (r.status === 404 || r.status === 410) return { kind: 'gone', reason: `repositorio no encontrado (HTTP ${r.status})` };
      if (!r.data) return { kind: 'skip' }; // 403/5xx/cuota: no es evidencia de fallo
      await enrichRepo(ctx, r.data);
      const c = repoCandidate(r.data, ctx, 'reverify');
      if (t.sources.some((s) => s.connector === 'curated')) {
        const e = curated.get(t.sources.find((s) => s.connector === 'curated') ? `curated:${t.sources.find((s) => s.connector === 'curated')!.externalId}` : '');
        if (e) c.claims = e;
      }
      await precheckHomepage(c);
      const p = processCandidate(c, ctx.now);
      p.draft.sources = [primary];
      return { kind: 'ok', draft: p.draft, status: p.status, reasons: p.reasons };
    }
    if (t.id.startsWith('huggingface:')) {
      const r = await fetchSpace(t.id.slice(12));
      if (r.status === 404) return { kind: 'gone', reason: 'Space no encontrado (HTTP 404)' };
      if (!r.data) return { kind: 'skip' };
      const c = spaceCandidate(r.data, ctx, 'reverify');
      const raw = await httpGet(`https://huggingface.co/spaces/${r.data.id}/raw/main/README.md`, { maxBytes: 40_000, retries: 1, minIntervalMs: 600 });
      if (raw.ok) c.hf!.readme = raw.text.replace(/^---[\s\S]*?---\s*/, '');
      const p = processCandidate(c, ctx.now);
      p.draft.sources = [primary];
      return { kind: 'ok', draft: p.draft, status: p.status, reasons: p.reasons };
    }
    // Sitios web (curada, listas, RSS).
    const url = t.urls.official ?? primary.url;
    const page = await fetchOfficialPage(url);
    if (page.status === 404 || page.status === 410) return { kind: 'gone', reason: `sitio oficial devuelve ${page.status}` };
    if (!page.page) return page.status >= 500 || page.status === 0 || page.status === 429 || page.status === 403 ? { kind: 'skip' } : { kind: 'gone', reason: `sitio oficial: ${page.error}` };
    const claims = curated.get(t.id);
    let pricingPage: Candidate['pricingPage'] = null;
    if (claims?.pricingUrl) {
      const r = await httpGet(claims.pricingUrl, { respectRobots: true, maxBytes: 1_500_000, retries: 1, minIntervalMs: 1500 });
      pricingPage = { status: r.status, url: claims.pricingUrl, text: r.ok ? cleanText(r.text, 30_000) : '' };
    }
    const c: Candidate = {
      connector: primary.connector,
      externalId: primary.externalId,
      sourceUrl: primary.url,
      retrievedAt: ctx.now.toISOString(),
      name: claims?.name ?? t.name,
      description: claims?.description || page.page.description || t.description.original,
      homepage: url,
      page: { ...page.page, status: page.status, finalUrl: page.finalUrl },
      pricingPage,
      claims,
    };
    const p = processCandidate(c, ctx.now);
    p.draft.sources = [primary];
    return { kind: 'ok', draft: p.draft, status: p.status, reasons: p.reasons };
  } catch (e) {
    ctx.error('reverify', `${t.id}: ${e instanceof Error ? e.message : e}`);
    return { kind: 'skip' };
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
