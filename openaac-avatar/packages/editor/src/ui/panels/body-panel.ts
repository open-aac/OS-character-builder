import type { Store } from '../../state/store';
import { panel, slider } from '../components';

export function bodyPanel(store: Store): HTMLElement {
  return panel(
    'Body',
    'body',
    slider({
      label: 'Body size',
      min: 0,
      max: 1,
      step: 0.01,
      value: store.state.body,
      format: (v) => `${Math.round(v * 100)}%`,
      ends: ['Slim', 'Broad'],
      onInput: (body) => store.update({ body }),
    }),
  );
}
