/**
 * Built-in art kits and the body-size blend between the two extremes.
 */
import frontKitJson from './kits/front.json' with { type: 'json' };
import sideKitJson from './kits/side.json' with { type: 'json' };
import threeQuarterKitJson from './kits/three-quarter.json' with { type: 'json' };
import { lerpPoint, lerpSubpath } from './geometry.js';
import type { ArtKit, KitPart, Point, Subpath } from './types.js';

export const KITS: Readonly<Record<string, ArtKit>> = {
  front: frontKitJson as unknown as ArtKit,
  'three-quarter': threeQuarterKitJson as unknown as ArtKit,
  side: sideKitJson as unknown as ArtKit,
};

/** Views with art, in the order offered to people. */
export const VIEWS = ['front', 'three-quarter', 'side'] as const;

export function getKit(view = 'front'): ArtKit {
  const kit = KITS[view];
  if (!kit) throw new Error(`No art for view "${view}". Available: ${Object.keys(KITS).join(', ')}`);
  return kit;
}

export interface MorphedPart {
  part: KitPart;
  shapes: Subpath[];
}

export interface MorphedFigure {
  parts: MorphedPart[];
  pivots: Record<string, Point>;
}

/** Blend the slim (0) and broad (1) extremes. */
export function morph(kit: ArtKit, body: number): MorphedFigure {
  const t = Math.min(1, Math.max(0, body));
  const parts = kit.parts.map((part) => ({
    part,
    shapes: part.shapes.low.map((low, i) => lerpSubpath(low, part.shapes.high[i]!, t)),
  }));
  const pivots: Record<string, Point> = {};
  for (const [name, p] of Object.entries(kit.pivots)) pivots[name] = lerpPoint(p.low, p.high, t);
  return { parts, pivots };
}
