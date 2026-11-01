/**
 * Clasificación basada en evidencia. Cada función devuelve el valor y la evidencia que lo respalda;
 * si no hay evidencia, devuelve vacío/null (nunca se supone).
 */
import { CATEGORIES, type PlatformId, type PricingId } from '../src/config/taxonomy.ts';
import type { Candidate } from './connectors/types.ts';
import { cleanText } from './lib/sanitize.ts';

export interface Evidence<T> {
  value: T;
  evidence: string[];
}

const norm = (s: string) => ` ${s.toLowerCase().replace(/[\s_/|]+/g, ' ')} `;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function hasPhrase(text: string, phrase: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escapeRe(phrase)}([^a-z0-9]|$)`, 'i').test(text);
}

/* ---------------------------- Evidencia de IA ---------------------------- */

const AI_TERMS = [
  'ai', 'a.i.', 'artificial intelligence', 'machine learning', 'deep learning', 'neural network', 'neural', 'llm', 'llms', 'large language model',
  'language model', 'gpt', 'chatgpt', 'openai', 'claude', 'gemini', 'llama', 'mistral', 'ollama', 'llama.cpp', 'whisper', 'stable diffusion',
  'diffusion', 'generative', 'genai', 'gen ai', 'transformer', 'transformers', 'computer vision', 'speech recognition', 'text-to-speech', 'tts',
  'text-to-image', 'text-to-video', 'rag', 'embedding', 'embeddings', 'chatbot', 'ai-powered', 'ai powered', 'inteligencia artificial', 'ia',
  'copilot', 'agent', 'agents', 'gguf', 'onnx', 'yolo', 'sdxl', 'flux', 'comfyui', 'vlm', 'multimodal',
];

const WEAK_AI = new Set(['agent', 'agents', 'ia', 'ai', 'neural', 'diffusion', 'flux', 'rag']);

/**
 * Evidencia de IA. Fuente principal (nombre, descripción, temas, meta descripción): un término fuerte o dos términos.
 * El README/página solo cuenta si aporta al menos 3 términos fuertes distintos (no basta con una mención aislada).
 */
export function aiEvidence(primary: string[], secondary: string[] = []): Evidence<boolean> {
  const p = norm(primary.join(' '));
  const hits = AI_TERMS.filter((k) => hasPhrase(p, k));
  const strong = hits.filter((h) => !WEAK_AI.has(h));
  if (strong.length >= 1 || hits.length >= 2) return { value: true, evidence: hits.slice(0, 6) };
  const s = norm(secondary.join(' '));
  const sec = AI_TERMS.filter((k) => !WEAK_AI.has(k) && hasPhrase(s, k));
  return { value: sec.length >= 3, evidence: [...hits, ...sec.map((x) => `readme:${x}`)].slice(0, 6) };
}

/* -------------------- Aplicación utilizable vs. no-herramienta -------------------- */

const EXCLUDE_NAME = /(^|[-_/])(awesome|papers?|dataset|datasets|prompts?|tutorials?|course|courses|cookbook|examples?|notebooks?|interview|roadmap|cheatsheet|leaderboard|benchmark|survey|resources|list)([-_/]|$)/i;
const EXCLUDE_TOPICS = ['awesome', 'awesome-list', 'dataset', 'datasets', 'prompts', 'prompt-engineering-guide', 'tutorial', 'course', 'papers', 'paper', 'survey', 'leaderboard', 'benchmark', 'research-paper', 'education-resource'];
const EXCLUDE_TEXT = [
  'a curated list', 'curated list of', 'awesome list', 'collection of prompts', 'list of prompts', 'prompt collection', 'dataset for', 'official implementation',
  'implementation of the paper', 'code for the paper', 'paper:', 'model weights', 'pretrained model', 'pre-trained model', 'model card', 'this dataset',
  'course materials', 'tutorial series', 'research code', 'accompanying code', 'reproduce the results', 'leaderboard',
];
const LIBRARY_TEXT = [
  'python library', 'library for', 'a library', 'sdk for', 'python sdk', 'typescript sdk', 'client library', 'api wrapper', 'wrapper for', 'bindings for',
  'framework for building', 'a framework', 'toolkit for building', 'npm package', 'python package for', 'pip package', 'inference engine', 'inference library',
  'training framework', 'fine-tuning framework', 'boilerplate', 'starter kit', 'template for',
];
const APP_TEXT = [
  'app', 'application', 'desktop app', 'desktop application', 'web app', 'webui', 'web ui', 'web interface', 'user interface', 'gui', 'cli', 'command-line',
  'command line', 'terminal', 'browser extension', 'chrome extension', 'firefox add-on', 'extension', 'self-hosted', 'self hosted', 'selfhosted', 'download',
  'install', 'installer', 'mobile app', 'android app', 'ios app', 'plugin for', 'vs code extension', 'vscode extension', 'bot', 'tool', 'platform',
  'assistant', 'editor', 'client', 'studio', 'playground', 'dashboard', 'docker',
];

export function applicationEvidence(c: Candidate, text: string): { app: boolean; excluded: string | null; library: boolean; evidence: string[] } {
  const t = norm(text);
  const name = c.github?.fullName ?? c.hf?.id ?? c.name;
  if (EXCLUDE_NAME.test(name.split('/').pop() ?? name)) return { app: false, excluded: `nombre de colección/recurso (${name})`, library: false, evidence: [] };
  const topic = c.github?.topics.find((x) => EXCLUDE_TOPICS.includes(x));
  if (topic) return { app: false, excluded: `tema excluido: ${topic}`, library: false, evidence: [] };
  const ex = EXCLUDE_TEXT.find((k) => t.includes(` ${k}`) || t.includes(k));
  const libHits = LIBRARY_TEXT.filter((k) => t.includes(k));
  const appHits = APP_TEXT.filter((k) => hasPhrase(t, k));
  const binaries = (c.github?.release?.assets ?? []).some((a) => /\.(exe|msi|dmg|pkg|appimage|deb|rpm|apk|ipa|zip|crx|xpi|vsix)$/i.test(a));
  if (binaries) appHits.push('release binaries');
  if (c.hf) appHits.push(`hf space (${c.hf.sdk ?? 'app'})`);
  if (c.connector === 'curated') appHits.push('official product site');
  if (ex && appHits.length < 3) return { app: false, excluded: `no es una herramienta: "${ex}"`, library: false, evidence: [] };
  const library = libHits.length > 0 && appHits.length < 2 + libHits.length;
  return { app: !library && appHits.length > 0, excluded: null, library, evidence: [...appHits.slice(0, 6), ...libHits.map((l) => `lib:${l}`)] };
}

/** Evidencia de funcionamiento: release publicada, sitio/demo comprobado o instrucciones de instalación y uso. */
export function usableEvidence(c: Candidate, readme: string, verifiedHomepage: boolean): Evidence<boolean> {
  const ev: string[] = [];
  if (c.github?.release) ev.push(`release ${c.github.release.tag}`);
  if (verifiedHomepage) ev.push('sitio/demo accesible');
  if (/```[a-z]*\s*\n[\s\S]{0,300}?\b(pip|pipx|uv|npm|npx|pnpm|yarn|brew|cargo|go|docker|docker compose|git clone|winget|choco|scoop|apt|flatpak|snap)\b[^\n]*(install|run|clone|add|up|pull)\b/i.test(readme)) ev.push('README: instrucciones de instalación');
  if (/^#{1,4}\s*(installation|install|getting started|quick ?start|usage|download|instalación|uso)\b/im.test(readme)) ev.push('README: sección de instalación/uso');
  if (c.hf || c.connector === 'curated') ev.push(c.hf ? 'Space en ejecución' : 'producto con sitio oficial');
  return { value: ev.length > 0 && (ev.length >= 2 || !!c.github?.release || verifiedHomepage || !!c.hf || c.connector === 'curated'), evidence: ev };
}

/** Título H1 del README (para nombres de repositorio genéricos o para respetar mayúsculas). */
export function readmeTitle(readme: string): string | null {
  const m = readme.match(/^#\s+(.+)$/m) ?? readme.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return null;
  const t = cleanText(m[1], 60).replace(/[|–—:].*$/, '').trim();
  return t.length >= 2 && t.length <= 40 && !/^(readme|introduction|about|overview)$/i.test(t) ? t : null;
}

/* ------------------------------- Categorías ------------------------------- */

/**
 * Categorías: palabras clave en descripción/temas (peso 2) o README/hint (peso 1).
 * Se asignan como máximo 3 con puntuación >= 2. Sin coincidencias → "other".
 */
export function classifyCategories(primary: string[], secondary: string[], claimed: string[] = [], local = false): Evidence<string[]> {
  const p = norm(primary.join(' '));
  const s = norm(secondary.join(' ').slice(0, 6000));
  const scores: { id: string; score: number; hits: string[] }[] = [];
  for (const cat of CATEGORIES) {
    if (cat.id === 'other') continue;
    let score = 0;
    const hits: string[] = [];
    let secondary = 0;
    for (const k of cat.keywords) {
      if (hasPhrase(p, k)) {
        score += 2;
        hits.push(k);
      } else if (hasPhrase(s, k)) {
        secondary += 1;
        hits.push(`readme:${k}`);
      }
    }
    // El README solo refuerza: nunca basta por sí solo para asignar una categoría.
    if (score > 0) score += Math.min(secondary, 1);
    if (claimed.includes(cat.id)) {
      score += 2;
      hits.push('curated');
    }
    if (cat.id === 'local-ai' && local) {
      score += 2;
      hits.push('runs-locally');
    }
    if (score >= 2) scores.push({ id: cat.id, score, hits });
  }
  scores.sort((a, b) => b.score - a.score);
  const top = scores.slice(0, 3);
  if (!top.length) return { value: ['other'], evidence: ['sin palabras clave de categoría'] };
  return { value: top.map((x) => x.id), evidence: top.map((x) => `${x.id}: ${x.hits.slice(0, 3).join(', ')}`) };
}

/* ------------------------------- Plataformas ------------------------------ */

const STORE_PATTERNS: [PlatformId, RegExp][] = [
  ['ios', /apps\.apple\.com\/[^ ]*\/app\//i],
  ['android', /play\.google\.com\/store\/apps/i],
  ['browser-extension', /(chromewebstore\.google\.com|chrome\.google\.com\/webstore|addons\.mozilla\.org\/[^ ]*\/addon|microsoftedge\.microsoft\.com\/addons)/i],
];

function nearby(text: string, word: RegExp, ctx: RegExp, radius = 90): boolean {
  let m: RegExpExecArray | null;
  const re = new RegExp(word.source, 'gi');
  while ((m = re.exec(text))) {
    const win = text.slice(Math.max(0, m.index - radius), m.index + radius);
    if (ctx.test(win)) return true;
  }
  return false;
}

function countNearby(text: string, word: RegExp, ctx: RegExp, radius = 90): number {
  let n = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(word.source, 'gi');
  while ((m = re.exec(text))) if (ctx.test(text.slice(Math.max(0, m.index - radius), m.index + radius))) n++;
  return n;
}

const OS_CONTEXT = /(download|install|installer|binary|binaries|release|available|support|supports|supported|runs on|run on|works on|compatible|platform|desktop|build|portable|setup)/i;

export function detectPlatforms(c: Candidate, readme: string): Evidence<PlatformId[]> {
  const out = new Map<PlatformId, string>();
  const add = (p: PlatformId, why: string) => {
    if (!out.has(p)) out.set(p, why);
  };
  const assets = c.github?.release?.assets ?? [];
  for (const a of assets) {
    if (/\.(exe|msi)$|[-_.](win|windows|win64|win32)[-_.]/i.test(a)) add('windows', `release: ${a}`);
    if (/\.(dmg|pkg)$|[-_.](mac|macos|darwin|osx)[-_.]/i.test(a) || /\.app\.(zip|tar\.gz)$/i.test(a)) add('macos', `release: ${a}`);
    if (/\.(appimage|deb|rpm|flatpak|snap)$|[-_.]linux[-_.]/i.test(a)) add('linux', `release: ${a}`);
    if (/\.apk$/i.test(a)) add('android', `release: ${a}`);
    if (/\.(crx|xpi)$/i.test(a)) add('browser-extension', `release: ${a}`);
  }
  const links = [...(c.page?.links ?? []), ...(readme.match(/https?:\/\/[^\s)"'<>]+/g) ?? [])];
  for (const l of links) for (const [p, re] of STORE_PATTERNS) if (re.test(l)) add(p, `enlace: ${l.slice(0, 80)}`);
  const text = `${readme}\n${c.page?.text ?? ''}`;
  const osWords: [PlatformId, RegExp][] = [['windows', /\bwindows\b/], ['macos', /\b(macos|mac os|os x|apple silicon)\b/], ['linux', /\blinux\b/]];
  for (const [p, re] of osWords) {
    // Evidencia textual: un encabezado del README (p. ej. "### Windows") o al menos dos menciones con contexto de instalación/soporte.
    const heading = new RegExp(`^#{1,5}[^\\n]*${re.source}`, 'im').test(readme);
    if (heading || countNearby(text, re, OS_CONTEXT) >= 2) add(p, heading ? 'README: sección dedicada' : 'texto: varias menciones con instalación/soporte');
  }
  const topics = c.github?.topics ?? [];
  const desc = `${c.description} ${topics.join(' ')}`.toLowerCase();
  if (/\b(cli|command[- ]line|terminal)\b/.test(desc) || topics.includes('cli')) add('cli', 'descripción/temas: CLI');
  else if (/```(bash|sh|shell|console)?\s*\n\s*\$?\s*(pip|pipx|uv tool|npm|brew|cargo|go) install [^\n]+\n[\s\S]{0,400}?```/i.test(readme) && /\b(usage|command|run)\b[\s\S]{0,200}```(bash|sh|shell|console)?\s*\n\s*\$?\s*[a-z][\w-]{1,30} /i.test(readme)) {
    add('cli', 'README: instalación y uso por terminal');
  }
  if (/\b(browser extension|chrome extension|firefox (add-on|extension)|edge extension)\b/.test(desc)) add('browser-extension', 'descripción: extensión de navegador');
  // Las extensiones de IDE no son una plataforma del directorio: no se infiere el sistema operativo.
  // Web: Spaces de HF (app web alojada), web UIs autoalojadas o sitio oficial de una app web (lista curada).
  if (c.hf) add('web', 'Hugging Face Space (aplicación web alojada)');
  if (/\b(web ?ui|web interface|web app|webapp|web application|in your browser|browser-based|self-hosted|selfhosted|self hosted)\b/.test(desc)) add('web', 'descripción: interfaz web');
  if (c.claims?.webApp && (c.page?.status ?? 0) > 0 && (c.page?.status ?? 0) < 500) add('web', 'curada: aplicación web en el sitio oficial');
  // Plataformas declaradas en la lista curada: solo se aceptan si la página oficial lo confirma.
  for (const p of c.claims?.platforms ?? []) {
    if (out.has(p)) continue;
    const pageText = (c.page?.text ?? '').toLowerCase();
    const word: Record<string, RegExp> = { windows: /\bwindows\b/, macos: /\b(mac|macos)\b/, linux: /\blinux\b/, android: /\b(android|google play)\b/, ios: /\b(ios|iphone|app store)\b/, 'browser-extension': /\b(chrome|extension|add-on)\b/, cli: /\b(cli|terminal|command line)\b/, web: /./ };
    if (word[p]?.test(pageText) && /\b(download|get|install|available)\b/.test(pageText)) add(p, 'curada + mención en sitio oficial');
  }
  return { value: [...out.keys()], evidence: [...out.entries()].map(([k, v]) => `${k}: ${v}`) };
}

/* ------------------------------ Licencia y precio ------------------------------ */

const OSI = new Set([
  'MIT', 'Apache-2.0', 'GPL-2.0', 'GPL-3.0', 'GPL-2.0-only', 'GPL-3.0-only', 'GPL-2.0-or-later', 'GPL-3.0-or-later', 'AGPL-3.0', 'AGPL-3.0-only', 'AGPL-3.0-or-later',
  'LGPL-2.1', 'LGPL-3.0', 'LGPL-2.1-only', 'LGPL-3.0-only', 'BSD-2-Clause', 'BSD-3-Clause', 'MPL-2.0', 'ISC', 'Unlicense', '0BSD', 'EPL-2.0', 'Zlib', 'BSL-1.0', 'Artistic-2.0', 'EUPL-1.2', 'CC0-1.0',
]);

export function licenseInfo(spdx: string | null, name: string | null): { spdx: string | null; name: string | null; openSource: boolean | null } {
  if (!spdx) return { spdx: null, name: null, openSource: null };
  return { spdx, name: name ?? spdx, openSource: OSI.has(spdx) ? true : null };
}

const PAID_SIGNALS = /(\$|€|£)\s?\d|\b\d+(\.\d+)?\s?(usd|eur)\b|per month|\/\s?mo(nth)?\b|per user|billed (annually|monthly)|subscription|upgrade to pro|pro plan|premium plan/i;
const FREE_PLAN = /\b(free plan|free tier|free forever|start for free|get started for free|try (it )?for free|\$0\b|free trial|free version|basic plan is free)\b/i;

export function detectPricing(c: Candidate, license: { openSource: boolean | null }, readme: string): Evidence<PricingId> {
  if (c.pricingPage && c.pricingPage.text) {
    const txt = c.pricingPage.text;
    const paid = PAID_SIGNALS.test(txt);
    const free = FREE_PLAN.test(txt) || /\bfree\b/i.test(txt.slice(0, 4000));
    if (paid && free) return { value: 'freemium', evidence: [`página de precios: plan gratuito y planes de pago (${c.pricingPage.url})`] };
    if (paid) return { value: 'paid', evidence: [`página de precios: solo planes de pago (${c.pricingPage.url})`] };
    if (free) return { value: 'free', evidence: [`página de precios: gratuito (${c.pricingPage.url})`] };
  }
  if (license.openSource === true && (c.github || c.hf)) {
    const commercial = PAID_SIGNALS.test(readme.slice(0, 15_000));
    if (!commercial) return { value: 'free', evidence: [`licencia open source ${c.github?.license.spdx ?? c.hf?.license ?? ''}, sin planes de pago en la fuente`] };
    return { value: 'unverified', evidence: ['open source con menciones de planes de pago: no verificable'] };
  }
  return { value: 'unverified', evidence: ['sin evidencia de precio'] };
}

/* ------------------------- Ejecución local / sin conexión ------------------------- */

export function detectLocal(c: Candidate, text: string): Evidence<boolean | null> {
  const t = text.toLowerCase();
  const m = t.match(/\b(runs? (entirely |fully |100% )?locally|run (it )?locally|local llms?|on-device|on your (own )?(computer|machine|device|hardware)|self-hosted|selfhosted|self hosted|locally hosted|local-first|without (sending|uploading) (your )?data|ollama|llama\.cpp|gguf)\b/);
  if (m && (c.github || c.claims?.platforms?.some((p) => ['windows', 'macos', 'linux'].includes(p)))) return { value: true, evidence: [`texto: "${m[0]}"`] };
  return { value: null, evidence: [] };
}

export function detectOffline(text: string): Evidence<boolean | null> {
  const m = text.toLowerCase().match(/\b(works? (completely |fully |100% )?offline|fully offline|offline[- ]first|no internet (connection )?(is )?required|without (an )?internet( connection)?|100% offline|completely offline)\b/);
  return m ? { value: true, evidence: [`texto: "${m[0]}"`] } : { value: null, evidence: [] };
}

/* --------------------- Listas desde el README (funciones, requisitos) --------------------- */

export function extractSection(readme: string, heading: RegExp, max = 6): string[] {
  const lines = readme.split(/\r?\n/);
  const out: string[] = [];
  let inSection = false;
  let level = 0;
  for (const line of lines) {
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      if (inSection && h[1].length <= level) break;
      if (!inSection && heading.test(h[2])) {
        inSection = true;
        level = h[1].length;
      }
      continue;
    }
    if (!inSection) continue;
    const b = line.match(/^\s{0,3}[-*+]\s+(.*)$/);
    if (b) {
      const item = cleanText(b[1], 160).replace(/^[^\p{L}\p{N}]+/u, '').replace(/[:.]$/, '');
      if (item.length >= 8 && item.length <= 150 && !/https?:\/\//.test(item)) out.push(item);
      if (out.length >= max) break;
    }
  }
  return out;
}

export const FEATURES_HEADING = /^(\W*\s*)?(key |main |core )?(features|highlights|what it does|capabilities|características|funciones)\b/i;
export const REQUIREMENTS_HEADING = /^(\W*\s*)?(system )?(requirements|prerequisites|hardware requirements|requisitos)\b/i;

/** Primer párrafo en prosa del README (sin badges, código ni tablas). */
export function readmeIntro(readme: string): string {
  const blocks = readme.replace(/```[\s\S]*?```/g, '\n').replace(/<[^>]+>/g, ' ').split(/\n\s*\n/);
  for (const b of blocks) {
    const t = cleanText(b, 500);
    if (t.length < 60) continue;
    if (/^(\||#|!\[|\[!\[|>\s*\[!)/.test(b.trim())) continue;
    if ((t.match(/\w+/g) ?? []).length < 10) continue;
    if (/(english|中文|日本語|한국어|español|français)\s*[|·]/i.test(t)) continue;
    return t;
  }
  return '';
}
