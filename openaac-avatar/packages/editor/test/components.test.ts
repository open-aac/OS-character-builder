import { afterEach, describe, expect, it, vi } from 'vitest';
import { button, choiceChips, group, hint, panel, slider, subPanel } from '../src/ui/components';

afterEach(() => {
  localStorage.clear();
});

describe('panel', () => {
  it('builds a disclosure section with an icon chip; Pose is open by default', () => {
    const el = panel('Pose', 'pose', hint('x'));
    expect(el.tagName).toBe('SECTION');
    expect(el.className).toBe('panel');
    const header = el.querySelector('.panel-header')!;
    expect(header.querySelector('.panel-title-text')?.textContent).toBe('Pose');
    expect(header.querySelector('.icon-chip')).toBeTruthy();
    expect(header.getAttribute('aria-expanded')).toBe('true');
  });

  it('every other panel starts collapsed by default', () => {
    const el = panel('Body', 'body', hint('x'));
    expect(el.querySelector('.panel-header')!.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector<HTMLElement>('.panel-body-wrap')!.inert).toBe(true);
  });

  it('clicking the header toggles aria-expanded, the open class, and inert on the content', () => {
    const el = panel('Pose', 'pose', hint('x'));
    const header = el.querySelector<HTMLButtonElement>('.panel-header')!;
    const wrap = el.querySelector<HTMLElement>('.panel-body-wrap')!;
    expect(wrap.classList.contains('open')).toBe(true);
    expect(wrap.inert).toBe(false);

    header.click();
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(wrap.classList.contains('open')).toBe(false);
    expect(wrap.inert).toBe(true);

    header.click();
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(wrap.classList.contains('open')).toBe(true);
    expect(wrap.inert).toBe(false);
  });

  it('connects the header and content with aria-controls/id', () => {
    const el = panel('Body', 'body', hint('x'));
    const header = el.querySelector<HTMLButtonElement>('.panel-header')!;
    const wrap = el.querySelector<HTMLElement>('.panel-body-wrap')!;
    expect(header.getAttribute('aria-controls')).toBe(wrap.id);
    expect(wrap.id).toBeTruthy();
  });

  it('remembers open/closed state per panel across instances (persisted)', () => {
    const first = panel('Pose', 'pose', hint('x'));
    first.querySelector<HTMLButtonElement>('.panel-header')!.click();
    expect(first.querySelector('.panel-header')!.getAttribute('aria-expanded')).toBe('false');

    const second = panel('Pose', 'pose', hint('x'));
    expect(second.querySelector('.panel-header')!.getAttribute('aria-expanded')).toBe('false');
  });

  it('a panel listed as collapsed-by-default starts closed', () => {
    const el = panel('Fine adjustments', 'adjust', hint('x'));
    expect(el.querySelector('.panel-header')!.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector<HTMLElement>('.panel-body-wrap')!.inert).toBe(true);
  });
});

describe('subPanel', () => {
  it('builds a nested disclosure with the "subpanel" class', () => {
    const el = subPanel('Fine adjustments', 'adjust', hint('x'));
    expect(el.tagName).toBe('SECTION');
    expect(el.className).toBe('subpanel');
    expect(el.querySelector('.panel-title-text')?.textContent).toBe('Fine adjustments');
  });
});

describe('group', () => {
  it('builds a toned fieldset with a legend', () => {
    const el = group('Right arm', 'arm', 'blue', hint('x'));
    expect(el.tagName).toBe('FIELDSET');
    expect(el.className).toContain('tone-blue');
    expect(el.querySelector('legend span:last-child')?.textContent).toBe('Right arm');
  });
});

describe('hint', () => {
  it('renders a paragraph with the hint class', () => {
    const el = hint('Be careful');
    expect(el.tagName).toBe('P');
    expect(el.className).toBe('hint');
    expect(el.textContent).toBe('Be careful');
  });
});

describe('button', () => {
  it('calls onClick when clicked, and applies the variant class', () => {
    const onClick = vi.fn();
    const b = button('Go', onClick, 'primary');
    expect(b.className).toBe('btn btn-primary');
    b.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('defaults to the soft variant', () => {
    expect(button('Go', () => {}).className).toBe('btn btn-soft');
  });
});

describe('slider', () => {
  it('shows the formatted initial value', () => {
    const el = slider({ label: 'Body', min: 0, max: 1, step: 0.1, value: 0.5, format: (v) => `${v * 100}%`, onInput: () => {} });
    expect(el.querySelector('output')?.textContent).toBe('50%');
  });

  it('calls onInput with a number, and updates the output, as the user drags it', () => {
    const onInput = vi.fn();
    const el = slider({ label: 'Body', min: 0, max: 1, step: 0.1, value: 0.5, format: (v) => `${Math.round(v * 100)}%`, onInput });
    const input = el.querySelector('input')!;
    input.value = '0.8';
    input.dispatchEvent(new Event('input'));
    expect(onInput).toHaveBeenCalledWith(0.8);
    expect(el.querySelector('output')?.textContent).toBe('80%');
  });

  it('shows the end labels when given', () => {
    const el = slider({ label: 'Body', min: 0, max: 1, step: 0.1, value: 0, ends: ['Slim', 'Broad'], onInput: () => {} });
    const ends = el.querySelectorAll('.ends span');
    expect(ends[0]?.textContent).toBe('Slim');
    expect(ends[1]?.textContent).toBe('Broad');
  });

  it('disables the input and shows "fixed" when given a reason', () => {
    const el = slider({ label: 'Knee', min: -30, max: 30, step: 1, value: 0, disabledReason: 'Locked', onInput: () => {} });
    expect(el.querySelector('input')?.disabled).toBe(true);
    expect(el.querySelector('output')?.textContent).toBe('fixed');
    expect(el.getAttribute('title')).toBe('Locked');
  });
});

describe('choiceChips', () => {
  const options = [
    { value: 'a', label: 'Option A' },
    { value: 'b', label: 'Option B' },
  ];

  it('marks the selected option as checked', () => {
    const el = choiceChips('Pick', options, 'b', () => {});
    const chips = el.querySelectorAll<HTMLButtonElement>('.chip');
    expect(chips[0]?.getAttribute('aria-checked')).toBe('false');
    expect(chips[1]?.getAttribute('aria-checked')).toBe('true');
    expect(chips[1]?.className).toContain('on');
  });

  it('calls onSelect with the clicked option value', () => {
    const onSelect = vi.fn();
    const el = choiceChips('Pick', options, 'a', onSelect);
    el.querySelectorAll<HTMLButtonElement>('.chip')[1]?.click();
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('is announced as a radio group', () => {
    const el = choiceChips('Pick one', options, 'a', () => {});
    expect(el.getAttribute('role')).toBe('radiogroup');
    expect(el.getAttribute('aria-label')).toBe('Pick one');
  });
});
