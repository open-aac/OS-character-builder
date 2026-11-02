/** Shows the current settings as a render request (what the CLI and API take), and loads one back in. */
import { RequestError, type RenderRequest } from '@openaac-avatar/core';
import { $ } from '../../lib/dom';
import { fromRequest, toRequest, type Store } from '../../state/store';

export function setupRequestDialog(store: Store): () => void {
  const dialog = $<HTMLDialogElement>('#json-dialog');
  const text = $<HTMLTextAreaElement>('#json-text');
  const error = $('#json-error');

  $('#json-load').addEventListener('click', (e) => {
    e.preventDefault();
    try {
      store.replace(fromRequest(JSON.parse(text.value) as RenderRequest));
      dialog.close();
    } catch (err) {
      error.textContent = err instanceof RequestError ? err.problems.join('\n') : `Not valid JSON: ${(err as Error).message}`;
    }
  });

  return () => {
    text.value = JSON.stringify(toRequest(store.state), null, 2);
    error.textContent = '';
    dialog.showModal();
  };
}
