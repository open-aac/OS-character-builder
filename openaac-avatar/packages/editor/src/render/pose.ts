/** The template pose for the editor's current settings (same rules as the renderer). */
import { availableVariants, getKit, resolvePose, type ResolvedPose } from '@openaac-avatar/core';
import type { EditorState } from '../state/store';

export function templatePose(s: EditorState, withAdjust = true): ResolvedPose {
  const kit = getKit(s.view);
  return resolvePose({ preset: s.preset, adjust: withAdjust ? s.adjust : {} }, s.body, availableVariants(kit, s.clothing), s.view);
}

/** Joints the current view's art can move (the side view shows one arm and one leg). */
export function jointsInView(view: string): (pivot: string) => boolean {
  const pivots = getKit(view).pivots;
  return (pivot) => pivot in pivots;
}
