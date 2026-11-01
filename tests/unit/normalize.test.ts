import { describe, expect, it } from 'vitest';
import { cleanName, cleanText, detectLang, slugify, stripMarkdown } from '../../pipeline/lib/sanitize.ts';
import { canonicalUrl, githubRepoFromUrl, hfSpaceFromUrl, safeUrl } from '../../pipeline/lib/url.ts';
import { parsePage } from '../../pipeline/lib/html.ts';

describe('normalización de texto', () => {
  it('elimina HTML, scripts y caracteres de control', () => {
    expect(cleanText('<p>Hola <b>mundo</b></p><script>alert(1)</script>\u0007')).toBe('Hola mundo');
    expect(cleanText('<img src=x onerror=alert(1)>Texto')).toBe('Texto');
  });
  it('decodifica entidades sin crear etiquetas', () => {
    const out = cleanText('&lt;script&gt;x&lt;/script&gt; &amp; más');
    expect(out).toContain('& más');
    // El texto se escapa al renderizar; aquí solo verificamos que no hay control chars.
    expect(out).not.toMatch(/[\u0000-\u0008]/);
  });
  it('quita badges y conserva el texto de los enlaces', () => {
    expect(stripMarkdown('[![CI](https://x/badge.svg)](https://x) Run [Ollama](https://ollama.com) locally').trim()).toBe('Run Ollama locally');
  });
  it('elimina avisos de Markdown (> [!WARNING])', () => {
    expect(cleanText('> [!WARNING]\n> Deprecated soon\nReal text')).toBe('Deprecated soon Real text');
  });
  it('recorta descripciones largas en un límite de frase', () => {
    const s = 'Primera frase completa aquí. '.repeat(40);
    const out = cleanText(s, 100);
    expect(out.length).toBeLessThanOrEqual(101);
  });
  it('limpia nombres', () => {
    expect(cleanName('  — My Tool | ')).toBe('My Tool');
  });
  it('genera slugs estables', () => {
    expect(slugify('Écrire Mejor: AI Tool!')).toBe('ecrire-mejor-ai-tool');
    expect(slugify('---')).toBe('');
  });
  it('detecta idioma es/en y descarta otros alfabetos', () => {
    expect(detectLang('Una herramienta para transcribir audio con la IA de forma local')).toBe('es');
    expect(detectLang('A tool to transcribe audio with AI locally on your computer')).toBe('en');
    expect(detectLang('本地语音输入工具')).toBe('unknown');
    expect(detectLang('Sortiert Fotos mit lokaler KI und ist für Windows nicht nur ein Tool')).toBe('unknown');
  });
});

describe('validación de enlaces', () => {
  it('acepta https público y convierte http a https', () => {
    expect(safeUrl('https://ollama.com/download')).toBe('https://ollama.com/download');
    expect(safeUrl('http://example.org', { allowHttp: true })).toBe('https://example.org/');
  });
  it('rechaza esquemas peligrosos, IPs privadas, credenciales y acortadores', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'https://127.0.0.1/', 'https://192.168.1.4/x', 'https://localhost/', 'https://user:pass@site.com/', 'https://bit.ly/abc', 'ftp://site.com', 'https://8.8.8.8/', 'https://intranet.local/']) {
      expect(safeUrl(bad), bad).toBeNull();
    }
    expect(safeUrl('http://example.org')).toBeNull();
  });
  it('canonicaliza para deduplicar', () => {
    expect(canonicalUrl('https://www.Example.com/path/?utm_source=x&b=2&a=1#top')).toBe('https://example.com/path?a=1&b=2');
    expect(canonicalUrl('https://github.com/Ollama/Ollama.git')).toBe('https://github.com/ollama/ollama');
  });
  it('extrae repositorios de GitHub y Spaces de Hugging Face', () => {
    expect(githubRepoFromUrl('https://github.com/ollama/ollama/tree/main')).toBe('ollama/ollama');
    expect(githubRepoFromUrl('https://github.com/topics/ai')).toBeNull();
    expect(githubRepoFromUrl('https://gitlab.com/a/b')).toBeNull();
    expect(hfSpaceFromUrl('https://huggingface.co/spaces/openai/whisper')).toBe('openai/whisper');
    expect(hfSpaceFromUrl('https://huggingface.co/openai/whisper-large')).toBeNull();
  });
});

describe('metadatos de páginas', () => {
  it('extrae título, descripción, og:image, icono y enlaces absolutos', () => {
    const html = `<html lang="en"><head><title>Tool – Home</title><meta name="description" content="An AI &amp; ML tool">
      <meta property="og:image" content="/og.png"><link rel="icon" href="/fav.png"></head>
      <body><a href="https://apps.apple.com/us/app/tool/id1">iOS</a><a href="javascript:alert(1)">x</a></body></html>`;
    const p = parsePage(html, 'https://tool.example.org/');
    expect(p.title).toBe('Tool – Home');
    expect(p.description).toBe('An AI & ML tool');
    expect(p.ogImage).toBe('https://tool.example.org/og.png');
    expect(p.icon).toBe('https://tool.example.org/fav.png');
    expect(p.links).toEqual(['https://apps.apple.com/us/app/tool/id1']);
  });
});
