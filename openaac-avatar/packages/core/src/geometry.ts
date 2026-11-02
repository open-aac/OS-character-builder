import type { Point, Subpath } from './types.js';

/** 2D affine matrix in SVG order: [a, b, c, d, e, f] maps (x, y) to (a*x + c*y + e, b*x + d*y + f). */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function translate(x: number, y: number): Matrix {
  return [1, 0, 0, 1, x, y];
}

/** Rotation in degrees. Positive is clockwise on screen (y points down). */
export function rotate(deg: number): Matrix {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, s, -s, c, 0, 0];
}

/** Scale by `k` along the unit direction (ux, uy), leaving the perpendicular axis untouched. */
export function scaleAlong(ux: number, uy: number, k: number): Matrix {
  const t = k - 1;
  return [1 + t * ux * ux, t * ux * uy, t * ux * uy, 1 + t * uy * uy, 0, 0];
}

/** Conjugate `m` so it acts about point p instead of the origin. */
export function about(p: Point, m: Matrix): Matrix {
  return multiply(translate(p[0], p[1]), multiply(m, translate(-p[0], -p[1])));
}

export function applyToPoint(m: Matrix, p: Point): [number, number] {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
}

export function applyToSubpath(m: Matrix, sp: Subpath): Subpath {
  const src = sp.pts;
  const pts = new Array<number>(src.length);
  for (let i = 0; i < src.length; i += 2) {
    const x = src[i]!;
    const y = src[i + 1]!;
    pts[i] = m[0] * x + m[2] * y + m[4];
    pts[i + 1] = m[1] * x + m[3] * y + m[5];
  }
  return { closed: sp.closed, pts };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpPoint(a: Point, b: Point, t: number): [number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
}

export function lerpSubpath(a: Subpath, b: Subpath, t: number): Subpath {
  if (a.pts.length !== b.pts.length) {
    throw new Error(`Cannot blend shapes with different point counts (${a.pts.length} vs ${b.pts.length})`);
  }
  const pts = new Array<number>(a.pts.length);
  for (let i = 0; i < a.pts.length; i++) pts[i] = lerp(a.pts[i]!, b.pts[i]!, t);
  return { closed: a.closed, pts };
}

/* ------------------------------------------------------------------ */
/* Bounding boxes                                                       */
/* ------------------------------------------------------------------ */

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function emptyBox(): Box {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

export function isEmptyBox(b: Box): boolean {
  return !(b.maxX >= b.minX && b.maxY >= b.minY);
}

function addPoint(b: Box, x: number, y: number): void {
  if (x < b.minX) b.minX = x;
  if (x > b.maxX) b.maxX = x;
  if (y < b.minY) b.minY = y;
  if (y > b.maxY) b.maxY = y;
}

/** Parameter values in (0, 1) where a 1D cubic Bézier has a turning point. */
function cubicExtrema(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const out: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) out.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      out.push((-b + sq) / (2 * a), (-b - sq) / (2 * a));
    }
  }
  return out.filter((t) => t > 0 && t < 1);
}

function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** Exact bounding box of the curves (not just their control points). */
export function subpathBox(sp: Subpath, into: Box = emptyBox()): Box {
  const p = sp.pts;
  if (p.length < 2) return into;
  addPoint(into, p[0]!, p[1]!);
  for (let i = 2; i + 5 < p.length; i += 6) {
    const x0 = p[i - 2]!, y0 = p[i - 1]!;
    const x1 = p[i]!, y1 = p[i + 1]!;
    const x2 = p[i + 2]!, y2 = p[i + 3]!;
    const x3 = p[i + 4]!, y3 = p[i + 5]!;
    addPoint(into, x3, y3);
    for (const t of cubicExtrema(x0, x1, x2, x3)) addPoint(into, cubicAt(x0, x1, x2, x3, t), cubicAt(y0, y1, y2, y3, t));
    for (const t of cubicExtrema(y0, y1, y2, y3)) addPoint(into, cubicAt(x0, x1, x2, x3, t), cubicAt(y0, y1, y2, y3, t));
  }
  return into;
}

export function growBox(b: Box, by: number): Box {
  return { minX: b.minX - by, minY: b.minY - by, maxX: b.maxX + by, maxY: b.maxY + by };
}

/* ------------------------------------------------------------------ */
/* Path data output                                                     */
/* ------------------------------------------------------------------ */

function fmt(n: number, decimals: number): string {
  const s = n.toFixed(decimals);
  // Trim trailing zeros and a dangling decimal point; avoid "-0".
  const t = s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
  return t === '-0' ? '0' : t;
}

/** Serialise subpaths to an SVG `d` attribute using absolute M/C/Z commands. */
export function toPathData(subpaths: readonly Subpath[], decimals = 2): string {
  const parts: string[] = [];
  for (const sp of subpaths) {
    const p = sp.pts;
    if (p.length < 2) continue;
    let d = `M${fmt(p[0]!, decimals)} ${fmt(p[1]!, decimals)}`;
    for (let i = 2; i + 5 < p.length; i += 6) {
      d += `C${fmt(p[i]!, decimals)} ${fmt(p[i + 1]!, decimals)} ${fmt(p[i + 2]!, decimals)} ${fmt(p[i + 3]!, decimals)} ${fmt(p[i + 4]!, decimals)} ${fmt(p[i + 5]!, decimals)}`;
    }
    if (sp.closed) d += 'Z';
    parts.push(d);
  }
  return parts.join('');
}
