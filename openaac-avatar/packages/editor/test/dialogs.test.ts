import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toRequest, initialState, Store } from '../src/state/store';
import { setupExportDialog } from '../src/ui/dialogs/export-dialog';
import { setupRequestDialog } from '../src/ui/dialogs/request-dialog';

function exportFixture(): void {
  document.body.innerHTML = `
    <dialog id="export-dialog">
      <img id="export-png" alt="" />
      <div class="export-side">
        <span id="export-size"></span>
        <button type="button" id="export-svg-dl">Download SVG</button>
        <button type="button" id="export-png-dl">Download PNG</button>
        <button type="button" id="export-copy">Copy SVG</button>
        <p id="export-msg"></p>
      </div>
      <textarea id="export-svg" readonly></textarea>
    </dialog>`;
}

function requestFixture(): void {
  document.body.innerHTML = `
    <dialog id="json-dialog">
      <textarea id="json-text"></textarea>
      <p id="json-error"></p>
      <button id="json-load">Load</button>
    </dialog>`;
}

describe('export dialog', () => {
  beforeEach(exportFixture);

  it('fills in the SVG code, PNG preview and size label, and opens as a modal', async () => {
    const store = new Store(initialState());
    const open = setupExportDialog(store);
    await open();
    expect(document.querySelector('#export-svg')).toHaveProperty('value', expect.stringContaining('<svg'));
    expect(document.querySelector<HTMLImageElement>('#export-png')!.src).toContain('data:image/png');
    expect(document.querySelector('#export-size')!.textContent).toBe('500 × 500 px');
    expect(document.querySelector('#export-dialog')!.hasAttribute('open')).toBe(true);
  });

  it('downloading the SVG names the file after the current state', async () => {
    const store = new Store(initialState());
    await setupExportDialog(store)();
    const createObjectURL = vi.spyOn(URL, 'createObjectURL');
    document.querySelector<HTMLButtonElement>('#export-svg-dl')!.click();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(document.querySelector('#export-msg')!.textContent).toContain('person-standing-50.svg');
  });

  it('downloading the PNG uses the rendered preview image', async () => {
    const store = new Store(initialState());
    await setupExportDialog(store)();
    document.querySelector<HTMLButtonElement>('#export-png-dl')!.click();
    expect(document.querySelector('#export-msg')!.textContent).toContain('person-standing-50.png');
  });

  it('copy writes the SVG code to the clipboard', async () => {
    const store = new Store(initialState());
    await setupExportDialog(store)();
    document.querySelector<HTMLButtonElement>('#export-copy')!.click();
    await vi.waitFor(() => expect(document.querySelector('#export-msg')!.textContent).toContain('copied'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(document.querySelector<HTMLTextAreaElement>('#export-svg')!.value);
  });
});

describe('request-json dialog', () => {
  beforeEach(requestFixture);

  it('shows the current state as request JSON when opened', () => {
    const store = new Store(initialState());
    setupRequestDialog(store)();
    const text = document.querySelector<HTMLTextAreaElement>('#json-text')!.value;
    expect(JSON.parse(text)).toEqual(toRequest(store.state));
    expect(document.querySelector('#json-dialog')!.hasAttribute('open')).toBe(true);
  });

  it('loading valid JSON replaces the whole state and closes the dialog', () => {
    const store = new Store(initialState());
    const open = setupRequestDialog(store);
    open();
    const next = { ...toRequest(store.state), view: 'side', pose: { preset: 'waving' } };
    document.querySelector<HTMLTextAreaElement>('#json-text')!.value = JSON.stringify(next);
    document.querySelector<HTMLButtonElement>('#json-load')!.click();
    expect(store.state.view).toBe('side');
    expect(store.state.preset).toBe('waving');
    expect(document.querySelector('#json-dialog')!.hasAttribute('open')).toBe(false);
  });

  it('reports malformed JSON without touching the state', () => {
    const store = new Store(initialState());
    setupRequestDialog(store)();
    document.querySelector<HTMLTextAreaElement>('#json-text')!.value = '{not json';
    document.querySelector<HTMLButtonElement>('#json-load')!.click();
    expect(store.state).toEqual(initialState());
    expect(document.querySelector('#json-error')!.textContent).toContain('Not valid JSON');
  });

  it('reports every validation problem for a structurally valid but invalid request', () => {
    const store = new Store(initialState());
    setupRequestDialog(store)();
    document.querySelector<HTMLTextAreaElement>('#json-text')!.value = JSON.stringify({ view: 'front', pose: { preset: 'flying' }, avatar: { body: 3 }, options: {} });
    document.querySelector<HTMLButtonElement>('#json-load')!.click();
    const error = document.querySelector('#json-error')!.textContent!;
    expect(error).toContain('pose.preset');
    expect(error).toContain('avatar.body');
  });
});
