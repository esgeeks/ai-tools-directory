import { describe, expect, it } from 'vitest';
import { CatalogIndex, assignSlug, computeTrends, dedupeKeys, mergeTool, recordMetrics, type MetricHistory } from '../../pipeline/store.ts';
import type { Tool } from '../../src/lib/schema.ts';
import type { Draft } from '../../pipeline/process.ts';
import fixture from '../fixtures/data/catalog.json' with { type: 'json' };

const tools = structuredClone(fixture.tools) as unknown as Tool[];

function draftFrom(t: Tool, over: Partial<Draft> = {}): Draft {
  return { ...structuredClone(t), id: 'new:x', canonicalKeys: [], sources: [{ connector: 'x', externalId: 'y', url: 'https://example.org/', retrievedAt: '2026-11-01' }], ...over } as Draft;
}

describe('detección de duplicados', () => {
  const idx = new CatalogIndex(structuredClone(tools));
  it('genera claves verificables (id, repo, URL canónica)', () => {
    const keys = dedupeKeys(tools[0]);
    expect(keys).toContain('github:example/fixture-alpha');
  });
  it('detecta duplicado por repositorio de GitHub', () => {
    const d = draftFrom(tools[0], { canonicalKeys: ['github:example/fixture-alpha'], name: 'Otro nombre' });
    expect(idx.find(d)?.slug).toBe('fixture-alpha');
  });
  it('detecta duplicado por URL canónica (www, parámetros de seguimiento)', () => {
    const d = draftFrom(tools[1], { canonicalKeys: ['url:https://example.com/beta'], name: 'Beta' });
    expect(idx.find(d)?.slug).toBe('fixture-beta');
  });
  it('el mismo nombre con dominio distinto NO es duplicado', () => {
    const d = draftFrom(tools[1], { canonicalKeys: ['url:https://otro.example.net'], urls: { ...tools[1].urls, official: 'https://otro.example.net/' } });
    expect(idx.find(d)).toBeUndefined();
  });
  it('asigna slugs únicos', () => {
    const d = draftFrom(tools[0], { name: 'Fixture Alpha', urls: { ...tools[0].urls, github: 'https://github.com/otro/fixture-alpha' } });
    expect(assignSlug(d, idx)).toBe('fixture-alpha-otro');
  });
});

describe('fusión y cambios', () => {
  it('conserva identidad y traducción si el texto original no cambia; detecta cambios', () => {
    const t = structuredClone(tools[0]);
    const d = draftFrom(t, { pricing: 'freemium' });
    d.description = { ...t.description, es: null, status: { es: 'pending', en: 'original' } };
    const { tool, changed } = mergeTool(t, d, '2026-11-02');
    expect(tool.slug).toBe('fixture-alpha');
    expect(tool.dates.added).toBe(t.dates.added);
    expect(tool.description.es).toBe(t.description.es);
    expect(changed).toEqual(['pricing']);
    expect(tool.dates.lastChangeDetected).toBe('2026-11-02');
  });
});

describe('tendencias con historial propio', () => {
  it('requiere al menos 7 días y crecimiento mínimo', () => {
    const h: MetricHistory = { a: { github_stars: [['2026-10-20', 100], ['2026-10-27', 150], ['2026-11-01', 200]] }, b: { github_stars: [['2026-10-30', 10], ['2026-11-01', 500]] } };
    const tr = computeTrends(h, new Set(['a', 'b']), '2026-11-01');
    expect(tr.map((x) => x.id)).toEqual(['a']);
    expect(tr[0].delta).toBeGreaterThanOrEqual(50);
  });
  it('registra métricas sin duplicar el mismo día', () => {
    const h: MetricHistory = {};
    const t = { ...structuredClone(tools[0]), metrics: [{ kind: 'github_stars' as const, value: 5, source: 'x', at: '2026-11-01' }] };
    recordMetrics(h, t);
    recordMetrics(h, { ...t, metrics: [{ ...t.metrics[0], value: 6 }] });
    expect(h[t.id].github_stars).toEqual([['2026-11-01', 6]]);
  });
});
