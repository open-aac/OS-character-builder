/** Small line icons for panel and group headings (24×24, drawn with currentColor). */

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  pose: svg('<circle cx="12" cy="6" r="3"/><path d="M6 21v-2a6 6 0 0 1 12 0v2"/>'),
  adjust: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9l2.1 2.1m10 10 2.1 2.1M4.9 19.1 7 17m10-10 2.1-2.1"/>'),
  body: svg('<path d="M12 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z"/><path d="M5 21c0-5 3-9 7-9s7 4 7 9"/><path d="M3 15h3m12 0h3"/>'),
  colours: svg('<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.6-2.2-.4-1.2.3-2.3 1.6-2.3H17a4 4 0 0 0 4-4c0-5.2-4-9.5-9-9.5Z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="14.5" cy="7" r="1.2"/>'),
  lines: svg('<path d="M4 7h16"/><path d="M4 12h16" stroke-width="3"/><path d="M4 17h16" stroke-width="4.5"/>'),
  export: svg('<path d="M12 3v12m0 0-5-5m5 5 5-5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'),
  head: svg('<circle cx="12" cy="11" r="7"/><path d="M9 10h.01M15 10h.01M9.5 14a3.5 3.5 0 0 0 5 0"/><path d="M6 8c2-3 10-3 12 0"/>'),
  arm: svg('<path d="M6 4c0 6 2 10 7 11l4 1"/><path d="M17 13l3 3-3 3"/>'),
  clothing: svg('<path d="M8 3 3 6l2 5 3-1v11h8V10l3 1 2-5-5-3c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3Z"/>'),
  leg: svg('<path d="M9 3v9l-1 8h5"/><path d="M14 3v9l1 4"/>'),
};

export type IconName = keyof typeof ICONS;
