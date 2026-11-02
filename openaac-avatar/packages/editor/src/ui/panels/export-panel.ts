import { FRAMINGS } from '@openaac-avatar/core';
import { FRAMING_LABELS } from '../../config/labels';
import { h } from '../../lib/dom';
import type { Store } from '../../state/store';
import { button, choiceChips, hint, panel } from '../components';

export interface ExportActions {
  openExport: () => void;
  openRequestJson: () => void;
}

export function exportPanel(store: Store, actions: ExportActions): HTMLElement {
  const { framing, size, background } = store.state;

  const sizeInput = h('input', { type: 'number', id: 'export-size-input', min: '16', max: '4096', step: '1', value: String(size) });
  sizeInput.addEventListener('change', () => {
    // `|| 500` would also catch a genuine 0 (falsy): clamp that into range instead of silently defaulting.
    const n = Number(sizeInput.value);
    const v = Math.min(4096, Math.max(16, Math.round(Number.isNaN(n) ? 500 : n)));
    sizeInput.value = String(v);
    store.update({ size: v });
  });

  const bgOn = h('input', { type: 'checkbox', id: 'background-on', checked: background !== null });
  const bg = h('input', { type: 'color', id: 'background-colour', value: background ?? '#ffffff', disabled: background === null, 'aria-label': 'Background colour' });
  const setBackground = () => {
    bg.disabled = !bgOn.checked;
    store.update({ background: bgOn.checked ? bg.value : null });
  };
  bgOn.addEventListener('change', setBackground);
  bg.addEventListener('input', setBackground);

  return panel(
    'Export',
    'export',
    hint('Framing'),
    choiceChips(
      'Framing',
      FRAMINGS.map((f) => ({ value: f, label: FRAMING_LABELS[f] })),
      framing,
      (f) => store.update({ framing: f }, { rebuild: true }),
    ),
    h('div', { class: 'row' }, h('label', { class: 'inline' }, 'Size (px) ', sizeInput), h('label', { class: 'inline' }, bgOn, ' Background ', bg)),
    h('div', { class: 'row wrap' }, button('Export…', actions.openExport, 'primary'), button('Request JSON…', actions.openRequestJson, 'soft')),
  );
}
