/** "Look": clothing, colours and line weight, merged into one collapsible panel. */
import { h } from '../../lib/dom';
import type { Store } from '../../state/store';
import { panel } from '../components';
import { clothingFields } from './clothing-panel';
import { coloursFields } from './colours-panel';
import { linesFields } from './lines-panel';

export function lookPanel(store: Store): HTMLElement {
  return panel(
    'Look',
    'clothing',
    h('p', { class: 'field-label' }, 'Clothing'),
    ...clothingFields(store),
    h('p', { class: 'field-label' }, 'Colours'),
    ...coloursFields(store),
    h('p', { class: 'field-label' }, 'Line weight'),
    ...linesFields(store),
  );
}
