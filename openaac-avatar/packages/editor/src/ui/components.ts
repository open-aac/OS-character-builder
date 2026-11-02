/** Reusable building blocks for the settings panels. */
import { h } from '../lib/dom';
import { ICONS, type IconName } from './icons';

function iconChip(name: IconName, tone = 'blue'): HTMLElement {
  const chip = h('span', { class: `icon-chip tone-${tone}` });
  chip.innerHTML = ICONS[name];
  return chip;
}

export function panel(title: string, icon: IconName, ...body: Node[]): HTMLElement {
  return h('section', { class: 'panel' }, h('h2', { class: 'panel-title' }, iconChip(icon), h('span', {}, title)), ...body);
}

/** A coloured sub-card inside a panel, e.g. one body part's joints. */
export function group(title: string, icon: IconName, tone: string, ...body: Node[]): HTMLElement {
  return h('fieldset', { class: `group tone-${tone}` }, h('legend', {}, iconChip(icon, tone), h('span', {}, title)), ...body);
}

export function hint(text: string): HTMLElement {
  return h('p', { class: 'hint' }, text);
}

export function button(label: string, onClick: () => void, variant: 'primary' | 'soft' | 'ghost' = 'soft'): HTMLButtonElement {
  const b = h('button', { type: 'button', class: `btn btn-${variant}` }, label);
  b.addEventListener('click', onClick);
  return b;
}

export interface SliderOptions {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format?: (v: number) => string;
  /** Labels under the two ends of the track. */
  ends?: readonly [string, string];
  /** Shown greyed out and not adjustable, with this reason as a tooltip. */
  disabledReason?: string;
  onInput: (v: number) => void;
}

export function slider(o: SliderOptions): HTMLElement {
  const format = o.format ?? String;
  const out = h('output', { class: 'value-pill' }, format(o.value));
  const input = h('input', {
    type: 'range',
    min: String(o.min),
    max: String(o.max),
    step: String(o.step),
    value: String(o.value),
    'aria-label': o.label,
  });
  // The filled part of the track follows the thumb.
  const paint = () => {
    const pct = o.max === o.min ? 0 : ((Number(input.value) - o.min) / (o.max - o.min)) * 100;
    input.style.setProperty('--fill', `${pct}%`);
  };
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = format(v);
    paint();
    o.onInput(v);
  });
  paint();
  if (o.disabledReason) {
    input.disabled = true;
    out.textContent = 'fixed';
  }
  const row = h(
    'label',
    { class: o.disabledReason ? 'slider disabled' : 'slider', title: o.disabledReason },
    h('span', { class: 'label' }, o.label),
    input,
    out,
  );
  if (o.ends) row.append(h('span', { class: 'ends' }, h('span', {}, o.ends[0]), h('span', {}, o.ends[1])));
  return row;
}

/** A row of mutually exclusive choices, announced as a radio group. */
export function choiceChips<T extends string>(
  label: string,
  options: readonly { value: T; label: string; title?: string; icon?: Node }[],
  selected: T,
  onSelect: (v: T) => void,
  className = 'chips',
): HTMLElement {
  const groupEl = h('div', { class: className, role: 'radiogroup', 'aria-label': label });
  for (const opt of options) {
    const on = opt.value === selected;
    const b = h('button', { type: 'button', class: on ? 'chip on' : 'chip', role: 'radio', 'aria-checked': String(on), title: opt.title });
    if (opt.icon) b.append(opt.icon);
    b.append(h('span', { class: 'chip-label' }, opt.label));
    b.addEventListener('click', () => onSelect(opt.value));
    groupEl.append(b);
  }
  return groupEl;
}
