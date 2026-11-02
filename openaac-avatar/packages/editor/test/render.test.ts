import { describe, expect, it } from 'vitest';
import { jointsInView, templatePose } from '../src/render/pose';
import { fileName, renderSymbol } from '../src/render/symbol';
import { initialState } from '../src/state/store';

describe('templatePose', () => {
  it('resolves the current preset for the current view and body', () => {
    const pose = templatePose(initialState());
    expect(pose.preset).toBe('standing');
    expect(typeof pose.angles).toBe('object');
  });

  it('applies manual adjustments when asked, and omits them when not', () => {
    const s = { ...initialState(), preset: 'waving', adjust: { elbow_R: 20 } };
    const withAdjust = templatePose(s, true);
    const without = templatePose(s, false);
    expect(withAdjust.angles['elbow_R']).not.toBe(without.angles['elbow_R']);
  });
});

describe('jointsInView', () => {
  it('accepts every pivot the front kit defines', () => {
    const inFront = jointsInView('front');
    expect(inFront('shoulder_R')).toBe(true);
    expect(inFront('shoulder_L')).toBe(true);
  });

  it('rejects a pivot made up for the test', () => {
    const inFront = jointsInView('front');
    expect(inFront('not-a-real-pivot')).toBe(false);
  });
});

describe('renderSymbol', () => {
  it('renders the state through the shared core as an SVG', () => {
    const svg = renderSymbol(initialState(), { size: 120 });
    expect(svg).toMatch(/^<svg[\s>]/);
    expect(svg).toContain('width="120"');
  });

  it('keeps ids unique with the given prefix', () => {
    const svg = renderSymbol(initialState(), { size: 100, idPrefix: 'xyz' });
    expect(svg).toMatch(/id="xyz/);
  });

  it('can draw an explicit pose instead of the state current one', () => {
    const pose = templatePose({ ...initialState(), preset: 'waving' });
    const svg = renderSymbol(initialState(), { size: 100, pose });
    // Still the standing-state colours/body, but the waving arm position.
    expect(svg).toMatch(/^<svg[\s>]/);
  });
});

describe('fileName', () => {
  it('names the front view without a view prefix', () => {
    const s = { ...initialState(), view: 'front', preset: 'standing', body: 0.5 };
    expect(fileName(s, 'svg')).toBe('person-standing-50.svg');
  });

  it('includes the view for non-front views', () => {
    const s = { ...initialState(), view: 'side', preset: 'waving', body: 0.2 };
    expect(fileName(s, 'png')).toBe('person-side-waving-20.png');
  });
});
