import { describe, expect, it } from 'vitest';
import { applyFilters, DEFAULT_STATE, parseState, query, searchScore, serializeState, sortItems, type IndexItem } from '../../src/lib/filters.ts';

const NOW = Date.parse('2026-11-01T12:00:00Z');
const item = (o: Partial<IndexItem>): IndexItem => ({
  slug: 'x', name: 'X', description: '', categories: [], categoryLabels: [], tags: [], platforms: [], pricing: 'unverified', openSource: null, local: null, offline: null,
  added: '2026-10-01', updated: null, verified: '2026-11-01', logo: null, source: 'GitHub', url: '/es/herramientas/x/', sponsored: false, ...o,
});
const items: IndexItem[] = [
  item({ slug: 'whisper-desk', name: 'Whisper Desk', description: 'Transcripción de audio local', categories: ['voice-transcription', 'local-ai'], categoryLabels: ['Voz y transcripción'], platforms: ['windows', 'macos'], pricing: 'free', openSource: true, local: true, offline: true, added: '2026-10-30', updated: '2026-10-31' }),
  item({ slug: 'pixel-gen', name: 'Pixel Gen', description: 'Generación de imágenes en la web', categories: ['image-generation'], categoryLabels: ['Generación de imágenes'], platforms: ['web'], pricing: 'freemium', added: '2026-09-01', updated: '2026-10-01' }),
  item({ slug: 'code-pilot', name: 'Code Pilot', description: 'Asistente de programación en la terminal', categories: ['programming'], categoryLabels: ['Programación'], platforms: ['cli', 'linux'], pricing: 'paid', openSource: false, added: '2026-07-01', updated: null }),
];

describe('búsqueda', () => {
  it('ignora mayúsculas y acentos y exige todos los términos', () => {
    expect(searchScore(items[0], 'TRANSCRIPCION')).toBeGreaterThan(0);
    expect(searchScore(items[0], 'transcripcion imagenes')).toBe(0);
  });
  it('prioriza coincidencias en el nombre', () => {
    const r = query(items, { ...DEFAULT_STATE, q: 'pilot' }, NOW);
    expect(r[0].slug).toBe('code-pilot');
  });
});

describe('filtros combinables', () => {
  it('OR dentro del grupo, AND entre grupos', () => {
    const r = applyFilters(items, { ...DEFAULT_STATE, platforms: ['web', 'cli'], pricing: ['paid'] }, NOW);
    expect(r.map((x) => x.slug)).toEqual(['code-pilot']);
  });
  it('open source / local / sin conexión solo con valor confirmado (null no pasa)', () => {
    expect(applyFilters(items, { ...DEFAULT_STATE, openSource: true }, NOW).map((x) => x.slug)).toEqual(['whisper-desk']);
    expect(applyFilters(items, { ...DEFAULT_STATE, offline: true }, NOW).map((x) => x.slug)).toEqual(['whisper-desk']);
  });
  it('filtra por fecha de incorporación y de actualización', () => {
    expect(applyFilters(items, { ...DEFAULT_STATE, addedWithin: 7 }, NOW).map((x) => x.slug)).toEqual(['whisper-desk']);
    expect(applyFilters(items, { ...DEFAULT_STATE, updatedWithin: 90 }, NOW).map((x) => x.slug).sort()).toEqual(['pixel-gen', 'whisper-desk']);
  });
  it('filtra por categoría', () => {
    expect(applyFilters(items, { ...DEFAULT_STATE, categories: ['image-generation'] }, NOW).map((x) => x.slug)).toEqual(['pixel-gen']);
  });
});

describe('ordenación', () => {
  it('por fecha de incorporación, actualización y nombre', () => {
    expect(sortItems(items, 'added').map((x) => x.slug)).toEqual(['whisper-desk', 'pixel-gen', 'code-pilot']);
    expect(sortItems(items, 'updated').map((x) => x.slug)).toEqual(['whisper-desk', 'pixel-gen', 'code-pilot']);
    expect(sortItems(items, 'name').map((x) => x.slug)).toEqual(['code-pilot', 'pixel-gen', 'whisper-desk']);
  });
});

describe('estado en la URL', () => {
  it('serializa y vuelve a leer el mismo estado, descartando valores no permitidos', () => {
    const s = { ...DEFAULT_STATE, q: 'audio', categories: ['voice-transcription'], platforms: ['web', 'linux'], openSource: true, addedWithin: 30, sort: 'name' as const };
    const back = parseState(serializeState(s), { categories: ['voice-transcription'], platforms: ['web', 'linux'], pricing: ['free'] });
    expect(back).toEqual(s);
    const bad = parseState(new URLSearchParams('plat=web,<script>&added=999&sort=evil'), { categories: [], platforms: ['web'], pricing: [] });
    expect(bad.platforms).toEqual(['web']);
    expect(bad.addedWithin).toBe(0);
    expect(bad.sort).toBe('added');
  });
});
