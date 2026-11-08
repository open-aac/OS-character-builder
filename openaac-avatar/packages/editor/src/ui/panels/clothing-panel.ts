import { getKit, kitGarments, type GarmentSlot } from '@openaac-avatar/core';
import { GARMENT_LABELS, styleLabel } from '../../config/labels';
import { h } from '../../lib/dom';
import type { Store } from '../../state/store';
import { choiceChips, hint } from '../components';

/** Pick a garment for each slot. Choices come from the art, so new garments appear here by themselves. */
export function clothingFields(store: Store): Node[] {
  const { view, clothing } = store.state;
  const offered = kitGarments(getKit('front'));
  const inView = kitGarments(getKit(view));
  const rows: Node[] = [];
  for (const slot of ['top', 'bottom'] as GarmentSlot[]) {
    if (!offered[slot].length) continue;
    rows.push(
      h('p', { class: 'field-label' }, slot === 'top' ? 'Top' : 'Bottom'),
      choiceChips(
        slot === 'top' ? 'Top' : 'Bottom',
        offered[slot].map((style) => ({ value: style, label: GARMENT_LABELS[slot][style] ?? styleLabel(style) })),
        clothing[slot],
        (style) => store.update({ clothing: { ...store.state.clothing, [slot]: style } }, { rebuild: true }),
      ),
    );
  }
  const noChoice = view !== 'front' && !inView.top.length && !inView.bottom.length;
  if (noChoice) rows.push(hint('This view is drawn in one outfit for now; your choice is used in the front view.'));
  return rows;
}
