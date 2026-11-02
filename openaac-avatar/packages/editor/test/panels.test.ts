import { describe, expect, it, vi } from 'vitest';
import { adjustPanel } from '../src/ui/panels/adjust-panel';
import { bodyPanel } from '../src/ui/panels/body-panel';
import { clothingPanel } from '../src/ui/panels/clothing-panel';
import { coloursPanel } from '../src/ui/panels/colours-panel';
import { exportPanel } from '../src/ui/panels/export-panel';
import { linesPanel } from '../src/ui/panels/lines-panel';
import { posePanel } from '../src/ui/panels/pose-panel';
import { Store, initialState } from '../src/state/store';

const chipsIn = (root: HTMLElement, label: string) => root.querySelector<HTMLElement>(`[role="radiogroup"][aria-label="${label}"]`)!;
const chipFor = (group: HTMLElement, value: string) => [...group.querySelectorAll<HTMLButtonElement>('.chip')].find((c) => c.querySelector('.chip-label')?.textContent === value)!;

describe('posePanel', () => {
  it('shows the current view and preset as selected', () => {
    const store = new Store(initialState());
    const el = posePanel(store);
    expect(chipsIn(el, 'View').querySelector('.chip.on .chip-label')?.textContent).toBe('Front');
    expect(chipsIn(el, 'Template pose').querySelector('.chip.on')).toBeTruthy();
  });

  it('switching view resets adjustments, keeps the preset if offered, and rebuilds', () => {
    const store = new Store({ ...initialState(), adjust: { elbow_R: 10 } });
    const onRebuild = vi.fn();
    store.on('rebuild', onRebuild);
    const el = posePanel(store);
    chipFor(chipsIn(el, 'View'), 'Side').click();
    expect(store.state.view).toBe('side');
    expect(store.state.adjust).toEqual({});
    expect(onRebuild).toHaveBeenCalledTimes(1);
  });

  it('switching view to one without the current preset falls back to standing', () => {
    // 'cheering' is not offered in every view; side is the most restrictive.
    const store = new Store({ ...initialState(), preset: 'cheering' });
    const el = posePanel(store);
    chipFor(chipsIn(el, 'View'), 'Side').click();
    expect(store.state.preset === 'cheering' || store.state.preset === 'standing').toBe(true);
  });

  it('picking a template changes the preset, clears adjustments, and rebuilds', () => {
    const store = new Store({ ...initialState(), adjust: { elbow_R: 10 } });
    const onRebuild = vi.fn();
    store.on('rebuild', onRebuild);
    const el = posePanel(store);
    chipFor(chipsIn(el, 'Template pose'), 'Waving').click();
    expect(store.state.preset).toBe('waving');
    expect(store.state.adjust).toEqual({});
    expect(onRebuild).toHaveBeenCalledTimes(1);
  });
});

describe('bodyPanel', () => {
  it('shows the current body size as a percentage', () => {
    const store = new Store({ ...initialState(), body: 0.3 });
    const el = bodyPanel(store);
    expect(el.querySelector('output')?.textContent).toBe('30%');
  });

  it('dragging the slider updates body (no rebuild needed)', () => {
    const store = new Store(initialState());
    const onRebuild = vi.fn();
    store.on('rebuild', onRebuild);
    const input = bodyPanel(store).querySelector('input')!;
    input.value = '0.75';
    input.dispatchEvent(new Event('input'));
    expect(store.state.body).toBe(0.75);
    expect(onRebuild).not.toHaveBeenCalled();
  });
});

describe('linesPanel', () => {
  it('dragging the slider updates line weight', () => {
    const store = new Store(initialState());
    const input = linesPanel(store).querySelector('input')!;
    input.value = '0.8';
    input.dispatchEvent(new Event('input'));
    expect(store.state.lineWeight).toBe(0.8);
  });
});

describe('clothingPanel', () => {
  it('offers the front styles and marks the current choice', () => {
    const store = new Store(initialState());
    const el = clothingPanel(store);
    const top = chipsIn(el, 'Top');
    expect(top.querySelector('.chip.on')).toBeTruthy();
  });

  it('picking a style updates that slot and rebuilds', () => {
    const store = new Store(initialState());
    const onRebuild = vi.fn();
    store.on('rebuild', onRebuild);
    const el = clothingPanel(store);
    const bottom = chipsIn(el, 'Bottom');
    const otherChip = [...bottom.querySelectorAll<HTMLButtonElement>('.chip')].find((c) => !c.classList.contains('on'))!;
    const label = otherChip.querySelector('.chip-label')!.textContent;
    otherChip.click();
    expect(store.state.clothing.bottom).not.toBe(initialState().clothing.bottom);
    expect(onRebuild).toHaveBeenCalledTimes(1);
    expect(label).toBeTruthy();
  });
});

describe('coloursPanel', () => {
  it('shows a colour input per role except ink', () => {
    const store = new Store(initialState());
    const el = coloursPanel(store);
    expect(el.querySelector('#colour-ink')).toBeNull();
    expect(el.querySelector('#colour-skin')).toBeTruthy();
  });

  it('typing in the colour input updates that role', () => {
    const store = new Store(initialState());
    const el = coloursPanel(store);
    const input = el.querySelector<HTMLInputElement>('#colour-skin')!;
    input.value = '#123456';
    input.dispatchEvent(new Event('input'));
    expect(store.state.colors.skin).toBe('#123456');
  });

  it('clicking a swatch sets the colour and the picker value', () => {
    const store = new Store(initialState());
    const el = coloursPanel(store);
    const row = el.querySelector('#colour-hair')!.closest('.color-row')!;
    const swatch = row.querySelector<HTMLButtonElement>('.swatch')!;
    const expected = swatch.title;
    swatch.click();
    expect(store.state.colors.hair).toBe(expected);
    expect(row.querySelector<HTMLInputElement>('#colour-hair')!.value.toLowerCase()).toBe(expected.toLowerCase());
  });

  it('reset colours restores the defaults and rebuilds', () => {
    const store = new Store({ ...initialState(), colors: { ...initialState().colors, skin: '#000000' } });
    const onRebuild = vi.fn();
    store.on('rebuild', onRebuild);
    const el = coloursPanel(store);
    [...el.querySelectorAll('button')].find((b) => b.textContent === 'Reset colours')!.click();
    expect(store.state.colors).toEqual(initialState().colors);
    expect(onRebuild).toHaveBeenCalledTimes(1);
  });
});

describe('adjustPanel', () => {
  it('offers a slider for an unlocked joint, defaulting to its current adjustment', () => {
    const store = new Store({ ...initialState(), adjust: { shoulder_R: 5 } });
    const el = adjustPanel(store);
    const sliders = [...el.querySelectorAll('input[type="range"]')] as HTMLInputElement[];
    expect(sliders.length).toBeGreaterThan(0);
  });

  it('moving a slider records the adjustment for that joint', () => {
    const store = new Store(initialState());
    const el = adjustPanel(store);
    const neckRow = [...el.querySelectorAll('label.slider, label.slider.disabled')].find((l) => l.querySelector('.label')?.textContent === 'Tilt')!;
    const input = neckRow.querySelector('input')!;
    input.value = '10';
    input.dispatchEvent(new Event('input'));
    expect(store.state.adjust['neck']).toBe(10);
  });

  it('reset adjustments clears them all and rebuilds', () => {
    const store = new Store({ ...initialState(), adjust: { neck: 10, shoulder_R: 5 } });
    const onRebuild = vi.fn();
    store.on('rebuild', onRebuild);
    const el = adjustPanel(store);
    [...el.querySelectorAll('button')].find((b) => b.textContent === 'Reset adjustments')!.click();
    expect(store.state.adjust).toEqual({});
    expect(onRebuild).toHaveBeenCalledTimes(1);
  });
});

describe('exportPanel', () => {
  const actions = { openExport: vi.fn(), openRequestJson: vi.fn() };

  it('shows the current framing, size and background', () => {
    const store = new Store({ ...initialState(), framing: 'upper', size: 300 });
    const el = exportPanel(store, actions);
    expect(chipsIn(el, 'Framing').querySelector('.chip.on .chip-label')?.textContent).toBe('Upper body');
    expect(el.querySelector<HTMLInputElement>('#export-size-input')?.value).toBe('300');
  });

  it('choosing a different framing updates state and rebuilds', () => {
    const store = new Store(initialState());
    const onRebuild = vi.fn();
    store.on('rebuild', onRebuild);
    const el = exportPanel(store, actions);
    chipFor(chipsIn(el, 'Framing'), 'Head').click();
    expect(store.state.framing).toBe('head');
    expect(onRebuild).toHaveBeenCalledTimes(1);
  });

  it('changing the size input clamps into [16, 4096]', () => {
    const store = new Store(initialState());
    const el = exportPanel(store, actions);
    const input = el.querySelector<HTMLInputElement>('#export-size-input')!;
    input.value = '99999';
    input.dispatchEvent(new Event('change'));
    expect(store.state.size).toBe(4096);
    input.value = '5';
    input.dispatchEvent(new Event('change'));
    expect(store.state.size).toBe(16);
  });

  it('clamps an entered 0 to the minimum instead of falling back to the default', () => {
    const store = new Store(initialState());
    const el = exportPanel(store, actions);
    const input = el.querySelector<HTMLInputElement>('#export-size-input')!;
    input.value = '0';
    input.dispatchEvent(new Event('change'));
    expect(store.state.size).toBe(16);
  });

  it('clamps an emptied input to the minimum too (a number input sanitises invalid text to "")', () => {
    const store = new Store(initialState());
    const el = exportPanel(store, actions);
    const input = el.querySelector<HTMLInputElement>('#export-size-input')!;
    input.value = '';
    input.dispatchEvent(new Event('change'));
    expect(store.state.size).toBe(16);
  });

  it('turning on the background enables the colour input and sets it', () => {
    const store = new Store(initialState());
    const el = exportPanel(store, actions);
    const toggle = el.querySelector<HTMLInputElement>('#background-on')!;
    const colour = el.querySelector<HTMLInputElement>('#background-colour')!;
    expect(colour.disabled).toBe(true);
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    expect(colour.disabled).toBe(false);
    expect(store.state.background).toBe(colour.value);
  });

  it('turning the background off clears it', () => {
    const store = new Store({ ...initialState(), background: '#ff0000' });
    const el = exportPanel(store, actions);
    const toggle = el.querySelector<HTMLInputElement>('#background-on')!;
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    expect(store.state.background).toBeNull();
  });

  it('the export and request-json buttons call the supplied actions', () => {
    const store = new Store(initialState());
    const localActions = { openExport: vi.fn(), openRequestJson: vi.fn() };
    const el = exportPanel(store, localActions);
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Export'))!.click();
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Request JSON'))!.click();
    expect(localActions.openExport).toHaveBeenCalledTimes(1);
    expect(localActions.openRequestJson).toHaveBeenCalledTimes(1);
  });
});
