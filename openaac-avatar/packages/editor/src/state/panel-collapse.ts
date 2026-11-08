/**
 * Remembers which settings panels are expanded or collapsed, across visits.
 *
 * Separate from `persist.ts`: this is UI-only navigation state, not part of a
 * render request, so it must never show up in an exported/request JSON.
 */
const KEY = 'openaac-avatar-editor-panels';

function readAll(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function isPanelOpen(id: string, defaultOpen: boolean): boolean {
  const all = readAll();
  return id in all ? !!all[id] : defaultOpen;
}

export function setPanelOpen(id: string, open: boolean): void {
  try {
    const all = readAll();
    all[id] = open;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage may be unavailable (private browsing, quota); the toggle still works, it just won't persist */
  }
}
