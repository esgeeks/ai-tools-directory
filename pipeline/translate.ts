/**
 * Traducción automática con caché, protección de términos y control de calidad.
 * - Solo traduce textos nuevos o modificados (clave = hash del texto + par de idiomas).
 * - Protege nombres de producto, URLs, cifras, versiones y código con marcadores.
 * - Descarta traducciones vacías, truncadas, repetitivas o que pierden marcadores.
 * - Si no hay traducción fiable, se conserva el original y se registra el estado.
 * El proveedor es intercambiable (interfaz Translator) para añadir otro en el futuro.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Tool } from '../src/lib/schema.ts';

export type Lang = 'es' | 'en';
export interface TranslateItem { id: string; text: string; source: Lang; target: Lang }
export interface Translator {
  name: string;
  translate(items: TranslateItem[]): { available: boolean; results: Map<string, string>; error: string | null };
}

/** Términos técnicos que nunca se traducen. */
const KEEP_TERMS = [
  'open source', 'open-source', 'self-hosted', 'LLM', 'LLMs', 'GPT', 'ChatGPT', 'OpenAI', 'Claude', 'Gemini', 'Llama', 'Mistral', 'Ollama', 'llama.cpp', 'GGUF',
  'Whisper', 'Stable Diffusion', 'SDXL', 'FLUX', 'ComfyUI', 'RAG', 'API', 'APIs', 'CLI', 'GUI', 'WebUI', 'Web UI', 'UI', 'SDK', 'Docker', 'Kubernetes', 'GitHub',
  'Hugging Face', 'Python', 'JavaScript', 'TypeScript', 'Node.js', 'React', 'Next.js', 'VS Code', 'macOS', 'Windows', 'Linux', 'Android', 'iOS', 'Chrome',
  'Firefox', 'TTS', 'STT', 'OCR', 'GPU', 'CPU', 'CUDA', 'MCP', 'Markdown', 'PDF', 'JSON', 'YAML', 'SQL', 'Gradio', 'Streamlit',
];

export function protect(text: string, extraTerms: string[] = []): { text: string; tokens: string[] } {
  const tokens: string[] = [];
  const mark = (s: string) => {
    tokens.push(s);
    return ` ZQX${tokens.length - 1}QZ `;
  };
  let out = text
    .replace(/https?:\/\/\S+/g, mark)
    .replace(/`[^`]+`/g, mark)
    .replace(/\b[\w.-]+@[\w-]+\.[\w.]+\b/g, mark)
    .replace(/\bv?\d+(\.\d+){1,3}\b/g, mark)
    .replace(/\b\d+(\.\d+)?\s?(GB|MB|KB|TB|ms|s|x|%|B|K|M)\b/g, mark);
  const terms = [...new Set([...extraTerms.filter((t) => t.length >= 2), ...KEEP_TERMS])].sort((a, b) => b.length - a.length);
  for (const term of terms) {
    const re = new RegExp(`(?<![\\w])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`, 'g');
    out = out.replace(re, mark);
  }
  return { text: out.replace(/\s{2,}/g, ' ').trim(), tokens };
}

export function restore(text: string, tokens: string[]): string | null {
  let ok = true;
  const seen = new Set<number>();
  const out = text.replace(/\s?ZQX\s?(\d+)\s?QZ\s?/gi, (m, n) => {
    const i = Number(n);
    if (!(i in tokens)) {
      ok = false;
      return m;
    }
    seen.add(i);
    const lead = /^\s/.test(m) ? ' ' : '';
    const trail = /\s$/.test(m) ? ' ' : '';
    return `${lead}${tokens[i]}${trail}`;
  });
  if (!ok || seen.size !== tokens.length) return null;
  return out.replace(/\s+([,.;:!?)])/g, '$1').replace(/\(\s+/g, '(').replace(/\s{2,}/g, ' ').trim();
}

/** Control de calidad: devuelve null si la traducción no es fiable. */
export function qualityCheck(source: string, translated: string | null): string | null {
  if (!translated) return null;
  const t = translated.trim();
  if (!t) return null;
  const ratio = t.length / Math.max(1, source.length);
  if (source.length > 30 && (ratio < 0.5 || ratio > 2.2)) return null;
  if (source.length > 40 && t.toLowerCase() === source.toLowerCase()) return null;
  if (/(\b\w+\b)(\s+\1\b){3,}/i.test(t)) return null; // bucles repetitivos
  if (/ZQX|QZ\d/i.test(t)) return null;
  const srcNums = (source.match(/\d+/g) ?? []).sort().join(',');
  const outNums = (t.match(/\d+/g) ?? []).sort().join(',');
  if (srcNums !== outNums) return null;
  return t;
}

export const argosTranslator: Translator = {
  name: 'argos-translate',
  translate(items) {
    if (!items.length) return { available: true, results: new Map(), error: null };
    const python = process.env.PYTHON || 'python3';
    const res = spawnSync(python, ['-I', join(process.cwd(), 'pipeline/translate/argos_translate.py')], {
      input: JSON.stringify({ items }),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: 45 * 60 * 1000,
    });
    if (res.status !== 0 || !res.stdout) return { available: false, results: new Map(), error: res.stderr?.slice(0, 500) || res.error?.message || 'python falló' };
    try {
      const parsed = JSON.parse(res.stdout) as { available: boolean; results: { id: string; text: string }[]; error: string | null };
      return { available: parsed.available, results: new Map(parsed.results.map((r) => [r.id, r.text])), error: parsed.error };
    } catch {
      return { available: false, results: new Map(), error: 'salida no válida del traductor' };
    }
  },
};

type Cache = Record<string, string>;
const CACHE_FILE = join(process.cwd(), 'data/translation-cache.json');

export function loadCache(): Cache {
  return existsSync(CACHE_FILE) ? (JSON.parse(readFileSync(CACHE_FILE, 'utf8')) as Cache) : {};
}
export function saveCache(cache: Cache) {
  writeFileSync(CACHE_FILE, `${JSON.stringify(cache, Object.keys(cache).sort(), 0)}\n`);
}
const key = (text: string, s: Lang, t: Lang) => createHash('sha256').update(`${s}>${t}\n${text}`).digest('hex').slice(0, 24);

/**
 * Traduce descripciones y listas pendientes de las fichas (in place).
 * Devuelve cuántas traducciones quedan pendientes.
 */
export function translateTools(tools: Tool[], translator: Translator, log: (m: string) => void, opts: { enabled: boolean }): { pending: number; translated: number; failed: number; error: string | null } {
  const cache = loadCache();
  type Job = { tool: Tool; field: 'description' | 'features' | 'requirements'; index: number; target: Lang; source: Lang; text: string; tokens: string[]; k: string };
  const jobs: Job[] = [];
  for (const tool of tools) {
    const src = tool.description.originalLang;
    if (src === 'unknown') continue;
    const target: Lang = src === 'es' ? 'en' : 'es';
    const needDesc = tool.description[target] === null || tool.description.status[target] === 'pending' || tool.description.status[target] === 'failed';
    if (needDesc && tool.description.original) {
      // Se traduce por párrafos para mejorar la calidad.
      tool.description.original.split(/\n{2,}/).forEach((para, i) => {
        const p = protect(para, [tool.name]);
        jobs.push({ tool, field: 'description', index: i, target, source: src, text: p.text, tokens: p.tokens, k: key(para, src, target) });
      });
    }
    for (const field of ['features', 'requirements'] as const) {
      const list = tool[field];
      if (list.original.length && (!list[target] || list[target]!.length !== list.original.length)) {
        list.original.forEach((item, i) => {
          const p = protect(item, [tool.name]);
          jobs.push({ tool, field, index: i, target, source: src, text: p.text, tokens: p.tokens, k: key(item, src, target) });
        });
      }
    }
  }
  const toRun = jobs.filter((j) => !(j.k in cache));
  let error: string | null = null;
  let available = true;
  if (toRun.length && opts.enabled) {
    const uniq = [...new Map(toRun.map((j) => [j.k, j])).values()];
    log(`traducción: ${uniq.length} textos nuevos con ${translator.name}`);
    const r = translator.translate(uniq.map((j) => ({ id: j.k, text: j.text, source: j.source, target: j.target })));
    available = r.available;
    error = r.error;
    for (const j of uniq) {
      const raw = r.results.get(j.k);
      const restored = raw ? restore(raw, j.tokens) : null;
      const original = restore(j.text, j.tokens) ?? j.text;
      const ok = qualityCheck(original, restored);
      if (ok) cache[j.k] = ok;
    }
  } else if (toRun.length) {
    available = false;
    error = 'traducción desactivada en esta ejecución';
  }
  // Ensambla resultados por ficha.
  let pending = 0, translated = 0, failed = 0;
  const byTool = new Map<Tool, Job[]>();
  for (const j of jobs) byTool.set(j.tool, [...(byTool.get(j.tool) ?? []), j]);
  for (const [tool, tj] of byTool) {
    const target = tj[0].target;
    const desc = tj.filter((j) => j.field === 'description').sort((a, b) => a.index - b.index);
    if (desc.length) {
      const parts = desc.map((j) => cache[j.k]);
      if (parts.every(Boolean)) {
        tool.description[target] = parts.join('\n\n');
        tool.description.status[target] = 'machine';
        translated++;
      } else {
        tool.description[target] = null;
        tool.description.status[target] = available ? 'failed' : 'pending';
        if (available) failed++;
        else pending++;
      }
    }
    for (const field of ['features', 'requirements'] as const) {
      const fj = tj.filter((j) => j.field === field).sort((a, b) => a.index - b.index);
      if (!fj.length) continue;
      const parts = fj.map((j) => cache[j.k]);
      tool[field][target] = parts.every(Boolean) ? parts : null;
    }
  }
  saveCache(cache);
  return { pending, translated, failed, error };
}
