/** Reusable building blocks for the settings panels. */
import { h } from '../lib/dom';
import { isPanelOpen, setPanelOpen } from '../state/panel-collapse';
import { ICONS, type IconName } from './icons';

function iconChip(name: IconName, tone = 'blue'): HTMLElement {
  const chip = h('span', { class: `icon-chip tone-${tone}` });
  chip.innerHTML = ICONS[name];
  return chip;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Panels open by default; anything not listed here (every other panel, and "Fine adjustments") starts collapsed. */
const DEFAULT_OPEN: Readonly<Record<string, boolean>> = {
  pose: true,
};

/**
 * A collapsible section: a button header (icon, title, chevron) with
 * `aria-expanded`/`aria-controls`, and a content region that animates open and
 * closed with CSS and is `inert` while collapsed — so its controls drop out of
 * the tab order and accessibility tree, not just out of view. Open/closed
 * state is remembered per panel (by its title) across visits.
 */
function disclosure(sectionClass: string, title: string, icon: IconName, ...body: Node[]): HTMLElement {
  const id = slugify(title);
  const open0 = isPanelOpen(id, DEFAULT_OPEN[id] ?? false);
  const headerId = `panel-header-${id}`;
  const bodyId = `panel-body-${id}`;

  const chevron = h('span', { class: 'panel-chevron', 'aria-hidden': 'true' });
  chevron.innerHTML = ICONS.chevron;

  const header = h(
    'button',
    { type: 'button', class: 'panel-header', id: headerId, 'aria-expanded': String(open0), 'aria-controls': bodyId },
    iconChip(icon),
    h('span', { class: 'panel-title-text' }, title),
    chevron,
  );

  const content = h('div', { class: 'panel-body' }, ...body);
  const wrap = h('div', { class: open0 ? 'panel-body-wrap open' : 'panel-body-wrap', id: bodyId }, content);
  wrap.inert = !open0;

  header.addEventListener('click', () => {
    const next = header.getAttribute('aria-expanded') !== 'true';
    header.setAttribute('aria-expanded', String(next));
    wrap.classList.toggle('open', next);
    wrap.inert = !next;
    setPanelOpen(id, next);
  });

  return h('section', { class: sectionClass }, header, wrap);
}

export function panel(title: string, icon: IconName, ...body: Node[]): HTMLElement {
  return disclosure('panel', title, icon, ...body);
}

/** A nested collapsible sub-section inside a panel (lighter styling), e.g. "Fine adjustments" under Pose. */
export function subPanel(title: string, icon: IconName, ...body: Node[]): HTMLElement {
  return disclosure('subpanel', title, icon, ...body);
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

/**
 * A row of mutually exclusive choices, announced as a radio group.
 * `extra` builds content shown only inside the selected option (e.g. an "Edit pose" link); when given,
 * that option renders as a `div[role=radio]` instead of a `button` so it can safely nest the extra control.
 */
export function choiceChips<T extends string>(
  label: string,
  options: readonly { value: T; label: string; title?: string; icon?: Node }[],
  selected: T,
  onSelect: (v: T) => void,
  className = 'chips',
  extra?: (value: T) => Node | null,
): HTMLElement {
  const groupEl = h('div', { class: className, role: 'radiogroup', 'aria-label': label });
  for (const opt of options) {
    const on = opt.value === selected;
    const extraNode = on ? (extra?.(opt.value) ?? null) : null;
    const activate = () => onSelect(opt.value);
    const labelEl = h('span', { class: 'chip-label' }, opt.label);
    const b = extraNode
      ? h('div', { class: on ? 'chip on' : 'chip', role: 'radio', 'aria-checked': String(on), tabindex: '0', title: opt.title })
      : h('button', { type: 'button', class: on ? 'chip on' : 'chip', role: 'radio', 'aria-checked': String(on), title: opt.title });
    if (opt.icon) b.append(opt.icon);
    b.append(extraNode ? h('span', { class: 'chip-text' }, labelEl, extraNode) : labelEl);
    b.addEventListener('click', activate);
    if (extraNode) {
      b.addEventListener('keydown', (e: Event) => {
        const key = (e as KeyboardEvent).key;
        if (key === 'Enter' || key === ' ') {
          e.preventDefault();
          activate();
        }
      });
    }
    groupEl.append(b);
  }
  return groupEl;
}
