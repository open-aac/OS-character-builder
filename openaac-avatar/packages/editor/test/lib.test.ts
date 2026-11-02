import { describe, expect, it, vi } from 'vitest';
import { $, h } from '../src/lib/dom';
import { downloadBlob, downloadUrl, svgToPng } from '../src/lib/files';

describe('$', () => {
  it('returns the matching element', () => {
    document.body.innerHTML = '<div id="here"></div>';
    expect($('#here')).toBeInstanceOf(HTMLElement);
  });

  it('throws a helpful error when nothing matches', () => {
    expect(() => $('#missing')).toThrow(/Missing element #missing/);
  });
});

describe('h', () => {
  it('sets class, data- and aria- as attributes', () => {
    const el = h('div', { class: 'a b', 'data-preset': 'waving', 'aria-label': 'hi' });
    expect(el.className).toBe('a b');
    expect(el.getAttribute('data-preset')).toBe('waving');
    expect(el.getAttribute('aria-label')).toBe('hi');
  });

  it('sets everything else as a property', () => {
    const el = h('input', { type: 'range', value: '5' });
    expect(el.type).toBe('range');
    expect(el.value).toBe('5');
  });

  it('appends string and node children in order', () => {
    const child = h('span', {}, 'inner');
    const el = h('div', {}, 'first', child, 'last');
    expect(el.textContent).toBe('firstinnerlast');
    expect(el.children[0]).toBe(child);
  });

  it('skips undefined props', () => {
    const el = h('button', { title: undefined });
    expect(el.hasAttribute('title')).toBe(false);
  });
});

describe('downloadUrl', () => {
  it('creates a temporary link, clicks it, and removes it', () => {
    downloadUrl('data:text/plain,hi', 'file.txt');
    expect(document.querySelectorAll('a').length).toBe(0);
  });

  it('revokes blob: URLs shortly after', () => {
    vi.useFakeTimers();
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    downloadUrl('blob:mock', 'file.svg');
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revoke).toHaveBeenCalledWith('blob:mock');
    vi.useRealTimers();
  });

  it('does not try to revoke a non-blob URL', () => {
    vi.useFakeTimers();
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    downloadUrl('data:text/plain,hi', 'file.txt');
    vi.advanceTimersByTime(2000);
    expect(revoke).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('downloadBlob', () => {
  it('turns the blob into an object URL and downloads it', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL');
    downloadBlob(new Blob(['<svg/>'], { type: 'image/svg+xml' }), 'file.svg');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });
});

describe('svgToPng', () => {
  it('rasterises the SVG string to a PNG data URL', async () => {
    const url = await svgToPng('<svg></svg>', 64);
    expect(url).toBe('data:image/png;base64,mock');
  });

  it('revokes the intermediate object URL once done', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    await svgToPng('<svg></svg>', 64);
    expect(revoke).toHaveBeenCalledWith('blob:mock');
  });
});
