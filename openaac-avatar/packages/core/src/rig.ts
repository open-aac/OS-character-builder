/**
 * The skeleton: which joints exist, how they chain together, how far they
 * may bend, and which art parts each joint moves.
 *
 * Parts are assigned by name, so new art (a long sleeve, a hat, a shoe)
 * attaches to the right joint without code changes as long as it follows
 * the naming rules in docs/art-authoring.md.
 */
import type { GarmentSlot, ArtKit } from './types.js';

export type Side = 'L' | 'R';

export interface JointDef {
  id: string;
  /** Pivot name in the art (without `pivot_`). */
  pivot: string;
  parent: string | null;
  side: Side | null;
  /** Allowed angle range in degrees, relative to the rest pose. Positive = up / away from the body. */
  limits: readonly [number, number];
  /** Child pivot that defines the limb's long axis (for foreshortening). */
  axisTo?: string;
}

/** Draw groups. A limb and the clothing on it are drawn together so the whole limb can go in front of or behind the body. */
/**
 * `trunk` is the bare torso (body skin, neck): always the back layer, so any gap
 * between garments shows clothing behind it rather than skin.
 * `torso` is the clothing on the torso.
 */
export type UnitId = 'hairBack' | 'trunk' | 'leg_L' | 'leg_R' | 'arm_L' | 'arm_R' | 'torso' | 'head';

/** `hairBack` is the hair behind the body (long hair hanging down the back): the very back layer. */
export const DEFAULT_UNIT_ORDER: readonly UnitId[] = ['hairBack', 'trunk', 'leg_L', 'leg_R', 'torso', 'arm_L', 'arm_R', 'head'];

function sideJoints(side: Side): JointDef[] {
  return [
    { id: `shoulder_${side}`, pivot: `shoulder_${side}`, parent: null, side, limits: [-95, 150], axisTo: `elbow_${side}` },
    { id: `elbow_${side}`, pivot: `elbow_${side}`, parent: `shoulder_${side}`, side, limits: [-170, 170], axisTo: `wrist_${side}` },
    { id: `wrist_${side}`, pivot: `wrist_${side}`, parent: `elbow_${side}`, side, limits: [-70, 70] },
    // Wide enough for sitting in the side and ¾ views (thigh forward).
    { id: `hip_${side}`, pivot: `hip_${side}`, parent: null, side, limits: [-90, 100], axisTo: `knee_${side}` },
    { id: `knee_${side}`, pivot: `knee_${side}`, parent: `hip_${side}`, side, limits: [-100, 100], axisTo: `ankle_${side}` },
    { id: `ankle_${side}`, pivot: `ankle_${side}`, parent: `knee_${side}`, side, limits: [-45, 45] },
  ];
}

/** Parents always come before their children. */
export const JOINTS: readonly JointDef[] = [
  { id: 'neck', pivot: 'neck', parent: null, side: null, limits: [-25, 25] },
  ...sideJoints('R'),
  ...sideJoints('L'),
];

export const JOINT_IDS = JOINTS.map((j) => j.id);

export const JOINT_BY_ID: ReadonlyMap<string, JointDef> = new Map(JOINTS.map((j) => [j.id, j]));

/** Allowed foreshortening range (length multiplier along the limb). */
export const SCALE_LIMITS: readonly [number, number] = [0.2, 1.5];

/* ------------------------------------------------------------------ */
/* Part → joint rules                                                   */
/* ------------------------------------------------------------------ */

const HEAD_PART = /^(head|hair|expression|ear(_[LR])?|nose|mouth|eye|eyebrow|eyelash|hat|cap|glasses|beard|moustache|mustache|headwear|hood)(_|$)/;

const RULES: readonly [RegExp, (m: RegExpExecArray) => string][] = [
  [/(?:^|_)arm_([LR])_upper$/, (m) => `shoulder_${m[1]}`],
  [/(?:^|_)arm_([LR])_lower$/, (m) => `elbow_${m[1]}`],
  // Hand pieces: hand, palm, thumb, fingers (e.g. arm_R_palm_index), cuff.
  [/(?:^|_)arm_([LR])_(?:hand|palm|thumb|fingers?|cuff)(?:_[a-z]+)*$/, (m) => `wrist_${m[1]}`],
  [/^(?:glove|hand)_([LR])(_|$)/, (m) => `wrist_${m[1]}`],
  [/(?:^|_)leg_([LR])_upper$/, (m) => `hip_${m[1]}`],
  [/(?:^|_)leg_([LR])_lower$/, (m) => `knee_${m[1]}`],
  [/(?:^|_)leg_([LR])_(foot|shoe|sock)$/, (m) => `ankle_${m[1]}`],
  [/^(?:shoe|foot|sock)_([LR])(_|$)/, (m) => `ankle_${m[1]}`],
];

/**
 * Alternative art is named `<part>@<variant>`, e.g. `arm_R_palm@grip` or
 * `leg_L_upper@sit`. Variants on the same joint are alternative sets: a pose
 * picks one (e.g. `grip`), otherwise the `open` set is drawn if there is one.
 * A variant part also replaces the plain part with the same name.
 */
export function splitVariant(partId: string): { base: string; variant: string | null } {
  const i = partId.indexOf('@');
  return i < 0 ? { base: partId, variant: null } : { base: partId.slice(0, i), variant: partId.slice(i + 1) };
}

/** Which joint moves a part. `null` means the torso (it never rotates). */
export function jointForPart(id: string): string | null {
  const partId = splitVariant(id).base;
  for (const [re, to] of RULES) {
    const m = re.exec(partId);
    if (m) return to(m);
  }
  if (HEAD_PART.test(partId)) return 'neck';
  return null;
}

/** Bare-torso parts (skin, neck) that sit behind everything else. */
const TRUNK_PART = /^(body|torso|neck)(_|$)/;

export function unitForPart(partId: string, jointId: string | null): UnitId {
  if (!jointId && TRUNK_PART.test(splitVariant(partId).base)) return 'trunk';
  return unitForJoint(jointId);
}

export function unitForJoint(jointId: string | null): UnitId {
  if (!jointId) return 'torso';
  if (jointId === 'neck') return 'head';
  const side = jointId.slice(-1) as Side;
  return /^(shoulder|elbow|wrist)_/.test(jointId) ? (`arm_${side}` as UnitId) : (`leg_${side}` as UnitId);
}

/* ------------------------------------------------------------------ */
/* Kit validation against the rig                                       */
/* ------------------------------------------------------------------ */

export interface KitIssue {
  severity: 'error' | 'warning' | 'info';
  part?: string;
  message: string;
}

const KNOWN_TORSO = /^(body|torso|neck|(shirt|pants|top|skirt|dress)(_[a-z]+_[a-z]+)?_body|pants_seat|skirt|dress|belt)/;

export function validateKit(kit: ArtKit): KitIssue[] {
  const issues: KitIssue[] = [];
  // A view may show only one side (side view); a joint's pivot is required when some part moves with it.
  const used = new Set(kit.parts.map((p) => jointForPart(p.id)).filter((j): j is string => !!j));
  for (const j of JOINTS) {
    if (kit.pivots[j.pivot]) continue;
    if (used.has(j.id)) issues.push({ severity: 'error', message: `pivot_${j.pivot} is missing (needed for the ${j.id} joint)` });
    else if (j.id === 'neck') issues.push({ severity: 'warning', message: 'pivot_neck is missing, so the head cannot tilt' });
  }
  for (const name of Object.keys(kit.pivots)) {
    if (!JOINTS.some((j) => j.pivot === name)) issues.push({ severity: 'info', message: `pivot_${name} isn't used by the skeleton` });
  }
  for (const p of kit.parts) {
    const joint = jointForPart(p.id);
    const { base } = splitVariant(p.id);
    if (!joint && !KNOWN_TORSO.test(base)) {
      issues.push({ severity: 'warning', part: p.id, message: "name doesn't match a body segment, so it's fixed to the torso" });
    }
  }
  return issues;
}

/* ------------------------------------------------------------------ */
/* Clothing                                                             */
/* ------------------------------------------------------------------ */

const GARMENT_PART = /^(shirt|top|dress|jacket|coat|pants|shorts|trousers|skirt|leggings)_([a-z]+_[a-z]+)_(body|arm|leg|seat)(?=_|$)/;
const TOP_KIND = /^(shirt|top|dress|jacket|coat)$/;

/**
 * The garment a part belongs to, from its name: `shirt_tight_long_arm_R_lower` is
 * the `tight_long` style in the `top` slot. Plain names (`shirt_body`) belong to
 * no particular style.
 */
export function garmentOf(partId: string): { slot: GarmentSlot; style: string; kind: string } | null {
  const m = GARMENT_PART.exec(splitVariant(partId).base);
  if (!m) return null;
  return { slot: TOP_KIND.test(m[1]!) ? 'top' : 'bottom', style: m[2]!, kind: m[1]! };
}

const HAIR_PART = /^hair_([a-z]+_[a-z]+)_([a-zA-Z0-9_]+)$/;
const EXPRESSION_PART = /^expression_([a-z]+)_([a-zA-Z0-9_]+)$/;

/**
 * The hair style a part belongs to, from its name: `hair_long_straight_back` is the
 * `long_straight` style. Plain names (`hair`) belong to no particular style.
 */
export function hairOf(partId: string): { style: string; piece: string } | null {
  const m = HAIR_PART.exec(splitVariant(partId).base);
  return m ? { style: m[1]!, piece: m[2]! } : null;
}

/** The facial expression a part belongs to: `expression_surprised_eye_L_fill` is `surprised`. */
export function expressionOf(partId: string): { name: string; piece: string } | null {
  const m = EXPRESSION_PART.exec(splitVariant(partId).base);
  return m ? { name: m[1]!, piece: m[2]! } : null;
}

/** Hair hanging behind the body, as opposed to the part of the style drawn over the head. */
export function isBackHair(partId: string): boolean {
  return hairOf(partId)?.piece === 'back';
}

/** A garment part's name without its style: `pants_tight_short_leg_L_upper` → `pants_leg_L_upper`. */
export function genericName(partId: string): string {
  const { base } = splitVariant(partId);
  const g = garmentOf(base);
  return g ? base.replace(`${g.kind}_${g.style}_`, `${g.kind}_`) : base;
}
