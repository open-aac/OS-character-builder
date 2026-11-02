/**
 * Makes two versions of a shape blendable: same number of segments, and
 * corresponding points in the same order.
 */
import type { Subpath } from '@openaac-avatar/core';

type Seg = [number, number, number, number, number, number]; // c1x c1y c2x c2y x y

function segments(sp: Subpath): Seg[] {
  const out: Seg[] = [];
  for (let i = 2; i + 5 < sp.pts.length; i += 6) out.push(sp.pts.slice(i, i + 6) as Seg);
  return out;
}

function fromSegments(start: [number, number], segs: Seg[], closed: boolean): Subpath {
  const pts = [start[0], start[1]];
  for (const s of segs) pts.push(...s);
  return { closed, pts };
}

export function segmentCount(sp: Subpath): number {
  return (sp.pts.length - 2) / 6;
}

/** Split a cubic at t using de Casteljau. */
function split(p0: [number, number], s: Seg, t: number): [Seg, Seg] {
  const l = (a: number, b: number) => a + (b - a) * t;
  const [x1, y1, x2, y2, x3, y3] = s;
  const [x0, y0] = p0;
  const ax = l(x0, x1), ay = l(y0, y1);
  const bx = l(x1, x2), by = l(y1, y2);
  const cx = l(x2, x3), cy = l(y2, y3);
  const dx = l(ax, bx), dy = l(ay, by);
  const ex = l(bx, cx), ey = l(by, cy);
  const fx = l(dx, ex), fy = l(dy, ey);
  return [
    [ax, ay, dx, dy, fx, fy],
    [ex, ey, cx, cy, x3, y3],
  ];
}

function chord(p0: [number, number], s: Seg): number {
  // Control polygon length: a cheap upper bound on arc length.
  return (
    Math.hypot(s[0] - p0[0], s[1] - p0[1]) + Math.hypot(s[2] - s[0], s[3] - s[1]) + Math.hypot(s[4] - s[2], s[5] - s[3])
  );
}

/** Add nodes by halving the longest segment until the shape has `target` segments. The outline itself is unchanged. */
export function subdivideTo(sp: Subpath, target: number, protectLast = false): Subpath {
  const start: [number, number] = [sp.pts[0]!, sp.pts[1]!];
  const segs = segments(sp);
  while (segs.length < target) {
    let best = 0;
    let bestLen = -1;
    let p: [number, number] = start;
    let bestStart = start;
    segs.forEach((s, i) => {
      const len = chord(p, s);
      if (len > bestLen && !(protectLast && i === segs.length - 1)) {
        bestLen = len;
        best = i;
        bestStart = p;
      }
      p = [s[4], s[5]];
    });
    const [a, b] = split(bestStart, segs[best]!, 0.5);
    segs.splice(best, 1, a, b);
  }
  return fromSegments(start, segs, sp.closed);
}

/** Reverse drawing direction. */
export function reverse(sp: Subpath): Subpath {
  const segs = segments(sp);
  const nodes: [number, number][] = [[sp.pts[0]!, sp.pts[1]!], ...segs.map((s) => [s[4], s[5]] as [number, number])];
  const out: Seg[] = [];
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i]!;
    const prev = nodes[i]!;
    out.push([s[2], s[3], s[0], s[1], prev[0], prev[1]]);
  }
  const end = nodes[nodes.length - 1]!;
  return fromSegments(end, out, sp.closed);
}

/** For a closed path, start at node k instead of node 0. */
export function rotateStart(sp: Subpath, k: number): Subpath {
  if (!sp.closed || k === 0) return sp;
  const segs = segments(sp);
  const n = segs.length;
  const rotated = [...segs.slice(k), ...segs.slice(0, k)];
  const prev = segs[(k - 1 + n) % n]!;
  return fromSegments([prev[4], prev[5]], rotated, true);
}

function nodes(sp: Subpath): [number, number][] {
  const out: [number, number][] = [[sp.pts[0]!, sp.pts[1]!]];
  for (let i = 6; i < sp.pts.length; i += 6) out.push([sp.pts[i]!, sp.pts[i + 1]!]);
  return out;
}

/**
 * Node positions scaled into a unit box. The slim and broad versions of a
 * part differ a lot in width, so shapes are compared after stretching both
 * to the same box: what matters is where each node sits *on the outline*
 * (top-left corner, bottom middle...), not how far apart the shapes are.
 */
function normalised(sp: Subpath): [number, number][] {
  const ns = nodes(sp);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ns) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  return ns.map(([x, y]) => [(x - minX) / w, (y - minY) / h]);
}

/** How badly two equal-length shapes correspond, node by node. */
function mismatch(a: Subpath, b: Subpath): number {
  const na = normalised(a);
  const nb = normalised(b);
  let sum = 0;
  for (let i = 0; i < na.length; i++) {
    const dx = na[i]![0] - nb[i]![0];
    const dy = na[i]![1] - nb[i]![1];
    sum += dx * dx + dy * dy;
  }
  return sum;
}

export interface MatchResult {
  low: Subpath;
  high: Subpath;
  notes: string[];
}

/** Close an open path with a straight segment back to its start (the edge an SVG fill uses anyway). */
function closeWithLine(sp: Subpath): Subpath {
  const p = sp.pts;
  const x0 = p[p.length - 2]!, y0 = p[p.length - 1]!;
  const x1 = p[0]!, y1 = p[1]!;
  return {
    closed: true,
    pts: [...p, x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3, x0 + (2 * (x1 - x0)) / 3, y0 + (2 * (y1 - y0)) / 3, x1, y1],
  };
}

function dropLast(sp: Subpath): Subpath {
  return { closed: false, pts: sp.pts.slice(0, -6) };
}

/**
 * Line `other` up with `ref`: same segment count, same start point and
 * direction. `ref` is never re-ordered, so its segment indices stay put.
 */
function align(ref: Subpath, other: Subpath, refName: string, otherName: string, protectRefLast: boolean) {
  const notes: string[] = [];
  const nr = segmentCount(ref);
  const no = segmentCount(other);
  if (nr !== no) {
    notes.push(
      `node count differs (${refName} ${nr}, ${otherName} ${no}); added ${Math.abs(nr - no)} node(s) to ${nr < no ? refName : otherName} automatically`,
    );
    if (nr < no) ref = subdivideTo(ref, no, protectRefLast);
    else other = subdivideTo(other, nr);
  }

  const identity = mismatch(ref, other);
  let best = other;
  let bestCost = identity;
  let bestDesc = '';
  const n = segmentCount(other);
  const candidates: [Subpath, string][] = [];
  if (other.closed && ref.closed) {
    for (let k = 0; k < n; k++) {
      if (k) candidates.push([rotateStart(other, k), `start shifted by ${k}`]);
      candidates.push([rotateStart(reverse(other), k), k ? `reversed, start shifted by ${k}` : 'reversed']);
    }
  } else if (!other.closed && !ref.closed) {
    candidates.push([reverse(other), 'reversed']);
  }
  for (const [c, desc] of candidates) {
    const cost = mismatch(ref, c);
    if (cost < bestCost) {
      bestCost = cost;
      best = c;
      bestDesc = desc;
    }
  }
  // Only re-order when it is clearly better; small differences are just the shapes being different sizes.
  if (best !== other && bestCost < identity * 0.6) {
    notes.push(`points were drawn in a different order (${bestDesc} in ${otherName}); re-ordered automatically`);
    other = best;
  }
  return { ref, other, notes };
}

/* ---------------------------------------------------------------- */
/* Pairing by position along the outline                              */
/* ---------------------------------------------------------------- */

/** Lengths of each segment, measured on a fine polyline. */
function segmentLengths(sp: Subpath): number[] {
  const out: number[] = [];
  let p: [number, number] = [sp.pts[0]!, sp.pts[1]!];
  for (const s of segments(sp)) {
    let len = 0;
    let prev = p;
    for (let k = 1; k <= 16; k++) {
      const q = pointAt(p, s, k / 16);
      len += Math.hypot(q[0] - prev[0], q[1] - prev[1]);
      prev = q;
    }
    out.push(len);
    p = [s[4], s[5]];
  }
  return out;
}

function pointAt(p0: [number, number], s: Seg, t: number): [number, number] {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * p0[0] + b * s[0] + c * s[2] + d * s[4], a * p0[1] + b * s[1] + c * s[3] + d * s[5]];
}

/** Where each node sits along the outline, as a fraction of its length (0 for the start, excluding the end). */
function nodeFractions(sp: Subpath): number[] {
  const lens = segmentLengths(sp);
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  const out = [0];
  let acc = 0;
  for (let i = 0; i < lens.length - 1; i++) out.push((acc += lens[i]!) / total);
  return out;
}

/** Points spread evenly along the outline (for comparing shapes regardless of where their nodes are). */
function evenPoints(sp: Subpath, count: number): [number, number][] {
  const lens = segmentLengths(sp);
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  const segs = segments(sp);
  const out: [number, number][] = [];
  let i = 0;
  let before = 0;
  let p: [number, number] = [sp.pts[0]!, sp.pts[1]!];
  for (let k = 0; k < count; k++) {
    const target = (k / (sp.closed ? count : count - 1)) * total;
    while (i < segs.length - 1 && before + lens[i]! < target) {
      before += lens[i]!;
      p = [segs[i]![4], segs[i]![5]];
      i++;
    }
    out.push(pointAt(p, segs[i]!, Math.min(1, Math.max(0, (target - before) / (lens[i]! || 1)))));
  }
  return out;
}

function normalise(pts: [number, number][]): [number, number][] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  return pts.map(([x, y]) => [(x - minX) / w, (y - minY) / h]);
}

const distance2 = (a: [number, number][], b: [number, number][]) =>
  a.reduce((sum, p, i) => sum + (p[0] - b[i]![0]) ** 2 + (p[1] - b[i]![1]) ** 2, 0) / a.length;

/** Points that blend into each other: every node and segment midpoint, in each shape's own box. */
function blendPairs(sp: Subpath): [number, number][] {
  const out: [number, number][] = [];
  let p: [number, number] = [sp.pts[0]!, sp.pts[1]!];
  for (const s of segments(sp)) {
    out.push(p, pointAt(p, s, 0.5));
    p = [s[4], s[5]];
  }
  return normalise(out);
}

/** How badly two blendable shapes correspond: low is good. */
export function blendQuality(a: Subpath, b: Subpath): number {
  return distance2(blendPairs(a), blendPairs(b));
}

/** Split a shape so it has nodes at the given outline fractions (curves unchanged). */
function splitAtFractions(sp: Subpath, fractions: number[]): Subpath {
  const lens = segmentLengths(sp);
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  const segs = segments(sp);
  const start: [number, number] = [sp.pts[0]!, sp.pts[1]!];
  const out: Seg[] = [];
  let before = 0;
  let p = start;
  let f = 0;
  const wanted = [...fractions].sort((a, b) => a - b);
  segs.forEach((seg, i) => {
    const from = before / total;
    const to = (before + lens[i]!) / total;
    let rest = seg;
    let restFrom = from;
    let restStart = p;
    while (f < wanted.length && wanted[f]! <= from + 1e-6) f++;
    while (f < wanted.length && wanted[f]! < to - 1e-6) {
      // Local t from the arc length inside what is left of this segment (close enough for nodes).
      const t = (wanted[f]! - restFrom) / (to - restFrom);
      const [a, b] = split(restStart, rest, t);
      out.push(a);
      restStart = [a[4], a[5]];
      rest = b;
      restFrom = wanted[f]!;
      f++;
    }
    out.push(rest);
    before += lens[i]!;
    p = [seg[4], seg[5]];
  });
  return fromSegments(start, out, sp.closed);
}

/**
 * Line `other` up with `ref` by position along the outline rather than node by
 * node: for shapes drawn with their nodes spread very differently. The start
 * and direction are chosen by comparing evenly spaced points, then both are
 * split so each has a node wherever the other does.
 */
function alignByOutline(ref: Subpath, other: Subpath): { ref: Subpath; other: Subpath; desc: string } {
  const N = 48;
  const target = normalise(evenPoints(ref, N));
  const n = segmentCount(other);
  const candidates: [Subpath, string][] = [[other, '']];
  if (other.closed) {
    for (let k = 0; k < n; k++) {
      if (k) candidates.push([rotateStart(other, k), `start shifted by ${k}`]);
      candidates.push([rotateStart(reverse(other), k), k ? `reversed, start shifted by ${k}` : 'reversed']);
    }
  } else candidates.push([reverse(other), 'reversed']);
  let best = candidates[0]!;
  let bestCost = Infinity;
  for (const c of candidates) {
    const cost = distance2(target, normalise(evenPoints(c[0], N)));
    if (cost < bestCost) {
      bestCost = cost;
      best = c;
    }
  }
  const o = best[0];
  const fr = nodeFractions(ref);
  const fo = nodeFractions(o);
  // Line up matching corners (a hem corner with the same hem corner), spreading the rest evenly between them.
  const anchors = cornerAnchors(ref, o, fr, fo);
  const toRef = (f: number) => mapFraction(f, anchors.map(([, b]) => b), anchors.map(([a]) => a));
  const toOther = (f: number) => mapFraction(f, anchors.map(([a]) => a), anchors.map(([, b]) => b));
  const r2 = splitAtFractions(ref, fo.map(toRef));
  const o2 = splitAtFractions(o, fr.map(toOther));
  if (segmentCount(r2) === segmentCount(o2)) return { ref: r2, other: o2, desc: best[1] };
  return { ref: splitAtFractions(ref, fo), other: splitAtFractions(o, fr), desc: best[1] };
}

/** Indices of nodes where the outline turns sharply (a corner, not a curve). */
function corners(sp: Subpath): number[] {
  const segs = segments(sp);
  const ns = nodes(sp);
  const out: number[] = [];
  const dir = (a: [number, number], b: [number, number]) => Math.atan2(b[1] - a[1], b[0] - a[0]);
  const away = (from: [number, number], cands: [number, number][]) => cands.find((c) => Math.hypot(c[0] - from[0], c[1] - from[1]) > 0.5);
  for (let i = 0; i < ns.length; i++) {
    const node = ns[i]!;
    const inSeg = i > 0 ? segs[i - 1] : sp.closed ? segs[segs.length - 1] : undefined;
    const outSeg = i < segs.length ? segs[i] : undefined;
    if (!inSeg || !outSeg) continue;
    const before = away(node, [[inSeg[2], inSeg[3]], [inSeg[0], inSeg[1]]]);
    const after = away(node, [[outSeg[0], outSeg[1]], [outSeg[2], outSeg[3]], [outSeg[4], outSeg[5]]]);
    if (!before || !after) continue;
    let turn = Math.abs(dir(before, node) - dir(node, after));
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    if (turn > (40 * Math.PI) / 180) out.push(i);
  }
  return out;
}

/**
 * Pairs of outline fractions (ref, other) that must line up: the start and end,
 * plus corners that sit in the same place on both shapes (in each shape's own box).
 */
function cornerAnchors(ref: Subpath, other: Subpath, fr: number[], fo: number[]): [number, number][] {
  const pr = normalise(nodes(ref));
  const po = normalise(nodes(other));
  const cr = corners(ref);
  const co = corners(other);
  const near = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const pairs: [number, number][] = [];
  for (const i of cr) {
    // Mutually nearest corners, close enough to be the same feature.
    const j = co.reduce((best, c) => (best < 0 || near(pr[i]!, po[c]!) < near(pr[i]!, po[best]!) ? c : best), -1);
    if (j < 0 || near(pr[i]!, po[j]!) > 0.25) continue;
    const back = cr.reduce((best, c) => (best < 0 || near(po[j]!, pr[c]!) < near(po[j]!, pr[best]!) ? c : best), -1);
    if (back === i) pairs.push([fr[i]!, fo[j]!]);
  }
  pairs.sort((a, b) => a[0] - b[0]);
  // Keep only pairs in the same order on both shapes.
  const out: [number, number][] = [[0, 0]];
  for (const p of pairs) {
    const last = out[out.length - 1]!;
    if (p[0] > last[0] + 1e-4 && p[1] > last[1] + 1e-4 && p[0] < 1 - 1e-4 && p[1] < 1 - 1e-4) out.push(p);
  }
  out.push([1, 1]);
  return out;
}

/** Piecewise-linear map of an outline fraction between matched anchor lists. */
function mapFraction(f: number, from: number[], to: number[]): number {
  for (let k = 1; k < from.length; k++) {
    if (f <= from[k]! + 1e-9) {
      const t = (f - from[k - 1]!) / (from[k]! - from[k - 1]! || 1);
      return to[k - 1]! + t * (to[k]! - to[k - 1]!);
    }
  }
  return f;
}

/**
 * Pair up one subpath from each extreme so they can be blended.
 *
 * - Different node counts: nodes are added to the shorter one (shape unchanged).
 * - Different start point or direction: the high one is re-ordered to match.
 * - Closed in one file, open in the other: both are drawn open, with the gap
 *   where the open one has it (usually a joint, where the limb tucks under the next one).
 */
export function matchSubpaths(low: Subpath, high: Subpath, near?: GapHint): MatchResult {
  const byNode = matchByNode(low, high);
  const nodeQuality = blendQuality(byNode.low, byNode.high);
  if (nodeQuality <= POOR_MATCH) return byNode;
  // Nodes drawn in very different places along the outline make the blend twist; pair by outline position then.
  // If the outline is left open in different places in the two files (or only in one), pair them as closed
  // shapes: the open ends are where a limb tucks under the next one, so the extra line is covered.
  const sameKind = low.closed === high.closed && (low.closed || nodeQuality <= POOR_MATCH * 10);
  if (sameKind) {
    const r = alignByOutline(low, high);
    if (blendQuality(r.ref, r.other) < nodeQuality * 0.7) {
      return { low: r.ref, high: r.other, notes: [`${REPAIRED}${r.desc ? `, ${r.desc} in high` : ''}`] };
    }
    return byNode;
  }
  const r = pairOpenings(low, high, near);
  if (r && blendQuality(r.low, r.high) < nodeQuality * 0.7) return r;
  return byNode;
}

const REPAIRED = 'nodes are spread differently along the outline in low and high; paired by position along the outline instead';

/**
 * Outlines left open in different places in the two files (or open in only
 * one): pair them as closed shapes by position along the outline, then open
 * both again at the same place, where the reference file has its gap (low,
 * unless only high is open). The opening is a joint tucked under the next
 * part, so no line is drawn across it, as in the art.
 */
function pairOpenings(low: Subpath, high: Subpath, near?: GapHint): MatchResult | null {
  const options = [!low.closed, !high.closed]
    .map((open, i) => (open ? pairOpeningsAt(low, high, i === 0) : null))
    .filter((r): r is NonNullable<typeof r> => !!r);
  if (!options.length) return null;
  if (options.length === 1 || !near) return options[0]!.result;
  // Prefer the opening nearest the given point (the knee or elbow): a line there shows when the limb bends.
  // Prefer the gap nearest the next joint down (e.g. the knee for a thigh): a line there shows when the limb bends.
  const dist = (o: (typeof options)[number]) => Math.hypot(o.gap[0] - near[o.refIsLow ? 'low' : 'high'][0], o.gap[1] - near[o.refIsLow ? 'low' : 'high'][1]);
  return options.reduce((a, b) => (dist(b) < dist(a) ? b : a)).result;
}

/** A point per extreme (e.g. the knee's pivot) that an outline's opening should be near. */
export type GapHint = { low: [number, number]; high: [number, number] };

function pairOpeningsAt(low: Subpath, high: Subpath, refIsLow: boolean): { result: MatchResult; gap: [number, number]; refIsLow: boolean } | null {
  const refOpen = refIsLow ? low : high;
  const otherRaw = refIsLow ? high : low;
  const gap: [number, number] = [
    (refOpen.pts[0]! + refOpen.pts[refOpen.pts.length - 2]!) / 2,
    (refOpen.pts[1]! + refOpen.pts[refOpen.pts.length - 1]!) / 2,
  ];
  const ref = closeWithLine(refOpen);
  const other = otherRaw.closed ? otherRaw : closeWithLine(otherRaw);
  // Where the reference's gap (its added closing edge) starts, as a fraction of the outline.
  const fr = nodeFractions(ref);
  const gapFrom = fr[fr.length - 1]!;
  const a = alignByOutline(ref, other);
  // Both now have nodes at the same fractions: drop the segments over the gap from both.
  const keep = nodeFractions(a.ref).filter((f) => f < gapFrom - 1e-6).length;
  const open = (sp: Subpath): Subpath => ({ closed: false, pts: sp.pts.slice(0, 2 + keep * 6) });
  const [l, h] = refIsLow ? [open(a.ref), open(a.other)] : [open(a.other), open(a.ref)];
  if (segmentCount(l) < 2) return null;
  return {
    gap,
    refIsLow,
    result: {
      low: l,
      high: h,
      notes: [
        `${REPAIRED}; the outline is open in different places in the two files, so both are left open where ${refIsLow ? 'low' : 'high'} is (a joint, tucked under the next part)`,
      ],
    },
  };
}

/** Above this, a node-by-node pairing visibly distorts the in-between shapes. */
const POOR_MATCH = 0.004;

function matchByNode(low: Subpath, high: Subpath): MatchResult {
  if (low.closed === high.closed) {
    const r = align(low, high, 'low', 'high', false);
    return { low: r.ref, high: r.other, notes: r.notes };
  }
  const openIsLow = !low.closed;
  const open = closeWithLine(openIsLow ? low : high);
  const closed = openIsLow ? high : low;
  const r = align(open, closed, openIsLow ? 'low' : 'high', openIsLow ? 'high' : 'low', true);
  const notes = [
    `outline is closed in ${openIsLow ? 'high' : 'low'} but open in ${openIsLow ? 'low' : 'high'}; drawn open in both (no outline across the gap)`,
    ...r.notes.filter((n) => !n.startsWith('node count differs')),
  ];
  const ref = dropLast(r.ref);
  const other = dropLast(r.other);
  return openIsLow ? { low: ref, high: other, notes } : { low: other, high: ref, notes };
}
