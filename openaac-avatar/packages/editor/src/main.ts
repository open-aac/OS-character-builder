/**
 * Person Symbol Editor: entry point.
 *
 *   state/     editor state, store, saving to this browser
 *   render/    calls the shared render core for previews and exports
 *   ui/        settings panels and dialogs
 *   config/    labels and colour swatches
 *   lib/       small DOM and file helpers
 *   styles/    CSS, split by concern
 */
import '@fontsource-variable/nunito/wght.css';
import './styles/index.css';
import { $ } from './lib/dom';
import { downloadUrl, svgToPng } from './lib/files';
import { mountPreview } from './render/preview';
import { fileName, renderSymbol } from './render/symbol';
import { loadSaved, persist } from './state/persist';
import { Store, initialState } from './state/store';
import { mountControls } from './ui/controls';
import { setupExportDialog } from './ui/dialogs/export-dialog';
import { setupRequestDialog } from './ui/dialogs/request-dialog';

const store = new Store(loadSaved());
persist(store);

const openExport = setupExportDialog(store);
const openRequestJson = setupRequestDialog(store);

mountPreview(store);
mountControls(store, { openExport: () => void openExport(), openRequestJson });

/* Small screens: the preview is pinned at the top; this button enlarges it. */
const expandButton = $('#preview-expand');
function setPreviewExpanded(expanded: boolean): void {
  document.querySelector('.stage')?.toggleAttribute('data-expanded', expanded);
  expandButton.setAttribute('aria-expanded', String(expanded));
  expandButton.setAttribute('aria-label', expanded ? 'Shrink preview' : 'Enlarge preview');
}
expandButton.addEventListener('click', () => setPreviewExpanded(expandButton.getAttribute('aria-expanded') !== 'true'));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') setPreviewExpanded(false);
});

/* Header actions */
const toast = $('#toast');
let toastTimer = 0;
function say(message: string): void {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2600);
}

$('#action-export').addEventListener('click', () => void openExport());
$('#action-reset').addEventListener('click', () => {
  store.replace(initialState());
  say('Back to the default figure');
});
$('#action-png').addEventListener('click', async () => {
  const { size } = store.state;
  const png = await svgToPng(renderSymbol(store.state, { size }), size);
  downloadUrl(png, fileName(store.state, 'png'));
  say(`Saving ${fileName(store.state, 'png')}. If nothing downloads, use Export SVG to save the picture.`);
});
