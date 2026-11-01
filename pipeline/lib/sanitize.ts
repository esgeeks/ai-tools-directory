/**
 * Limpieza de texto externo. Todo lo que procede de fuentes se trata como no confiable:
 * se eliminan etiquetas HTML, scripts, Markdown decorativo y caracteres de control.
 * El sitio, además, escapa todo al renderizar (defensa en profundidad).
 */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d{1,6});/g, (_, n) => safeChar(Number(n)))
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, n) => safeChar(parseInt(n, 16)))
    .replace(/&([a-z0-9#]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}
function safeChar(code: number): string {
  if (!Number.isFinite(code) || code < 32 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return ' ';
  return String.fromCodePoint(code);
}

export function stripHtml(s: string): string {
  return s
    .replace(/<(script|style|noscript|template|iframe|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?[a-z][^>]*>/gi, ' ');
}

/** Elimina Markdown: imágenes, badges, enlaces (se queda el texto), código, encabezados, énfasis. */
export function stripMarkdown(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(^|\s)[*_](\S[^*_]*?)[*_](?=\s|$)/g, '$1$2')
    .replace(/:[a-z0-9_+-]+:/gi, ' ');
}

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿]/g;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{FE0F}]/gu;

/** Texto plano seguro de una línea (o párrafos si keepParagraphs). */
export function cleanText(input: unknown, max = 600, { keepParagraphs = false } = {}): string {
  if (typeof input !== 'string') return '';
  let s = decodeEntities(stripHtml(input));
  s = stripMarkdown(s).replace(CONTROL, ' ').replace(EMOJI, '');
  s = keepParagraphs
    ? s.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n\n')
    : s.replace(/\s+/g, ' ').trim();
  if (s.length > max) {
    const cut = s.slice(0, max);
    const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'));
    s = (lastStop > max * 0.6 ? cut.slice(0, lastStop + 1) : `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : max).trimEnd()}…`).trim();
  }
  return s;
}

/** Nombre de producto: corto, sin decoraciones. */
export function cleanName(input: unknown): string {
  return cleanText(input, 80).replace(/^[\s\-–—|:·•]+|[\s\-–—|:·•]+$/g, '').trim();
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

/** Detección de idioma muy simple (es/en) por palabras vacías. Otro alfabeto → unknown. */
export function detectLang(s: string): 'es' | 'en' | 'unknown' {
  const text = s.toLowerCase();
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (!letters.length) return 'unknown';
  const latin = letters.replace(/[^a-záéíóúñüàèìòùçâêîôûäëïö]/g, '').length;
  if (latin / letters.length < 0.85) return 'unknown';
  const words = text.split(/[^a-záéíóúñü]+/).filter(Boolean);
  const ES = new Set(['el', 'la', 'los', 'las', 'de', 'del', 'que', 'y', 'en', 'un', 'una', 'para', 'con', 'por', 'es', 'su', 'tu', 'como', 'más', 'herramienta', 'puedes']);
  const EN = new Set(['the', 'and', 'of', 'to', 'a', 'an', 'in', 'for', 'with', 'is', 'your', 'you', 'on', 'that', 'it', 'from', 'by', 'this', 'tool', 'can']);
  const OTHER = new Set(['und', 'der', 'die', 'das', 'mit', 'für', 'ist', 'nicht', 'les', 'des', 'est', 'pour', 'avec', 'une', 'dans', 'não', 'uma', 'com', 'para', 'você', 'het', 'een', 'van', 'och', 'och', 'til', 'che', 'della', 'sono']);
  let es = 0, en = 0, other = 0;
  for (const w of words) {
    if (ES.has(w)) es++;
    if (EN.has(w)) en++;
    if (OTHER.has(w)) other++;
  }
  // Español y portugués comparten palabras (para, com…): solo cuenta "otro" si supera claramente a ambos.
  if (other > es && other > en) return 'unknown';
  if (es === 0 && en === 0) return words.length >= 3 ? 'en' : 'unknown';
  return es > en ? 'es' : 'en';
}
