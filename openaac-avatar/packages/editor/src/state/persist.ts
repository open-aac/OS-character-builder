/** Remembers the last symbol in this browser. Optional: everything works without storage. */
import type { RenderRequest } from '@openaac-avatar/core';
import { fromRequest, initialState, toRequest, type EditorState, type Store } from './store';

const STORAGE_KEY = 'openaac-avatar-editor';

export function loadSaved(): EditorState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return fromRequest(JSON.parse(raw) as RenderRequest);
  } catch {
    /* storage blocked, or a saved state from an older version: start fresh */
  }
  return initialState();
}

export function persist(store: Store): void {
  store.on('change', () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toRequest(store.state)));
    } catch {
      /* storage blocked: nothing to do */
    }
  });
}
