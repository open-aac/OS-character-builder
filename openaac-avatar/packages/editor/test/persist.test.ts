import { DEFAULT_COLORS, type RenderRequest } from '@openaac-avatar/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadSaved, persist } from '../src/state/persist';
import { Store, initialState, toRequest } from '../src/state/store';

const STORAGE_KEY = 'openaac-avatar-editor';

beforeEach(() => localStorage.clear());

describe('loadSaved', () => {
  it('returns the initial state when nothing was saved', () => {
    expect(loadSaved()).toEqual(initialState());
  });

  it('restores a previously saved request', () => {
    const req: RenderRequest = { view: 'side', pose: { preset: 'waving' }, avatar: { body: 0.7, colors: { ...DEFAULT_COLORS, skin: '#abcabc' } }, options: { size: 200 } };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(req));
    const s = loadSaved();
    expect(s.view).toBe('side');
    expect(s.preset).toBe('waving');
    expect(s.body).toBe(0.7);
    expect(s.colors.skin).toBe('#abcabc');
    expect(s.size).toBe(200);
  });

  it('starts fresh when the saved value is not valid JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(loadSaved()).toEqual(initialState());
  });

  it('starts fresh when the saved value fails request validation', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ view: 'front', pose: { preset: 'flying' }, avatar: {}, options: {} }));
    expect(loadSaved()).toEqual(initialState());
  });
});

describe('persist', () => {
  it('writes the current request to storage on every change', () => {
    const store = new Store(initialState());
    persist(store);
    store.update({ body: 0.85 });
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved).toEqual(toRequest(store.state));
    expect(saved.avatar.body).toBe(0.85);
  });

  it('does not write anything before the first change', () => {
    const store = new Store(initialState());
    persist(store);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
