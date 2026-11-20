// The steps of /start kept for the life of a tab (src/client/startDraft.ts).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearStartDraft, readStartDraft, writeStartDraft } from '@/client/startDraft';

function memorySession(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, String(value)),
  };
}

const g = globalThis as unknown as { window?: { sessionStorage: Storage } };

describe('the /start draft', () => {
  beforeEach(() => {
    g.window = { sessionStorage: memorySession() };
  });
  afterEach(() => {
    delete g.window;
  });

  it('keeps the step and the background answers, and clears them', () => {
    expect(readStartDraft()).toBeNull();
    const draft = { at: 'q:stage', age: 2, role: 'emp' as const, extra: { field: 3 }, usState: 'GA', ticker: 'RIVR' };
    writeStartDraft(draft);
    expect(readStartDraft()).toEqual(draft);
    clearStartDraft();
    expect(readStartDraft()).toBeNull();
  });

  it('drops a draft at the introduction, and fields of the wrong shape', () => {
    writeStartDraft({ at: 'intro', age: 1, role: 'emp', extra: {}, usState: '', ticker: '' });
    expect(readStartDraft()).toBeNull();
    g.window?.sessionStorage.setItem(
      'standing.v1.start-draft',
      JSON.stringify({ at: 'role', age: -1, role: 'king', extra: { field: 2.5, 'bad key': 1, year: 1 }, usState: 7, ticker: 'X'.repeat(40) }),
    );
    expect(readStartDraft()).toEqual({ at: 'role', age: null, role: null, extra: { year: 1 }, usState: '', ticker: 'X'.repeat(12) });
    g.window?.sessionStorage.setItem('standing.v1.start-draft', '{not json');
    expect(readStartDraft()).toBeNull();
  });

  it('does nothing without a window or with blocked storage', () => {
    delete g.window;
    expect(readStartDraft()).toBeNull();
    expect(() => writeStartDraft({ at: 'age', age: 0, role: null, extra: {}, usState: '', ticker: '' })).not.toThrow();
    expect(() => clearStartDraft()).not.toThrow();
    g.window = {
      get sessionStorage(): Storage {
        throw new Error('blocked');
      },
    };
    expect(readStartDraft()).toBeNull();
    expect(() => writeStartDraft({ at: 'age', age: 0, role: null, extra: {}, usState: '', ticker: '' })).not.toThrow();
  });
});
