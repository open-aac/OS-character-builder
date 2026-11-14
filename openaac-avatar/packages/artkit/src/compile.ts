/**
 * Turns the two body extremes (slim `low`, broad `high`) into one art kit.
 */
import { addFarArm, deriveClothes, deriveSeatedTrousers } from './derive.js';
import { jointForPart, expressionOf, hairOf, isBackHair, type ArtKit, type FillRole, type KitPart, type StrokeRole, type Subpath } from '@openaac-avatar/core';
import { parseInkscapeSvg, type RawArt, type RawPart } from './inkscape.js';
import { matchSubpaths, type GapHint } from './match.js';

export interface SourceFile {
  xml: string;
  name: string;
}

export interface CompileInput {
  low: SourceFile;
  high: SourceFile;
  /**
   * Extra art merged into each extreme, e.g. stand-in parts (`addons/*.low.svg`). A low add-on with no
   * matching `.high.svg` (hair and expressions) is used for both extremes, moved with the head.
   */
  addons?: { low: SourceFile[]; high: SourceFile[] };
  view?: string;
}

export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  severity: Severity;
  part?: string;
  message: string;
}

export interface CompileResult {
  kit: ArtKit | null;
  findings: Finding[];
}

/** Placeholder colours from the art prep sheet. The renderer swaps these for the user's choices. */
export const PLACEHOLDER_COLOURS: Record<string, FillRole> = {
  '#d59965': 'skin',
  '#2b190d': 'hair',
  '#482e11': 'iris',
  '#acacac': 'bottom',
  '#000000': 'ink',
};

const isEyebrow = (id: string) => /(^|_)eyebrow(_|$)/.test(id);

/** Style guide line weights at a 1000px canvas. */
export const STROKE_WIDTHS: Record<StrokeRole, number> = { body: 10, face: 5 };

/** White is used for three things; the part name says which. */
function whiteRole(id: string): FillRole {
  if (/^eye_[LR]_fill$|^eye.*white/i.test(id) || /^expression_[a-z]+_eye_[LR]_fill$/.test(id)) return 'eyeWhite';
  if (/^(shirt|top|dress|jacket|coat|sleeve)/i.test(id)) return 'top';
  return 'fixed';
}

/** Clothing is recoloured by what it is, whatever placeholder colour it was drawn in. */
const GARMENT_ROLE: [RegExp, FillRole][] = [
  [/^(shirt|top|dress|jacket|coat|sleeve)/i, 'top'],
  [/^(pants|shorts|trousers|skirt|leggings)/i, 'bottom'],
];

function fillRole(p: RawPart, findings: Finding[]): FillRole | null {
  if (!p.fill) return null;
  if (p.fill === '#2b190d' && isEyebrow(p.id)) return 'eyebrow';
  if (p.fill !== '#000000') for (const [re, role] of GARMENT_ROLE) if (re.test(p.id)) return role;
  if (p.fill === '#ffffff') return whiteRole(p.id);
  const role = PLACEHOLDER_COLOURS[p.fill];
  if (role) return role;
  findings.push({
    severity: 'warning',
    part: p.id,
    message: `fill ${p.fill} is not one of the placeholder colours, so it can't be recoloured (kept as drawn)`,
  });
  return 'fixed';
}

/**
 * Line weight class for a part. If the two files disagree (a slip in one
 * of them), the width closest to a style-guide weight wins.
 */
function strokeRole(pl: RawPart, ph: RawPart, findings: Finding[]): StrokeRole | null {
  const stroked = [pl, ph].filter((p) => p.stroke && p.strokeWidth > 0);
  if (!stroked.length) return null;
  const distance = (w: number) => Math.min(Math.abs(w - STROKE_WIDTHS.body), Math.abs(w - STROKE_WIDTHS.face));
  const best = stroked.reduce((a, b) => (distance(b.strokeWidth) < distance(a.strokeWidth) ? b : a));
  const w = best.strokeWidth;
  const role: StrokeRole = w >= 7.5 ? 'body' : 'face';
  const target = STROKE_WIDTHS[role];
  if (stroked.length === 2 && Math.abs(pl.strokeWidth - ph.strokeWidth) > 0.25) {
    findings.push({
      severity: 'warning',
      part: ph.id,
      message: `outline is ${pl.strokeWidth.toFixed(2)}px in low but ${ph.strokeWidth.toFixed(2)}px in high; using ${target}px`,
    });
  } else if (Math.abs(w - target) > 0.25) {
    findings.push({ severity: 'warning', part: ph.id, message: `outline is ${w.toFixed(2)}px; treated as ${role} weight (${target}px)` });
  }
  if (best.stroke !== '#000000') {
    findings.push({ severity: 'info', part: ph.id, message: `outline colour ${best.stroke} will be drawn as the ink colour` });
  }
  return role;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Front view: the figure is symmetrical, so each left sleeve is drawn as the
 * mirror image of the right one (about the neck), when the two differ. Small
 * differences between hand-drawn sleeves show up clearly once the arms hang
 * down, as one cuff looking different from the other.
 */
function mirrorSleeves(art: RawArt, which: string, findings: Finding[]): void {
  const neck = art.pivots.get('neck');
  if (!neck) return;
  const cx = neck[0];
  for (const left of art.parts) {
    if (!/^(shirt|top|dress|jacket|coat|sleeve)_.*arm_L_/.test(left.id)) continue;
    const right = art.parts.find((p) => p.id === left.id.replace('arm_L_', 'arm_R_'));
    if (!right || right.subpaths.length !== left.subpaths.length) continue;
    const mirrored = right.subpaths.map((sp) => ({ closed: sp.closed, pts: sp.pts.map((v, i) => (i % 2 === 0 ? 2 * cx - v : v)) }));
    // Only report a real difference (not rounding).
    const differ = mirrored.some((sp, i) => sp.pts.length !== left.subpaths[i]!.pts.length || sp.pts.some((v, j) => Math.abs(v - left.subpaths[i]!.pts[j]!) > 1));
    left.subpaths = mirrored;
    if (differ) findings.push({ severity: 'info', part: left.id, message: `drawn as the mirror image of ${right.id} in ${which} (the two sleeves differed)` });
  }
}

/**
 * Where an outline's opening belongs: the limb's middle joint (knee or elbow),
 * where the two segments overlap and a line would show when the limb bends.
 * Ends at the hip, shoulder, ankle and wrist are covered by clothes or the
 * hand and foot, so either file's opening works there.
 */
function gapHint(id: string, low: RawArt, high: RawArt): GapHint | undefined {
  const joint = jointForPart(id);
  const m = joint && /^(hip|knee|shoulder|elbow)_([LR])$/.exec(joint);
  if (!m) return undefined;
  const middle = `${m[1] === 'hip' || m[1] === 'knee' ? 'knee' : 'elbow'}_${m[2]}`;
  const pl = low.pivots.get(middle);
  const ph = high.pivots.get(middle);
  return pl && ph ? { low: pl, high: ph } : undefined;
}
const roundSubpath = (sp: Subpath): Subpath => ({ closed: sp.closed, pts: sp.pts.map(round) });

/** Parts placed by rule rather than at the end, so a later add-on lands after earlier ones of its kind. */
const placedAfterHead = new WeakSet<RawPart>();
const placedFirst = new WeakSet<RawPart>();

/**
 * Where hair goes among the head's parts, following how the designer layered it:
 * hair hanging at the back is first (the renderer draws it behind the body), except in the side view,
 * where it is drawn over the head just after it; short hair in the ¾ and side views is also drawn
 * just after the head, behind the ear and face; everything else is drawn on top.
 */
function placeHair(art: RawArt, p: RawPart, view: string): boolean {
  const h = hairOf(p.id);
  if (!h) return false;
  const behindFace = view !== 'front' && h.style.startsWith('short_');
  if (isBackHair(p.id) && view !== 'side') {
    let i = 0;
    while (i < art.parts.length && placedFirst.has(art.parts[i]!)) i++;
    placedFirst.add(p);
    art.parts.splice(i, 0, p);
    return true;
  }
  const head = art.parts.findIndex((q) => q.id === 'head');
  if ((isBackHair(p.id) || behindFace) && head >= 0) {
    let i = head + 1;
    while (i < art.parts.length && placedAfterHead.has(art.parts[i]!)) i++;
    placedAfterHead.add(p);
    art.parts.splice(i, 0, p);
    return true;
  }
  return false;
}

/** Append add-on parts after the main file's parts (so they draw on top within their joint). */
function withAddons(art: RawArt, addons: { file: SourceFile; shift?: readonly [number, number] }[], view: string): RawArt {
  for (const { file: f, shift } of addons) {
    const extra = parseInkscapeSvg(f.xml, f.name);
    for (const p of extra.parts) {
      if (shift) p.subpaths = p.subpaths.map((sp) => ({ closed: sp.closed, pts: sp.pts.map((v, i) => v + shift[i % 2]!) }));
      if (placeHair(art, p, view)) continue;
      // Leg variant art (and its clothes) goes in as a block where that leg is drawn, so it keeps the
      // leg's place among the body, shirt and arms; other add-ons draw on top within their joint.
      const leg = p.id.includes('@') ? /(?:^|_)(leg_[LR])_/.exec(p.id)?.[1] : undefined;
      const at = leg ? art.parts.findIndex((q) => !q.id.includes('@') && new RegExp(`(?:^|_)${leg}_`).test(q.id)) : -1;
      if (at < 0) {
        art.parts.push(p);
        continue;
      }
      const placed = art.parts.filter((q, i) => i >= at && q.id.includes('@') && q.id.includes(`${leg}_`)).length;
      art.parts.splice(at + placed, 0, p);
    }
    art.problems.push(...extra.problems);
  }
  return art;
}

/** Where the head is: the mean of its outline points. */
function headCentre(art: RawArt): [number, number] | null {
  const head = art.parts.find((p) => p.id === 'head');
  if (!head) return null;
  let x = 0;
  let y = 0;
  let n = 0;
  for (const sp of head.subpaths) {
    for (let i = 0; i + 1 < sp.pts.length; i += 2) {
      x += sp.pts[i]!;
      y += sp.pts[i + 1]!;
      n++;
    }
  }
  return n ? [x / n, y / n] : null;
}

/** The plain face and hair parts that styled hair and expressions replace. */
const PLAIN_FACE = /^(mouth|eyebrow(_[LR])?|eye(_[LR])?_(fill|iris|line))$/;

/** Once the art has styled hair or expressions, the plain parts of the base art are not needed. */
function dropReplaced(art: RawArt, which: string, findings: Finding[]): void {
  const styledFace = art.parts.some((p) => expressionOf(p.id));
  const styledHair = art.parts.some((p) => hairOf(p.id));
  const gone = art.parts.filter((p) => (styledFace && PLAIN_FACE.test(p.id)) || (styledHair && p.id === 'hair'));
  if (!gone.length) return;
  art.parts = art.parts.filter((p) => !gone.includes(p));
  findings.push({ severity: 'info', message: `${which}: plain ${gone.map((p) => p.id).join(', ')} replaced by the hair and expression styles` });
}

export function compileKit(input: CompileInput): CompileResult {
  const findings: Finding[] = [];
  let low: RawArt;
  let high: RawArt;
  const view = input.view ?? 'front';
  try {
    const baseLow = parseInkscapeSvg(input.low.xml, input.low.name);
    const baseHigh = parseInkscapeSvg(input.high.xml, input.high.name);
    // Low-only add-ons (hair, expressions) are used for both extremes, moved by however far the head
    // moves between them (a broader body sits the head a little differently).
    const lowAddons = input.addons?.low ?? [];
    const highAddons = input.addons?.high ?? [];
    const hasHigh = (f: SourceFile) => highAddons.some((h) => h.name === f.name.replace(/\.low\.svg$/, '.high.svg'));
    const derived = lowAddons.filter((f) => !hasHigh(f));
    const a = headCentre(baseLow);
    const b = headCentre(baseHigh);
    const shift: [number, number] = a && b ? [b[0] - a[0], b[1] - a[1]] : [0, 0];
    if (derived.length && !(a && b)) findings.push({ severity: 'warning', message: 'no head part found, so low-only add-ons are not moved between the body sizes' });
    // The high add-ons follow the low ones' order, so both extremes stack their parts the same way.
    const highInOrder = lowAddons.map((f) => {
      const h = highAddons.find((x) => x.name === f.name.replace(/\.low\.svg$/, '.high.svg'));
      return h ? { file: h } : { file: f, shift };
    });
    const highOnly = highAddons.filter((h) => !lowAddons.some((f) => h.name === f.name.replace(/\.low\.svg$/, '.high.svg')));
    low = withAddons(baseLow, lowAddons.map((file) => ({ file })), view);
    high = withAddons(baseHigh, [...highInOrder, ...highOnly.map((file) => ({ file }))], view);
    for (const [art, which] of [[low, 'low'], [high, 'high']] as const) dropReplaced(art, which, findings);
  } catch (e) {
    return { kit: null, findings: [{ severity: 'error', message: (e as Error).message }] };
  }
  // A low-only add-on is read for both extremes, so its notes would appear twice.
  const seenNotes = new Set<string>();
  for (const pr of [...low.problems, ...high.problems]) {
    if (seenNotes.has(pr.message)) continue;
    seenNotes.add(pr.message);
    findings.push(pr);
  }
  if ((input.view ?? 'front') === 'front') {
    for (const [art, which] of [[low, 'low'], [high, 'high']] as const) {
      mirrorSleeves(art, which, findings);
      const seated = deriveSeatedTrousers(art);
      if (seated.length) findings.push({ severity: 'info', message: `${which}: made seated clothing ${seated.join(', ')}` });
    }
  }
  else {
    for (const [art, which] of [[low, 'low'], [high, 'high']] as const) {
      const made = deriveClothes(art);
      const seatedQuarter = input.view === 'three-quarter' ? deriveSeatedTrousers(art, true) : [];
      if (seatedQuarter.length) findings.push({ severity: 'info', message: `${which}: made seated clothing ${seatedQuarter.join(', ')}` });
      if (made.length) findings.push({ severity: 'info', message: `${which}: made stand-in clothing ${made.join(', ')}` });
      if (input.view === 'side') {
        const far = addFarArm(art);
        if (far.length) findings.push({ severity: 'info', message: `${which}: far arm made from the near arm (${far.length} parts)` });
      }
    }
  }

  if (low.width !== high.width || low.height !== high.height) {
    findings.push({
      severity: 'error',
      message: `page sizes differ: low ${low.width}×${low.height}, high ${high.width}×${high.height}`,
    });
  }

  const index = (art: RawArt, which: string) => {
    const map = new Map<string, RawPart>();
    for (const p of art.parts) {
      if (map.has(p.id)) findings.push({ severity: 'error', part: p.id, message: `appears twice in ${which}` });
      map.set(p.id, p);
    }
    return map;
  };
  const lowParts = index(low, 'low');
  const highParts = index(high, 'high');

  for (const id of lowParts.keys()) {
    if (!highParts.has(id)) findings.push({ severity: 'error', part: id, message: 'is in low but missing from high' });
  }
  for (const id of highParts.keys()) {
    if (!lowParts.has(id)) findings.push({ severity: 'error', part: id, message: 'is in high but missing from low' });
  }

  // Drawing order follows the high file; flag if low disagrees.
  const shared = high.parts.map((p) => p.id).filter((id) => lowParts.has(id));
  const lowOrder = low.parts.map((p) => p.id).filter((id) => highParts.has(id));
  if (shared.join('|') !== lowOrder.join('|')) {
    findings.push({ severity: 'warning', message: 'layer order differs between the two files; using the order in high' });
  }

  const parts: KitPart[] = [];
  for (const id of shared) {
    const pl = lowParts.get(id)!;
    const ph = highParts.get(id)!;
    if (pl.pathEffect || ph.pathEffect) {
      findings.push({ severity: 'warning', part: id, message: 'still has a live path effect attached; the saved shape is used as-is' });
    }
    if (pl.opacity < 1 || ph.opacity < 1) {
      findings.push({ severity: 'info', part: id, message: 'has transparency, which is ignored (parts are drawn fully opaque)' });
    }
    if (pl.fill !== ph.fill || pl.stroke !== ph.stroke) {
      findings.push({ severity: 'warning', part: id, message: `colours differ between files (low ${pl.fill}, high ${ph.fill}); using high` });
    }
    if (pl.subpaths.length !== ph.subpaths.length) {
      findings.push({
        severity: 'error',
        part: id,
        message: `has ${pl.subpaths.length} separate outline(s) in low but ${ph.subpaths.length} in high; these need to match`,
      });
      continue;
    }
    const lowShapes: Subpath[] = [];
    const highShapes: Subpath[] = [];
    pl.subpaths.forEach((sl, i) => {
      const sh = ph.subpaths[i]!;
      const m = matchSubpaths(sl, sh, gapHint(id, low, high));
      for (const note of m.notes) {
        findings.push({ severity: 'warning', part: id, message: pl.subpaths.length > 1 ? `outline ${i + 1}: ${note}` : note });
      }
      lowShapes.push(roundSubpath(m.low));
      highShapes.push(roundSubpath(m.high));
    });

    const fr = fillRole(ph, findings);
    parts.push({
      id,
      fillRole: fr,
      fill: ph.fill,
      strokeRole: strokeRole(pl, ph, findings),
      shapes: { low: lowShapes, high: highShapes },
    });
  }

  // Pivots.
  const pivots: ArtKit['pivots'] = {};
  for (const [name, pl] of low.pivots) {
    const ph = high.pivots.get(name);
    if (!ph) {
      findings.push({ severity: 'error', message: `pivot_${name} is in low but missing from high` });
      continue;
    }
    pivots[name] = { low: [round(pl[0]), round(pl[1])], high: [round(ph[0]), round(ph[1])] };
  }
  for (const name of high.pivots.keys()) {
    if (!low.pivots.has(name)) findings.push({ severity: 'error', message: `pivot_${name} is in high but missing from low` });
  }
  if (!low.pivots.size) findings.push({ severity: 'error', message: 'no "pivots" layer found' });

  const hasErrors = findings.some((f) => f.severity === 'error');
  const kit: ArtKit = {
    format: 'openaac-avatar-kit',
    version: 1,
    view: input.view ?? 'front',
    canvas: { width: high.width, height: high.height },
    strokeWidths: { ...STROKE_WIDTHS },
    parts,
    pivots,
    source: { files: { low: input.low.name, high: input.high.name }, compiledAt: new Date().toISOString() },
  };
  return { kit: hasErrors ? null : kit, findings };
}
