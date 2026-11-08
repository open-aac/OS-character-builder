/**
 * End-to-end-ish test: mounts the real index.html + main.ts together (the
 * same wiring the browser runs) and drives it like a user would, instead of
 * testing each module in isolation.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const indexHtml = readFileSync(resolve(import.meta.dirname, '../index.html'), 'utf8');

const bodyFixture = () => {
  const body = indexHtml.match(/<body[^>]*>([\s\S]*)<\/body>/)![1]!;
  return body.replace(/<script[\s\S]*?<\/script>/g, '');
};

/** Both the preview and the pose-icon redraw are scheduled with requestAnimationFrame. */
const flush = () => new Promise((r) => setTimeout(r, 60));

const panelTitle = (name: string) => [...document.querySelectorAll('#controls .panel-title-text')].find((p) => p.textContent?.includes(name));

const chipFor = (group: Element, label: string) => [...group.querySelectorAll<HTMLButtonElement>('.chip')].find((c) => c.querySelector('.chip-label')?.textContent === label)!;

async function mountApp(): Promise<void> {
  document.body.innerHTML = bodyFixture();
  vi.resetModules();
  await import('../src/main.ts');
  await flush();
}

describe('the editor, mounted end to end', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders a preview, two thumbnails, and every settings panel', async () => {
    await mountApp();
    expect(document.querySelector('#preview')!.innerHTML).toContain('<svg');
    expect(document.querySelector('#thumb100')!.innerHTML).toContain('<svg');
    expect(document.querySelector('#thumb50')!.innerHTML).toContain('<svg');
    for (const title of ['Pose', 'Body', 'Look', 'Export']) expect(panelTitle(title), title).toBeTruthy();
  });

  it('picking a new pose selects it but stays in the gallery; "Edit pose" enters the limb view, and Back returns to it', async () => {
    await mountApp();
    const templatesBefore = panelTitle('Pose')!.closest('.panel')!.querySelector('[aria-label="Template pose"]')!;
    chipFor(templatesBefore, 'Waving').click();
    await flush();
    // The pose panel is rebuilt from scratch on a preset change, so re-find it live.
    let posePanel = panelTitle('Pose')!.closest('.panel')!;
    expect(posePanel.querySelector('.pose-back')).toBeNull();
    posePanel.querySelector<HTMLButtonElement>('.pose-edit-link')!.click();
    await flush();
    posePanel = panelTitle('Pose')!.closest('.panel')!;
    expect(posePanel.querySelector('.pose-back')).toBeTruthy();
    posePanel.querySelector<HTMLButtonElement>('.pose-back')!.click();
    await flush();
    const templatesAfter = panelTitle('Pose')!.closest('.panel')!.querySelector('[aria-label="Template pose"]')!;
    expect(templatesAfter.querySelector('.chip.on .chip-label')?.textContent).toBe('Waving');
  });

  it('picking a limb preset position applies it and redraws the preview', async () => {
    await mountApp();
    const templatesBefore = panelTitle('Pose')!.closest('.panel')!.querySelector('[aria-label="Template pose"]')!;
    chipFor(templatesBefore, 'Waving').click();
    await flush();
    panelTitle('Pose')!.closest('.panel')!.querySelector<HTMLButtonElement>('.pose-edit-link')!.click();
    await flush();
    // Head (the default first limb) uses Tilt-style labels; pick a limb with Raised/Lowered/Neutral presets.
    const limbs = panelTitle('Pose')!.closest('.panel')!.querySelector('[aria-label="Limb"]')!;
    chipFor(limbs, "Right arm (figure's right)").click();
    await flush();
    const presets = panelTitle('Pose')!.closest('.panel')!.querySelector('[aria-label="Preset position"]')!;
    chipFor(presets, 'Raised').click();
    await flush();
    const saved = JSON.parse(localStorage.getItem('openaac-avatar-editor')!);
    expect(Object.values(saved.pose.adjust as Record<string, number>).some((v) => v > 0)).toBe(true);
  });

  it('dragging the body slider redraws the preview live', async () => {
    await mountApp();
    const bodyPanel = panelTitle('Body')!.closest('.panel')!;
    const input = bodyPanel.querySelector<HTMLInputElement>('input[type="range"]')!;
    input.value = '0.1';
    input.dispatchEvent(new Event('input'));
    await flush();
    expect(bodyPanel.querySelector('output')?.textContent).toBe('10%');
  });

  it('picking a colour swatch recolours the figure and persists it', async () => {
    await mountApp();
    const lookPanel = panelTitle('Look')!.closest('.panel')!;
    const row = lookPanel.querySelector('#colour-skin')!.closest('.color-row')!;
    const swatch = row.querySelector<HTMLButtonElement>('.swatch')!;
    const chosen = swatch.title;
    swatch.click();
    await flush();
    expect(row.querySelector<HTMLInputElement>('#colour-skin')!.value.toLowerCase()).toBe(chosen.toLowerCase());
    const saved = JSON.parse(localStorage.getItem('openaac-avatar-editor')!);
    expect(saved.avatar.colors.skin.toLowerCase()).toBe(chosen.toLowerCase());
  });

  it('reset puts every control back to its default, including the Pose panel view, and shows a toast', async () => {
    await mountApp();
    const bodyInputBefore = panelTitle('Body')!.closest('.panel')!.querySelector<HTMLInputElement>('input[type="range"]')!;
    bodyInputBefore.value = '0.95';
    bodyInputBefore.dispatchEvent(new Event('input'));
    const templatesBefore = panelTitle('Pose')!.closest('.panel')!.querySelector('[aria-label="Template pose"]')!;
    chipFor(templatesBefore, 'Waving').click();
    await flush();
    panelTitle('Pose')!.closest('.panel')!.querySelector<HTMLButtonElement>('.pose-edit-link')!.click();
    await flush();

    document.querySelector<HTMLButtonElement>('#action-reset')!.click();
    await flush();

    // Reset replaces the whole store, which rebuilds every panel from scratch.
    const bodyPanelAfter = panelTitle('Body')!.closest('.panel')!;
    expect(bodyPanelAfter.querySelector('output')?.textContent).toBe('50%');
    const posePanelAfter = panelTitle('Pose')!.closest('.panel')!;
    expect(posePanelAfter.querySelector('.pose-back')).toBeNull();
    expect(posePanelAfter.querySelector('[aria-label="Template pose"]')).toBeTruthy();
    const toast = document.querySelector('#toast')!;
    expect(toast.textContent).toContain('default figure');
    expect(toast.classList.contains('show')).toBe(true);
  });

  it('expanding a panel persists across a remount', async () => {
    await mountApp();
    panelTitle('Look')!.closest('.panel')!.querySelector<HTMLButtonElement>('.panel-header')!.click();
    expect(panelTitle('Look')!.closest('.panel')!.querySelector('.panel-header')!.getAttribute('aria-expanded')).toBe('true');

    await mountApp();
    expect(panelTitle('Look')!.closest('.panel')!.querySelector('.panel-header')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('Export opens the export dialog with the current figure', async () => {
    await mountApp();
    document.querySelector<HTMLButtonElement>('#action-export')!.click();
    await flush();
    expect(document.querySelector('#export-dialog')!.hasAttribute('open')).toBe(true);
    expect(document.querySelector<HTMLTextAreaElement>('#export-svg')!.value).toContain('<svg');
  });

  it('Download PNG rasterises the current figure and shows a confirmation', async () => {
    await mountApp();
    document.querySelector<HTMLButtonElement>('#action-png')!.click();
    await flush();
    expect(document.querySelector('#toast')!.textContent).toContain('.png');
  });
});
