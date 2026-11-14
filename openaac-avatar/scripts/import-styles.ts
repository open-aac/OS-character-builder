/**
 * Splits the designer's hair and expression files into add-ons for the art kit.
 *
 *   pnpm art:import-styles [folder]
 *
 * The folder (default art/source/delivered/Hair+FacialExpressions) holds low-body files named
 * `*_expressions.svg` and `*_hair_<length>_<texture>.svg`. For each view this writes
 *   art/source/<view>/addons/expressions.low.svg
 *   art/source/<view>/addons/hair-<length>_<texture>.low.svg
 * with parts renamed to `expression_<name>_<part>` and `hair_<length>_<texture>_<piece>`. There is no
 * high file: the kit compiler uses the low shapes for both ends of the body slider, moved with the head.
 *
 * Each file also carries a copy of the body, a hair-less face and, in the expressions file, front-view
 * hair left over from drawing. Only the expression groups and the hair belonging to the file's style are
 * taken. Anything skipped or fixed is listed in the output.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { elements, label, normalise, setLabel, viewOf } from './lib/art-names.js';

const root = resolve(import.meta.dirname, '..');
const dir = resolve(process.argv[2] ?? join(root, 'art/source/delivered/Hair+FacialExpressions'));
const LEAF = new Set(['path', 'ellipse', 'circle', 'rect']);
/** Samples and drafts that were left in the files. */
const STRAY = /sample|buzzcut/i;

type Kind = { kind: 'expressions' } | { kind: 'hair'; style: string };

function kindOf(file: string): Kind | null {
  if (/_expressions\.svg$/.test(file)) return { kind: 'expressions' };
  const m = /_hair_([a-z]+_[a-z]+)\.svg$/.exec(file);
  return m ? { kind: 'hair', style: m[1]! } : null;
}

const isHidden = (el: Element) => /display\s*:\s*none/.test(el.getAttribute('style') ?? '');
const show = (el: Element) => el.setAttribute('style', (el.getAttribute('style') ?? '').replace(/display\s*:\s*none/, 'display:inline'));

/** The new name for a leaf, or null if it is not part of this file's add-on. */
function rename(leaf: string, groups: string[], view: string, kind: Kind, notes: Map<string, string>): string | null {
  if (STRAY.test(leaf)) {
    notes.set(leaf, 'skipped (draft or front-only style)');
    return null;
  }
  if (kind.kind === 'expressions') {
    const expr = [...groups].reverse().find((g) => /^expression_[a-z]+$/.test(g));
    if (!expr) return null;
    // The side view carries a stray copy of the front view's sided eyebrows next to its own.
    if (view === 'side' && /_[LR](_|$)/.test(leaf)) {
      notes.set(`${expr}/${leaf}`, 'skipped (front-view leftover in the side view)');
      return null;
    }
    return `${expr}_${normalise(leaf, groups, view)}`;
  }
  const m = /^hair(?:_([a-z]+_[a-z]+))?(?:_(.+))?$/.exec(leaf);
  if (!m) return null;
  const piece = m[2] ?? 'front';
  const named = m[1];
  if (named && named !== kind.style) notes.set(leaf, `relabelled as ${kind.style} (it is in the ${kind.style} file)`);
  if (!named && m[2]) return null; // e.g. `hair_back` without a style: not something we can place
  return `hair_${kind.style}_${piece}`;
}

function extract(xml: string, layerLabel: string, view: string, kind: Kind, notes: Map<string, string>): { xml: string; names: string[] } {
  const doc = new DOMParser().parseFromString(xml, 'image/svg+xml');
  const svg = doc.documentElement;
  for (const layer of elements(svg)) {
    if (layer.localName === 'g' && layer.getAttribute('inkscape:groupmode') === 'layer' && label(layer) !== layerLabel) svg.removeChild(layer);
  }
  const names: string[] = [];
  const seen = new Set<string>();
  const walk = (el: Element, groups: string[]): boolean => {
    let kept = false;
    for (const child of elements(el)) {
      const l = label(child);
      if (child.localName === 'g') {
        if (/^(pivots?|clothing)$/i.test(l)) {
          el.removeChild(child);
          continue;
        }
        const inside = walk(child, l ? [...groups, l] : groups);
        if (!inside) el.removeChild(child);
        else {
          if (isHidden(child)) {
            show(child);
            notes.set(`${l || 'group'} (hidden layer)`, 'shown');
          }
          kept = true;
        }
      } else if (LEAF.has(child.localName)) {
        const n = l ? rename(l, groups, view, kind, notes) : null;
        if (!n) {
          el.removeChild(child);
        } else if (seen.has(n)) {
          notes.set(`${l} (duplicate of ${n})`, 'skipped');
          el.removeChild(child);
        } else {
          seen.add(n);
          names.push(n);
          if (n !== l) notes.set(l, n);
          setLabel(child, n);
          if (isHidden(child)) show(child);
          kept = true;
        }
      }
    }
    return kept;
  };
  walk(svg, []);
  return { xml: new XMLSerializer().serializeToString(doc), names };
}

let written = 0;
for (const file of readdirSync(dir).sort()) {
  const kind = kindOf(file);
  if (!kind) continue;
  const xml = readFileSync(join(dir, file), 'utf8');
  const layers = elements(new DOMParser().parseFromString(xml, 'image/svg+xml').documentElement).filter(
    (e) => e.localName === 'g' && e.getAttribute('inkscape:groupmode') === 'layer' && /^BM_/.test(label(e)),
  );
  for (const layer of layers) {
    const view = viewOf(label(layer));
    const notes = new Map<string, string>();
    // The layer itself may be switched off while the designer works on another view.
    const doc = new DOMParser().parseFromString(xml, 'image/svg+xml');
    for (const l of elements(doc.documentElement)) if (label(l) === label(layer) && isHidden(l)) show(l);
    const { xml: out, names } = extract(new XMLSerializer().serializeToString(doc), label(layer), view, kind, notes);
    if (!names.length) {
      console.log(`${file} · ${label(layer)}: nothing to import`);
      continue;
    }
    const outDir = join(root, 'art/source', view, 'addons');
    mkdirSync(outDir, { recursive: true });
    const name = kind.kind === 'expressions' ? 'expressions.low.svg' : `hair-${kind.style}.low.svg`;
    writeFileSync(join(outDir, name), out);
    written++;
    console.log(`${file} · ${label(layer)} → art/source/${view}/addons/${name} (${names.length} parts)`);
    for (const n of names) console.log(`    ${n}`);
    for (const [from, to] of notes) if (!names.includes(to)) console.log(`    ! ${from}: ${to}`);
    for (const [from, to] of notes) if (names.includes(to)) console.log(`    ${from} → ${to}`);
  }
}
console.log(`wrote ${written} add-on files`);
