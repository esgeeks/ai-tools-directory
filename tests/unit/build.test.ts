/**
 * Construcción estática con DATOS DE PRUEBA (tests/fixtures/data): comprueba páginas bilingües,
 * hreflang, canonical, noindex de fichas sin traducción, sitemap, robots y escape de contenido.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const OUT = join(process.cwd(), '.cache/test-dist');
const read = (p: string) => readFileSync(join(OUT, p), 'utf8');

beforeAll(() => {
  rmSync(OUT, { recursive: true, force: true });
  execFileSync('npx', ['astro', 'build', '--outDir', OUT], { env: { ...process.env, AITD_DATA_DIR: 'tests/fixtures/data' }, stdio: 'pipe' });
}, 180_000);
afterAll(() => rmSync(OUT, { recursive: true, force: true }));

describe('construcción estática bilingüe', () => {
  it('genera inicio en /es/ y /en/ y redirección en la raíz', () => {
    expect(existsSync(join(OUT, 'es/index.html'))).toBe(true);
    expect(existsSync(join(OUT, 'en/index.html'))).toBe(true);
    expect(read('index.html')).toContain('url=/es/');
    expect(read('es/index.html')).toContain('<html lang="es"');
    expect(read('en/index.html')).toContain('<html lang="en"');
  });
  it('genera fichas con URLs localizadas y hreflang recíproco', () => {
    const es = read('es/herramientas/fixture-alpha/index.html');
    const en = read('en/tools/fixture-alpha/index.html');
    expect(es).toContain('hreflang="en" href="https://tools.iathink.com/en/tools/fixture-alpha/"');
    expect(en).toContain('hreflang="es" href="https://tools.iathink.com/es/herramientas/fixture-alpha/"');
    expect(es).toContain('rel="canonical" href="https://tools.iathink.com/es/herramientas/fixture-alpha/"');
    expect(es).toContain('aplicación de escritorio ficticia');
    expect(es).toContain('"@type":"SoftwareApplication"');
  });
  it('marca noindex la ficha sin traducción fiable y la excluye del sitemap', () => {
    const robots = /<meta name="robots" content="noindex/;
    expect(read('es/herramientas/fixture-beta/index.html')).toMatch(robots);
    const en = read('en/tools/fixture-beta/index.html');
    expect(en).not.toMatch(robots);
    // hreflang solo apunta a versiones indexables
    expect(en).not.toContain('rel="alternate" hreflang="es"');
    expect(en).toContain('hreflang="x-default" href="https://tools.iathink.com/en/tools/fixture-beta/"');
    const sm = read('sitemap.xml');
    expect(sm).toContain('https://tools.iathink.com/en/tools/fixture-beta/');
    expect(sm).not.toContain('<loc>https://tools.iathink.com/es/herramientas/fixture-beta/</loc>');
  });
  it('genera categorías, favoritos, comparador, índices JSON y robots', () => {
    expect(existsSync(join(OUT, 'es/categorias/asistentes-de-ia/index.html'))).toBe(true);
    expect(existsSync(join(OUT, 'en/categories/ai-assistants/index.html'))).toBe(true);
    expect(read('es/favoritos/index.html')).toContain('noindex');
    expect(read('en/compare/index.html')).toContain('noindex');
    const idx = JSON.parse(read('es/index.json'));
    expect(idx.items).toHaveLength(3);
    expect(idx.items.find((i: { slug: string }) => i.slug === 'fixture-alpha').description).toContain('ficticia');
    expect(read('robots.txt')).toContain('Sitemap: https://tools.iathink.com/sitemap.xml');
  });
  it('incluye la analítica sin cookies de Cloudflare', () => {
    expect(read('es/index.html')).toContain('static.cloudflareinsights.com/beacon.min.js');
    expect(read('es/index.html')).toContain('ede9c31e625c4f8883b057275f144075');
  });
  it('incluye el aviso de seguridad y no muestra cifras inventadas', () => {
    const home = read('es/index.html');
    expect(home).toContain('no la seguridad del software');
    expect(home).not.toMatch(/\d[\d.,]*\s*(usuarios|users)/i);
  });
});
