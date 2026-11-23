/** The template pose for the editor's current settings (same rules as the renderer). */
import { availableVariants, DEFAULT_ADJUST_RANGE, getKit, resolvePose, type JointDef, type ResolvedPose } from '@openaac-avatar/core';
import type { EditorState } from '../state/store';

export function templatePose(s: EditorState, withAdjust = true): ResolvedPose {
  const kit = getKit(s.view);
  return resolvePose({ preset: s.preset, adjust: withAdjust ? s.adjust : {}, hands: s.hands }, s.body, availableVariants(kit, s.clothing), s.view);
}

/** Joints the current view's art can move (the side view shows one arm and one leg). */
export function jointsInView(view: string): (pivot: string) => boolean {
  const pivots = getKit(view).pivots;
  return (pivot) => pivot in pivots;
}

/**
 * How far a joint may move from here, relative to the template's own pose: both the joint's
 * natural limits and the editor's overall adjustment range apply, whichever is narrower.
 */
export function jointRange(joint: JointDef, template: ResolvedPose): [number, number] {
  const base = template.angles[joint.id] ?? 0;
  return [Math.round(Math.max(-DEFAULT_ADJUST_RANGE, joint.limits[0] - base)), Math.round(Math.min(DEFAULT_ADJUST_RANGE, joint.limits[1] - base))];
}
