/**
 * jsdom stands in for the real browser in tests, but it does not implement
 * every API the editor touches. Stub the missing pieces once, here, so each
 * test can simulate user input without worrying about plumbing.
 */
import { afterEach, vi } from 'vitest';

if (!window.matchMedia) {
  window.matchMedia = ((query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia;
}

// jsdom has no object URL store at all; a fake value is enough since nothing dereferences it.
URL.createObjectURL = vi.fn(() => 'blob:mock');
URL.revokeObjectURL = vi.fn();

// jsdom's <img> never actually loads anything, so decode() would hang forever.
HTMLImageElement.prototype.decode = vi.fn(() => Promise.resolve());

// jsdom has no real canvas backend; fake just enough of the 2D context for svgToPng().
const fakeContext = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeContext) as unknown as typeof HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,mock');

if (!navigator.clipboard) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(() => Promise.resolve()) },
    configurable: true,
  });
}

// Recent jsdom supports <dialog>; polyfill just in case the installed version does not.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
}
if (!HTMLDialogElement.prototype.close) {
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
}

// downloadUrl() clicks a real <a download> to trigger a save; jsdom has no
// concept of "download" and logs a noisy "navigation not implemented" error
// for it, so stop the click before it tries to navigate.
document.addEventListener(
  'click',
  (e) => {
    if ((e.target as HTMLElement).closest?.('a[download]')) e.preventDefault();
  },
  true,
);

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  vi.restoreAllMocks();
});
