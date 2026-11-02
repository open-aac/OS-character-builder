/**
 * Editor state and the small store that holds it.
 *
 * The state maps one-to-one onto a core render request, so whatever the
 * editor shows can be saved, sent to the CLI or the HTTP API, and loaded back.
 */
import { DEFAULT_COLORS, getKit, kitGarments, normalizeRequest, type ColorRole, type Framing, type GarmentSlot, type RenderRequest } from '@openaac-avatar/core';

export interface EditorState {
  /** Which art: front, three-quarter or side. */
  view: string;
  preset: string;
  adjust: Record<string, number>;
  body: number;
  colors: Record<ColorRole, string>;
  lineWeight: number;
  /** Garment style per slot, e.g. { top: 'tight_short', bottom: 'tight_long' }. */
  clothing: Record<GarmentSlot, string>;
  framing: Framing;
  size: number;
  background: string | null;
}

/** The first garment style the front art offers in each slot. */
export function defaultClothing(): Record<GarmentSlot, string> {
  const g = kitGarments(getKit('front'));
  return { top: g.top[0] ?? '', bottom: g.bottom[0] ?? '' };
}

export const initialState = (): EditorState => ({
  view: 'front',
  preset: 'standing',
  adjust: {},
  body: 0.5,
  colors: { ...DEFAULT_COLORS },
  lineWeight: 1,
  clothing: defaultClothing(),
  framing: 'full',
  size: 500,
  background: null,
});

const round = (n: number) => Math.round(n * 100) / 100;

export function toRequest(s: EditorState): RenderRequest {
  const adjust = Object.fromEntries(Object.entries(s.adjust).filter(([, v]) => v !== 0));
  const clothing = Object.fromEntries(Object.entries(s.clothing).filter(([, v]) => v));
  return {
    view: s.view,
    pose: { preset: s.preset, ...(Object.keys(adjust).length ? { adjust } : {}) },
    avatar: { body: round(s.body), colors: { ...s.colors }, lineWeight: round(s.lineWeight), clothing },
    options: { framing: s.framing, size: s.size, ...(s.background ? { background: s.background } : {}) },
  };
}

/** Line weight range offered in the editor. */
export const LINE_WEIGHT = [0.75, 1] as const;

/** Validates through the core (throws RequestError), so anything loaded here also renders on the server. */
export function fromRequest(r: RenderRequest): EditorState {
  const n = normalizeRequest(r);
  return {
    view: n.view,
    preset: n.pose.preset,
    adjust: { ...n.pose.adjust },
    body: n.avatar.body,
    colors: { ...n.avatar.colors },
    lineWeight: Math.min(LINE_WEIGHT[1], Math.max(LINE_WEIGHT[0], n.avatar.lineWeight)),
    clothing: { ...defaultClothing(), ...n.avatar.clothing },
    framing: n.options.framing,
    size: n.options.size,
    background: n.options.background,
  };
}

/** `change` fires on every edit (redraw the preview); `rebuild` when the controls themselves must be redrawn. */
type Event = 'change' | 'rebuild';

export class Store {
  #state: EditorState;
  #listeners: Record<Event, Set<() => void>> = { change: new Set(), rebuild: new Set() };

  constructor(state: EditorState) {
    this.#state = state;
  }

  get state(): Readonly<EditorState> {
    return this.#state;
  }

  /** Apply a change. Pass `rebuild` when the change alters which controls are shown or their ranges. */
  update(patch: Partial<EditorState>, { rebuild = false } = {}): void {
    this.#state = { ...this.#state, ...patch };
    this.#emit('change');
    if (rebuild) this.#emit('rebuild');
  }

  replace(state: EditorState): void {
    this.#state = state;
    this.#emit('change');
    this.#emit('rebuild');
  }

  on(event: Event, fn: () => void): void {
    this.#listeners[event].add(fn);
  }

  #emit(event: Event): void {
    for (const fn of this.#listeners[event]) fn();
  }
}
