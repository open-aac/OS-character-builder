import { DEFAULT_COLORS, RequestError, getKit, kitGarments, type RenderRequest } from '@openaac-avatar/core';
import { describe, expect, it, vi } from 'vitest';
import { Store, defaultClothing, defaultLook, fromRequest, initialState, toRequest } from '../src/state/store';

describe('initialState', () => {
  it('is the figure the editor shows on first load', () => {
    const s = initialState();
    expect(s.view).toBe('front');
    expect(s.preset).toBe('standing');
    expect(s.adjust).toEqual({});
    expect(s.body).toBe(0.5);
    expect(s.colors).toEqual(DEFAULT_COLORS);
    expect(s.lineWeight).toBe(1);
    expect(s.framing).toBe('full');
    expect(s.size).toBe(500);
    expect(s.background).toBeNull();
  });

  it('picks the first garment style the front art offers, for both slots', () => {
    const g = kitGarments(getKit('front'));
    expect(defaultClothing()).toEqual({ top: g.top[0], bottom: g.bottom[0] });
    expect(initialState().clothing).toEqual(defaultClothing());
  });
});

describe('hair and expression', () => {
  it('start as the art\'s defaults', () => {
    expect(defaultLook()).toEqual({ hair: 'short_straight', expression: 'content' });
    expect(initialState()).toMatchObject(defaultLook());
  });

  it('are saved in the request and loaded back, including no hair', () => {
    const s = { ...initialState(), hair: 'none', expression: 'angry' };
    expect(toRequest(s).avatar).toMatchObject({ hair: 'none', expression: 'angry' });
    expect(fromRequest(toRequest(s))).toEqual(s);
  });

  it('fall back to the defaults when the request leaves them out', () => {
    const req: RenderRequest = { view: 'front', pose: { preset: 'standing' }, avatar: {}, options: {} };
    expect(fromRequest(req)).toMatchObject(defaultLook());
  });

  it('are rejected when the art does not have them', () => {
    expect(() => fromRequest({ avatar: { hair: 'mohawk' } })).toThrow(RequestError);
  });
});

describe('toRequest / fromRequest', () => {
  it('round-trips the initial state exactly', () => {
    expect(fromRequest(toRequest(initialState()))).toEqual(initialState());
  });

  it('round-trips a state with every field touched', () => {
    const s = {
      ...initialState(),
      view: 'side',
      preset: 'waving',
      adjust: { elbow_R: 12 },
      hands: { R: 'grip' },
      body: 0.8,
      colors: { ...DEFAULT_COLORS, skin: '#112233' },
      lineWeight: 0.9,
      framing: 'upper' as const,
      size: 240,
      background: '#ff00ff',
    };
    expect(fromRequest(toRequest(s))).toEqual(s);
  });

  it('drops zero adjustments and empty clothing from the request', () => {
    const s = { ...initialState(), adjust: { elbow_R: 0, wrist_L: 5 }, clothing: { top: '', bottom: 'tight_long' } };
    const req = toRequest(s);
    expect(req.pose!.adjust).toEqual({ wrist_L: 5 });
    expect(req.avatar!.clothing).toEqual({ bottom: 'tight_long' });
  });

  it('rounds body and line weight to two decimal places', () => {
    const s = { ...initialState(), body: 1 / 3, lineWeight: 2 / 3 };
    const req = toRequest(s);
    expect(req.avatar!.body).toBe(0.33);
    expect(req.avatar!.lineWeight).toBe(0.67);
  });

  it('fills in default clothing for slots missing from the request', () => {
    const req: RenderRequest = { view: 'front', pose: { preset: 'standing' }, avatar: {}, options: {} };
    expect(fromRequest(req).clothing).toEqual(defaultClothing());
  });

  it('clamps a loaded line weight into the editor range', () => {
    // Valid for the core (0.25-4) but outside the editor's own slider range (0.75-1).
    const req: RenderRequest = { view: 'front', pose: { preset: 'standing' }, avatar: { lineWeight: 2 }, options: {} };
    expect(fromRequest(req).lineWeight).toBe(1);
  });

  it('rejects an invalid request the same way the server would', () => {
    const bad = { view: 'front', pose: { preset: 'flying' }, avatar: {}, options: {} } as unknown as RenderRequest;
    expect(() => fromRequest(bad)).toThrow(RequestError);
  });
});

describe('Store', () => {
  it('starts with the state it was given', () => {
    const store = new Store(initialState());
    expect(store.state).toEqual(initialState());
  });

  it('update() merges the patch and always notifies change listeners', () => {
    const store = new Store(initialState());
    const onChange = vi.fn();
    store.on('change', onChange);
    store.update({ body: 0.9 });
    expect(store.state.body).toBe(0.9);
    expect(store.state.view).toBe('front'); // untouched fields survive
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('update() only notifies rebuild listeners when asked', () => {
    const store = new Store(initialState());
    const onRebuild = vi.fn();
    store.on('rebuild', onRebuild);
    store.update({ body: 0.9 });
    expect(onRebuild).not.toHaveBeenCalled();
    store.update({ preset: 'waving' }, { rebuild: true });
    expect(onRebuild).toHaveBeenCalledTimes(1);
  });

  it('replace() swaps the whole state and always notifies both events', () => {
    const store = new Store(initialState());
    const onChange = vi.fn();
    const onRebuild = vi.fn();
    store.on('change', onChange);
    store.on('rebuild', onRebuild);
    const next = { ...initialState(), view: 'side' };
    store.replace(next);
    expect(store.state).toEqual(next);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onRebuild).toHaveBeenCalledTimes(1);
  });

  it('notifies every registered listener for an event', () => {
    const store = new Store(initialState());
    const a = vi.fn();
    const b = vi.fn();
    store.on('change', a);
    store.on('change', b);
    store.update({ body: 0.1 });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('starts with no Pose-panel sub-view (the template gallery)', () => {
    const store = new Store(initialState());
    expect(store.poseView).toBeNull();
  });

  it('setPoseView() sets the sub-view and notifies rebuild listeners', () => {
    const store = new Store(initialState());
    const onRebuild = vi.fn();
    store.on('rebuild', onRebuild);
    store.setPoseView({ limb: 'Head' });
    expect(store.poseView).toEqual({ limb: 'Head' });
    expect(onRebuild).toHaveBeenCalledTimes(1);
  });

  it('replace() resets the Pose-panel sub-view back to the gallery', () => {
    const store = new Store(initialState());
    store.setPoseView({ limb: 'Head' });
    store.replace(initialState());
    expect(store.poseView).toBeNull();
  });
});
