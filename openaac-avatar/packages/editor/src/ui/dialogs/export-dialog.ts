/**
 * Export: shows the PNG and the SVG code, with downloads where the page
 * allows them and two ways that always work (save the picture from its
 * context menu, or copy the SVG code).
 */
import { $ } from '../../lib/dom';
import { downloadBlob, downloadUrl, svgToPng } from '../../lib/files';
import { fileName, renderSymbol } from '../../render/symbol';
import type { Store } from '../../state/store';

export function setupExportDialog(store: Store): () => Promise<void> {
  const dialog = $<HTMLDialogElement>('#export-dialog');
  const img = $<HTMLImageElement>('#export-png');
  const code = $<HTMLTextAreaElement>('#export-svg');
  const status = $('#export-msg');
  const sizeLabel = $('#export-size');

  $('#export-svg-dl').addEventListener('click', () => {
    const name = fileName(store.state, 'svg');
    downloadBlob(new Blob([code.value], { type: 'image/svg+xml' }), name);
    status.textContent = `Saving ${name}. If nothing downloads, use Copy SVG.`;
  });

  $('#export-png-dl').addEventListener('click', () => {
    const name = fileName(store.state, 'png');
    downloadUrl(img.src, name);
    status.textContent = `Saving ${name}. If nothing downloads, right-click the picture and choose Save image.`;
  });

  $('#export-copy').addEventListener('click', () => {
    navigator.clipboard.writeText(code.value).then(
      () => (status.textContent = 'SVG copied. Paste it into a file ending in .svg.'),
      () => {
        code.focus();
        code.select();
        status.textContent = 'Copying is blocked here. The code is selected: press Ctrl+C (Cmd+C on a Mac).';
      },
    );
  });

  return async () => {
    const { size, preset } = store.state;
    code.value = renderSymbol(store.state, { size, embedRequest: true });
    status.textContent = '';
    sizeLabel.textContent = `${size} × ${size} px`;
    img.alt = `${preset} symbol, ${size} × ${size} px`;
    img.src = await svgToPng(renderSymbol(store.state, { size }), size);
    dialog.showModal();
  };
}
