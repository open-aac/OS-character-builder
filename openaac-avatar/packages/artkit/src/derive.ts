/**
 * Stand-in clothing for views the designer drew in one outfit only.
 *
 * The ¾ and side art come with the T-shirt and shorts. The other styles the
 * front view offers (long sleeves, a loose T-shirt, trousers, loose shorts)
 * are made from that art: a long sleeve or trouser leg is the limb grown a
 * little and cut at the wrist or ankle, and the loose styles are the drawn
 * garment grown a little more. Each new piece takes the drawn garment's
 * colour and outline, and is placed right after it in the drawing order.
 *
 * The drawn outfit is renamed to the `tight_short` style so it is offered
 * with the others. Styles the designer has drawn for the view are left alone.
 */
import ClipperLib from 'clipper-lib';
import type { Subpath } from '@openaac-avatar/core';
import type { RawArt, RawPart } from './inkscape.js';

type IntPoint = { X: number; Y: number };
type Path = IntPoint[];
type Paths = Path[];
const { Clipper, ClipperOffset, ClipType, PolyType, PolyFillType, JoinType, EndType } = ClipperLib;

const SCALE = 100;
const STEPS = 12;
/** Points on the outline of each made piece (the same for both body extremes, so they blend). */
const POINTS = 48;
/** How much a long sleeve or trouser leg stands off the limb, in line widths. */
const TIGHT = 0.25;
/** How much looser the loose styles are than the drawn ones, in line widths. */
const LOOSE = 1.8;

const UNSTYLED = /^(shirt|pants)_(body|body_fill|body_line|arm_[LR]_upper|leg_[LR]_upper)$/;

function pathOf(sp: Subpath): Path {
  const p = sp.pts;
  const pt = (x: number, y: number): IntPoint => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) });
  const out: Path = [pt(p[0]!, p[1]!)];
  for (let i = 2; i + 5 < p.length; i += 6) {
    const [x0, y0] = [p[i - 2]!, p[i - 1]!];
    for (let k = 1; k <= STEPS; k++) {
      const t = k / STEPS, u = 1 - t;
      const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      out.push(pt(a * x0 + b * p[i]! + c * p[i + 2]! + d * p[i + 4]!, a * y0 + b * p[i + 1]! + c * p[i + 3]! + d * p[i + 5]!));
    }
  }
  return out;
}

function boolean(type: number, a: Paths, b: Paths): Paths {
  const c = new Clipper();
  c.AddPaths(a, PolyType.ptSubject, true);
  c.AddPaths(b, PolyType.ptClip, true);
  const out: Paths = [];
  c.Execute(type, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero);
  return out;
}
const union = (...a: Paths[]) => boolean(ClipType.ctUnion, a.flat(), []);
const intersection = (a: Paths, b: Paths) => boolean(ClipType.ctIntersection, a, b);

function offset(area: Paths, by: number): Paths {
  const o = new ClipperOffset(2, 0.1 * SCALE);
  o.AddPaths(area, JoinType.jtRound, EndType.etClosedPolygon);
  const out: Paths = [];
  o.Execute(out, by * SCALE);
  return out;
}

const areaOf = (part: RawPart): Paths => union(part.subpaths.filter((s) => s.pts.length >= 8).map(pathOf));

/** The half of the page on the `from` side of the line through `at`, square to the direction `from`→`at`. */
function halfPlane(from: readonly [number, number], at: readonly [number, number]): Path {
  const [dx, dy] = [at[0] - from[0], at[1] - from[1]];
  const len = Math.hypot(dx, dy) || 1;
  const [ux, uy] = [dx / len, dy / len];
  const [nx, ny] = [-uy, ux];
  const F = 5000;
  const p = (along: number, side: number): IntPoint => ({
    X: Math.round((at[0] + ux * along + nx * side) * SCALE),
    Y: Math.round((at[1] + uy * along + ny * side) * SCALE),
  });
  return [p(0, -F), p(0, F), p(-F, F), p(-F, -F)];
}

/**
 * The largest ring as one smooth closed subpath of `POINTS` points, starting
 * at the point nearest `anchor` and running clockwise, so the low and high
 * versions line up point for point.
 */
function smooth(area: Paths, anchor: readonly [number, number]): Subpath | null {
  let ring = area.reduce<Path | null>((best, r) => (!best || Math.abs(Clipper.Area(r)) > Math.abs(Clipper.Area(best)) ? r : best), null);
  if (!ring || ring.length < 3) return null;
  if (Clipper.Area(ring) < 0) ring = [...ring].reverse();
  const pts = ring.map((q) => [q.X / SCALE, q.Y / SCALE] as const);
  let start = 0;
  pts.forEach((q, i) => {
    if (Math.hypot(q[0] - anchor[0], q[1] - anchor[1]) < Math.hypot(pts[start]![0] - anchor[0], pts[start]![1] - anchor[1])) start = i;
  });
  const loop = [...pts.slice(start), ...pts.slice(0, start)];
  // Even spacing along the outline.
  const cum = [0];
  for (let i = 1; i <= loop.length; i++) {
    const a = loop[i - 1]!, b = loop[i % loop.length]!;
    cum.push(cum[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[cum.length - 1]!;
  const even: [number, number][] = [];
  let j = 0;
  for (let k = 0; k < POINTS; k++) {
    const s = (k / POINTS) * total;
    while (cum[j + 1]! < s) j++;
    const a = loop[j]!, b = loop[(j + 1) % loop.length]!;
    const t = (s - cum[j]!) / (cum[j + 1]! - cum[j]! || 1);
    even.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  // Catmull-Rom through the points, as cubic segments.
  const at = (i: number) => even[(i + POINTS) % POINTS]!;
  const out = [even[0]![0], even[0]![1]];
  for (let i = 0; i < POINTS; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    out.push(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  return { closed: true, pts: out.map((v) => Math.round(v * 1000) / 1000) };
}

/** Adds the stand-in clothing styles to one body extreme's art (see the module comment). */
export function deriveClothes(art: RawArt): string[] {
  const made: string[] = [];
  // Variant art (e.g. seated legs `pants_tight_long_leg_L_upper@sit`) doesn't count as a drawn outfit.
  const has = (re: RegExp) => art.parts.some((p) => !p.id.includes('@') && re.test(p.id));
  const byId = (id: string) => art.parts.find((p) => p.id === id);
  // Only art drawn in a single unstyled outfit.
  if (!has(UNSTYLED) || has(/^(shirt|pants)_[a-z]+_[a-z]+_/)) return made;
  for (const p of art.parts) if (UNSTYLED.test(p.id)) p.id = p.id.replace(/^(shirt|pants)_/, '$1_tight_short_');

  const piv = (n: string) => art.pivots.get(n);
  /** Inserts new pieces right after `after`, styled like it. */
  const insert = (after: RawPart, pieces: { id: string; sp: Subpath | null }[]) => {
    let at = art.parts.indexOf(after);
    for (const { id, sp } of pieces) {
      if (!sp) continue;
      art.parts.splice(++at, 0, { ...after, id, subpaths: [sp] });
      made.push(id);
    }
  };
  const copy = (part: RawPart, style: string) => {
    art.parts.splice(art.parts.indexOf(part) + 1, 0, { ...part, id: part.id.replace('_tight_short_', `_${style}_`) });
  };

  for (const kind of ['shirt', 'pants'] as const) {
    const body = art.parts.filter((p) => p.id.startsWith(`${kind}_tight_short_body`));
    const limb = kind === 'shirt' ? 'arm' : 'leg';
    const [root, mid, end] = kind === 'shirt' ? ['shoulder', 'elbow', 'wrist'] : ['hip', 'knee', 'ankle'];
    const longStyle = 'tight_long';
    // The body piece stays as drawn for every style but the loose top.
    for (const b of body) {
      copy(b, longStyle);
      if (kind === 'pants') copy(b, 'loose_short');
    }
    if (kind === 'shirt') {
      const b = body.find((p) => p.id === 'shirt_tight_short_body');
      const shoulder = piv('shoulder_L') ?? piv('shoulder_R');
      if (b && shoulder) {
        const w = b.strokeWidth * LOOSE;
        // Wider and longer, with the neckline kept as drawn.
        const drop = Math.round(w * 1.5 * SCALE);
        const lowered = areaOf(b).map((r) => r.map((q) => ({ X: q.X, Y: q.Y + drop })));
        const below = intersection(offset(union(areaOf(b), lowered), w * 1.3), [halfPlane([shoulder[0], shoulder[1] + 1], shoulder)]);
        const loose = offset(offset(union(areaOf(b), below), w * 3), -w * 3);
        insert(b, [{ id: 'shirt_loose_short_body', sp: smooth(loose, piv('neck') ?? shoulder) }]);
      }
    }

    for (const side of ['L', 'R'] as const) {
      const garment = byId(`${kind}_tight_short_${limb}_${side}_upper`);
      const upper = byId(`${limb}_${side}_upper`);
      const lower = byId(`${limb}_${side}_lower`);
      const [pr, pm, pe] = [piv(`${root}_${side}`), piv(`${mid}_${side}`), piv(`${end}_${side}`)];
      if (!garment || !upper || !lower || !pr || !pm || !pe) continue;
      const w = garment.strokeWidth;
      // Long: the drawn short piece joined with the limb grown a little, then the lower limb cut at the wrist/ankle.
      const longUpper = union(areaOf(garment), offset(areaOf(upper), w * TIGHT));
      const cutAt: [number, number] = kind === 'shirt' ? [pe[0] - (pe[0] - pm[0]) * 0.04, pe[1] - (pe[1] - pm[1]) * 0.04] : [pe[0] + (pe[0] - pm[0]) * 0.02, pe[1] + (pe[1] - pm[1]) * 0.02];
      const longLower = intersection(offset(areaOf(lower), w * TIGHT), [halfPlane(pm, cutAt)]);
      // A loose sleeve is wider from the shoulder down; grown above the shoulder too, it would stand
      // up behind the head as a hump when the arm is raised. Closing smooths the step between the two.
      // Wider only: as long as the drawn sleeve (a longer one would reach the face when the arm is raised).
      const [ax, ay] = [pm[0] - pr[0], pm[1] - pr[1]];
      const alen = Math.hypot(ax, ay) || 1;
      const reach = Math.max(...areaOf(garment).flat().map((q) => ((q.X / SCALE - pr[0]) * ax + (q.Y / SCALE - pr[1]) * ay) / alen));
      const hem: [number, number] = [pr[0] + (ax / alen) * reach, pr[1] + (ay / alen) * reach];
      const grownBelow = intersection(intersection(offset(areaOf(garment), w * LOOSE * 0.6), [halfPlane(pm, pr)]), [halfPlane(pr, hem)]);
      const looseUpper = kind === 'shirt'
        ? offset(offset(union(areaOf(garment), grownBelow), w * 3), -w * 3)
        : offset(areaOf(garment), w * LOOSE);
      insert(garment, [
        // Lower first, so the upper piece covers its top at the knee or elbow, as the drawn limbs do.
        { id: `${kind}_tight_long_${limb}_${side}_lower`, sp: smooth(longLower, pm) },
        { id: `${kind}_tight_long_${limb}_${side}_upper`, sp: smooth(longUpper, pr) },
        { id: `${kind}_loose_short_${limb}_${side}_upper`, sp: smooth(looseUpper, pr) },
      ]);
    }
  }
  return made;
}

/**
 * The side art has only the near (left) arm. The far arm is the same arm
 * drawn behind everything, on the same pivots, so a pose can raise it
 * (e.g. waving with the far hand while the near arm hangs). Hanging, it is
 * hidden behind the body.
 */
export function addFarArm(art: RawArt): string[] {
  const isNear = (id: string) => /^(arm_L_|(shirt|top|dress|jacket|coat)_.*arm_L_)/.test(id);
  if (art.parts.some((p) => /arm_R_/.test(p.id)) || !art.pivots.has('shoulder_L')) return [];
  const [e, w] = [art.pivots.get('elbow_L'), art.pivots.get('wrist_L')];
  /** The far hand is the other hand: its open hand is the near one turned over (mirrored along the forearm). */
  const turnOver = (sp: Subpath): Subpath => {
    if (!e || !w) return sp;
    const len = Math.hypot(w[0] - e[0], w[1] - e[1]) || 1;
    const [ux, uy] = [(w[0] - e[0]) / len, (w[1] - e[1]) / len];
    const pts = [...sp.pts];
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const [dx, dy] = [pts[i]! - w[0], pts[i + 1]! - w[1]];
      const along = dx * ux + dy * uy;
      pts[i] = w[0] + 2 * along * ux - dx;
      pts[i + 1] = w[1] + 2 * along * uy - dy;
    }
    return { closed: sp.closed, pts };
  };
  const far = art.parts
    .filter((p) => isNear(p.id))
    .map((p) => ({ ...p, id: p.id.replace('arm_L_', 'arm_R_'), subpaths: /@wave$/.test(p.id) ? p.subpaths.map(turnOver) : p.subpaths }));
  art.parts.unshift(...far);
  for (const j of ['shoulder', 'elbow', 'wrist']) {
    const pv = art.pivots.get(`${j}_L`);
    if (pv) art.pivots.set(`${j}_R`, [pv[0], pv[1]]);
  }
  return far.map((p) => p.id);
}

/**
 * Seated trousers for the front view, which has seated legs (`leg_L_upper@sit`, …)
 * and seated shorts (`pants_leg_L_upper@sit`) but no seated trousers. The seated
 * shorts become the `tight_short` style's; `loose_short` is them grown a little;
 * `tight_long` is them joined with the seated thigh and shin grown slightly, cut
 * just above the foot. Each trouser leg is one piece, drawn over the seated leg.
 */
export function deriveSeatedTrousers(art: RawArt, wholeLeg = false): string[] {
  const made: string[] = [];
  const byId = (id: string) => art.parts.find((p) => p.id === id);
  const styles = new Set(art.parts.map((p) => /^pants_([a-z]+_[a-z]+)_/.exec(p.id)?.[1]).filter((s): s is string => !!s));
  for (const side of ['L', 'R'] as const) {
    const shorts = byId(`pants_leg_${side}_upper@sit`);
    const thigh = byId(`leg_${side}_upper@sit`);
    const shin = byId(`leg_${side}_lower@sit`);
    const foot = byId(`leg_${side}_foot@sit`);
    const hip = art.pivots.get(`hip_${side}`);
    if (!shorts || !thigh || !shin || !foot || !hip) continue;
    const w = shorts.strokeWidth;
    const area = areaOf(shorts);
    shorts.id = `pants_tight_short_leg_${side}_upper@sit`;
    let at = art.parts.indexOf(shorts);
    if (styles.has('loose_short')) {
      const sp = smooth(offset(area, w * LOOSE * 0.6), hip);
      if (sp) {
        art.parts.splice(++at, 0, { ...shorts, id: `pants_loose_short_leg_${side}_upper@sit`, subpaths: [sp] });
        made.push(`pants_loose_short_leg_${side}_upper@sit`);
      }
    }
    if (styles.has('tight_long')) {
      // Seated in front view, the shins hang straight down: the hem is a level cut a little way into the foot.
      const ys = areaOf(foot).flat().map((q) => q.Y / SCALE);
      const [top, bottom] = [Math.min(...ys), Math.max(...ys)];
      const cutY = top + (bottom - top) * 0.3;
      // Two pieces named like the standing ones (so they replace them). The shin piece is drawn over the
      // thigh piece, so the knees facing the viewer keep their outline, as with the seated shorts.
      const upper = smooth(union(area, offset(areaOf(thigh), w * TIGHT)), hip);
      const lower = smooth(intersection(offset(areaOf(shin), w * TIGHT), [halfPlane([hip[0], cutY - 1], [hip[0], cutY])]), hip);
      if (upper && lower) {
        // Over the whole seated leg (thigh, shin and the top of the foot), so after the last of them.
        const last = Math.max(...[shorts, thigh, shin, foot].map((p) => art.parts.indexOf(p)), at);
        const up = { ...shorts, id: `pants_tight_long_leg_${side}_upper@sit`, subpaths: [upper] };
        const down = { ...shorts, id: `pants_tight_long_leg_${side}_lower@sit`, subpaths: [lower] };
        // With the seated thigh drawn as the whole leg (¾ stand-in), the shin piece is hidden under it.
        art.parts.splice(last + 1, 0, ...(wholeLeg ? [down, up] : [up, down]));
        made.push(`pants_tight_long_leg_${side}_upper@sit`, `pants_tight_long_leg_${side}_lower@sit`);
      }
    }
  }
  return made;
}
