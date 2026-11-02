import { VIEWS, presetsForView } from '@openaac-avatar/core';
import { VIEW_LABELS } from '../../config/labels';
import { h } from '../../lib/dom';
import { renderSymbol } from '../../render/symbol';
import type { Store } from '../../state/store';
import { choiceChips, hint, panel } from '../components';

export function poseIconSvg(store: Store, preset: string): string {
  return renderSymbol({ ...store.state, preset, adjust: {}, framing: 'full', background: null }, { size: 44, idPrefix: `pose-${preset}` });
}

/** A tiny version of the figure in that pose, in the current colours and body size (kept up to date by the preview). */
function poseIcon(store: Store, preset: string): HTMLElement {
  const icon = h('span', { class: 'pose-icon', 'aria-hidden': 'true', 'data-preset': preset });
  icon.innerHTML = poseIconSvg(store, preset);
  return icon;
}

export function posePanel(store: Store): HTMLElement {
  const { view } = store.state;
  const presets = presetsForView(view);
  return panel(
    'Pose',
    'pose',
    h('p', { class: 'field-label' }, 'View'),
    choiceChips(
      'View',
      VIEWS.map((v) => ({ value: v, label: VIEW_LABELS[v] ?? v })),
      view,
      (next) => {
        // Keep the pose if the new view has it, otherwise stand.
        const keep = presetsForView(next).some((p) => p.id === store.state.preset);
        store.update({ view: next, preset: keep ? store.state.preset : 'standing', adjust: {} }, { rebuild: true });
      },
    ),
    h('p', { class: 'field-label' }, 'Template'),
    choiceChips(
      'Template pose',
      presets.map((p) => ({ value: p.id, label: p.label, title: p.description, icon: poseIcon(store, p.id) })),
      store.state.preset,
      (preset) => store.update({ preset, adjust: {} }, { rebuild: true }),
      'pose-grid',
    ),
    ...(presets.length < 9 ? [hint('More poses for this view once its hand art arrives.')] : []),
  );
}
