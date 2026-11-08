import { DEFAULT_ADJUST_RANGE, JOINT_BY_ID } from '@openaac-avatar/core';
import { jointRange, jointsInView, templatePose } from '../../render/pose';
import { JOINT_GROUPS, JOINT_NAMES } from '../../config/labels';
import { h } from '../../lib/dom';
import type { Store } from '../../state/store';
import { button, group, hint, slider } from '../components';
import type { IconName } from '../icons';

/** Colour and icon per body-part group, in JOINT_GROUPS order. */
const GROUP_STYLE: readonly { tone: string; icon: IconName }[] = [
  { tone: 'pink', icon: 'head' },
  { tone: 'blue', icon: 'arm' },
  { tone: 'green', icon: 'arm' },
  { tone: 'orange', icon: 'leg' },
  { tone: 'purple', icon: 'leg' },
];

/** The per-joint sliders, grouped by body part. Unchanged from the original "Adjust" panel, just no longer wrapped in its own top-level panel: it's nested ("Fine adjustments") under the Pose panel's limb view. */
export function adjustFields(store: Store): Node[] {
  const { adjust } = store.state;
  const template = templatePose(store.state, false);
  const inView = jointsInView(store.state.view);
  const locked = new Set(template.locked);
  const grid = h('div', { class: 'joints' });

  JOINT_GROUPS.forEach((g, i) => {
    const style = GROUP_STYLE[i] ?? { tone: 'blue', icon: 'adjust' as IconName };
    const sliders: HTMLElement[] = [];
    for (const id of g.joints) {
      const joint = JOINT_BY_ID.get(id);
      if (!joint || !inView(joint.pivot)) continue;
      const [min, max] = jointRange(joint, template);
      sliders.push(
        slider({
          label: JOINT_NAMES[id.replace(/_[LR]$/, '')] ?? id,
          min,
          max,
          step: 1,
          value: adjust[id] ?? 0,
          format: (v) => `${v > 0 ? '+' : ''}${v}°`,
          disabledReason: locked.has(id) ? 'Fixed in this pose: the art is drawn already in position' : undefined,
          onInput: (v) => store.update({ adjust: { ...store.state.adjust, [id]: v } }),
        }),
      );
    }
    if (sliders.length) grid.append(group(g.title, style.icon, style.tone, ...sliders));
  });

  return [
    hint(
      `Fine-tune the template by up to ±${DEFAULT_ADJUST_RANGE}°. Positive moves a limb up or away from the body.` +
        (locked.size ? ' Legs are fixed in this pose because the seated legs are drawn in position.' : ''),
    ),
    grid,
    h('div', { class: 'row end' }, button('Reset adjustments', () => store.update({ adjust: {} }, { rebuild: true }), 'ghost')),
  ];
}
