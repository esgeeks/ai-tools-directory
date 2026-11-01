import { describe, expect, it, vi } from 'vitest';
import { protect, qualityCheck, restore, translateTools, type Translator } from '../../pipeline/translate.ts';
import type { Tool } from '../../src/lib/schema.ts';
import fixture from '../fixtures/data/catalog.json' with { type: 'json' };

// La caché real no se toca en las pruebas.
vi.mock('node:fs', async (orig) => {
  const fs = await orig<typeof import('node:fs')>();
  return { ...fs, writeFileSync: vi.fn(), existsSync: (p: string) => (String(p).includes('translation-cache') ? false : fs.existsSync(p)) };
});

describe('protección de términos', () => {
  it('protege URLs, versiones, cifras y nombres de producto y los restaura', () => {
    const src = 'Ollama Desktop v2.1.0 runs Llama models with 8 GB RAM. See https://ollama.com for details.';
    const p = protect(src, ['Ollama Desktop']);
    expect(p.text).not.toContain('https://');
    expect(p.text).not.toContain('Ollama Desktop');
    expect(restore(p.text, p.tokens)).toBe(src);
  });
  it('detecta marcadores perdidos', () => {
    const p = protect('Use Docker and https://x.example.org now', []);
    expect(restore(p.text.replace(/ZQX0QZ/, ''), p.tokens)).toBeNull();
  });
});

describe('control de calidad', () => {
  it('descarta traducciones vacías, idénticas, repetitivas o con cifras alteradas', () => {
    const src = 'A desktop app to transcribe audio with 3 engines locally.';
    expect(qualityCheck(src, '')).toBeNull();
    expect(qualityCheck(src, src)).toBeNull();
    expect(qualityCheck(src, 'la la la la la la')).toBeNull();
    expect(qualityCheck(src, 'Una app de escritorio para transcribir audio con 4 motores localmente.')).toBeNull();
    expect(qualityCheck(src, 'Una app de escritorio para transcribir audio con 3 motores localmente.')).toBe('Una app de escritorio para transcribir audio con 3 motores localmente.');
  });
});

const fakeTranslator: Translator = {
  name: 'fake',
  translate(items) {
    // Simula una traducción: prefija y conserva marcadores.
    return { available: true, results: new Map(items.map((i) => [i.id, `[${i.target}] ${i.text}`])), error: null };
  },
};
const brokenTranslator: Translator = { name: 'broken', translate: () => ({ available: false, results: new Map(), error: 'no disponible' }) };

describe('traducción y respaldo', () => {
  it('traduce solo lo pendiente y marca el estado como automático', () => {
    const tools = structuredClone(fixture.tools) as unknown as Tool[];
    const spy = vi.spyOn(fakeTranslator, 'translate');
    const r = translateTools(tools, fakeTranslator, () => {}, { enabled: true });
    const beta = tools.find((t) => t.slug === 'fixture-beta')!;
    expect(beta.description.status.es).toBe('machine');
    expect(beta.description.es).toContain('[es]');
    expect(beta.description.es).toContain('Fixture Beta'); // nombre de producto preservado
    // Alpha ya tenía traducción: no se vuelve a pedir.
    const asked = spy.mock.calls.flatMap((c) => c[0].map((i) => i.text)).join(' ');
    expect(asked).not.toContain('used only in automated tests');
    expect(r.translated).toBeGreaterThan(0);
  });
  it('si el traductor no está disponible conserva el original y deja la traducción pendiente', () => {
    const tools = structuredClone(fixture.tools) as unknown as Tool[];
    const r = translateTools(tools, brokenTranslator, () => {}, { enabled: true });
    const beta = tools.find((t) => t.slug === 'fixture-beta')!;
    expect(beta.description.es).toBeNull();
    expect(beta.description.status.es).toBe('pending');
    expect(beta.description.original.length).toBeGreaterThan(0);
    expect(r.pending).toBeGreaterThan(0);
  });
});

describe('pulido del español', () => {
  it('cambia AI por IA sin tocar nombres de producto y une posesivos sueltos', async () => {
    const { polishEs } = await import('../../pipeline/translate.ts');
    expect(polishEs('El editor de vídeo impulsado por AI de CapCut', ['CapCut'])).toBe('El editor de vídeo impulsado por IA de CapCut');
    expect(polishEs('Notion AI ayuda con AI.', ['Notion AI'])).toBe('Notion AI ayuda con IA.');
    expect(polishEs("CapCut 's editor")).toBe("CapCut's editor");
  });
});
