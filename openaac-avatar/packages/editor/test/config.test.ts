import { COLOR_ROLES, FRAMINGS, VIEWS } from '@openaac-avatar/core';
import { describe, expect, it } from 'vitest';
import { COLOR_LABELS, FRAMING_LABELS, GARMENT_LABELS, VIEW_LABELS, styleLabel } from '../src/config/labels';
import { SWATCHES } from '../src/config/swatches';

const HEX = /^#[0-9a-f]{6}$/i;

describe('COLOR_LABELS', () => {
  it('names every colour role the core defines', () => {
    for (const role of COLOR_ROLES) expect(COLOR_LABELS[role], role).toBeTruthy();
  });
});

describe('FRAMING_LABELS', () => {
  it('names every framing the core offers', () => {
    for (const f of FRAMINGS) expect(FRAMING_LABELS[f], f).toBeTruthy();
  });
});

describe('VIEW_LABELS', () => {
  it('names every view the core offers', () => {
    for (const v of VIEWS) expect(VIEW_LABELS[v], v).toBeTruthy();
  });
});

describe('SWATCHES', () => {
  it('only offers valid, non-empty, unique hex colours per role', () => {
    for (const [role, colours] of Object.entries(SWATCHES)) {
      expect(colours!.length, role).toBeGreaterThan(0);
      for (const c of colours!) expect(c, `${role}: ${c}`).toMatch(HEX);
      expect(new Set(colours), role).toEqual(new Set(colours));
      expect(new Set(colours).size, `${role} has a duplicate`).toBe(colours!.length);
    }
  });

  it('only offers swatches for roles the editor actually has colour labels for', () => {
    for (const role of Object.keys(SWATCHES)) expect(COLOR_ROLES).toContain(role);
  });
});

describe('GARMENT_LABELS', () => {
  it('has a readable name for every documented style, in both slots', () => {
    for (const slot of ['top', 'bottom'] as const) {
      for (const style of Object.keys(GARMENT_LABELS[slot])) expect(GARMENT_LABELS[slot][style]).toBeTruthy();
    }
  });
});

describe('styleLabel', () => {
  it('turns an id into a sentence-cased, comma-joined label', () => {
    expect(styleLabel('loose_long')).toBe('Loose, long');
    expect(styleLabel('tight_short')).toBe('Tight, short');
  });
});
