/**
 * Editor state and the small store that holds it.
 *
 * The state maps one-to-one onto a core render request, so whatever the
 * editor shows can be saved, sent to the CLI or the HTTP API, and loaded back.
 */
import { DEFAULT_COLORS, getKit, kitGarments, normalizeRequest, shownLook, type ColorRole, type Framing, type GarmentSlot, type RenderRequest } from '@openaac-avatar/core';

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
  /** Hair style from the art, or `none`. Empty if the art has no hair styles. */
  hair: string;
  /** Facial expression from the art. Empty if the art has no expressions. */
  expression: string;
  framing: Framing;
  size: number;
  background: string | null;
}

/** The first garment style the front art offers in each slot. */
export function defaultClothing(): Record<GarmentSlot, string> {
  const g = kitGarments(getKit('front'));
  return { top: g.top[0] ?? '', bottom: g.bottom[0] ?? '' };
}

/** The hair style and expression the front art draws unless asked otherwise. */
export function defaultLook(): { hair: string; expression: string } {
  const { hair = '', expression = '' } = shownLook(getKit('front'));
  return { hair, expression };
}

export const initialState = (): EditorState => ({
  view: 'front',
  preset: 'standing',
  adjust: {},
  body: 0.5,
  colors: { ...DEFAULT_COLORS },
  lineWeight: 1,
  clothing: defaultClothing(),
  ...defaultLook(),
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
    avatar: { body: round(s.body), colors: { ...s.colors }, lineWeight: round(s.lineWeight), clothing, ...(s.hair ? { hair: s.hair } : {}), ...(s.expression ? { expression: s.expression } : {}) },
    options: { framing: s.framing, size: s.size, ...(s.background ? { background: s.background } : {}) },
  };
}

/** Line weight range offered in the editor. */
export const LINE_WEIGHT = [0.75, 1] as const;

/** Validates through the core (throws RequestError), so anything loaded here also renders on the server. */
export function fromRequest(r: RenderRequest): EditorState {
  const n = normalizeRequest(r);
  shownLook(getKit(n.view), n.avatar);
  return {
    view: n.view,
    preset: n.pose.preset,
    adjust: { ...n.pose.adjust },
    body: n.avatar.body,
    colors: { ...n.avatar.colors },
    lineWeight: Math.min(LINE_WEIGHT[1], Math.max(LINE_WEIGHT[0], n.avatar.lineWeight)),
    clothing: { ...defaultClothing(), ...n.avatar.clothing },
    hair: n.avatar.hair ?? defaultLook().hair,
    expression: n.avatar.expression ?? defaultLook().expression,
    framing: n.options.framing,
    size: n.options.size,
    background: n.options.background,
  };
}

/** `change` fires on every edit (redraw the preview); `rebuild` when the controls themselves must be redrawn. */
type Event = 'change' | 'rebuild';

/** Which sub-view the Pose panel shows: a limb picked to fine-tune, after choosing a template. */
export interface PoseView {
  limb: string;
}

/** The tabs of the Look panel. */
export type LookTab = 'face' | 'clothing' | 'colours';

export class Store {
  #state: EditorState;
  #listeners: Record<Event, Set<() => void>> = { change: new Set(), rebuild: new Set() };
  /**
   * The Pose panel's current sub-view (template gallery when `null`, otherwise a limb's preset
   * view). This is UI-only navigation state, not part of a render request, so it lives here
   * rather than in `EditorState` (which maps 1:1 onto `RenderRequest` and is round-tripped/saved).
   */
  poseView: PoseView | null = null;

  /** The Look panel's selected tab. UI-only, like `poseView`. */
  lookTab: LookTab = 'clothing';

  /** The large preview is zoomed in on the head (Hair/Face tab open). It does not change the export framing. */
  headZoom = false;

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
    this.poseView = null;
    this.#emit('change');
    this.#emit('rebuild');
  }

  /** Enter or leave the Pose panel's limb-preset view, and rebuild the controls to show it. */
  setPoseView(view: PoseView | null): void {
    this.poseView = view;
    this.#emit('rebuild');
  }

  /** Zoom the preview in on the head, or back out; redraws the preview only when this changes. */
  setHeadZoom(on: boolean): void {
    if (on === this.headZoom) return;
    this.headZoom = on;
    this.#emit('change');
  }

  on(event: Event, fn: () => void): void {
    this.#listeners[event].add(fn);
  }

  #emit(event: Event): void {
    for (const fn of this.#listeners[event]) fn();
  }
}
