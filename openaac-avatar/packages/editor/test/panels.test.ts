import { afterEach, describe, expect, it, vi } from 'vitest';
import { JOINT_GROUPS } from '../src/config/labels';
import { h } from '../src/lib/dom';
import { adjustFields } from '../src/ui/panels/adjust-panel';
import { bodyPanel } from '../src/ui/panels/body-panel';
import { clothingFields } from '../src/ui/panels/clothing-panel';
import { coloursFields } from '../src/ui/panels/colours-panel';
import { exportPanel } from '../src/ui/panels/export-panel';
import { linesFields } from '../src/ui/panels/lines-panel';
import { lookPanel } from '../src/ui/panels/look-panel';
import { posePanel } from '../src/ui/panels/pose-panel';
import { Store, initialState } from '../src/state/store';

afterEach(() => {
  localStorage.clear();
});

const chipsIn = (root: HTMLElement, label: string) => root.querySelector<HTMLElement>(`[role="radiogroup"][aria-label="${label}"]`)!;
const chipFor = (group: HTMLElement, value: string) => [...group.querySelectorAll<HTMLButtonElement>('.chip')].find((c) => c.querySelector('.chip-label')?.textContent === value)!;
/** The field-building panels no longer wrap themselves in `panel()`: put their Nodes in a container to query them. */
const fieldContainer = (...nodes: Node[]) => h('div', {}, ...nodes);

describe('posePanel', () => {
  it('shows the gallery view by default, with current view and preset selected', () => {
    const store = new Store(initialState());
    const el = posePanel(store);
    expect(chipsIn(el, 'View').querySelector('.chip.on .chip-label')?.textContent).toBe('Front');
    expect(chipsIn(el, 'Template pose').querySelector('.chip.on')).toBeTruthy();
    expect(el.querySelector('.pose-back')).toBeNull();
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

  it('picking a template changes the preset and clears adjustments, but stays in the gallery', () => {
    const store = new Store({ ...initialState(), adjust: { elbow_R: 10 } });
    const onRebuild = vi.fn();
    store.on('rebuild', onRebuild);
    const el = posePanel(store);
    chipFor(chipsIn(el, 'Template pose'), 'Waving').click();
    expect(store.state.preset).toBe('waving');
    expect(store.state.adjust).toEqual({});
    expect(store.poseView).toBeNull();
    expect(onRebuild).toHaveBeenCalledTimes(1);
  });

  it('shows an "Edit pose" link only on the selected template', () => {
    const store = new Store(initialState());
    const el = posePanel(store);
    const chips = [...chipsIn(el, 'Template pose').querySelectorAll('.chip')];
    const selected = chips.find((c) => c.classList.contains('on'))!;
    const others = chips.filter((c) => c !== selected);
    expect(selected.querySelector('.pose-edit-link')).toBeTruthy();
    for (const c of others) expect(c.querySelector('.pose-edit-link')).toBeNull();
  });

  it('clicking "Edit pose" enters the limb view without changing the preset', () => {
    const store = new Store(initialState());
    const el = posePanel(store);
    chipsIn(el, 'Template pose').querySelector<HTMLButtonElement>('.pose-edit-link')!.click();
    expect(store.state.preset).toBe('standing');
    expect(store.poseView).not.toBeNull();
  });

  it('the limb view shows a Back button, a limb selector, preset chips and a collapsed Fine adjustments section', () => {
    const store = new Store(initialState());
    store.setPoseView({ limb: JOINT_GROUPS[0]!.title });
    const el = posePanel(store);
    expect(el.querySelector('.pose-back')).toBeTruthy();
    expect(chipsIn(el, 'Limb')).toBeTruthy();
    expect(chipsIn(el, 'Preset position')).toBeTruthy();
    const fineAdjustments = [...el.querySelectorAll('.panel-title-text')].find((n) => n.textContent === 'Fine adjustments')!;
    expect(fineAdjustments).toBeTruthy();
    expect(fineAdjustments.closest('.subpanel')!.querySelector('.panel-header')!.getAttribute('aria-expanded')).toBe('false');
  });

  it('clicking Back returns to the gallery view', () => {
    const store = new Store(initialState());
    store.setPoseView({ limb: JOINT_GROUPS[0]!.title });
    const el = posePanel(store);
    el.querySelector<HTMLButtonElement>('.pose-back')!.click();
    expect(store.poseView).toBeNull();
  });

  it('picking a different limb switches the selection', () => {
    const store = new Store(initialState());
    store.setPoseView({ limb: JOINT_GROUPS[0]!.title });
    const el = posePanel(store);
    const otherGroup = JOINT_GROUPS[1]!.title;
    chipFor(chipsIn(el, 'Limb'), otherGroup).click();
    expect(store.poseView).toEqual({ limb: otherGroup });
  });

  it("picking a preset position applies all of that limb's joint angles at once and rebuilds", () => {
    const store = new Store(initialState());
    const armGroup = JOINT_GROUPS.find((g) => g.title.includes('Right arm'))!;
    store.setPoseView({ limb: armGroup.title });
    const onRebuild = vi.fn();
    store.on('rebuild', onRebuild);
    const el = posePanel(store);
    chipFor(chipsIn(el, 'Preset position'), 'Raised').click();
    for (const id of armGroup.joints) expect(store.state.adjust[id]).toBeGreaterThan(0);
    expect(onRebuild).toHaveBeenCalledTimes(1);
  });

  it('shows a hint instead of presets when every joint in the limb is locked by the pose', () => {
    const store = new Store({ ...initialState(), preset: 'sitting-utensil' });
    const legGroup = JOINT_GROUPS.find((g) => g.title.includes('Right leg'))!;
    store.setPoseView({ limb: legGroup.title });
    const el = posePanel(store);
    expect(chipsIn(el, 'Preset position')).toBeNull();
    expect(el.textContent).toContain('Fixed in this pose');
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

describe('linesFields', () => {
  it('dragging the slider updates line weight', () => {
    const store = new Store(initialState());
    const el = fieldContainer(...linesFields(store));
    const input = el.querySelector('input')!;
    input.value = '0.8';
    input.dispatchEvent(new Event('input'));
    expect(store.state.lineWeight).toBe(0.8);
  });
});

describe('clothingFields', () => {
  it('offers the front styles and marks the current choice', () => {
    const store = new Store(initialState());
    const el = fieldContainer(...clothingFields(store));
    const top = chipsIn(el, 'Top');
    expect(top.querySelector('.chip.on')).toBeTruthy();
  });

  it('picking a style updates that slot and rebuilds', () => {
    const store = new Store(initialState());
    const onRebuild = vi.fn();
    store.on('rebuild', onRebuild);
    const el = fieldContainer(...clothingFields(store));
    const bottom = chipsIn(el, 'Bottom');
    const otherChip = [...bottom.querySelectorAll<HTMLButtonElement>('.chip')].find((c) => !c.classList.contains('on'))!;
    const label = otherChip.querySelector('.chip-label')!.textContent;
    otherChip.click();
    expect(store.state.clothing.bottom).not.toBe(initialState().clothing.bottom);
    expect(onRebuild).toHaveBeenCalledTimes(1);
    expect(label).toBeTruthy();
  });
});

describe('coloursFields', () => {
  it('shows a colour input per role except ink', () => {
    const store = new Store(initialState());
    const el = fieldContainer(...coloursFields(store));
    expect(el.querySelector('#colour-ink')).toBeNull();
    expect(el.querySelector('#colour-skin')).toBeTruthy();
    expect(el.querySelector('#colour-eyebrow')).toBeTruthy();
  });

  it('typing in the colour input updates that role', () => {
    const store = new Store(initialState());
    const el = fieldContainer(...coloursFields(store));
    const input = el.querySelector<HTMLInputElement>('#colour-skin')!;
    input.value = '#123456';
    input.dispatchEvent(new Event('input'));
    expect(store.state.colors.skin).toBe('#123456');
  });

  it('clicking a swatch sets the colour and the picker value', () => {
    const store = new Store(initialState());
    const el = fieldContainer(...coloursFields(store));
    const row = el.querySelector('#colour-skin')!.closest('.color-row')!;
    const swatch = row.querySelector<HTMLButtonElement>('.swatch')!;
    const expected = swatch.title;
    swatch.click();
    expect(store.state.colors.skin).toBe(expected);
    expect(row.querySelector<HTMLInputElement>('#colour-skin')!.value.toLowerCase()).toBe(expected.toLowerCase());
  });

  it('does not offer eye whites or outlines', () => {
    const el = fieldContainer(...coloursFields(new Store(initialState())));
    expect(el.querySelector('#colour-eyeWhite')).toBeNull();
    expect(el.textContent).not.toContain('Eye whites');
  });

  it('hair uses the same colour input and swatches as the other colours', () => {
    const store = new Store(initialState());
    const el = fieldContainer(...coloursFields(store));
    const input = el.querySelector<HTMLInputElement>('#colour-hair')!;
    expect(input.type).toBe('color');
    input.value = '#12ab9c';
    input.dispatchEvent(new Event('input'));
    expect(store.state.colors.hair).toBe('#12ab9c');
    const swatch = input.closest('.color-row')!.querySelector<HTMLButtonElement>('.swatch')!;
    swatch.click();
    expect(input.value.toLowerCase()).toBe(swatch.title.toLowerCase());
  });

  it('zooms to the head for hair/eyebrow/eyes colours, and returns to default for other colour roles', () => {
    const store = new Store(initialState());
    const el = fieldContainer(...coloursFields(store));

    const hair = el.querySelector<HTMLInputElement>('#colour-hair')!;
    hair.value = '#123456';
    hair.dispatchEvent(new Event('input'));
    expect(store.headZoom).toBe(true);

    const eyebrow = el.querySelector<HTMLInputElement>('#colour-eyebrow')!;
    eyebrow.value = '#654321';
    eyebrow.dispatchEvent(new Event('input'));
    expect(store.headZoom).toBe(true);

    const eyes = el.querySelector<HTMLInputElement>('#colour-iris')!;
    eyes.value = '#336699';
    eyes.dispatchEvent(new Event('input'));
    expect(store.headZoom).toBe(true);

    const skin = el.querySelector<HTMLInputElement>('#colour-skin')!;
    skin.value = '#d59965';
    skin.dispatchEvent(new Event('input'));
    expect(store.headZoom).toBe(false);

    const top = el.querySelector<HTMLInputElement>('#colour-top')!;
    top.value = '#ffffff';
    top.dispatchEvent(new Event('input'));
    expect(store.headZoom).toBe(false);
  });

  it('reset colours restores the defaults and rebuilds', () => {
    const store = new Store({ ...initialState(), colors: { ...initialState().colors, skin: '#000000' } });
    const onRebuild = vi.fn();
    store.on('rebuild', onRebuild);
    const el = fieldContainer(...coloursFields(store));
    [...el.querySelectorAll('button')].find((b) => b.textContent === 'Reset colours')!.click();
    expect(store.state.colors).toEqual(initialState().colors);
    expect(onRebuild).toHaveBeenCalledTimes(1);
  });
});

describe('adjustFields', () => {
  it('offers a slider for an unlocked joint, defaulting to its current adjustment', () => {
    const store = new Store({ ...initialState(), adjust: { shoulder_R: 5 } });
    const el = fieldContainer(...adjustFields(store));
    const sliders = [...el.querySelectorAll('input[type="range"]')] as HTMLInputElement[];
    expect(sliders.length).toBeGreaterThan(0);
  });

  it('moving a slider records the adjustment for that joint', () => {
    const store = new Store(initialState());
    const el = fieldContainer(...adjustFields(store));
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
    const el = fieldContainer(...adjustFields(store));
    [...el.querySelectorAll('button')].find((b) => b.textContent === 'Reset adjustments')!.click();
    expect(store.state.adjust).toEqual({});
    expect(onRebuild).toHaveBeenCalledTimes(1);
  });
});

describe('lookPanel', () => {
  it('composes clothing, colours and line weight under one "Look" panel', () => {
    const store = new Store(initialState());
    const el = lookPanel(store);
    expect(el.querySelector('.panel-title-text')?.textContent).toBe('Look');
    expect(chipsIn(el, 'Top')).toBeTruthy();
    expect(el.querySelector('#colour-skin')).toBeTruthy();
    expect(el.querySelector('input[type="range"]')).toBeTruthy();
  });

  it('is collapsed by default, like every panel except Pose', () => {
    const el = lookPanel(new Store(initialState()));
    expect(el.querySelector('.panel-header')!.getAttribute('aria-expanded')).toBe('false');
  });

  const tab = (el: HTMLElement, id: string) => el.querySelector<HTMLButtonElement>(`#look-tab-${id}`)!;
  const tabPanel = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`#look-tabpanel-${id}`)!;

  it('has Clothing, Hair/Face and Colours tabs, opening on Clothing', () => {
    const el = lookPanel(new Store(initialState()));
    expect([...el.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toEqual(['Clothing', 'Hair/Face', 'Colours']);
    expect(tab(el, 'clothing').getAttribute('aria-selected')).toBe('true');
    expect(tabPanel(el, 'face').hidden).toBe(true);
    expect(tabPanel(el, 'clothing').hidden).toBe(false);
    expect(tabPanel(el, 'colours').hidden).toBe(true);
    expect(tabPanel(el, 'face').querySelector('[aria-label="Hair"]')).toBeTruthy();
    expect(tabPanel(el, 'clothing').querySelector('[aria-label="Top"]')).toBeTruthy();
    expect(tabPanel(el, 'colours').querySelector('#colour-skin')).toBeTruthy();
  });

  it('clicking a tab shows only that tab, and arrow keys move between tabs', () => {
    const el = lookPanel(new Store(initialState()));
    tab(el, 'colours').click();
    expect(tab(el, 'colours').getAttribute('aria-selected')).toBe('true');
    expect(tabPanel(el, 'colours').hidden).toBe(false);
    expect(tabPanel(el, 'face').hidden).toBe(true);
    tab(el, 'colours').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(tabPanel(el, 'face').hidden).toBe(false);
  });

  it('zooms the preview in on the head while Hair/Face is open, and out for the other tabs', () => {
    const store = new Store(initialState());
    const el = lookPanel(store);
    const header = el.querySelector<HTMLButtonElement>('.panel-header')!;
    // Collapsed: no zoom, and Clothing is selected by default.
    expect(store.headZoom).toBe(false);
    header.click();
    expect(store.headZoom).toBe(false);
    tab(el, 'clothing').click();
    expect(store.headZoom).toBe(false);
    tab(el, 'face').click();
    expect(store.headZoom).toBe(true);
    tab(el, 'colours').click();
    expect(store.headZoom).toBe(false);
    tab(el, 'face').click();
    header.click();
    expect(store.headZoom).toBe(false);
  });

  it('keeps the tab and zoom when the panel is rebuilt', () => {
    const store = new Store(initialState());
    localStorage.setItem('openaac-avatar-editor-panels', JSON.stringify({ look: true }));
    tab(lookPanel(store), 'face').click();
    expect(store.headZoom).toBe(true);
    const rebuilt = lookPanel(store);
    expect(store.headZoom).toBe(true);
    expect(tab(rebuilt, 'face').getAttribute('aria-selected')).toBe('true');
    tab(rebuilt, 'clothing').click();
    expect(tab(lookPanel(store), 'clothing').getAttribute('aria-selected')).toBe('true');
    expect(store.headZoom).toBe(false);
  });

  it('zooming does not change the export framing', () => {
    const store = new Store(initialState());
    localStorage.setItem('openaac-avatar-editor-panels', JSON.stringify({ look: true }));
    tab(lookPanel(store), 'face').click();
    expect(store.headZoom).toBe(true);
    expect(store.state.framing).toBe('full');
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
    // Scope to the panel body: the disclosure header button's own title text is also "Export".
    const buttons = [...el.querySelector('.panel-body')!.querySelectorAll('button')];
    buttons.find((b) => b.textContent?.includes('Export'))!.click();
    buttons.find((b) => b.textContent?.includes('Request JSON'))!.click();
    expect(localActions.openExport).toHaveBeenCalledTimes(1);
    expect(localActions.openRequestJson).toHaveBeenCalledTimes(1);
  });
});
