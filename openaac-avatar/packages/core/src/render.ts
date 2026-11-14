/**
 * Renders a figure to an SVG string. Pure string building: no DOM, so the
 * same function runs in the editor and on the server.
 */
import { applyToPoint, applyToSubpath, emptyBox, growBox, isEmptyBox, subpathBox, toPathData, type Box, type Matrix } from './geometry.js';
import { getKit, morph } from './kit.js';
import { jointMatrices, resolvePose, variantBase, type ResolvedPose } from './pose.js';
import { RequestError, normalizeRequest, type NormalizedRequest } from './request.js';
import { expressionOf, garmentOf, genericName, hairOf, isBackHair, jointForPart, splitVariant, unitForPart, type UnitId } from './rig.js';
import { joinGarmentPieces, mergeSleeves, outlineClothEdges, quarterLap, trimTorsoSkin } from './merge.js';
import type { ArtKit, ColorRole, FillRole, GarmentSlot, StrokeRole, Subpath } from './types.js';

export interface PosedPart {
  id: string;
  unit: UnitId;
  /** Drawn in front of everything (a limb reaching towards the viewer). */
  front: boolean;
  joint: string | null;
  fillRole: FillRole | null;
  fill: string | null;
  strokeRole: StrokeRole | null;
  shapes: Subpath[];
  /** Shapes are straight segments (from shape geometry), written as lines. */
  polyline?: boolean;
  /** Parts merged into this one (e.g. hanging sleeves into the shirt). */
  merged?: readonly string[];
  /** For a sleeve or trouser leg joined from two pieces: the upper piece's shapes. */
  upperPiece?: Subpath[];
}

export interface PosedFigure {
  parts: PosedPart[];
  pose: ResolvedPose;
}

/** Variant names the kit has art for. */
export function kitVariants(kit: ArtKit): Set<string> {
  const out = new Set<string>();
  for (const p of kit.parts) {
    const v = splitVariant(p.id).variant;
    if (v) out.add(v);
  }
  return out;
}

/** The variant set drawn when a pose doesn't ask for another one. */
export const DEFAULT_VARIANT = 'open';

/**
 * Pick which parts to draw. Variants on the same joint are alternative sets
 * (e.g. an open hand and a gripping hand): the pose's choice wins, else the
 * `open` set. A visible variant also hides the plain part of the same name.
 * `active` holds the pose's variants, e.g. `grip` (both sides) or `grip_R`.
 */
export function visibleParts(
  kit: ArtKit,
  active: readonly string[],
  clothing: Partial<Record<GarmentSlot, string>> = {},
  look: LookChoice = {},
): Set<string> {
  const worn = wornStyles(kit, clothing);
  const shown = shownLook(kit, look);
  const info = kit.parts.filter((p) => {
    // Other garments in the same slot are not drawn.
    const g = garmentOf(p.id);
    if (g && worn[g.slot] !== g.style) return false;
    // Nor are other hair styles or expressions.
    const h = hairOf(p.id);
    if (h && shown.hair !== h.style) return false;
    const e = expressionOf(p.id);
    return !e || shown.expression === e.name;
  }).map((p) => {
    const { base, variant } = splitVariant(p.id);
    const joint = jointForPart(base);
    return { id: p.id, base, variant, joint, key: joint ?? 'torso', side: joint?.match(/_([LR])$/)?.[1] };
  });

  // Which variant sets exist on each joint.
  const offered = new Map<string, Set<string>>();
  for (const p of info) {
    if (!p.variant) continue;
    const set = offered.get(p.key) ?? new Set<string>();
    set.add(p.variant);
    offered.set(p.key, set);
  }

  const chosen = new Map<string, string | null>();
  for (const [key, set] of offered) {
    const side = key.match(/_([LR])$/)?.[1];
    const pick = active.find((tag) => {
      const m = /^(.*)_([LR])$/.exec(tag);
      return m ? m[2] === side && set.has(m[1]!) : set.has(tag);
    });
    chosen.set(key, pick ? variantBase(pick) : set.has(DEFAULT_VARIANT) ? DEFAULT_VARIANT : null);
  }

  const visible = new Set<string>();
  const replaced = new Set<string>();
  for (const p of info) {
    if (p.variant && chosen.get(p.key) === p.variant) {
      visible.add(p.id);
      replaced.add(genericName(p.base));
    }
  }
  // A visible variant replaces the plain part, whatever garment style the plain part is drawn in.
  for (const p of info) if (!p.variant && !replaced.has(genericName(p.id))) visible.add(p.id);
  return visible;
}

/** Hair style (or `none`) and expression asked for; null or omitted means the art's default. */
export interface LookChoice {
  hair?: string | null;
  expression?: string | null;
}

/** Hair styles the art offers, in drawing order. Empty if the art has only its plain hair. */
export function kitHairStyles(kit: ArtKit): string[] {
  const out: string[] = [];
  for (const p of kit.parts) {
    const h = hairOf(p.id);
    if (h && !out.includes(h.style)) out.push(h.style);
  }
  return out;
}

/** Expressions the art offers, in drawing order. */
export function kitExpressions(kit: ArtKit): string[] {
  const out: string[] = [];
  for (const p of kit.parts) {
    const e = expressionOf(p.id);
    if (e && !out.includes(e.name)) out.push(e.name);
  }
  return out;
}

/** Style drawn when no hair is asked for, if the art has it (else the first style). */
export const DEFAULT_HAIR = 'short_straight';
/** Expression drawn when none is asked for, if the art has it (else the first). */
export const DEFAULT_EXPRESSION = 'content';

/**
 * The hair style and expression drawn: the requested ones, else the defaults. `hair` is `none` for
 * no hair. Throws RequestError for ones the art doesn't have. A view without hair or expression
 * art draws what its plain parts show, and both are undefined.
 */
export function shownLook(kit: ArtKit, look: LookChoice = {}): { hair?: string; expression?: string } {
  const hairs = kitHairStyles(kit);
  const expressions = kitExpressions(kit);
  const problems: string[] = [];
  const out: { hair?: string; expression?: string } = {};
  if (hairs.length) {
    const want = look.hair;
    if (want && want !== 'none' && !hairs.includes(want)) problems.push(`avatar.hair must be one of: none, ${hairs.join(', ')}`);
    out.hair = want && (want === 'none' || hairs.includes(want)) ? want : hairs.includes(DEFAULT_HAIR) ? DEFAULT_HAIR : hairs[0]!;
  }
  if (expressions.length) {
    const want = look.expression;
    if (want && !expressions.includes(want)) problems.push(`avatar.expression must be one of: ${expressions.join(', ')}`);
    out.expression = want && expressions.includes(want) ? want : expressions.includes(DEFAULT_EXPRESSION) ? DEFAULT_EXPRESSION : expressions[0]!;
  }
  if (problems.length) throw new RequestError(problems);
  return out;
}

/** Garment styles the art offers in each slot, in drawing order. */
export function kitGarments(kit: ArtKit): Record<GarmentSlot, string[]> {
  const out: Record<GarmentSlot, string[]> = { top: [], bottom: [] };
  for (const p of kit.parts) {
    const g = garmentOf(p.id);
    if (g && !out[g.slot].includes(g.style)) out[g.slot].push(g.style);
  }
  return out;
}

/**
 * The style worn in each slot: the requested one, else the first the art has.
 * Throws RequestError for a style the art doesn't have.
 */
export function wornStyles(kit: ArtKit, clothing: Partial<Record<GarmentSlot, string>>): Partial<Record<GarmentSlot, string>> {
  const offered = kitGarments(kit);
  const out: Partial<Record<GarmentSlot, string>> = {};
  const problems: string[] = [];
  for (const slot of ['top', 'bottom'] as const) {
    const styles = offered[slot];
    if (!styles.length) continue;
    const want = clothing[slot];
    if (want && !styles.includes(want)) problems.push(`avatar.clothing.${slot} must be one of: ${styles.join(', ')}`);
    out[slot] = want && styles.includes(want) ? want : styles[0]!;
  }
  if (problems.length) throw new RequestError(problems);
  return out;
}

/**
 * Variant art usable with the clothes worn (pass this to `resolvePose`). The
 * seated legs are drawn with shorts, so with long trousers the standing legs
 * are posed instead (the template's fallback for missing sitting art).
 */
export function availableVariants(kit: ArtKit, clothing: Partial<Record<GarmentSlot, string>> = {}): Set<string> {
  const out = kitVariants(kit);
  const worn = wornStyles(kit, clothing);
  // Seated legs need seated art for the bottom worn; without it (e.g. long trousers), the standing legs are posed.
  const seated = (style: string) => kit.parts.some((p) => p.id.startsWith(`pants_${style}_`) && splitVariant(p.id).variant === 'sit');
  if (worn.bottom && !seated(worn.bottom) && /long/.test(worn.bottom)) out.delete('sit');
  return out;
}

const SEATED_MIN_BODY = 0.05;

/** Side view: a hip bent this far (degrees either way) puts the thigh in the lap, whatever pose it came from. */
const LAP_HIP = 15;

/** Whether the thighs are swung far enough from standing that the hips and thighs have to be fitted together. */
function lapped(pose: ResolvedPose, view: string): boolean {
  return !!pose.seated || (view === 'side' && ['hip_L', 'hip_R'].some((j) => Math.abs(pose.angles[j] ?? 0) >= LAP_HIP));
}

/**
 * Morph to the body size, apply the pose, and return the parts in drawing order.
 * `poseOverride` replaces the resolved pose (used for animated previews).
 */
export function poseFigure(kit: ArtKit, req: NormalizedRequest, poseOverride?: ResolvedPose): PosedFigure {
  const available = availableVariants(kit, req.avatar.clothing);
  const pose = poseOverride ?? resolvePose(req.pose, req.avatar.body, available, kit.view);
  // Side view sitting from standing art: on the very slimmest body the thigh is too thin to reach the
  // hips, so the figure is drawn at least SEATED_MIN_BODY (a difference too small to see elsewhere).
  const body = lapped(pose, kit.view) && kit.view === 'side' ? Math.max(req.avatar.body, SEATED_MIN_BODY) : req.avatar.body;
  const fig = morph(kit, body);
  const mats = jointMatrices(fig.pivots, pose);
  const visible = visibleParts(kit, pose.variants.filter((v) => available.has(variantBase(v))), req.avatar.clothing, req.avatar);

  const partIndex = new Map(kit.parts.map((p, i) => [p.id, i]));
  const byUnit = new Map<UnitId, PosedPart[]>();
  for (const { part, shapes } of fig.parts) {
    if (!visible.has(part.id)) continue;
    const joint = jointForPart(part.id);
    // Hair hanging behind the body is the back layer. In the side view it is drawn over the head, as drawn.
    const unit: UnitId = isBackHair(part.id) && kit.view !== 'side' ? 'hairBack' : unitForPart(part.id, joint);
    const m = joint ? mats.get(joint) : undefined;
    const posed: PosedPart = {
      id: part.id,
      unit,
      front: joint !== null && pose.onTop.includes(joint),
      joint,
      fillRole: part.fillRole,
      fill: part.fill,
      strokeRole: part.strokeRole,
      shapes: m ? shapes.map((s) => applyToSubpath(m, s)) : shapes,
    };
    const list = byUnit.get(unit) ?? [];
    list.push(posed);
    byUnit.set(unit, list);
  }
  const ordered: PosedPart[] = [];
  if (!pose.order.length) {
    // No unit order: the designer's layer order (other views, where far limbs are drawn behind).
    for (const list of byUnit.values()) ordered.push(...list);
    ordered.sort((a, b) => partIndex.get(a.id)! - partIndex.get(b.id)!);
  } else {
    const seen = new Set<UnitId>();
    // The bare torso is always the back layer, even if a pose's order leaves it out.
    const withTrunk: readonly UnitId[] = pose.order.includes('trunk') ? pose.order : ['trunk', ...pose.order];
    const order: readonly UnitId[] = withTrunk.includes('hairBack') ? withTrunk : ['hairBack', ...withTrunk];
    for (const u of order) {
      seen.add(u);
      ordered.push(...(byUnit.get(u) ?? []));
    }
    // Any unit the pose forgot goes on top rather than disappearing.
    for (const [u, list] of byUnit) if (!seen.has(u)) ordered.push(...list);
  }
  const lineWidth = kit.strokeWidths.body * req.avatar.lineWeight;
  // ¾ and side limbs meet edge to edge at the elbow and knee: a round cap behind them keeps the outline whole when they bend.
  if (kit.view !== 'front') addJointCaps(ordered, fig, mats);
  // Where each joint is once posed (its own matrix keeps its pivot in place).
  const posedPivots: Record<string, [number, number]> = {};
  for (const [j, m] of mats) {
    const pv = fig.pivots[j];
    if (pv) posedPivots[j] = applyToPoint(m, pv);
  }
  const layered = joinGarmentPieces([...ordered.filter((p) => !p.front), ...ordered.filter((p) => p.front)], lineWidth, posedPivots);
  // Sleeve merging fixes the front art's T-pose sleeves once the arms hang down. The other views are
  // drawn with the arms down already, so their sleeves keep the designer's outlines.
  const merged = kit.view === 'front' ? mergeSleeves(layered, pose.onTop, lineWidth, posedPivots) : trimTorsoSkin(layered, restArmsOverTorso(kit, fig.parts), fig.pivots['neck'], lineWidth);
  const seated = !lapped(pose, kit.view) ? merged : quarterLap(merged, posedPivots, lineWidth, kit.view === 'side');
  const parts = outlineClothEdges(seated, lineWidth);
  return { parts, pose };
}

const FRAMING_UNITS: Record<string, readonly UnitId[] | null> = {
  full: null,
  upper: ['hairBack', 'torso', 'head', 'arm_L', 'arm_R'],
  head: ['hairBack', 'head'],
};

/** The square area to show, in kit units. */
export function frameBox(kit: ArtKit, fig: PosedFigure, req: NormalizedRequest): Box {
  const { framing, padding } = req.options;
  if (framing === 'canvas') return { minX: 0, minY: 0, maxX: kit.canvas.width, maxY: kit.canvas.height };
  const units = FRAMING_UNITS[framing] ?? null;
  let box = emptyBox();
  for (const p of fig.parts) {
    if (units && !units.includes(p.unit)) continue;
    const pb = emptyBox();
    for (const s of p.shapes) subpathBox(s, pb);
    if (isEmptyBox(pb)) continue;
    const half = p.strokeRole ? (kit.strokeWidths[p.strokeRole] * req.avatar.lineWeight) / 2 : 0;
    const g = growBox(pb, half);
    box = {
      minX: Math.min(box.minX, g.minX),
      minY: Math.min(box.minY, g.minY),
      maxX: Math.max(box.maxX, g.maxX),
      maxY: Math.max(box.maxY, g.maxY),
    };
  }
  if (isEmptyBox(box)) return { minX: 0, minY: 0, maxX: kit.canvas.width, maxY: kit.canvas.height };
  // Square it around the centre so symbols tile evenly, then pad.
  const side = Math.max(box.maxX - box.minX, box.maxY - box.minY);
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const half = (side * (1 + 2 * padding)) / 2;
  return { minX: cx - half, minY: cy - half, maxX: cx + half, maxY: cy + half };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const r2 = (n: number) => String(Math.round(n * 100) / 100);

const isEyebrow = (id: string) => /(^|_)eyebrow(_|$)/.test(id);

function fillFor(p: PosedPart, colors: Record<ColorRole, string>): string {
  if (!p.fillRole) return 'none';
  if (p.fillRole === 'fixed') return p.fill ?? 'none';
  // Backward compatibility: existing kit JSONs tag eyebrows as hair.
  if (p.fillRole === 'hair' && isEyebrow(p.id)) return colors.eyebrow;
  return colors[p.fillRole];
}

/**
 * Arm parts as drawn (unposed) and layered in front of the torso skin, as parts for shape geometry.
 * A far arm drawn behind the torso doesn't hide any of it.
 */
function restArmsOverTorso(kit: ArtKit, parts: readonly { part: ArtKit['parts'][number]; shapes: Subpath[] }[]): PosedPart[] {
  const bodyAt = kit.parts.findIndex((p) => /^body(_|$)/.test(p.id) && p.fillRole === 'skin');
  return parts
    .filter(({ part }) => kit.parts.indexOf(part) > bodyAt && /^(shoulder|elbow|wrist)_/.test(jointForPart(part.id) ?? '') && part.fillRole)
    .map(({ part, shapes }) => ({ id: part.id, unit: 'torso', front: false, joint: null, fillRole: part.fillRole, fill: part.fill, strokeRole: part.strokeRole, shapes }));
}

/** The straight edge that closes each open outline (where SVG fills across without a line). */
function openingEdges(subpaths: readonly Subpath[]): string {
  return subpaths
    .filter((sp) => !sp.closed && sp.pts.length >= 4)
    .map((sp) => `M${r2(sp.pts[sp.pts.length - 2]!)} ${r2(sp.pts[sp.pts.length - 1]!)}L${r2(sp.pts[0]!)} ${r2(sp.pts[1]!)}`)
    .join('');
}

/**
 * Round caps at the elbows and knees, drawn just behind the two segments that
 * meet there. Each fits inside the limb as drawn (a circle across the limb's
 * width at the joint, slightly smaller), so it only shows on the outside of a
 * bend, where it rounds the corner and keeps the outline continuous.
 */
function addJointCaps(ordered: PosedPart[], fig: ReturnType<typeof morph>, mats: Map<string, Matrix>): void {
  for (const side of ['L', 'R']) {
    for (const [upperJoint, joint, childJoint] of [['shoulder', 'elbow', 'wrist'], ['hip', 'knee', 'ankle']] as const) {
      const at = fig.pivots[`${joint}_${side}`];
      const child = fig.pivots[`${childJoint}_${side}`];
      const skinOn = (j: string) => fig.parts.find(({ part }) => part.fillRole === 'skin' && jointForPart(part.id) === `${j}_${side}` && !splitVariant(part.id).variant);
      const upper = skinOn(upperJoint);
      const lower = skinOn(joint);
      const m = mats.get(`${upperJoint}_${side}`);
      if (!at || !child || !upper || !lower || !m) continue;
      const len = Math.hypot(child[0] - at[0], child[1] - at[1]) || 1;
      const n: [number, number] = [-(child[1] - at[1]) / len, (child[0] - at[0]) / len];
      // Where a line across the limb at the joint meets its outline, on each side.
      let plus = Infinity;
      let minus = -Infinity;
      for (const sp of [...upper.shapes, ...lower.shapes]) {
        const pts = flatten(sp);
        for (let i = 1; i < pts.length; i++) {
          const t = crossAt(at, n, pts[i - 1]!, pts[i]!);
          if (t === null) continue;
          if (t > 0 && t < plus) plus = t;
          if (t < 0 && t > minus) minus = t;
        }
      }
      if (!Number.isFinite(plus) || !Number.isFinite(minus)) continue;
      const mid = (plus + minus) / 2;
      const c: [number, number] = [at[0] + n[0] * mid, at[1] + n[1] * mid];
      const r = ((plus - minus) / 2) * 0.9;
      const first = ordered.findIndex((p) => p.id === upper.part.id || p.id === lower.part.id);
      if (first < 0) continue;
      // A long sleeve or trouser leg covers the joint and is rounded there itself; a skin cap would peek out.
      if (ordered.some((p) => p.joint === `${joint}_${side}` && (p.fillRole === 'top' || p.fillRole === 'bottom'))) continue;
      const host = ordered[first]!;
      ordered.splice(first, 0, {
        id: `${host.id.split('_').slice(0, 2).join('_')}_${joint}_cap`,
        unit: host.unit,
        front: host.front,
        joint: `${upperJoint}_${side}`,
        fillRole: 'skin',
        fill: upper.part.fill,
        strokeRole: upper.part.strokeRole,
        shapes: [applyToSubpath(m, circle(c, r))],
      });
    }
  }
}

/** A subpath as a polyline (16 points per curve). */
function flatten(sp: Subpath): [number, number][] {
  const p = sp.pts;
  const out: [number, number][] = [[p[0]!, p[1]!]];
  for (let i = 2; i + 5 < p.length; i += 6) {
    const x0 = p[i - 2]!, y0 = p[i - 1]!;
    for (let k = 1; k <= 16; k++) {
      const t = k / 16, u = 1 - t;
      const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      out.push([a * x0 + b * p[i]! + c * p[i + 2]! + d * p[i + 4]!, a * y0 + b * p[i + 1]! + c * p[i + 3]! + d * p[i + 5]!]);
    }
  }
  if (sp.closed) out.push(out[0]!);
  return out;
}

/** Where the line `origin + t·dir` crosses segment a–b, as t (or null). */
function crossAt(origin: readonly [number, number], dir: [number, number], a: [number, number], b: [number, number]): number | null {
  const ex = b[0] - a[0], ey = b[1] - a[1];
  const den = dir[0] * ey - dir[1] * ex;
  if (Math.abs(den) < 1e-9) return null;
  const ox = a[0] - origin[0], oy = a[1] - origin[1];
  const t = (ox * ey - oy * ex) / den;
  const u = (ox * dir[1] - oy * dir[0]) / den;
  return u >= 0 && u <= 1 ? t : null;
}

/** A circle as four cubic arcs. */
function circle([cx, cy]: [number, number], r: number): Subpath {
  const k = 0.5523 * r;
  return {
    closed: true,
    pts: [
      cx + r, cy,
      cx + r, cy + k, cx + k, cy + r, cx, cy + r,
      cx - k, cy + r, cx - r, cy + k, cx - r, cy,
      cx - r, cy - k, cx - k, cy - r, cx, cy - r,
      cx + k, cy - r, cx + r, cy - k, cx + r, cy,
    ],
  };
}

/** Straight-segment subpaths as compact path data. */
function toLineData(subpaths: readonly Subpath[]): string {
  return subpaths
    .map((sp) => {
      const p = sp.pts;
      let d = `M${r2(p[0]!)} ${r2(p[1]!)}`;
      for (let i = 6; i + 1 < p.length; i += 6) d += `L${r2(p[i]!)} ${r2(p[i + 1]!)}`;
      return sp.closed ? `${d}Z` : d;
    })
    .join('');
}

/**
 * Render a request to an SVG string. Accepts unvalidated input (e.g. a
 * parsed HTTP body) and throws RequestError if it's malformed.
 */
export function renderSvg(input: unknown, viewOverride?: string, poseOverride?: ResolvedPose): string {
  const req = normalizeRequest(input);
  const view = viewOverride ?? req.view;
  const kit = getKit(view);
  const fig = poseFigure(kit, req, poseOverride);
  const box = frameBox(kit, fig, req);
  const { colors, lineWeight } = req.avatar;
  const { size, idPrefix, background, title, embedRequest } = req.options;
  const id = (s: string) => (idPrefix ? `${idPrefix}-${s}` : s);

  const out: string[] = [];
  const vb = `${r2(box.minX)} ${r2(box.minY)} ${r2(box.maxX - box.minX)} ${r2(box.maxY - box.minY)}`;
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${r2(size)}" height="${r2(size)}"` +
      ` data-generator="openaac-avatar" data-view="${esc(view)}" data-pose="${esc(fig.pose.preset)}"${title ? ' role="img"' : ''}>`,
  );
  if (title) out.push(`<title>${esc(title)}</title>`);
  if (embedRequest) {
    const saved = { view, pose: req.pose, avatar: req.avatar };
    out.push(`<metadata id="${id('openaac-avatar-request')}">${esc(JSON.stringify(saved))}</metadata>`);
  }

  if (background) {
    out.push(`<rect id="${id('background')}" class="background" x="${r2(box.minX)}" y="${r2(box.minY)}" width="${r2(box.maxX - box.minX)}" height="${r2(box.maxY - box.minY)}" fill="${background}"/>`);
  }
  out.push(`<g id="${id('figure')}" stroke-linecap="round" stroke-linejoin="round">`);
  let currentGroup: string | null = null;
  for (const p of fig.parts) {
    const group = p.front ? `unit-${p.unit}-front` : `unit-${p.unit}`;
    if (group !== currentGroup) {
      if (currentGroup) out.push('</g>');
      out.push(`<g id="${id(group)}" class="unit">`);
      currentGroup = group;
    }
    const classes = ['part'];
    if (p.fillRole) classes.push(`fill-${p.fillRole}`);
    if (p.strokeRole) classes.push(`stroke-${p.strokeRole}`);
    const width = p.strokeRole ? kit.strokeWidths[p.strokeRole] * lineWeight : 0;
    const stroke = p.strokeRole ? ` stroke="${colors.ink}" stroke-width="${r2(width)}"` : '';
    const d = p.polyline ? toLineData(p.shapes) : toPathData(p.shapes);
    const merged = p.merged?.length ? ` data-merged="${p.merged.map((m) => m.replace('@', '--')).join(' ')}"` : '';
    const fill = fillFor(p, colors);
    // ¾ and side art butts limb segments edge to edge at the joints; a fill-coloured edge across each
    // opening closes the hairline gap the blend between body sizes can leave there.
    const seams = kit.view !== 'front' && p.fillRole && p.strokeRole && !p.polyline ? openingEdges(p.shapes) : '';
    if (seams) {
      out.push(`<path id="${id(`${p.id.replace('@', '--')}-seam`)}" class="part seam-${p.fillRole}" d="${seams}" fill="none" stroke="${fill}" stroke-width="${r2(width)}"/>`);
    }
    out.push(`<path id="${id(p.id.replace('@', '--'))}" class="${classes.join(' ')}" d="${d}" fill="${fill}"${stroke}${merged}/>`);
  }
  if (currentGroup) out.push('</g>');
  out.push('</g></svg>');
  return out.join('\n');
}
