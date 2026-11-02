import { DEFAULT_COLORS, type ColorRole } from '@openaac-avatar/core';
import { COLOR_LABELS } from '../../config/labels';
import { SWATCHES } from '../../config/swatches';
import { h } from '../../lib/dom';
import type { Store } from '../../state/store';
import { button, panel } from '../components';

export function coloursPanel(store: Store): HTMLElement {
  const setColour = (role: ColorRole, value: string) => store.update({ colors: { ...store.state.colors, [role]: value } });
  const list = h('div', { class: 'colors' });

  // Outlines stay black: the outline colour option was removed at the art director's request.
  for (const role of (Object.keys(COLOR_LABELS) as ColorRole[]).filter((r) => r !== 'ink')) {
    const label = COLOR_LABELS[role];
    const picker = h('input', { type: 'color', id: `colour-${role}`, value: store.state.colors[role], 'aria-label': `${label} colour` });
    picker.addEventListener('input', () => setColour(role, picker.value));
    const row = h('div', { class: 'color-row' }, h('label', {}, h('span', { class: 'label' }, label), picker));

    const swatches = SWATCHES[role];
    if (swatches) {
      const strip = h('div', { class: 'swatches' });
      for (const c of swatches) {
        const sw = h('button', { type: 'button', class: 'swatch', title: c, 'aria-label': `${label} ${c}` });
        sw.style.background = c;
        sw.addEventListener('click', () => {
          picker.value = c;
          setColour(role, c);
        });
        strip.append(sw);
      }
      row.append(strip);
    }
    list.append(row);
  }

  return panel(
    'Colours',
    'colours',
    list,
    h('div', { class: 'row end' }, button('Reset colours', () => store.update({ colors: { ...DEFAULT_COLORS } }, { rebuild: true }), 'ghost')),
  );
}
