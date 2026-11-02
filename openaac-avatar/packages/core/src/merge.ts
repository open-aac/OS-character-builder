/**
 * Clothing merges done with exact shape geometry (Clipper polygon booleans
 * and offsets), so the result is a clean outline rather than lines hidden
 * under paint.
 *
 * Hanging sleeves: a sleeve in front of the shirt is the same cloth, so the
 * shirt and its hanging sleeves are drawn as one shape (their union), whose
 * outline is the shirt's silhouette with the sleeves. The sleeve's armpit
 * edge no longer runs across the chest. Each upper arm is cut to the part
 * that comes out of the sleeve, and is outlined along its sides and the cuff.
 */
import ClipperLib from 'clipper-lib';
import type { PosedPart } from './render.js';
import type { Subpath } from './types.js';

type IntPoint = { X: number; Y: number };
type Path = IntPoint[];
type Paths = Path[];

/** Clipper works in integers: kit units × SCALE. */
const SCALE = 100;
/** Points per curve segment when turning curves into polygons. */
const STEPS = 16;
/** Smoothing radius for the visible upper arm, in line widths. */
const OPEN = 1;

const { Clipper, ClipperOffset, ClipType, PolyType, PolyFillType, JoinType, EndType, PolyTree } = ClipperLib;

/** A subpath as a flattened point list (closed subpaths don't repeat the start). */
function pathOf(sp: Subpath): Path {
  const p = sp.pts;
  const pt = (x: number, y: number): IntPoint => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) });
  const path: Path = [pt(p[0]!, p[1]!)];
  for (let i = 2; i + 5 < p.length; i += 6) {
    const x0 = p[i - 2]!, y0 = p[i - 1]!;
    const x1 = p[i]!, y1 = p[i + 1]!, x2 = p[i + 2]!, y2 = p[i + 3]!, x3 = p[i + 4]!, y3 = p[i + 5]!;
    for (let k = 1; k <= STEPS; k++) {
      const t = k / STEPS;
      const u = 1 - t;
      const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      path.push(pt(a * x0 + b * x1 + c * x2 + d * x3, a * y0 + b * y1 + c * y2 + d * y3));
    }
  }
  if (sp.closed && path.length > 1) {
    const [f, l] = [path[0]!, path[path.length - 1]!];
    if (f.X === l.X && f.Y === l.Y) path.pop();
  }
  return path;
}

function boolean(type: number, subject: Paths, clip: Paths): Paths {
  const c = new Clipper();
  c.AddPaths(subject, PolyType.ptSubject, true);
  c.AddPaths(clip, PolyType.ptClip, true);
  const out: Paths = [];
  c.Execute(type, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero);
  return out;
}

const union = (...areas: Paths[]) => boolean(ClipType.ctUnion, areas.flat(), []);
const difference = (a: Paths, b: Paths) => boolean(ClipType.ctDifference, a, b);
const intersection = (a: Paths, b: Paths) => boolean(ClipType.ctIntersection, a, b);

/** The area grown (or shrunk, for negative `by`) by a distance in kit units, with round corners. */
function offset(area: Paths, by: number): Paths {
  const o = new ClipperOffset(2, 0.2 * SCALE);
  o.AddPaths(area, JoinType.jtRound, EndType.etClosedPolygon);
  const out: Paths = [];
  o.Execute(out, by * SCALE);
  return out;
}

/** Open lines clipped against an area (kept inside for intersection, outside for difference). */
function clipLines(lines: Paths, area: Paths, type: number): Paths {
  const c = new Clipper();
  c.AddPaths(lines, PolyType.ptSubject, false);
  c.AddPaths(area, PolyType.ptClip, true);
  const tree = new PolyTree();
  c.Execute(type, tree, PolyFillType.pftNonZero, PolyFillType.pftNonZero);
  return Clipper.OpenPathsFromPolyTree(tree);
}

/** The filled area of a part. Open outlines are closed with a straight edge, as SVG fills them. */
function areaOf(part: PosedPart): Paths {
  // Simplified first (to within 0.1 units): the flattened curves have far more points than the
  // geometry needs, and every boolean and offset is slower for each one.
  return union(part.shapes.filter((s) => s.pts.length >= 8).map((s) => simplify(pathOf(s), 0.1 * SCALE)));
}

/**
 * Thin areas over the straight edges that close a part's open outlines. SVG
 * fills across them but doesn't draw a line there.
 */
function openEnds(part: PosedPart): Paths {
  const h = 0.25 * SCALE;
  const out: Paths = [];
  for (const s of part.shapes) {
    if (s.closed || s.pts.length < 8) continue;
    const path = pathOf(s);
    const a = path[path.length - 1]!;
    const b = path[0]!;
    const len = Math.hypot(b.X - a.X, b.Y - a.Y) || 1;
    const ux = (b.X - a.X) / len, uy = (b.Y - a.Y) / len;
    const nx = -uy * h, ny = ux * h;
    const ex = ux * h, ey = uy * h;
    out.push([
      { X: a.X - ex + nx, Y: a.Y - ey + ny },
      { X: b.X + ex + nx, Y: b.Y + ey + ny },
      { X: b.X + ex - nx, Y: b.Y + ey - ny },
      { X: a.X - ex - nx, Y: a.Y - ey - ny },
    ]);
  }
  return out;
}

/** Back to subpaths of straight segments (control points on the line). */
function subpathsOf(paths: Paths, closed: boolean): Subpath[] {
  return paths
    .filter((path) => path.length >= 2)
    .map((full) => {
      // Fewer points: drop those within a hair (0.15 units) of the line through their neighbours.
      const path = simplify(closed ? [...full, full[0]!] : full, 0.15 * SCALE);
      if (closed) path.pop();
      const pts = [path[0]!.X / SCALE, path[0]!.Y / SCALE];
      const ring = closed ? [...path, path[0]!] : path;
      for (let i = 1; i < ring.length; i++) {
        const x0 = ring[i - 1]!.X / SCALE, y0 = ring[i - 1]!.Y / SCALE;
        const x1 = ring[i]!.X / SCALE, y1 = ring[i]!.Y / SCALE;
        pts.push(x0, y0, x1, y1, x1, y1);
      }
      return { closed, pts };
    });
}

/** Sleeves drawn in front of the shirt (arms not raised behind the torso). */
function frontSleeves(parts: readonly PosedPart[], shirtAt: number): PosedPart[] {
  return parts.filter((p, at) => at > shirtAt && p.fillRole === 'top' && /^shoulder_[LR]$/.test(p.joint ?? ''));
}

/** A forearm brought across the body (holding, eating) needs the whole sleeve outlined to read as an arm. */
const keepsOutline = (sleeve: PosedPart, onTop: readonly string[]) => onTop.includes(sleeve.joint!.replace('shoulder', 'elbow'));

/**
 * Merge hanging sleeves into the shirt. Returns the parts in drawing order:
 * the shirt becomes the shirt-and-sleeves shape, those sleeves are removed,
 * and each upper arm becomes its visible skin (out of the sleeve) plus a line
 * part (`<id>_line`) outlining it, cuff included. `lineWidth` is the outline
 * width in kit units. Any geometry problem leaves the parts unchanged.
 */
export function mergeSleeves(parts: readonly PosedPart[], onTop: readonly string[], lineWidth: number, pivots: Readonly<Record<string, readonly [number, number]>> = {}): PosedPart[] {
  const shirtAt = parts.findIndex((q) => q.fillRole === 'top' && q.joint === null && q.strokeRole);
  if (shirtAt < 0) return [...parts];
  // Every sleeve in front of the shirt gets its upper arm trimmed; hanging ones are also merged into the shirt.
  const sleeves = frontSleeves(parts, shirtAt);
  if (!sleeves.length) return [...parts];
  const merging = sleeves.filter((s) => !keepsOutline(s, onTop));
  // The art leaves a band of underarm skin below the sleeve (the sleeve is cut short underneath).
  // With the arm hanging, it would run along the chest, so strips this thin beside the sleeve are dropped.
  const strip = lineWidth * 1.4;
  /** Skin of the same arm drawn under the upper arm (the forearm): hidden wherever the upper arm used to cover it. */
  const isUnder = (p: PosedPart, sleeve: PosedPart) =>
    p.fillRole === 'skin' && p.unit === sleeve.unit && p.joint === sleeve.joint!.replace('shoulder', 'elbow') && parts.indexOf(p) < parts.findIndex((q) => q.joint === sleeve.joint && q.fillRole === 'skin');
  const involved = parts.filter(
    (p, i) => i === shirtAt || sleeves.includes(p) || sleeves.some((s) => (p.fillRole === 'skin' && s.joint === p.joint) || isUnder(p, s)),
  );
  /** Skin of the same arm drawn over the upper arm (a forearm brought forward): the upper arm only shows round it. */
  const isOver = (p: PosedPart, sleeve: PosedPart) =>
    p.fillRole === 'skin' && p.unit === sleeve.unit && p.joint === sleeve.joint!.replace('shoulder', 'elbow') && parts.indexOf(p) > parts.findIndex((q) => q.joint === sleeve.joint && q.fillRole === 'skin');
  const over = sleeves.map((s) => parts.filter((p) => isOver(p, s)));
  const key = `${lineWidth}|${involved.map(keyOf).join('|')}|${over.flat().map(keyOf).join('|')}`;
  // Cached: the replacement parts for those involved (other parts pass through untouched).
  const replaced = memo(sleeveCache, key, () => {
    const shirt = parts[shirtAt]!;
    const out: PosedPart[] = [];
    const sleeveAreas = sleeves.map(areaOf);
    if (merging.length) {
      // Closing (grow, then shrink) removes hairline notches where the sleeve and shoulder outlines almost meet.
      const merged = offset(offset(union(areaOf(shirt), ...merging.map((m) => sleeveAreas[sleeves.indexOf(m)]!)), lineWidth * 0.5), -lineWidth * 0.5);
      if (!merged.length) throw new Error('empty shirt');
      out.push({ ...shirt, shapes: subpathsOf(merged, true), polyline: true, merged: merging.map((s) => s.id) });
    } else out.push(shirt);
    // Sleeves that keep their own outline stay as they are.
    for (const sl of sleeves) if (!merging.includes(sl)) out.push(sl);
    // A long sleeve merged into the shirt keeps its outline from the elbow down (where the forearm
    // lies over the shirt); only the upper arm part inside the shirt goes, as for a short sleeve.
    for (const sl of merging) {
      if (!sl.upperPiece) continue;
      // Hidden from the shoulder to the armpit, where the sleeve is part of the shirt's outline.
      const side = sl.joint!.slice(-1);
      const [a, b] = [pivots[`shoulder_${side}`], pivots[`elbow_${side}`]];
      const hide = a && b
        ? intersection(offset(areaOf(sl), lineWidth * 2), [halfPlane(a, [a[0] + (b[0] - a[0]) * ARMPIT, a[1] + (b[1] - a[1]) * ARMPIT])])
        : intersection(areaOf(shirt), union(sl.upperPiece.filter((s) => s.pts.length >= 8).map(pathOf)));
      // Only where the arm lies over the shirt: the outer edge is already the shirt's outline.
      const over = difference(offset(areaOf(shirt), -lineWidth * 0.5), hide);
      const lines = linesInside(outlinesOf(sl), over).filter((l) => lengthOf(l) > lineWidth * SCALE);
      if (lines.length) out.push({ ...sl, id: `${sl.id}_line`, fillRole: null, fill: null, shapes: subpathsOf(lines, false), polyline: true });
    }

    sleeves.forEach((sleeve, k) => {
      const sleeveArea = sleeveAreas[k]!;
      const upper = parts.find((p) => p.joint === sleeve.joint && p.fillRole === 'skin');
      if (!upper) return;
      // The upper arm: only what comes out of the sleeve, without thin strips beside it.
      const arm = areaOf(upper);
      const core = difference(arm, offset(sleeveArea, strip));
      let cut = core.length ? intersection(difference(arm, sleeveArea), offset(core, strip + lineWidth * 0.3)) : [];
      // With the forearm brought forward over it, only the bit joining the sleeve to the forearm shows;
      // what bulges out beside them would read as a stub at the elbow.
      if (over[k]!.length && cut.length) cut = intersection(cut, [hull([sleeveArea, ...over[k]!.map(areaOf)].flat())]);
      // Opening (shrink, then grow) smooths away tabs and wiggles where the cut meets the arm's edge.
      const visible = cut.length ? offset(offset(cut, -lineWidth * OPEN), lineWidth * OPEN) : [];
      if (visible.length) {
        out.push({ ...upper, shapes: subpathsOf(visible, true), polyline: true, strokeRole: null });
        // Outline the visible piece all round (sides, cuff, and the short edge where a strip was
        // dropped), except where the art's outline is open: the elbow end, which the forearm continues.
        const lines = clipLines(visible.map((ring) => [...ring, ring[0]!]), openEnds(upper), ClipType.ctDifference);
        out.push({ ...upper, id: `${upper.id}_line`, fillRole: null, fill: null, shapes: subpathsOf(lines, false), polyline: true });
      }
      // What the upper arm and sleeve covered but no longer do.
      const hidden = difference(union(arm, sleeveArea), visible);
      for (const p of parts) {
        if (!isUnder(p, sleeve)) continue;
        const fill = difference(areaOf(p), hidden);
        if (!fill.length) continue;
        out.push({ ...p, shapes: subpathsOf(fill, true), polyline: true, strokeRole: null });
        const lines = clipLines(outlinesOf(p), hidden, ClipType.ctDifference);
        out.push({ ...p, id: `${p.id}_line`, fillRole: null, fill: null, shapes: subpathsOf(lines, false), polyline: true });
      }
    });
    return out;
  });
  if (!replaced) return [...parts];
  return withCached(parts, involved, new Map(replaced.map((r) => [r.id, r])));
}

/** The parts in order, with the involved ones replaced by their cached versions (and lines after their arms). */
function withCached(parts: readonly PosedPart[], involved: readonly PosedPart[], byId: Map<string, PosedPart>): PosedPart[] {
  const out: PosedPart[] = [];
  for (const p of parts) {
    if (!involved.includes(p)) {
      out.push(p);
      continue;
    }
    const r = byId.get(p.id);
    if (r) out.push({ ...p, shapes: r.shapes, polyline: r.polyline, strokeRole: r.strokeRole, merged: r.merged });
    const line = byId.get(`${p.id}_line`);
    if (line) out.push({ ...p, ...line, front: p.front, unit: p.unit });
  }
  return out;
}

/**
 * A garment piece drawn without an outline (e.g. the shorts' body, whose edges
 * are normally covered by the shorts' legs) gets one wherever its edge lies
 * over bare leg that is still visible, e.g. the thighs of seated legs.
 * Inserted as `<id>_edge` right after the piece. Bits shorter than about a
 * line width (`lineWidth`, kit units) are left out.
 */
export function outlineClothEdges(parts: readonly PosedPart[], lineWidth: number): PosedPart[] {
  const isPiece = (p: PosedPart) => (p.fillRole === 'top' || p.fillRole === 'bottom') && !p.strokeRole;
  const isLegSkin = (p: PosedPart) => (p.unit === 'leg_L' || p.unit === 'leg_R') && p.fillRole === 'skin';
  const last = parts.findLastIndex(isPiece);
  if (last < 0 || !parts.slice(0, last).some(isLegSkin)) return [...parts];
  // Only parts that overlap a garment piece matter.
  const boxes = parts.map(boxOf);
  const pieceBoxes = parts.flatMap((p, i) => (i <= last && isPiece(p) ? [boxes[i]!] : []));
  const relevant = parts.map((p, i) => i <= last && !!p.fillRole && pieceBoxes.some((b) => overlaps(b, boxes[i]!)));
  const key = `${lineWidth}|${parts.map((p, i) => (relevant[i] || (i <= last && isPiece(p)) ? keyOf(p) : '')).join('|')}`;
  const edges = memo(edgeCache, key, () => {
    const found = new Map<number, Subpath[]>();
    /** Bare leg showing so far, in drawing order. */
    let skin: Paths = [];
    parts.forEach((p, i) => {
      if (i > last || !relevant[i]) return;
      if (isPiece(p) && skin.length) {
        const edge = clipLines(outlinesOf(p), skin, ClipType.ctIntersection).filter((l) => lengthOf(l) > lineWidth * 1.5 * SCALE);
        if (edge.length) found.set(i, subpathsOf(edge, false));
      }
      const area = areaOf(p);
      skin = isLegSkin(p) ? union(skin, area) : skin.length ? difference(skin, area) : skin;
    });
    return found;
  });
  if (!edges?.size) return [...parts];
  return parts.flatMap((p, i) => {
    const edge = edges.get(i);
    return edge ? [p, { ...p, id: `${p.id}_edge`, fillRole: null, fill: null, strokeRole: 'body' as const, shapes: edge, polyline: true }] : [p];
  });
}

type Box = [number, number, number, number];

function boxOf(p: PosedPart): Box {
  const b: Box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const s of p.shapes) {
    for (let i = 0; i + 1 < s.pts.length; i += 2) {
      const x = s.pts[i]!, y = s.pts[i + 1]!;
      if (x < b[0]) b[0] = x;
      if (y < b[1]) b[1] = y;
      if (x > b[2]) b[2] = x;
      if (y > b[3]) b[3] = y;
    }
  }
  return b;
}

const overlaps = (a: Box, b: Box) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

/** A cache key for a part's geometry. */
const keyOf = (p: PosedPart) => `${p.id}:${p.shapes.map((s) => s.pts.map((v) => Math.round(v * 20)).join(',')).join(';')}`;

const edgeCache = new Map<string, Map<number, Subpath[]> | null>();
const sleeveCache = new Map<string, PosedPart[] | null>();

/**
 * Small most-recently-used cache: the editor re-renders the same geometry
 * many times (animation frames, thumbnails), and these computations are the
 * slow part of a render. Errors are cached as null.
 */
function memo<T>(cache: Map<string, T | null>, key: string, compute: () => T): T | null {
  if (cache.has(key)) {
    const hit = cache.get(key)!;
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  let value: T | null;
  try {
    value = compute();
  } catch {
    value = null;
  }
  cache.set(key, value);
  if (cache.size > 48) cache.delete(cache.keys().next().value!);
  return value;
}

/** A part's outlines as open lines (closed outlines return to their start). */
function outlinesOf(part: PosedPart): Paths {
  return part.shapes
    .filter((s) => s.pts.length >= 8)
    .map((s) => {
      const path = pathOf(s);
      return s.closed ? [...path, path[0]!] : path;
    });
}

const lengthOf = (path: Path) => path.reduce((sum, q, i) => (i ? sum + Math.hypot(q.X - path[i - 1]!.X, q.Y - path[i - 1]!.Y) : 0), 0);

const torsoSkinCache = new Map<string, { fill: Subpath[]; line: Subpath[] } | null>();

/**
 * Bare torso in the ¾ and side views (drawn with the arms down and fully
 * clothed). The designer drew the torso skin a little wider than the clothes
 * where the arms or clothes hide it; with the arms raised, or between body
 * sizes, those edges would show beside the clothes like extra limbs. Only the
 * skin you'd really see is kept: the part connected to the neck, outside the
 * clothes and the arms as drawn. Its outline is kept only along that part.
 *
 * `restArms` are the arm parts as drawn (unposed); `neck` the neck pivot.
 */
export function trimTorsoSkin(parts: readonly PosedPart[], restArms: readonly PosedPart[], neck: readonly [number, number] | undefined, lineWidth: number): PosedPart[] {
  const at = parts.findIndex((p) => p.unit === 'trunk' && p.fillRole === 'skin' && /^body(_|$)/.test(p.id));
  if (at < 0 || !neck) return [...parts];
  const body = parts[at]!;
  // Only clothes drawn over the body hide it; a sleeve behind it (the far arm) must not cut the neck.
  const clothes = parts.slice(at + 1).filter((p) => p.fillRole === 'top' || p.fillRole === 'bottom');
  const key = `${lineWidth}|${keyOf(body)}|${[...restArms, ...clothes].map(keyOf).join('|')}`;
  const cut = memo(torsoSkinCache, key, () => {
    const area = areaOf(body);
    const covered = union(...[...restArms, ...clothes].map(areaOf));
    const open = difference(area, covered);
    // The piece holding the neck (the neck pivot sits at the base of the head, inside the skin).
    const point = { X: Math.round(neck[0] * SCALE), Y: Math.round(neck[1] * SCALE) };
    const piece = open.filter((ring) => Clipper.PointInPolygon(point, ring) !== 0);
    const near = piece.length ? piece : open.length ? [nearest(open, point)] : [];
    // Grown a little so the skin still tucks under the neckline instead of stopping exactly at it.
    const keep = intersection(area, offset(near, lineWidth));
    return {
      fill: subpathsOf(keep, true),
      line: subpathsOf(clipLines(outlinesOf(body), offset(near, lineWidth * 0.6), ClipType.ctIntersection), false),
    };
  });
  if (!cut || !cut.fill.length) return [...parts];
  return [
    ...parts.slice(0, at),
    { ...body, shapes: cut.fill, polyline: true, strokeRole: null },
    { ...body, id: `${body.id}_line`, fillRole: null, fill: null, shapes: cut.line, polyline: true },
    ...parts.slice(at + 1),
  ];
}

/** Convex hull of the rings' points (monotone chain), counter-clockwise. */
function hull(rings: Paths): Path {
  const pts = rings.flat().sort((a, b) => a.X - b.X || a.Y - b.Y);
  if (pts.length < 3) return pts;
  const cross = (o: IntPoint, a: IntPoint, b: IntPoint) => (a.X - o.X) * (b.Y - o.Y) - (a.Y - o.Y) * (b.X - o.X);
  const half = (list: Path) => {
    const h: Path = [];
    for (const p of list) {
      while (h.length >= 2 && cross(h[h.length - 2]!, h[h.length - 1]!, p) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  return [...half(pts), ...half([...pts].reverse())];
}

/** The ring closest to a point (by its nearest vertex). */
function nearest(rings: Paths, p: IntPoint): Path {
  let best = rings[0]!;
  let bestD = Infinity;
  for (const r of rings) for (const q of r) {
    const d = (q.X - p.X) ** 2 + (q.Y - p.Y) ** 2;
    if (d < bestD) { bestD = d; best = r; }
  }
  return best;
}

const pieceCache = new Map<string, Subpath[] | null>();

/**
 * A long sleeve or trouser leg is drawn in two pieces, split at the elbow or
 * knee so each can follow its joint. Drawn as they are, each piece's outline
 * crosses the limb at the joint. Here the two posed pieces become one shape
 * (their union, with the notch at a bent joint filled), with one outline
 * round the whole sleeve or leg. It is drawn where the later of the two was.
 */
export function joinGarmentPieces(parts: readonly PosedPart[], lineWidth: number, pivots: Readonly<Record<string, readonly [number, number]>> = {}): PosedPart[] {
  const out = [...parts];
  const PIECE = /^((shirt|top|dress|jacket|coat|pants|shorts|trousers|skirt|leggings)_[a-z]+_[a-z]+_(arm|leg)_[LR])_upper$/;
  for (const upper of parts) {
    const m = PIECE.exec(upper.id);
    if (!m) continue;
    const lower = parts.find((p) => p.id === `${m[1]}_lower`);
    if (!lower) continue;
    const side = m[1]!.slice(-1);
    const [root, mid, end] = (m[3] === 'arm' ? ['shoulder', 'elbow', 'wrist'] : ['hip', 'knee', 'ankle']).map((j) => pivots[`${j}_${side}`]);
    // A limb folded back on itself (a hand brought up to the mouth) shows the forearm in front of the
    // upper arm, so it keeps its own outline: the pieces are joined only for a gentler bend.
    if (root && mid && end) {
      const [ux, uy, lx, ly] = [mid[0] - root[0], mid[1] - root[1], end[0] - mid[0], end[1] - mid[1]];
      const cos = (ux * lx + uy * ly) / ((Math.hypot(ux, uy) * Math.hypot(lx, ly)) || 1);
      if (cos < Math.cos((FOLDED * Math.PI) / 180)) continue;
    }
    const shapes = memo(pieceCache, `${lineWidth}|${keyOf(upper)}|${keyOf(lower)}|${[root, mid, end].join(';')}`, () => {
      const r = lineWidth * 0.8;
      let area = union(areaOf(upper), areaOf(lower));
      if (root && mid && end) {
        // Each piece cut square at the joint, and a round elbow or knee between them,
        // so a bent joint has a smooth outside rather than the upper piece's end sticking out.
        const up = intersection(areaOf(upper), [halfPlane(root, mid)]);
        const low = intersection(areaOf(lower), [halfPlane(end, mid)]);
        // Round the joint: the convex hull of both pieces near it, which fills the outside of the bend
        // without a knob where the forearm or shin is narrower than the limb above.
        const cap = jointCircle(areaOf(upper), root, mid);
        const near = jointCircle(areaOf(upper), root, mid, 1.6);
        const joint = cap && near ? union(intersection(up, [near]), intersection(low, [near]), [cap]) : [];
        if (up.length && low.length && joint.length) area = union(up, low, [hull(joint)]);
      }
      // Closing (grow, then shrink) fills the notch on the inside of a bent joint.
      const joined = offset(offset(area, r), -r);
      if (!joined.length) throw new Error('empty garment piece');
      return subpathsOf(joined, true);
    });
    if (!shapes) continue;
    const [iu, il] = [out.indexOf(upper), out.indexOf(lower)];
    const later = out[Math.max(iu, il)]!;
    out[Math.max(iu, il)] = { ...upper, front: later.front, shapes, polyline: true, merged: [lower.id], upperPiece: upper.shapes };
    out.splice(Math.min(iu, il), 1);
  }
  return out;
}

/** Of the upper arm or leg out to the elbow or knee, the shoulder-to-armpit share whose sleeve outline is the shirt's. */
const ARMPIT = 0.4;

/** The half of the page on the `from` side of the line through `at`, square to `from`→`at`. */
function halfPlane(from: readonly [number, number], at: readonly [number, number]): Path {
  const [dx, dy] = [at[0] - from[0], at[1] - from[1]];
  const len = Math.hypot(dx, dy) || 1;
  const [ux, uy] = [dx / len, dy / len];
  const F = 5000;
  const p = (along: number, side: number): IntPoint => ({
    X: Math.round((at[0] + ux * along - uy * side) * SCALE),
    Y: Math.round((at[1] + uy * along + ux * side) * SCALE),
  });
  return [p(0, -F), p(0, F), p(-F, F), p(-F, -F)];
}

/** A circle across the limb at the joint: centred between the outline's two sides on the line square to the limb there. */
function jointCircle(area: Paths, root: readonly [number, number], at: readonly [number, number], grow = 1): Path | null {
  const [dx, dy] = [at[0] - root[0], at[1] - root[1]];
  const len = Math.hypot(dx, dy) || 1;
  const n = [-dy / len, dx / len];
  const P = { X: at[0] * SCALE, Y: at[1] * SCALE };
  let plus = Infinity, minus = -Infinity;
  for (const ring of area) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
      // Where segment a-b meets the line P + t·n.
      const ex = b.X - a.X, ey = b.Y - a.Y;
      const den = n[0]! * ey - n[1]! * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((a.X - P.X) * ey - (a.Y - P.Y) * ex) / den;
      const u = ((a.X - P.X) * n[1]! - (a.Y - P.Y) * n[0]!) / den;
      if (u < 0 || u > 1) continue;
      if (t > 0 && t < plus) plus = t;
      if (t < 0 && t > minus) minus = t;
    }
  }
  if (!Number.isFinite(plus) || !Number.isFinite(minus)) return null;
  const mid = (plus + minus) / 2, r0 = (plus - minus) / 2;
  // A joint that isn't inside the limb (or a limb much wider than it is long) gets no cap.
  if (minus >= 0 || plus <= 0 || r0 > len * SCALE * 0.35) return null;
  const r = r0 * grow;
  const c = { X: P.X + n[0]! * mid, Y: P.Y + n[1]! * mid };
  return Array.from({ length: 48 }, (_, k) => ({ X: Math.round(c.X + r * Math.cos((k / 48) * 2 * Math.PI)), Y: Math.round(c.Y + r * Math.sin((k / 48) * 2 * Math.PI)) }));
}

/**
 * The runs of each line whose points lie inside the area (point by point, so a
 * run ends at the last point inside). Used where Clipper's open-line clipping
 * joins pieces across the area.
 */
function linesInside(lines: Paths, area: Paths, outside = false): Paths {
  const inside = (q: IntPoint) => {
    let wind = 0;
    for (const ring of area) if (Clipper.PointInPolygon(q, ring) !== 0) wind += Clipper.Orientation(ring) ? 1 : -1;
    return wind !== 0;
  };
  const out: Paths = [];
  for (const line of lines) {
    let run: Path = [];
    for (const q of line) {
      if (inside(q) !== outside) run.push(q);
      else {
        if (run.length > 1) out.push(run);
        run = [];
      }
    }
    if (run.length > 1) out.push(run);
  }
  return out;
}


/** Ramer–Douglas–Peucker simplification of an open point list (keeps both ends). */
function simplify(path: Path, tol: number): Path {
  if (path.length < 3) return [...path];
  const keep = new Uint8Array(path.length);
  keep[0] = keep[path.length - 1] = 1;
  const stack: [number, number][] = [[0, path.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const A = path[a]!, B = path[b]!;
    const dx = B.X - A.X, dy = B.Y - A.Y;
    const len = Math.hypot(dx, dy);
    let worst = -1, at = -1;
    for (let i = a + 1; i < b; i++) {
      const P = path[i]!;
      const d = len ? Math.abs(dx * (A.Y - P.Y) - dy * (A.X - P.X)) / len : Math.hypot(P.X - A.X, P.Y - A.Y);
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > tol) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return path.filter((_, i) => keep[i]);
}

/** Bend (degrees from straight) beyond which a sleeve or trouser leg is folded and keeps its two pieces. */
const FOLDED = 110;

/**
 * Where the seat is, for a figure posed sitting from standing art: the lower
 * edge of the thighs a little way out from the hips (the lowest of the two).
 * `null` if the thighs can't be found.
 */
export function seatLine(parts: readonly PosedPart[], pivots: Readonly<Record<string, readonly [number, number]>>): number | null {
  // The bottom of the drawn hips (the shorts' or trousers' body), when there is one: what sits on the seat.
  const hips = parts.filter((p) => p.unit === 'torso' && p.fillRole === 'bottom');
  if (hips.length) return Math.max(...hips.flatMap((p) => p.shapes.flatMap((sp) => sp.pts.filter((_, i) => i % 2 === 1))));
  let seat: number | null = null;
  for (const side of ['L', 'R']) {
    const hip = pivots[`hip_${side}`];
    const knee = pivots[`knee_${side}`];
    const thigh = parts.filter((p) => p.joint === `hip_${side}` && p.fillRole);
    if (!hip || !knee || !thigh.length) continue;
    const x = (hip[0] + (knee[0] - hip[0]) * 0.35) * SCALE;
    for (const ring of union(...thigh.map(areaOf))) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
        if ((a.X - x) * (b.X - x) > 0 || a.X === b.X) continue;
        const y = (a.Y + ((x - a.X) / (b.X - a.X)) * (b.Y - a.Y)) / SCALE;
        if (seat === null || y > seat) seat = y;
      }
    }
  }
  return seat;
}

const seatCache = new Map<string, PosedPart[] | null>();

/**
 * Sitting from standing art: the torso (hips, bottom, shirt hem) was drawn for
 * standing and would hang below the thighs. Everything of the torso below the
 * seat is cut off, so the bottom sits flat on the seat. Outlined pieces are
 * outlined along the cut; a fill drawn without its own outline (the shorts'
 * body, outlined by a separate line part) gets a line along the cut.
 */
export function seatCut(parts: readonly PosedPart[], seat: number, lineWidth: number, pivots: Readonly<Record<string, readonly [number, number]>> = {}, flat = true): PosedPart[] {
  const isTorso = (p: PosedPart) => (p.unit === 'torso' || p.unit === 'trunk') && p.shapes.some((s) => s.pts.some((v, i) => i % 2 === 1 && v > seat));
  // The thighs were drawn standing, reaching up to the waist and back over the bottom. Swung forward,
  // that back part would hang down behind the hip like a kneeling leg, so each thigh keeps only what
  // lies in front of its hip; the torso (cut flat at the seat) is the bottom.
  const thighCut = (p: PosedPart): { front: Paths; outer: Paths } | null => {
    const side = /^hip_([LR])$/.exec(p.joint ?? '')?.[1];
    const [hip, knee] = side ? [pivots[`hip_${side}`], pivots[`knee_${side}`]] : [];
    if (!hip || !knee) return null;
    const at = (t: number): [number, number] => [hip[0] + (knee[0] - hip[0]) * t, hip[1] + (knee[1] - hip[1]) * t];
    // In front of the hip; and the outer part of the thigh, which the seat cut leaves alone: towards the
    // knee (side view, thigh level), or ahead of the hip (¾ view, thighs angled down towards the viewer).
    const outer: Paths = [halfPlane(knee, at(flat ? 0.55 : OUTER_QUARTER))];
    return { front: [halfPlane(knee, at(-0.1))], outer };
  };
  const thighs = parts.filter((p) => p.fillRole && thighCut(p));
  const torso = parts.filter(isTorso);
  if (!torso.length && !thighs.length) return [...parts];
  const key = `${lineWidth}|${flat}|${seat.toFixed(1)}|${[...torso, ...thighs].map(keyOf).join('|')}`;
  const replaced = memo(seatCache, key, () => {
    const Y = Math.round(seat * SCALE), F = 1e6;
    const above: Paths = [[{ X: -F, Y: -F }, { X: F, Y: -F }, { X: F, Y }, { X: -F, Y }]];
    const band: Paths = [[{ X: -F, Y: Y - 0.05 * SCALE }, { X: F, Y: Y - 0.05 * SCALE }, { X: F, Y: Y + 0.05 * SCALE }, { X: -F, Y: Y + 0.05 * SCALE }]];
    const out: PosedPart[] = [];
    for (const p of torso) {
      if (p.fillRole) {
        const cut = intersection(areaOf(p), above);
        out.push({ ...p, shapes: subpathsOf(cut, true), polyline: true });
        if (!p.strokeRole) {
          // The cut edge, kept only where the fill reaches it.
          const edge = linesInside(cut.map((r) => [...r, r[0]!]), offset(band, 0.1)).filter((l) => lengthOf(l) > lineWidth * SCALE);
          if (edge.length) out.push({ ...p, id: `${p.id}_seat`, fillRole: null, fill: null, strokeRole: 'body', shapes: subpathsOf(edge, false), polyline: true });
        }
      } else {
        out.push({ ...p, shapes: subpathsOf(linesInside(outlinesOf(p), offset(above, 0.05)), false), polyline: true });
      }
    }
    const hipsInside = offset(union(...parts.filter((p) => p.unit === 'torso' && p.fillRole === 'bottom').map(areaOf)), -lineWidth);
    for (const p of thighs) {
      // Not below the seat either: the back of a standing thigh, swung forward, bulges down under it.
      const { front, outer } = thighCut(p)!;
      const keep = intersection(front, union(above, outer));
      // Opening (shrink, then grow) rounds the corners the cuts leave.
      const r = lineWidth * 2;
      const fill = offset(offset(intersection(areaOf(p), keep), -r), r);
      out.push({ ...p, shapes: subpathsOf(fill, true), polyline: true, strokeRole: null });
      if (!p.strokeRole) continue;
      // Outlined all round, except where it lies over the hips: there the thigh runs on into the bottom.
      const lines = linesInside(fill.map((ring) => [...ring, ring[0]!]), hipsInside, true).filter((l) => lengthOf(l) > lineWidth * SCALE);
      out.push({ ...p, id: `${p.id}_line`, fillRole: null, fill: null, shapes: subpathsOf(lines, false), polyline: true });
    }
    return out;
  });
  if (!replaced) return [...parts];
  return withCached(parts, [...torso, ...thighs], new Map(replaced.map((r) => [r.id, r])));
}

/** ¾ view: how far along the thigh (hip 0, knee 1) the seat cut stops. */
const OUTER_QUARTER = 0.4;

/** Centre and radius of the circle across a limb at `at`, square to `root`→`at` (between the outline's two sides). */
function across(area: Paths, root: readonly [number, number], at: readonly [number, number]): { c: [number, number]; r: number } | null {
  const [dx, dy] = [at[0] - root[0], at[1] - root[1]];
  const len = Math.hypot(dx, dy) || 1;
  const n = [-dy / len, dx / len] as const;
  const P = { X: at[0] * SCALE, Y: at[1] * SCALE };
  let plus = Infinity, minus = -Infinity;
  for (const ring of area) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
      const ex = b.X - a.X, ey = b.Y - a.Y;
      const den = n[0] * ey - n[1] * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((a.X - P.X) * ey - (a.Y - P.Y) * ex) / den;
      const u = ((a.X - P.X) * n[1] - (a.Y - P.Y) * n[0]) / den;
      if (u < 0 || u > 1) continue;
      if (t > 0 && t < plus) plus = t;
      if (t < 0 && t > minus) minus = t;
    }
  }
  if (!Number.isFinite(plus) || !Number.isFinite(minus)) return null;
  const mid = (plus + minus) / 2;
  return { c: [(P.X + n[0] * mid) / SCALE, (P.Y + n[1] * mid) / SCALE], r: (plus - minus) / 2 / SCALE };
}

const ring = (c: readonly [number, number], r: number, n = 48): Path =>
  Array.from({ length: n }, (_, k) => ({ X: Math.round((c[0] + r * Math.cos((k / n) * 2 * Math.PI)) * SCALE), Y: Math.round((c[1] + r * Math.sin((k / n) * 2 * Math.PI)) * SCALE) }));

const lapCache = new Map<string, PosedPart[] | null>();

/**
 * Sitting in the ¾ view from standing art. Swung forward, the standing thighs
 * (drawn reaching up to the waist and back over the bottom) break up into
 * odd shapes, so each thigh is redrawn as a smooth tapered tube from the hip
 * to the knee, as wide as the drawn thigh at each end: skin, then the shorts
 * or trousers over it (shorts as far down the thigh as the drawn ones go,
 * trousers joined on to the drawn trouser shin). The hips are cut flat where
 * they sit. Tubes are outlined except where they run into the hips.
 */
export function quarterLap(parts: readonly PosedPart[], pivots: Readonly<Record<string, readonly [number, number]>>, lineWidth: number, profile = false): PosedPart[] {
  const thighs = parts.filter((p) => /^hip_[LR]$/.test(p.joint ?? '') && p.fillRole && !/_cap$/.test(p.id));
  if (!thighs.length) return [...parts];
  const hipsParts = parts.filter((p) => p.unit === 'torso' && p.fillRole === 'bottom');
  // Side view: the knee caps go (the thigh's round end is the knee), and the shins count for the outline.
  const caps = profile ? parts.filter((p) => /_knee_cap(_line)?$/.test(p.id)) : [];
  const shins = profile ? parts.filter((p) => /^knee_[LR]$/.test(p.joint ?? '') && p.fillRole === 'skin' && !/_cap/.test(p.id)) : [];
  const key = `${lineWidth}|${profile}|${[...thighs, ...hipsParts, ...shins].map(keyOf).join('|')}`;
  const replaced = memo(lapCache, key, () => {
    const out: PosedPart[] = [];
    const hips = union(...hipsParts.map(areaOf));
    const hipsInside = offset(hips, -lineWidth);
    let seat = -Infinity;
    // No outline where a piece lies over the hips (it runs on into the bottom) or, side view, over the
    // shin (the thigh's end and the shin read as one bent leg, with no line across the knee).
    const hidden = hipsInside;
    const outline = (fill: Paths) => linesInside(fill.map((r) => [...r, r[0]!]), hidden, true).filter((l) => lengthOf(l) > lineWidth * SCALE);
    for (const side of ['L', 'R']) {
      const hip = pivots[`hip_${side}`], knee = pivots[`knee_${side}`];
      const mine = thighs.filter((p) => p.joint === `hip_${side}`);
      if (!hip || !knee || !mine.length) continue;
      const skin = mine.find((p) => p.fillRole === 'skin');
      const cloth = mine.find((p) => p.fillRole === 'bottom');
      const at = (t: number): [number, number] => [hip[0] + (knee[0] - hip[0]) * t, hip[1] + (knee[1] - hip[1]) * t];
      // Thigh width near the hip and at the knee, from the drawn skin thigh (or the cloth over it).
      const ref = areaOf(skin ?? cloth!);
      const top = across(ref, hip, at(0.3));
      const bottom = across(ref, hip, knee);
      if (!top || !bottom) continue;
      const tube = [hull([ring(top.c, top.r), ring(bottom.c, bottom.r * 0.95)])];
      // Side view: the drawn hips are already round at the back and sit on the seat as they are.
      if (!profile) seat = Math.max(seat, top.c[1] + top.r * 0.6);
      if (skin) {
        // Side view: thigh and shin as one shape, so the bent leg has no line across the knee.
        const shin = shins.filter((p) => p.joint === `knee_${side}`);
        // The foot is drawn under the thigh, so the shin stops where the foot starts (the foot keeps its outline).
        const feet = union(...parts.filter((p) => p.joint === `ankle_${side}` && p.fillRole).map(areaOf));
        const joined = shin.length ? offset(offset(union(tube, ...shin.map(areaOf)), lineWidth * 2), -lineWidth * 2) : tube;
        const leg = shin.length && feet.length ? difference(joined, feet) : joined;
        for (const p of shin) out.push({ ...p, shapes: [] });
        out.push({ ...skin, shapes: subpathsOf(leg, true), polyline: true, strokeRole: null });
        out.push({ ...skin, id: `${skin.id}_line`, fillRole: null, fill: null, shapes: subpathsOf(outline(leg), false), polyline: true });
      }
      if (cloth) {
        const w = lineWidth;
        const long = /_long_/.test(cloth.id);
        const loose = /_loose_/.test(cloth.id);
        let fill: Paths;
        if (long) {
          // The drawn trouser leg from the knee down, joined on to the tube.
          const shin = intersection(areaOf(cloth), [halfPlane([knee[0] + (knee[0] - hip[0]), knee[1] + (knee[1] - hip[1])], at(0.6))]);
          fill = offset(offset(union(offset(tube, w * 0.3), shin), w), -w);
        } else {
          // As far down the thigh as the drawn shorts reach.
          const [ax, ay] = [knee[0] - hip[0], knee[1] - hip[1]];
          const len2 = ax * ax + ay * ay || 1;
          const reach = Math.max(...areaOf(cloth).flat().map((q) => ((q.X / SCALE - hip[0]) * ax + (q.Y / SCALE - hip[1]) * ay) / len2));
          const t = Math.min(0.85, Math.max(profile ? 0.65 : 0.5, reach));
          fill = intersection(offset(tube, w * (loose ? 1.2 : 0.3)), [halfPlane(hip, at(t))]);
          fill = offset(offset(fill, -w), w);
        }
        out.push({ ...cloth, shapes: subpathsOf(fill, true), polyline: true, strokeRole: null });
        out.push({ ...cloth, id: `${cloth.id}_line`, fillRole: null, fill: null, strokeRole: cloth.strokeRole ?? 'body', shapes: subpathsOf(outline(fill), false), polyline: true });
      }
    }
    // The hips sit on the seat: cut flat just under the top of the thighs, rounded at the back.
    if (Number.isFinite(seat)) {
      const F = 1e6, Y = Math.round(seat * SCALE);
      const above: Paths = [[{ X: -F, Y: -F }, { X: F, Y: -F }, { X: F, Y }, { X: -F, Y }]];
      for (const p of hipsParts) {
        if (p.strokeRole) continue;
        const cut = offset(offset(intersection(areaOf(p), above), -lineWidth * 2), lineWidth * 2);
        out.push({ ...p, shapes: subpathsOf(cut, true), polyline: true });
        const edge = linesInside(cut.map((r) => [...r, r[0]!]), [[{ X: -F, Y: Y - lineWidth * 3 * SCALE }, { X: F, Y: Y - lineWidth * 3 * SCALE }, { X: F, Y: F }, { X: -F, Y: F }]]).filter((l) => lengthOf(l) > lineWidth * SCALE);
        if (edge.length) out.push({ ...p, id: `${p.id}_seat`, fillRole: null, fill: null, strokeRole: 'body', shapes: subpathsOf(edge, false), polyline: true });
      }
      for (const p of parts.filter((q) => q.unit === 'torso' && !q.fillRole && /pants|shorts|trousers/.test(q.id))) {
        out.push({ ...p, shapes: subpathsOf(linesInside(outlinesOf(p), above), false), polyline: true });
      }
    }
    for (const c of caps) out.push({ ...c, shapes: [] });
    return out;
  });
  if (!replaced) return [...parts];
  const involved = parts.filter((p) => replaced.some((r) => r.id === p.id || r.id === `${p.id}_line` || r.id === `${p.id}_seat`));
  return withCached(parts, involved, new Map(replaced.map((r) => [r.id, r])));
}
