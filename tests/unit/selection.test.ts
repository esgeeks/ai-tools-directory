import { describe, expect, it } from 'vitest';
import { COMPARE_KEY, FAVORITES_KEY, MemoryKV, Selection } from '../../src/lib/selection.ts';

describe('favoritos', () => {
  it('añade, quita y persiste entre instancias (simula cerrar el navegador)', () => {
    const store = new MemoryKV();
    const a = new Selection(store);
    expect(a.toggleFavorite('ollama')).toBe(true);
    expect(a.toggleFavorite('comfyui')).toBe(true);
    expect(a.toggleFavorite('ollama')).toBe(false);
    const b = new Selection(store);
    expect(b.favorites()).toEqual(['comfyui']);
    b.clearFavorites();
    expect(new Selection(store).favorites()).toEqual([]);
  });
  it('sanea datos corruptos o maliciosos en el almacenamiento', () => {
    const store = new MemoryKV();
    store.setItem(FAVORITES_KEY, JSON.stringify(['ok-slug', '<img onerror=x>', 42, 'ok-slug']));
    expect(new Selection(store).favorites()).toEqual(['ok-slug']);
    store.setItem(FAVORITES_KEY, '{no json');
    expect(new Selection(store).favorites()).toEqual([]);
  });
});

describe('comparador', () => {
  it('permite de 2 a 4 herramientas', () => {
    const s = new Selection(new MemoryKV());
    expect(s.canCompare()).toBe(false);
    s.toggleCompare('a');
    expect(s.canCompare()).toBe(false);
    s.toggleCompare('b');
    expect(s.canCompare()).toBe(true);
    s.toggleCompare('c');
    s.toggleCompare('d');
    expect(s.toggleCompare('e')).toBe('full');
    expect(s.compare()).toEqual(['a', 'b', 'c', 'd']);
    expect(s.toggleCompare('b')).toBe('removed');
    expect(s.toggleCompare('e')).toBe('added');
  });
  it('limita a 4 aunque el almacenamiento tenga más', () => {
    const store = new MemoryKV();
    store.setItem(COMPARE_KEY, JSON.stringify(['a', 'b', 'c', 'd', 'e', 'f']));
    expect(new Selection(store).compare()).toHaveLength(4);
  });
  it('rechaza identificadores inválidos', () => {
    expect(new Selection(new MemoryKV()).toggleCompare('../x')).toBe('invalid');
  });
});
