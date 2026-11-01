/**
 * Normalización + verificación + clasificación de un candidato.
 * Produce un borrador de ficha con estado: published | review | rejected,
 * junto con cada comprobación y el motivo de cualquier fallo.
 */
import type { Tool } from '../src/lib/schema.ts';
import type { Candidate } from './connectors/types.ts';
import {
  aiEvidence, applicationEvidence, classifyCategories, detectLocal, detectOffline, detectPlatforms, detectPricing,
  extractSection, FEATURES_HEADING, licenseInfo, readmeIntro, readmeTitle, REQUIREMENTS_HEADING, usableEvidence,
} from './classify.ts';
import { cleanName, cleanText, detectLang } from './lib/sanitize.ts';
import { canonicalUrl, githubRepoFromUrl, hostOf, safeUrl } from './lib/url.ts';

export type Draft = Omit<Tool, 'slug'> & { slug: string | null; canonicalKeys: string[] };

export interface ProcessResult {
  draft: Draft;
  status: 'published' | 'review' | 'rejected';
  checks: Record<string, boolean>;
  reasons: string[];
}

const DAY = 86_400_000;
const MAX_INACTIVE_DAYS = 540;
const MIN_DESC = 40;

function isoDay(d: Date | string): string {
  return (typeof d === 'string' ? new Date(d) : d).toISOString().slice(0, 10);
}

const GENERIC = /^(app|home|web|ui|client|server|desktop|main|core|project|tool|tools|demo|site|frontend|backend|monorepo|releases?)$/i;

/** Nombre de un repo: el H1 del README si coincide con el repo o si el nombre del repo es genérico; si no, el repo. */
function githubName(fullName: string, readme: string): string {
  const repo = fullName.split('/')[1].replace(/[-_]releases?$/i, '');
  const h1 = readmeTitle(readme);
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (h1 && squash(h1) === squash(repo)) return h1;
  if (GENERIC.test(repo)) return `${fullName.split('/')[0]} ${repo}`;
  return prettyRepoName(repo);
}

function prettyRepoName(repo: string): string {
  // Mantiene el nombre del repositorio tal cual (no se inventan nombres comerciales).
  return repo.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase()).replace(/\b(ai|llm|ui|cli|gpt|api|tts|ocr)\b/gi, (m) => m.toUpperCase());
}

export function processCandidate(c: Candidate, now: Date): ProcessResult {
  const reasons: string[] = [];
  const checks: Record<string, boolean> = {};
  const prov: Record<string, string> = {};
  const today = isoDay(now);
  const src = `${c.connector}:${c.externalId}`;

  /* ---------- 1. Normalización ---------- */
  const readmeRaw = c.github?.readme ?? c.hf?.readme ?? '';
  const readmeText = cleanText(readmeRaw, 20_000, { keepParagraphs: true });
  let name = cleanName(c.claims ? c.name : c.hf?.title || (c.github ? githubName(c.github.fullName, readmeRaw) : c.name));
  if (!name) name = cleanName(c.page?.title.split(/[|–—-]/)[0] ?? '');
  prov.name = c.claims ? 'curated (lista editorial)' : src;

  let description = cleanText(c.description, 500);
  prov.description = c.github ? `GitHub: descripción del repositorio` : c.hf ? 'Hugging Face: short_description' : c.claims?.description ? 'curated' : 'sitio oficial: meta description';
  if (!description && c.page?.description) description = c.page.description;
  if ((c.github || c.hf) && description.length < 140) {
    const intro = readmeIntro(readmeRaw);
    if (intro && !intro.toLowerCase().includes(description.toLowerCase().slice(0, 40)) && intro.length > 60) {
      description = description ? `${description}\n\n${intro}` : intro;
      prov.description += ' + primer párrafo del README';
    }
  }
  const lang = detectLang(description);

  /* ---------- 2. URLs ---------- */
  const githubUrl = c.github ? `https://github.com/${c.github.fullName}` : c.claims?.githubUrl ? safeUrl(c.claims.githubUrl) : null;
  const hfUrl = c.hf ? `https://huggingface.co/spaces/${c.hf.id}` : null;
  let official: string | null = null;
  if (c.connector === 'curated' || (!c.github && !c.hf)) official = safeUrl(c.page?.finalUrl || c.homepage || c.sourceUrl, { allowHttp: true });
  else if (c.github?.homepage) {
    const h = safeUrl(c.github.homepage, { allowHttp: true });
    // La homepage de un repo solo se publica si es un dominio distinto de github.com y fue comprobada (ver verifyHomepage en run.ts).
    if (h && hostOf(h) !== 'github.com') official = h;
  }
  if (official) prov['urls.official'] = c.github ? 'GitHub: homepage del repositorio' : 'sitio oficial';
  const download = c.github?.release ? safeUrl(c.github.release.url) : c.claims?.downloadUrl ? safeUrl(c.claims.downloadUrl) : null;
  if (download) prov['urls.download'] = c.github?.release ? `GitHub release ${c.github.release.tag}` : 'curated';
  const pricingUrl = c.pricingPage && c.pricingPage.status >= 200 && c.pricingPage.status < 400 ? safeUrl(c.pricingPage.url) : null;

  /* ---------- 3. Clasificación ---------- */
  const evidenceTexts = [name, description, (c.github?.topics ?? []).join(' '), (c.hf?.tags ?? []).join(' ')];
  const ai = aiEvidence([...evidenceTexts, c.page?.description ?? '', c.hint ?? ''], [readmeText.slice(0, 4000), c.page?.text.slice(0, 4000) ?? '']);
  const appEv = applicationEvidence(c, `${description} ${(c.github?.topics ?? []).join(' ')} ${readmeText.slice(0, 3000)}`);
  const license = c.github
    ? licenseInfo(c.github.license.spdx, c.github.license.name)
    : c.hf?.license
      ? licenseInfo(normalizeHfLicense(c.hf.license), null)
      : { spdx: null, name: null, openSource: c.claims?.openSource ?? null };
  if (license.spdx) prov.license = c.github ? 'GitHub API (license.spdx_id)' : 'Hugging Face (cardData.license)';
  const platforms = detectPlatforms(c, readmeRaw);
  prov.platforms = platforms.evidence.join(' | ') || 'sin evidencia';
  const fullText = `${description}\n${readmeText}\n${c.page?.text ?? ''}`;
  const local = detectLocal(c, fullText);
  const offline = detectOffline(fullText);
  if (local.value) prov.localExecution = local.evidence.join('; ');
  if (offline.value) prov.offline = offline.evidence.join('; ');
  const categories = classifyCategories(evidenceTexts, [readmeText.slice(0, 5000), c.hint ?? '', c.page?.text.slice(0, 3000) ?? ''], c.claims?.categories ?? [], local.value === true);
  prov.categories = categories.evidence.join(' | ');
  const pricing = detectPricing(c, license, readmeRaw);
  prov.pricing = pricing.evidence.join('; ');
  const features = extractSection(readmeRaw, FEATURES_HEADING, 6);
  const requirements = extractSection(readmeRaw, REQUIREMENTS_HEADING, 5);
  if (features.length) prov.features = 'README: sección de funciones';
  if (requirements.length) prov.requirements = 'README: sección de requisitos';

  /* ---------- 4. Imágenes (solo fuentes permitidas) ---------- */
  let logo: Tool['logo'] = null;
  if (c.github?.ownerAvatar && hostOf(c.github.ownerAvatar) === 'avatars.githubusercontent.com') logo = { url: c.github.ownerAvatar.replace(/\?.*$/, '?s=128'), origin: 'github-avatar' };
  else if (c.page?.icon && safeUrl(c.page.icon) && hostOf(c.page.icon).endsWith(hostOf(official ?? c.sourceUrl).split('.').slice(-2).join('.'))) logo = { url: c.page.icon, origin: 'official-favicon' };
  const screenshots: Tool['screenshots'] = [];
  if (c.page?.ogImage && official && hostOf(c.page.ogImage).endsWith(hostOf(official).split('.').slice(-2).join('.'))) {
    screenshots.push({ url: c.page.ogImage, origin: 'official-og-image', alt: name });
  }

  /* ---------- 5. Verificación ---------- */
  const hard = (key: string, ok: boolean, why: string) => {
    checks[key] = ok;
    if (!ok) reasons.push(`RECHAZO ${key}: ${why}`);
    return ok;
  };
  const soft = (key: string, ok: boolean, why: string) => {
    checks[key] = ok;
    if (!ok) reasons.push(`REVISIÓN ${key}: ${why}`);
    return ok;
  };

  hard('identifiableSource', !!c.sourceUrl && !!safeUrl(c.sourceUrl, { allowHttp: true }), 'sin URL de fuente válida');
  hard('aiEvidence', ai.value, 'sin evidencia de uso de IA');
  hard('isTool', !appEv.excluded, appEv.excluded ?? '');
  hard('notLibrary', !appEv.library, `parece una biblioteca/framework (${appEv.evidence.filter((e) => e.startsWith('lib:')).join(', ')})`);
  if (c.github) {
    hard('notArchived', !c.github.archived && !c.github.disabled, 'repositorio archivado o deshabilitado');
    hard('notFork', !c.github.fork && !c.github.isTemplate, 'fork o plantilla');
    soft('hasReadme', (c.github.readme ?? '').length >= 200, 'README ausente o vacío');
  }
  if (c.hf) {
    hard('spaceRunning', c.hf.runtimeStage === 'RUNNING' && !c.hf.disabled && !c.hf.private, `Space no en ejecución (${c.hf.runtimeStage ?? 'desconocido'})`);
  }
  // Accesibilidad de la URL principal.
  if (c.github) soft('urlReachable', true, '');
  else if (c.hf) soft('urlReachable', c.hf.runtimeStage === 'RUNNING', 'Space no accesible');
  else {
    const st = c.page?.status ?? 0;
    const restricted = c.connector === 'curated' && [401, 403, 429, 503].includes(st);
    if (restricted) reasons.push(`AVISO urlReachable: el sitio oficial respondió ${st} a peticiones automáticas (sin eludir el bloqueo)`);
    soft('urlReachable', (st >= 200 && st < 400) || restricted, `sitio oficial no accesible (HTTP ${st || 'sin respuesta'})`);
  }
  soft('appEvidence', appEv.app || c.connector === 'curated', 'no hay evidencia de aplicación utilizable');
  const usable = usableEvidence(c, readmeRaw, !!official);
  soft('worksEvidence', usable.value, 'sin evidencia de funcionamiento (release, sitio/demo o instrucciones de instalación)');
  if (usable.value) prov.worksEvidence = usable.evidence.join('; ');
  soft('descriptionSufficient', description.length >= MIN_DESC && description.split(/\s+/).length >= 6, `descripción insuficiente (${description.length} caracteres)`);
  soft('languageSupported', lang !== 'unknown', 'idioma de la descripción no soportado (solo es/en)');
  soft('platformEvidence', platforms.value.length > 0, 'ninguna plataforma respaldada por evidencia');
  soft('categoryEvidence', categories.value.length > 0, 'sin categoría');
  const activity = c.github?.pushedAt ?? c.hf?.lastModified ?? null;
  if (c.github || c.hf) soft('recentActivity', !!activity && now.getTime() - Date.parse(activity) < MAX_INACTIVE_DAYS * DAY, `sin actividad en ${MAX_INACTIVE_DAYS} días (posible abandono)`);
  soft('hasName', name.length >= 2, 'nombre vacío');

  const hardFail = reasons.some((r) => r.startsWith('RECHAZO'));
  const softFail = reasons.some((r) => r.startsWith('REVISIÓN'));
  const status: ProcessResult['status'] = hardFail ? 'rejected' : softFail ? 'review' : 'published';

  /* ---------- 6. Claves de deduplicación ---------- */
  const keys = new Set<string>();
  keys.add(`${c.connector === 'awesome-list' || c.connector === 'rss' ? 'web' : c.connector}:${c.externalId}`);
  if (c.github) keys.add(`github:${c.github.fullName.toLowerCase()}`);
  if (githubUrl) {
    const r = githubRepoFromUrl(githubUrl);
    if (r) keys.add(`github:${r.toLowerCase()}`);
  }
  if (c.hf) keys.add(`huggingface:${c.hf.id.toLowerCase()}`);
  if (official) {
    const cu = canonicalUrl(official);
    if (cu) keys.add(`url:${cu}`);
  }

  const metrics: Tool['metrics'] = [];
  if (c.github) {
    metrics.push({ kind: 'github_stars', value: c.github.stars, source: `GitHub API (${c.github.fullName})`, at: today });
    metrics.push({ kind: 'github_forks', value: c.github.forks, source: `GitHub API (${c.github.fullName})`, at: today });
  }
  if (c.hf) metrics.push({ kind: 'hf_likes', value: c.hf.likes, source: `Hugging Face API (${c.hf.id})`, at: today });

  const tags = [...new Set([...(c.github?.topics ?? []), ...(c.hf?.tags ?? []).filter((t) => !/[:=]/.test(t))])].map((t) => cleanText(t, 40)).filter((t) => /^[a-z0-9][a-z0-9.+-]{1,38}$/.test(t)).slice(0, 12);

  const draft: Draft = {
    id: c.github ? `github:${c.github.fullName.toLowerCase()}` : c.hf ? `huggingface:${c.hf.id.toLowerCase()}` : `${c.connector === 'curated' ? 'curated' : 'web'}:${c.externalId}`,
    slug: null,
    canonicalKeys: [...keys],
    name,
    description: {
      original: description,
      originalLang: lang,
      es: lang === 'es' ? description : null,
      en: lang === 'en' ? description : null,
      status: { es: lang === 'es' ? 'original' : 'pending', en: lang === 'en' ? 'original' : 'pending' },
    },
    categories: categories.value,
    tags,
    platforms: platforms.value,
    license,
    pricing: pricing.value,
    localExecution: local.value,
    offline: offline.value,
    urls: { official, github: githubUrl, huggingface: hfUrl, download, docs: null, pricing: pricingUrl },
    logo,
    screenshots,
    features: { original: features, es: lang === 'es' ? features : null, en: lang === 'en' ? features : null },
    requirements: { original: requirements, es: lang === 'es' ? requirements : null, en: lang === 'en' ? requirements : null },
    related: [],
    dates: {
      discovered: today,
      added: today,
      sourceUpdated: latest(c.github?.pushedAt, c.github?.release?.publishedAt, c.hf?.lastModified),
      lastVerified: today,
      lastChangeDetected: null,
    },
    sources: [{ connector: c.connector, externalId: c.externalId, url: safeUrl(c.sourceUrl, { allowHttp: true }) ?? c.sourceUrl, retrievedAt: today }],
    provenance: prov,
    metrics,
    validation: { status, checks, reasons, consecutiveFailures: 0 },
    sponsored: false,
    affiliateUrl: null,
  };
  return { draft, status, checks, reasons };
}

function latest(...dates: (string | null | undefined)[]): string | null {
  const v = dates.filter((d): d is string => !!d && !Number.isNaN(Date.parse(d))).sort().pop();
  return v ? isoDay(v) : null;
}

function normalizeHfLicense(l: string): string | null {
  const map: Record<string, string> = { mit: 'MIT', 'apache-2.0': 'Apache-2.0', 'gpl-3.0': 'GPL-3.0', 'agpl-3.0': 'AGPL-3.0', 'bsd-3-clause': 'BSD-3-Clause', 'cc0-1.0': 'CC0-1.0', 'mpl-2.0': 'MPL-2.0', unlicense: 'Unlicense' };
  return map[l.toLowerCase()] ?? null;
}
