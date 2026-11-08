/**
 * Quick whole-limb preset positions, derived from each joint's current
 * template-relative range (see rig.ts for the joint limits). Offered as a
 * fast alternative to the per-joint "Fine adjustments" sliders.
 *
 * NOTE: the exact angle fractions and left/right tilt labels below are a
 * first proposal, not verified against the rendered art in every view —
 * check how these look once previewed and adjust the fractions/labels if
 * any combination looks awkward (e.g. in the side view).
 */
import { JOINT_BY_ID } from '@openaac-avatar/core';
import type { JOINT_GROUPS } from '../config/labels';
import type { EditorState } from '../state/store';
import { jointRange, jointsInView, templatePose } from './pose';

export interface LimbPreset {
  id: 'lowered' | 'neutral' | 'raised';
  label: string;
  /** Joint id -> adjustment angle, for every unlocked joint in the group that's visible in this view. */
  angles: Record<string, number>;
}

/** How far into each joint's available range a "lowered"/"raised" preset reaches. */
const FRACTION = 0.7;

/** Presets for one joint-group (e.g. "Right arm"). Empty if every joint in the group is fixed by the current pose. */
export function limbPresets(state: EditorState, group: (typeof JOINT_GROUPS)[number]): LimbPreset[] {
  const template = templatePose(state, false);
  const inView = jointsInView(state.view);
  const locked = new Set(template.locked);
  const isHead = group.joints.length === 1 && group.joints[0] === 'neck';

  const joints = group.joints.filter((id) => {
    const joint = JOINT_BY_ID.get(id);
    return joint && inView(joint.pivot) && !locked.has(id);
  });
  if (!joints.length) return [];

  const ranges = new Map(joints.map((id) => [id, jointRange(JOINT_BY_ID.get(id)!, template)] as const));
  const build = (pick: (min: number, max: number) => number): Record<string, number> =>
    Object.fromEntries(joints.map((id) => [id, pick(...ranges.get(id)!)]));

  const lowered = build((min) => Math.round(min * FRACTION));
  const neutral = build(() => 0);
  const raised = build((_min, max) => Math.round(max * FRACTION));

  return isHead
    ? [
        { id: 'lowered', label: 'Tilt left', angles: lowered },
        { id: 'neutral', label: 'Centre', angles: neutral },
        { id: 'raised', label: 'Tilt right', angles: raised },
      ]
    : [
        { id: 'lowered', label: 'Lowered', angles: lowered },
        { id: 'neutral', label: 'Neutral', angles: neutral },
        { id: 'raised', label: 'Raised', angles: raised },
      ];
}

/** Which preset (if any) matches the adjustments currently applied to this group's joints. */
export function matchingPreset(adjust: Record<string, number>, presets: readonly LimbPreset[]): string {
  const match = presets.find((p) => Object.entries(p.angles).every(([id, v]) => (adjust[id] ?? 0) === v));
  return match?.id ?? '';
}
