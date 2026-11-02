/** Tiny DOM helpers; the editor has no UI framework. */

export const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element ${selector} in index.html`);
  return el;
};

type Props<K extends keyof HTMLElementTagNameMap> = Partial<HTMLElementTagNameMap[K]> & Record<string, unknown>;

/** Create an element: `class`, `data-*`, `aria-*` and `role` become attributes; everything else is set as a property. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props<K> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'role' || k.startsWith('data-') || k.startsWith('aria-')) el.setAttribute(k, String(v));
    else (el as unknown as Record<string, unknown>)[k] = v;
  }
  el.append(...children);
  return el;
}
