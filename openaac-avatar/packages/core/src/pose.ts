/**
 * Turns a template pose plus user adjustments into joint angles, then into
 * one transform matrix per joint (forward kinematics).
 */
import { IDENTITY, about, lerp, multiply, rotate, scaleAlong, translate, type Matrix } from './geometry.js';
import { DEFAULT_PRESET, PRESET_BY_ID, presetForView, presetsForView, type PoseValue } from './presets.js';
import { RequestError } from './request.js';
import { DEFAULT_UNIT_ORDER, JOINTS, JOINT_BY_ID, SCALE_LIMITS, type UnitId } from './rig.js';
import type { Point, PoseInput } from './types.js';

export interface ResolvedPose {
  preset: string;
  /** Final joint angles in degrees (after adjustment and limits). */
  angles: Record<string, number>;
  scales: Record<string, number>;
  order: readonly UnitId[];
  onTop: readonly string[];
  variants: readonly string[];
  /** Joints this pose doesn't allow adjusting (their art is drawn already posed). */
  locked: readonly string[];
  /** Off the ground (jumping). */
  airborne: boolean;
  /** Posed sitting from standing art: the torso is cut flat at the seat (see `seatCut`). */
  seated?: boolean;
}

export const DEFAULT_ADJUST_RANGE = 30;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function valueAt(v: PoseValue | undefined, body: number, dflt: number): number {
  if (v === undefined) return dflt;
  return typeof v === 'number' ? v : lerp(v.low, v.high, body);
}

/** Variant name without a side suffix: `grip_R` → `grip`. */
export const variantBase = (v: string) => v.replace(/_[LR]$/, '');

/**
 * Resolve a pose for a given body size (0..1).
 * Adjustments are clamped to the template's range, then to each joint's natural limits.
 * `availableVariants` lists the variant art the kit has; templates fall back to
 * their workaround settings for anything missing.
 */
export function resolvePose(
  input: PoseInput | undefined,
  body: number,
  availableVariants: ReadonlySet<string> = new Set(),
  view = 'front',
): ResolvedPose {
  const presetId = input?.preset ?? DEFAULT_PRESET;
  const template = PRESET_BY_ID.get(presetId);
  if (!template) throw new Error(`Unknown pose preset "${presetId}"`);
  const preset = presetForView(template, view);
  if (!preset) {
    const offered = presetsForView(view).map((p) => p.id);
    throw new RequestError([`pose.preset "${presetId}" isn't available in the ${view} view yet (use ${offered.join(', ')})`]);
  }
  const range = template.adjustRange ?? DEFAULT_ADJUST_RANGE;

  const variants = preset.variants ?? [];
  const angleValues = { ...preset.angles };
  // The side view's far arm stays hidden behind the near one unless the template moves it.
  if (view === 'side' && !['shoulder', 'elbow', 'wrist'].some((j) => `${j}_R` in angleValues)) {
    for (const j of ['shoulder', 'elbow', 'wrist']) if (`${j}_L` in angleValues) angleValues[`${j}_R`] = angleValues[`${j}_L`]!;
  }
  const scaleValues = { ...preset.scales };
  const locked = new Set<string>();
  for (const v of variants) {
    const rule = preset.variantRules?.[v];
    if (!rule) continue;
    if (availableVariants.has(variantBase(v))) {
      for (const j of rule.lock ?? []) locked.add(j);
    } else {
      Object.assign(angleValues, rule.fallback?.angles);
      Object.assign(scaleValues, rule.fallback?.scales);
    }
  }

  const angles: Record<string, number> = {};
  const scales: Record<string, number> = {};
  for (const j of JOINTS) {
    const base = valueAt(angleValues[j.id], body, 0);
    const adj = locked.has(j.id) ? 0 : clamp(input?.adjust?.[j.id] ?? 0, -range, range);
    angles[j.id] = clamp(base + adj, j.limits[0], j.limits[1]);
    scales[j.id] = clamp(valueAt(scaleValues[j.id], body, 1), SCALE_LIMITS[0], SCALE_LIMITS[1]);
  }
  // Other views keep the designer's layer order unless the template says otherwise (an empty order).
  const order = preset.order ?? (view === 'front' ? DEFAULT_UNIT_ORDER : []);
  return { preset: presetId, angles, scales, order, onTop: preset.onTop ?? [], variants, locked: [...locked], airborne: preset.airborne ?? false, ...('seated' in preset && preset.seated ? { seated: true } : {}) };
}

/**
 * One matrix per joint, mapping rest-pose coordinates to posed coordinates
 * for the parts that joint moves. `pivots` are the rest positions for the
 * current body size.
 *
 * Foreshortening squashes only the segment itself: the next joint moves to
 * the end of the shortened segment, but the limb below keeps its length.
 */
export function jointMatrices(pivots: Record<string, Point>, pose: ResolvedPose): Map<string, Matrix> {
  const segment = new Map<string, Matrix>();
  /** What a joint passes down to its children: rotation, plus the shift from foreshortening. */
  const carry = new Map<string, Matrix>();
  for (const j of JOINTS) {
    const pv = pivots[j.pivot];
    const parent = j.parent ? carry.get(j.parent) ?? IDENTITY : IDENTITY;
    if (!pv) {
      segment.set(j.id, parent);
      carry.set(j.id, parent);
      continue;
    }
    // Same number means mirror-image movement: flip the rotation for the limb of a pair that is on the
    // viewer's right. A limb drawn without its pair (side view) isn't flipped.
    const pair = j.side ? pivots[j.pivot.replace(/_([LR])$/, (_, s: string) => (s === 'L' ? '_R' : '_L'))] : undefined;
    const sign = pair && pv[0] > pair[0] ? -1 : 1;
    const rot = multiply(parent, about(pv, rotate(sign * (pose.angles[j.id] ?? 0))));
    const k = pose.scales[j.id] ?? 1;
    // Long axis: towards the child joint; for an end segment (hand, foot), the line from the parent joint.
    const to = j.axisTo ? pivots[JOINT_BY_ID.get(j.axisTo)?.pivot ?? j.axisTo] : undefined;
    const from = !to && j.parent ? pivots[JOINT_BY_ID.get(j.parent)?.pivot ?? j.parent] : undefined;
    if (k !== 1 && (to || from)) {
      const dx = to ? to[0] - pv[0] : pv[0] - from![0];
      const dy = to ? to[1] - pv[1] : pv[1] - from![1];
      const len = Math.hypot(dx, dy) || 1;
      segment.set(j.id, multiply(rot, about(pv, scaleAlong(dx / len, dy / len, k))));
      carry.set(j.id, to ? multiply(rot, translate((k - 1) * dx, (k - 1) * dy)) : rot);
    } else {
      segment.set(j.id, rot);
      carry.set(j.id, rot);
    }
  }
  return segment;
}

/**
 * Blend two resolved poses (t = 0 → a, 1 → b), for animated transitions.
 * Angles and scales blend smoothly; layering and variant art switch halfway.
 */
export function blendPoses(a: ResolvedPose, b: ResolvedPose, t: number): ResolvedPose {
  const k = Math.min(1, Math.max(0, t));
  const angles: Record<string, number> = {};
  const scales: Record<string, number> = {};
  for (const j of JOINTS) {
    angles[j.id] = lerp(a.angles[j.id] ?? 0, b.angles[j.id] ?? 0, k);
    scales[j.id] = lerp(a.scales[j.id] ?? 1, b.scales[j.id] ?? 1, k);
  }
  const pick = k < 0.5 ? a : b;
  return { ...pick, angles, scales };
}
