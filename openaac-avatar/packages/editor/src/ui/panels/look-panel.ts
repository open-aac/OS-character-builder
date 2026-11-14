/**
 * "Look": three tabs in one collapsible panel.
 *   Hair/Face  hair style and expression; the preview zooms in on the head while this tab is open
 *   Clothing   garments
 *   Colours    colours and line weight
 */
import { h } from '../../lib/dom';
import { isPanelOpen } from '../../state/panel-collapse';
import type { LookTab, Store } from '../../state/store';
import { panel } from '../components';
import { clothingFields } from './clothing-panel';
import { coloursFields } from './colours-panel';
import { expressionFields, hairFields } from './face-panel';
import { linesFields } from './lines-panel';

const TABS: readonly { id: LookTab; label: string }[] = [
  { id: 'clothing', label: 'Clothing' },
  { id: 'face', label: 'Hair/Face' },
  { id: 'colours', label: 'Colours' },
];

export function lookPanel(store: Store): HTMLElement {
  const content: Record<LookTab, Node[]> = {
    face: [...hairFields(store), ...expressionFields(store)],
    clothing: clothingFields(store),
    colours: [...coloursFields(store), h('p', { class: 'field-label' }, 'Line weight'), ...linesFields(store)],
  };

  const tabButtons = new Map<LookTab, HTMLButtonElement>();
  const tabPanels = new Map<LookTab, HTMLElement>();
  const tablist = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Look options' });
  for (const { id, label } of TABS) {
    const tab = h('button', { type: 'button', class: 'tab', role: 'tab', id: `look-tab-${id}`, 'aria-controls': `look-tabpanel-${id}` }, label);
    tab.addEventListener('click', () => select(id));
    tab.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const next = TABS[(TABS.findIndex((t) => t.id === id) + step + TABS.length) % TABS.length]!.id;
      select(next);
      tabButtons.get(next)!.focus();
    });
    tabButtons.set(id, tab);
    tablist.append(tab);
    tabPanels.set(id, h('div', { class: 'tab-panel', role: 'tabpanel', id: `look-tabpanel-${id}`, 'aria-labelledby': `look-tab-${id}` }, ...content[id]));
  }

  const el = panel('Look', 'clothing', tablist, ...tabPanels.values());
  const header = el.querySelector<HTMLButtonElement>('.panel-header')!;

  /** The preview is zoomed in on the head only while the Look panel is open on the Hair/Face tab. */
  const syncZoom = () => store.setHeadZoom(header.getAttribute('aria-expanded') === 'true' && store.lookTab === 'face');

  function show(tab: LookTab): void {
    store.lookTab = tab;
    for (const { id } of TABS) {
      const on = id === tab;
      const button = tabButtons.get(id)!;
      button.setAttribute('aria-selected', String(on));
      button.tabIndex = on ? 0 : -1;
      tabPanels.get(id)!.hidden = !on;
    }
  }
  function select(tab: LookTab): void {
    show(tab);
    syncZoom();
  }

  // Panels are rebuilt often (every chip click), so the tab and the zoom are kept in the store.
  show(store.lookTab);
  store.setHeadZoom(isPanelOpen('look', false) && store.lookTab === 'face');
  // The panel's own handler runs first, so `aria-expanded` is already the new state here.
  header.addEventListener('click', syncZoom);
  return el;
}
