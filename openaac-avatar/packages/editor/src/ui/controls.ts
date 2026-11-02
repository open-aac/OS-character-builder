/** The settings column. Panels are rebuilt when a change alters their contents (e.g. a new template). */
import { $ } from '../lib/dom';
import type { Store } from '../state/store';
import { adjustPanel } from './panels/adjust-panel';
import { bodyPanel } from './panels/body-panel';
import { clothingPanel } from './panels/clothing-panel';
import { coloursPanel } from './panels/colours-panel';
import { exportPanel, type ExportActions } from './panels/export-panel';
import { linesPanel } from './panels/lines-panel';
import { posePanel } from './panels/pose-panel';

export function mountControls(store: Store, actions: ExportActions): void {
  const root = $('#controls');
  const build = () =>
    root.replaceChildren(posePanel(store), adjustPanel(store), bodyPanel(store), clothingPanel(store), coloursPanel(store), linesPanel(store), exportPanel(store, actions));
  store.on('rebuild', build);
  build();
}
