/** The settings column. Panels are rebuilt when a change alters their contents (e.g. a new template). */
import { $ } from '../lib/dom';
import type { Store } from '../state/store';
import { bodyPanel } from './panels/body-panel';
import { exportPanel, type ExportActions } from './panels/export-panel';
import { lookPanel } from './panels/look-panel';
import { posePanel } from './panels/pose-panel';

export function mountControls(store: Store, actions: ExportActions): void {
  const root = $('#controls');
  const build = () => root.replaceChildren(posePanel(store), bodyPanel(store), lookPanel(store), exportPanel(store, actions));
  store.on('rebuild', build);
  build();
}
