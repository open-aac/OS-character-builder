/**
 * Imports the designer's delivered files into art/source/<view>/.
 *
 *   pnpm art:import <low.svg> <high.svg>
 *
 * The delivered files hold every view as a top-level layer (front, `…3-4`,
 * `…side`). Each view is written to its own pair of files, and part names
 * are normalised so the rig can read them:
 *
 * - A generic name inside a sided group takes the side, e.g. `hand` in
 *   `arm_L` → `arm_L_hand`, `eye_fill` in `eye_R` → `eye_R_fill`.
 * - Side view: the figure faces the viewer's left, so the one arm and leg
 *   we see are the figure's left. Unsided names get `_L`, e.g.
 *   `arm_upper` → `arm_L_upper`, `pivot_knee` → `pivot_knee_L`.
 * - ¾ view: the single ear drawn is the figure's left ear (`ear` → `ear_L`).
 * - Garment layers (`shirt_tight_long`, …) hidden in Inkscape are shown again:
 *   they are alternatives the designer toggles while drawing.
 *
 * Originals are kept in art/source/delivered/ for reference.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

const NS_INKSCAPE = 'http://www.inkscape.org/namespaces/inkscape';
/** A garment group, e.g. `shirt_tight_long`. */
const GARMENT = /^(shirt|top|dress|jacket|coat|pants|shorts|trousers|skirt|leggings)_[a-z]+_[a-z]+$/;
const root = resolve(import.meta.dirname, '..');
const [lowFile, highFile] = process.argv.slice(2);
if (!lowFile || !highFile) {
  console.error('usage: pnpm art:import <low.svg> <high.svg>');
  process.exit(1);
}

/** View id for a top-level layer label. */
function viewOf(label: string): string {
  if (/3-4|three|quarter/i.test(label)) return 'three-quarter';
  if (/side|profile/i.test(label)) return 'side';
  return 'front';
}

const label = (el: Element) => el.getAttributeNS(NS_INKSCAPE, 'label') || el.getAttribute('inkscape:label') || '';
const setLabel = (el: Element, v: string) => el.setAttribute('inkscape:label', v);
const elements = (el: Element) => {
  const out: Element[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) out.push(n as Element);
  return out;
};

/** The figure side named by the nearest sided ancestor group (`arm_L`, `eye_R`, …). */
function sideFrom(groups: string[]): { side: string; group: string } | null {
  for (let i = groups.length - 1; i >= 0; i--) {
    const m = /^(.*)_([LR])(@\w+)?$/.exec(groups[i]!);
    if (m) return { side: m[2]!, group: m[1]! };
  }
  return null;
}

function normalise(name: string, groups: string[], view: string): string {
  let n = name;
  const sided = sideFrom(groups);
  if (sided && !/_[LR](_|@|$)/.test(n)) {
    if (sided.group === 'arm' && n === 'hand') n = `arm_${sided.side}_hand`;
    else if (n.startsWith(`${sided.group}_`)) n = `${sided.group}_${sided.side}${n.slice(sided.group.length)}`;
  }
  if (view === 'side') {
    n = n
      .replace(/^(arm|leg)(_|$)/, '$1_L$2')
      .replace(/^(shirt|pants)_(arm|leg)_/, '$1_$2_L_')
      .replace(/^(eye|eyebrow|ear)(_|$)/, '$1_L$2')
      .replace(/^hand$/, 'arm_L_hand')
      .replace(/^pivot_(shoulder|elbow|wrist|hip|knee|ankle)$/, 'pivot_$1_L');
  }
  if (view === 'three-quarter') n = n.replace(/^ear$/, 'ear_L');
  return n;
}

function walk(el: Element, groups: string[], view: string, renamed: Map<string, string>): void {
  for (const child of elements(el)) {
    const l = label(child);
    if (child.localName === 'g') {
      // Garments are alternatives, so the designer hides some while drawing others; all are needed.
      const style = child.getAttribute('style') ?? '';
      if (GARMENT.test(l) && /display\s*:\s*none/.test(style)) {
        child.setAttribute('style', style.replace(/display\s*:\s*none/, 'display:inline'));
        renamed.set(`${l} (hidden layer)`, 'shown');
      }
      walk(child, l ? [...groups, l] : groups, view, renamed);
    } else if (l) {
      const n = normalise(l, groups, view);
      if (n !== l) {
        setLabel(child, n);
        renamed.set(l + (groups.length ? ` (in ${groups[groups.length - 1]})` : ''), n);
      }
    }
  }
}

const which = { low: lowFile, high: highFile } as const;
mkdirSync(join(root, 'art/source/delivered'), { recursive: true });
for (const [extreme, file] of Object.entries(which)) {
  copyFileSync(file, join(root, 'art/source/delivered', basename(file)));
  const xml = readFileSync(file, 'utf8');
  const layers = elements(new DOMParser().parseFromString(xml, 'image/svg+xml').documentElement).filter(
    (e) => e.localName === 'g' && e.getAttribute('inkscape:groupmode') === 'layer',
  );
  for (const keep of layers) {
    const view = viewOf(label(keep));
    // Fresh copy per view, with only that view's layer left in it.
    const doc = new DOMParser().parseFromString(xml, 'image/svg+xml');
    const svg = doc.documentElement;
    for (const layer of elements(svg)) {
      if (layer.localName === 'g' && layer.getAttribute('inkscape:groupmode') === 'layer' && label(layer) !== label(keep)) svg.removeChild(layer);
    }
    const renamed = new Map<string, string>();
    walk(svg, [], view, renamed);
    const dir = join(root, 'art/source', view);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `bm_${extreme}.svg`), new XMLSerializer().serializeToString(doc));
    console.log(`${extreme} · ${label(keep)} → art/source/${view}/bm_${extreme}.svg${renamed.size ? `, renamed ${renamed.size}:` : ''}`);
    for (const [from, to] of renamed) console.log(`    ${from} → ${to}`);
  }
}
