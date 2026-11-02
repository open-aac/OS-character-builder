/**
 * Template poses.
 *
 * Angles are degrees relative to the rest pose in the art (front: arms out,
 * legs straight; ¾ and side: arms hanging). Each template is written for the
 * front view; `views` gives its pose in the other views, where it is offered. Positive = up / away from the body, on both sides, so the
 * same number on L and R gives a mirror-image pose. R is the figure's
 * right, which is on the viewer's left.
 *
 * A value can be `{ low, high }` when the pose needs to differ with body
 * size (e.g. arms rest further out on a broader body); it is blended with
 * the body slider like the art itself.
 */
import type { UnitId } from './rig.js';

export type PoseValue = number | { low: number; high: number };

export interface VariantRule {
  fallback?: {
    angles?: Partial<Record<string, PoseValue>>;
    scales?: Partial<Record<string, PoseValue>>;
  };
  lock?: readonly string[];
}

/**
 * A template's pose for another view. Angles there are relative to that
 * view's drawn rest pose (arms hanging, for ¾ and side). `order` left out
 * keeps the designer's layer order, which already puts far limbs behind.
 */
export interface ViewPose {
  angles: Partial<Record<string, PoseValue>>;
  scales?: Partial<Record<string, PoseValue>>;
  order?: readonly UnitId[];
  onTop?: readonly string[];
  variants?: readonly string[];
  variantRules?: Partial<Record<string, VariantRule>>;
  airborne?: boolean;
  /** Sitting without seated art: the torso is cut off flat where the thighs leave it (the seat). */
  seated?: boolean;
}

export interface PosePreset {
  id: string;
  label: string;
  description: string;
  angles: Partial<Record<string, PoseValue>>;
  /** Limb length multipliers for foreshortening (keyed by joint id). */
  scales?: Partial<Record<string, PoseValue>>;
  /** Draw order of body units, back to front. Default: legs, torso, arms, head. */
  order?: readonly UnitId[];
  /**
   * Joints whose parts are drawn on top of everything else, e.g. a forearm
   * and hand reaching towards the viewer in front of the body or face.
   */
  onTop?: readonly string[];
  /**
   * Alternative art to use, by variant name. `grip` switches every
   * `…@grip` part on; `grip_R` only those on the figure's right.
   */
  variants?: readonly string[];
  /**
   * Per variant: `fallback` settings used while its art doesn't exist yet, and
   * joints to `lock` once it does (the art is already drawn in that pose).
   */
  variantRules?: Partial<Record<string, VariantRule>>;
  /** How far (±degrees) each joint may be adjusted from the template. Default 30. */
  adjustRange?: number;
  /** The figure is off the ground (e.g. jumping); previews can show it lifted. */
  airborne?: boolean;
  /** The same template in other views (the fields above are the front view). Missing: not offered there. */
  views?: Partial<Record<string, ViewPose>>;
}

/** Arms hanging relaxed at the sides; further out on a broader body so they clear the torso. */
const ARMS_DOWN = {
  shoulder: { low: -64, high: -42 },
  elbow: { low: 6, high: 2 },
  // Hands hang closer to vertical than the forearm.
  wrist: -14,
};

/**
 * Sitting from the front: thighs point at the viewer, so they are drawn
 * foreshortened and the knees a little apart. Uses `…@sit` thigh art when
 * the designer provides it.
 */
const SIT_LEGS = {
  hip_R: 10,
  hip_L: 10,
  knee_R: -10,
  knee_L: -10,
};

const SIT_SCALES = { hip_R: 0.2, hip_L: 0.2 };

/**
 * Raised arms are drawn behind the torso, so the shirt's shoulder covers the
 * joint and the sleeve's armpit edge can't show across the chest.
 * Hanging arms stay in front (the default order).
 */
const ARMS_BEHIND: readonly UnitId[] = ['leg_L', 'leg_R', 'arm_L', 'arm_R', 'torso', 'head'];
const RIGHT_ARM_BEHIND: readonly UnitId[] = ['leg_L', 'leg_R', 'arm_R', 'torso', 'arm_L', 'head'];

/**
 * Side view: the arm we see is the near one, so raised it is drawn in front of the head, not behind it.
 * The shoulder sits under the face here, so raised arms go up and forward to keep the face clear.
 */
const NEAR_ARM_FRONT = ['shoulder_L', 'elbow_L', 'wrist_L'];

/** Hands resting on the lap. */
const SIT_ARM = {
  shoulder: { low: -60, high: -40 },
  elbow: { low: -25, high: -30 },
};

/** Until there is gripping-hand art, the open hand is shortened so the fingers read as curled. */
const CURLED_R = { wrist_R: 0.55 };
const CURLED_L = { wrist_L: 0.55 };

/**
 * Hands resting on the knees: drawn as `…@rest` by the designer when available,
 * otherwise the open hand is shortened so the fingers read as draped over the knee.
 */
const REST_RULE_BOTH: VariantRule = { fallback: { scales: { wrist_R: 0.6, wrist_L: 0.6 } } };
const REST_RULE_L: VariantRule = { fallback: { scales: { wrist_L: 0.6 } } };

/** Sitting legs: drawn as such by the designer (`…@sit`), or faked from the standing legs. */
/**
 * Sitting in the ¾ and side views, posed from the standing legs (no seated art there yet).
 * Side: thigh straight forward, shin straight down. ¾: the thighs point forward towards
 * the side the figure faces, shortened since they also come towards the viewer.
 */
const SIDE_SIT_LEGS = { hip_L: 90, knee_L: -90 };
/**
 * The standing art's legs are short for their width on a broad body (a thigh thicker than the shin is
 * long), so sitting with them as drawn reads as kneeling. Thigh and shin are lengthened to sit on a chair.
 */
const SIDE_SIT_SCALES = { hip_L: { low: 1.15, high: 1.3 }, knee_L: { low: 1.2, high: 1.35 } };
const QUARTER_SIT_LEGS = { hip_R: 85, knee_R: -85, hip_L: -85, knee_L: 85 };
/** ¾ sitting: hands resting on the thighs. */
const Q_SIT_ARM_R = { shoulder: 10, elbow: -10 };
const Q_SIT_ARM_L = { shoulder: -25, elbow: -40 };
const QUARTER_SIT_SCALES = { hip_R: 0.7, hip_L: 0.7, knee_R: { low: 1, high: 1.15 }, knee_L: { low: 1, high: 1.15 } };

/** ¾ sitting: the seated legs (`…@sit`, stand-ins traced from a reference by scripts/make-quarter-sit.py), or the standing legs posed if they're missing. */
const QUARTER_SIT_RULE: VariantRule = {
  fallback: { angles: QUARTER_SIT_LEGS, scales: QUARTER_SIT_SCALES },
  lock: ['hip_R', 'hip_L', 'knee_R', 'knee_L', 'ankle_R', 'ankle_L'],
};

const SIT_RULE: VariantRule = {
  fallback: { angles: SIT_LEGS, scales: SIT_SCALES },
  lock: ['hip_R', 'hip_L', 'knee_R', 'knee_L', 'ankle_R', 'ankle_L'],
};

export const PRESETS: readonly PosePreset[] = [
  {
    id: 'standing',
    label: 'Standing',
    description: 'Standing straight, arms relaxed at the sides.',
    angles: {
      shoulder_R: ARMS_DOWN.shoulder,
      shoulder_L: ARMS_DOWN.shoulder,
      elbow_R: ARMS_DOWN.elbow,
      elbow_L: ARMS_DOWN.elbow,
      wrist_R: ARMS_DOWN.wrist,
      wrist_L: ARMS_DOWN.wrist,
    },
    // Hands seen from the side, thumb forward.
    variants: ['relaxed'],
    views: { 'three-quarter': { angles: {} }, side: { angles: {} } },
  },
  {
    id: 'waving',
    label: 'Waving',
    description: 'Right hand raised in a wave, left arm relaxed.',
    angles: {
      shoulder_R: 12,
      elbow_R: 95,
      wrist_R: 10,
      shoulder_L: ARMS_DOWN.shoulder,
      elbow_L: ARMS_DOWN.elbow,
      wrist_L: ARMS_DOWN.wrist,
      neck: -4,
    },
    variants: ['relaxed_L'],
    order: RIGHT_ARM_BEHIND,
    views: {
      'three-quarter': { angles: { shoulder_R: 70, elbow_R: 85, wrist_R: 5 } },
      side: { angles: { shoulder_R: 60, elbow_R: 90, wrist_R: 25 }, variants: ['wave_R'] },
    },
  },
  {
    id: 'reaching',
    label: 'Reaching for an object',
    description: 'Right arm stretched up and out towards something.',
    angles: {
      shoulder_R: 48,
      elbow_R: 6,
      wrist_R: 8,
      shoulder_L: ARMS_DOWN.shoulder,
      elbow_L: ARMS_DOWN.elbow,
      wrist_L: ARMS_DOWN.wrist,
      neck: -6,
    },
    variants: ['relaxed_L'],
    order: RIGHT_ARM_BEHIND,
    views: {
      'three-quarter': { angles: { shoulder_R: 110, elbow_R: 5, neck: -5 } },
      side: { angles: { shoulder_L: 120, elbow_L: 4 }, onTop: NEAR_ARM_FRONT },
    },
  },
  {
    id: 'holding',
    label: 'Holding an object',
    description: 'Both hands in front of the waist, side by side, holding something.',
    angles: {
      shoulder_R: { low: -62, high: -44 },
      shoulder_L: { low: -62, high: -44 },
      // Fists side by side with a gap between them; less bend on a slim body,
      // where the shoulders are closer together.
      elbow_R: { low: -34, high: -70 },
      elbow_L: { low: -34, high: -70 },
      wrist_R: 25,
      wrist_L: 25,
    },
    // Forearms come towards the viewer a little.
    scales: { elbow_R: 0.8, elbow_L: 0.8 },
    onTop: ['elbow_R', 'wrist_R', 'elbow_L', 'wrist_L'],
    variants: ['grip'],
    variantRules: { grip: { fallback: { scales: { ...CURLED_R, ...CURLED_L } } } },
    views: {
      // Forearm straight out in front.
      side: { angles: { shoulder_L: 12, elbow_L: 80, wrist_L: -10 } },
    },
  },
  {
    id: 'sitting',
    label: 'Sitting',
    description: 'Sitting facing forward, hands resting on the lap.',
    angles: {
      shoulder_R: SIT_ARM.shoulder,
      shoulder_L: SIT_ARM.shoulder,
      elbow_R: SIT_ARM.elbow,
      elbow_L: SIT_ARM.elbow,
    },
    variants: ['sit', 'rest'],
    variantRules: { sit: SIT_RULE, rest: REST_RULE_BOTH },
    views: {
      // Hands resting on the thighs.
      'three-quarter': { angles: { shoulder_R: Q_SIT_ARM_R.shoulder, elbow_R: Q_SIT_ARM_R.elbow, shoulder_L: Q_SIT_ARM_L.shoulder, elbow_L: Q_SIT_ARM_L.elbow }, variants: ['sit'], variantRules: { sit: QUARTER_SIT_RULE } },
      side: { angles: { ...SIDE_SIT_LEGS, shoulder_L: 15, elbow_L: 40 }, scales: SIDE_SIT_SCALES, seated: true },
    },
  },
  {
    id: 'sitting-utensil',
    label: 'Sitting with a utensil',
    description: 'Sitting, right hand brought up to the mouth as if eating with a spoon or fork.',
    angles: {
      // Elbow in front of the body, forearm up to the mouth.
      shoulder_R: -80,
      elbow_R: -150,
      wrist_R: -15,
      shoulder_L: SIT_ARM.shoulder,
      elbow_L: SIT_ARM.elbow,
    },
    scales: { elbow_R: { low: 0.8, high: 0.9 } },
    onTop: ['elbow_R', 'wrist_R'],
    variants: ['sit', 'grip_R', 'rest_L'],
    variantRules: { sit: SIT_RULE, grip_R: { fallback: { scales: CURLED_R } }, rest_L: REST_RULE_L },
    views: {
      // The near arm (the figure's left) brings the hand to the mouth, so it isn't hidden behind the body;
      // the far arm rests on the lap.
      'three-quarter': { angles: { shoulder_R: Q_SIT_ARM_R.shoulder, elbow_R: Q_SIT_ARM_R.elbow, shoulder_L: { low: -53, high: -35 }, elbow_L: -95 }, variants: ['sit', 'grip_L'], variantRules: { sit: QUARTER_SIT_RULE, grip_L: { fallback: { scales: CURLED_L } } } },
      side: { angles: { ...SIDE_SIT_LEGS, shoulder_L: 25, elbow_L: 80, wrist_L: 10, shoulder_R: 15, elbow_R: 40 }, scales: SIDE_SIT_SCALES, onTop: NEAR_ARM_FRONT, seated: true, variants: ['grip_L'], variantRules: { grip_L: { fallback: { scales: CURLED_L } } } },
    },
  },
  {
    id: 'pointing',
    label: 'Pointing',
    description: 'Right arm straight out to the side, pointing at something.',
    angles: {
      shoulder_R: 20,
      elbow_R: 8,
      wrist_R: 0,
      shoulder_L: ARMS_DOWN.shoulder,
      elbow_L: ARMS_DOWN.elbow,
      wrist_L: ARMS_DOWN.wrist,
      neck: -8,
    },
    variants: ['point_R', 'relaxed_L'],
    order: RIGHT_ARM_BEHIND,
    views: {
      'three-quarter': { angles: { shoulder_R: 65, elbow_R: 5 } },
      side: { angles: { shoulder_L: 85, elbow_L: 3 } },
    },
  },
  {
    id: 'jumping',
    label: 'Jumping',
    description: 'A star jump: arms and legs spread wide, off the ground.',
    angles: {
      shoulder_R: 58,
      shoulder_L: 58,
      elbow_R: 10,
      elbow_L: 10,
      wrist_R: 8,
      wrist_L: 8,
      hip_R: 24,
      hip_L: 24,
      knee_R: -4,
      knee_L: -4,
      ankle_R: 12,
      ankle_L: 12,
    },
    airborne: true,
    order: ARMS_BEHIND,
    views: {
      'three-quarter': {
        angles: { shoulder_R: 105, shoulder_L: 105, elbow_R: 10, elbow_L: 10, hip_R: 18, hip_L: 18, knee_R: -6, knee_L: -6 },
        airborne: true,
      },
      // From the side: arms up, legs nearly straight with the toes pointed (the side legs aren't drawn to bend far).
      side: { angles: { shoulder_L: 120, elbow_L: 20, hip_L: 8, knee_L: -12, ankle_L: -25 }, airborne: true, onTop: NEAR_ARM_FRONT },
    },
  },
  {
    id: 'cheering',
    label: 'Cheering',
    description: 'Both arms raised in a V, celebrating.',
    angles: {
      shoulder_R: 72,
      shoulder_L: 72,
      elbow_R: 12,
      elbow_L: 12,
      wrist_R: 8,
      wrist_L: 8,
      neck: 0,
    },
    order: ARMS_BEHIND,
    views: {
      'three-quarter': { angles: { shoulder_R: 125, shoulder_L: 125, elbow_R: 12, elbow_L: 12 } },
      side: { angles: { shoulder_L: 115, elbow_L: 30 }, onTop: NEAR_ARM_FRONT },
    },
  },
];

export const PRESET_BY_ID: ReadonlyMap<string, PosePreset> = new Map(PRESETS.map((p) => [p.id, p]));

/** The template as posed in a view, or undefined if it isn't offered there yet. */
export function presetForView(preset: PosePreset, view: string): ViewPose | undefined {
  return view === 'front' ? preset : preset.views?.[view];
}

/** Templates offered in a view. */
export function presetsForView(view: string): PosePreset[] {
  return PRESETS.filter((p) => presetForView(p, view));
}

export const DEFAULT_PRESET = 'standing';
