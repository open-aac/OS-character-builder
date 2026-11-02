/**
 * The large preview, the symbol-size thumbnails and the pose-button figures.
 *
 * The large preview is animated: changing pose moves the limbs smoothly into
 * place, and the waving pose waves. Thumbnails, pose buttons and exports always
 * show the still pose. Animation is skipped when the system asks for reduced motion.
 */
import { blendPoses, type ResolvedPose } from '@openaac-avatar/core';
import { $ } from '../lib/dom';
import type { EditorState, Store } from '../state/store';
import { poseIconSvg } from '../ui/panels/pose-panel';
import { templatePose } from './pose';
import { renderSymbol } from './symbol';

const TRANSITION_MS = 520;
/** How long after the last change the pose buttons' figures are redrawn. */
const ICON_DELAY = 180;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const targetPose = (s: EditorState): ResolvedPose => templatePose(s);

/** Idle motion layered on the still pose, per template. */
function idle(pose: ResolvedPose, ms: number): ResolvedPose {
  if (pose.preset !== 'waving') return pose;
  const w = Math.sin((ms / 1000) * Math.PI * 2 * 1.3);
  // The waving arm is the one bent up (the right arm; in the side view that is the far arm).
  const side = (pose.angles['elbow_R'] ?? 0) >= (pose.angles['elbow_L'] ?? 0) ? 'R' : 'L';
  return {
    ...pose,
    angles: {
      ...pose.angles,
      [`wrist_${side}`]: (pose.angles[`wrist_${side}`] ?? 0) + 16 * w,
      [`elbow_${side}`]: (pose.angles[`elbow_${side}`] ?? 0) + 6 * w,
    },
  };
}

export function mountPreview(store: Store): void {
  const preview = $('#preview');
  const thumbs = [
    { el: $('#thumb100'), size: 100, idPrefix: 't1' },
    { el: $('#thumb50'), size: 50, idPrefix: 't2' },
  ];

  let shown: ResolvedPose = targetPose(store.state);
  let from: ResolvedPose | null = null;
  let startedAt = 0;
  let lastPreset = store.state.preset;
  let lastView = store.state.view;
  let lastLook = '';
  let iconTimer = 0;
  let loop = 0;
  let still = 0;

  /** One frame of the large preview. Keeps looping while something moves. */
  const frame = (now: number) => {
    const s = store.state;
    const target = targetPose(s);
    let pose = target;
    if (from) {
      const t = (now - startedAt) / TRANSITION_MS;
      if (t >= 1) from = null;
      else pose = blendPoses(from, target, ease(t));
    }
    const animate = !reducedMotion();
    shown = pose;
    preview.parentElement?.setAttribute('data-airborne', String(target.airborne));
    preview.innerHTML = renderSymbol(s, { size: 600, idPrefix: 'p', pose: animate ? idle(pose, now) : pose });
    loop = from || (animate && target.preset === 'waving') ? requestAnimationFrame(frame) : 0;
  };

  /** Everything that only needs redrawing when the settings change. */
  const drawStill = () => {
    const s = store.state;
    for (const t of thumbs) t.el.innerHTML = renderSymbol(s, { size: t.size, idPrefix: t.idPrefix });
    preview.parentElement?.setAttribute('data-framing', s.framing);

    // Pose buttons show the figure with the current body and colours. Redrawn once a slider
    // settles rather than on every step: nine extra figures per step would make dragging stutter.
    const icons = document.querySelectorAll<HTMLElement>('.pose-icon[data-preset]');
    if ([...icons].some((i) => !i.firstElementChild)) drawIcons();
    else {
      clearTimeout(iconTimer);
      iconTimer = window.setTimeout(drawIcons, ICON_DELAY);
    }
  };

  const drawIcons = () => {
    const s = store.state;
    const look = JSON.stringify([s.view, s.body, s.colors, s.lineWeight, s.clothing]);
    const icons = document.querySelectorAll<HTMLElement>('.pose-icon[data-preset]');
    if (look === lastLook && ![...icons].some((i) => !i.firstElementChild)) return;
    lastLook = look;
    for (const icon of icons) icon.innerHTML = poseIconSvg(store, icon.dataset['preset']!);
  };

  const onChange = () => {
    const s = store.state;
    if (s.view !== lastView) {
      // A new view is different art: no in-between frames.
      lastView = s.view;
      lastPreset = s.preset;
      from = null;
    } else if (s.preset !== lastPreset) {
      lastPreset = s.preset;
      if (!reducedMotion()) {
        from = shown;
        startedAt = performance.now();
      }
    }
    if (!loop) loop = requestAnimationFrame(frame);
    cancelAnimationFrame(still);
    still = requestAnimationFrame(drawStill);
  };

  store.on('change', onChange);
  onChange();
}
