import type { Store } from '../../state/store';
import { LINE_WEIGHT } from '../../state/store';
import { panel, slider } from '../components';

export function linesPanel(store: Store): HTMLElement {
  return panel(
    'Lines',
    'lines',
    slider({
      label: 'Line weight',
      // Art direction: no heavier than the designed weight (legibility), and not so thin that gaps show.
      min: LINE_WEIGHT[0],
      max: LINE_WEIGHT[1],
      step: 0.05,
      value: store.state.lineWeight,
      format: (v) => `${v.toFixed(2)}×`,
      onInput: (lineWeight) => store.update({ lineWeight }),
    }),
  );
}
