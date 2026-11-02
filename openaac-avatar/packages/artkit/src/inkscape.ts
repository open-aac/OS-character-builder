/**
 * Reads an Inkscape SVG and flattens it into absolute, transform-free shapes.
 *
 * Everything that matters for the kit is pulled out here: each labelled
 * path becomes a list of cubic subpaths in page coordinates, with its
 * effective (on-page) stroke width, and each marker in the `pivots` layer
 * becomes a point.
 */
import { DOMParser } from '@xmldom/xmldom';
import svgpath from 'svgpath';
import { IDENTITY, applyToPoint, applyToSubpath, multiply, rotate, type Matrix } from '@openaac-avatar/core';
import type { Subpath } from '@openaac-avatar/core';

const NS_INKSCAPE = 'http://www.inkscape.org/namespaces/inkscape';

export interface RawPart {
  id: string;
  /** Group path, e.g. `body/arm_R`, for messages. */
  group: string;
  subpaths: Subpath[];
  fill: string | null;
  stroke: string | null;
  /** Stroke width as it appears on the page, after transforms. */
  strokeWidth: number;
  opacity: number;
  /** Whether the element still has an Inkscape live path effect attached. */
  pathEffect: boolean;
}

export interface RawArt {
  width: number;
  height: number;
  parts: RawPart[];
  pivots: Map<string, [number, number]>;
  problems: { severity: 'error' | 'warning' | 'info'; message: string }[];
}

/** Layers that are working aids rather than art; skipped if left in the file. */
const SKIP_LAYER = /^(ratios|ref|reference|guide|guides|sketch)/i;

export function parseInkscapeSvg(xml: string, fileLabel: string): RawArt {
  const problems: RawArt['problems'] = [];
  const warn = (message: string) => problems.push({ severity: 'warning', message });
  const stretched: string[] = [];
  const doc = new DOMParser({
    errorHandler: (level: string, msg: string) => {
      if (level !== 'warning') warn(`${fileLabel}: XML ${level}: ${msg}`);
    },
  }).parseFromString(xml, 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg || svg.localName !== 'svg') throw new Error(`${fileLabel}: not an SVG document`);

  // Page size and the user-unit scale implied by viewBox.
  const width = parseFloat(svg.getAttribute('width') ?? '') || 0;
  const height = parseFloat(svg.getAttribute('height') ?? '') || 0;
  const vb = (svg.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  let root: Matrix = IDENTITY;
  let pageW = width;
  let pageH = height;
  if (vb.length === 4 && vb.every(Number.isFinite)) {
    const [vx, vy, vw, vh] = vb as [number, number, number, number];
    pageW = width || vw;
    pageH = height || vh;
    if (Math.abs(pageW / vw - 1) > 1e-6 || Math.abs(pageH / vh - 1) > 1e-6 || vx !== 0 || vy !== 0) {
      warn(
        `${fileLabel}: viewBox is ${vb.join(' ')} but the page is ${pageW}×${pageH}. Coordinates are rescaled to page pixels; setting the document units to px avoids this.`,
      );
    }
    root = multiply([pageW / vw, 0, 0, pageH / vh, 0, 0], [1, 0, 0, 1, -vx, -vy]);
  }

  const parts: RawPart[] = [];
  const pivots = new Map<string, [number, number]>();

  const walk = (el: Element, m: Matrix, groupPath: string[], inPivots: boolean): void => {
    for (let n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType !== 1) continue;
      const child = n as Element;
      const tag = child.localName;
      if (tag === 'defs' || tag === 'metadata' || tag === 'namedview' || tag === 'title' || tag === 'desc') continue;

      const style = readStyle(child);
      if (style.display === 'none' || style.visibility === 'hidden') continue;

      const label = child.getAttributeNS(NS_INKSCAPE, 'label') || child.getAttribute('id') || tag;
      const cm = multiply(m, parseTransform(child.getAttribute('transform')));

      if (tag === 'g') {
        if (SKIP_LAYER.test(label)) {
          warn(`${fileLabel}: skipped working layer "${label}" (please leave it out of delivered files)`);
          continue;
        }
        const isPivots = inPivots || /^pivots?$/i.test(label);
        walk(child, cm, [...groupPath, label], isPivots);
        continue;
      }

      if (tag === 'image') {
        warn(`${fileLabel}: embedded image "${label}" ignored (reference images should be removed)`);
        continue;
      }

      if (inPivots) {
        const c = markerCentre(child);
        if (c) {
          const name = label.replace(/^pivot_/, '');
          if (pivots.has(name)) warn(`${fileLabel}: duplicate pivot "${label}"`);
          pivots.set(name, applyToPoint(cm, c));
        }
        continue;
      }

      if (tag === 'path' || tag === 'ellipse' || tag === 'circle' || tag === 'rect') {
        const d = tag === 'path' ? child.getAttribute('d') ?? '' : shapeToPath(child);
        if (!d.trim()) continue;
        const subpaths = toCubicSubpaths(d).map((sp) => applyToSubpath(cm, sp));
        const det = Math.abs(cm[0] * cm[3] - cm[1] * cm[2]);
        const sx = Math.hypot(cm[0], cm[1]);
        const sy = Math.hypot(cm[2], cm[3]);
        const fill = colour(style.fill ?? 'black');
        const stroke = colour(style.stroke ?? 'none');
        const rawWidth = stroke ? parseFloat(style['stroke-width'] ?? '1') : 0;
        if (stroke && Math.abs(sx - sy) / Math.max(sx, sy) > 0.02) stretched.push(label);
        const opacity =
          num(style.opacity, 1) * num(style['fill-opacity'], 1) * (stroke ? num(style['stroke-opacity'], 1) : 1);
        if (/url\(/.test(style.fill ?? '') || /url\(/.test(style.stroke ?? '')) {
          warn(`${fileLabel}: "${label}" uses a gradient or pattern; only flat colours can be recoloured`);
        }
        if (style.filter && style.filter !== 'none') warn(`${fileLabel}: "${label}" has a filter (blur etc.), which is ignored`);
        parts.push({
          id: label,
          group: groupPath.join('/'),
          subpaths,
          fill,
          stroke,
          strokeWidth: rawWidth * Math.sqrt(det),
          opacity,
          pathEffect: child.hasAttributeNS(NS_INKSCAPE, 'path-effect') || child.hasAttribute('inkscape:path-effect'),
        });
      }
    }
  };

  walk(svg, root, [], false);
  if (stretched.length) {
    problems.push({
      severity: 'info',
      message: `${fileLabel}: ${stretched.length} part(s) are scaled unevenly in Inkscape; outlines are redrawn at the exact style-guide weight, so nothing to fix.`,
    });
  }
  return { width: pageW, height: pageH, parts, pivots, problems };
}

/* ------------------------------------------------------------------ */

function num(v: string | undefined, dflt: number): number {
  if (v === undefined) return dflt;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : dflt;
}

const PRESENTATION = ['fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'display', 'visibility', 'filter'];

function readStyle(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of PRESENTATION) {
    const v = el.getAttribute(a);
    if (v) out[a] = v.trim();
  }
  for (const decl of (el.getAttribute('style') ?? '').split(';')) {
    const i = decl.indexOf(':');
    if (i > 0) out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
  }
  return out;
}

const NAMED: Record<string, string> = { black: '#000000', white: '#ffffff', none: 'none' };

/** Normalise a colour to lowercase #rrggbb, or null for none/unknown paint. */
function colour(v: string): string | null {
  const s = (NAMED[v.toLowerCase()] ?? v).toLowerCase();
  if (s === 'none' || s.startsWith('url(')) return s === 'none' ? null : s;
  const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
  if (m3) return `#${m3[1]}${m3[1]}${m3[2]}${m3[2]}${m3[3]}${m3[3]}`;
  return s;
}

export function parseTransform(t: string | null): Matrix {
  if (!t) return IDENTITY;
  let m: Matrix = IDENTITY;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  for (let r = re.exec(t); r; r = re.exec(t)) {
    const v = r[2]!.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    let n: Matrix = IDENTITY;
    switch (r[1]) {
      case 'matrix':
        n = [v[0] ?? 1, v[1] ?? 0, v[2] ?? 0, v[3] ?? 1, v[4] ?? 0, v[5] ?? 0];
        break;
      case 'translate':
        n = [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0];
        break;
      case 'scale':
        n = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const [a = 0, cx = 0, cy = 0] = v;
        n = multiply([1, 0, 0, 1, cx, cy], multiply(rotate(a), [1, 0, 0, 1, -cx, -cy]));
        break;
      }
      case 'skewX':
        n = [1, 0, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case 'skewY':
        n = [1, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
    }
    m = multiply(m, n);
  }
  return m;
}

function markerCentre(el: Element): [number, number] | null {
  const tag = el.localName;
  if (tag === 'circle' || tag === 'ellipse') return [num(el.getAttribute('cx') ?? undefined, 0), num(el.getAttribute('cy') ?? undefined, 0)];
  if (tag === 'rect') {
    return [
      num(el.getAttribute('x') ?? undefined, 0) + num(el.getAttribute('width') ?? undefined, 0) / 2,
      num(el.getAttribute('y') ?? undefined, 0) + num(el.getAttribute('height') ?? undefined, 0) / 2,
    ];
  }
  if (tag === 'path') {
    // Centre of the control-point bounds is close enough for a small dot.
    const sps = toCubicSubpaths(el.getAttribute('d') ?? '');
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const sp of sps) {
      for (let i = 0; i < sp.pts.length; i += 2) {
        minX = Math.min(minX, sp.pts[i]!); maxX = Math.max(maxX, sp.pts[i]!);
        minY = Math.min(minY, sp.pts[i + 1]!); maxY = Math.max(maxY, sp.pts[i + 1]!);
      }
    }
    return Number.isFinite(minX) ? [(minX + maxX) / 2, (minY + maxY) / 2] : null;
  }
  return null;
}

function shapeToPath(el: Element): string {
  const g = (a: string) => num(el.getAttribute(a) ?? undefined, 0);
  switch (el.localName) {
    case 'circle':
    case 'ellipse': {
      const cx = g('cx'), cy = g('cy');
      const rx = el.localName === 'circle' ? g('r') : g('rx');
      const ry = el.localName === 'circle' ? g('r') : g('ry');
      return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
    }
    case 'rect': {
      const x = g('x'), y = g('y'), w = g('width'), h = g('height');
      return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
    }
  }
  return '';
}

const EPS = 1e-6;

/** Convert any SVG path data to absolute cubic-only subpaths. Lines and quadratics become equivalent cubics. */
export function toCubicSubpaths(d: string): Subpath[] {
  const out: Subpath[] = [];
  let cur: Subpath | null = null;
  let sx = 0, sy = 0;

  const line = (x0: number, y0: number, x1: number, y1: number) => {
    cur!.pts.push(x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3, x0 + (2 * (x1 - x0)) / 3, y0 + (2 * (y1 - y0)) / 3, x1, y1);
  };
  const ensure = (x: number, y: number) => {
    if (!cur) {
      cur = { closed: false, pts: [x, y] };
      out.push(cur);
      sx = x; sy = y;
    }
  };

  svgpath(d)
    .abs()
    .unshort()
    .unarc()
    .iterate((seg, _i, x, y) => {
      switch (seg[0]) {
        case 'M':
          cur = { closed: false, pts: [seg[1], seg[2]] };
          out.push(cur);
          sx = seg[1]; sy = seg[2];
          break;
        case 'L':
          ensure(x, y);
          line(x, y, seg[1], seg[2]);
          break;
        case 'H':
          ensure(x, y);
          line(x, y, seg[1], y);
          break;
        case 'V':
          ensure(x, y);
          line(x, y, x, seg[1]);
          break;
        case 'C':
          ensure(x, y);
          cur!.pts.push(seg[1], seg[2], seg[3], seg[4], seg[5], seg[6]);
          break;
        case 'Q': {
          ensure(x, y);
          const [, qx, qy, ex, ey] = seg;
          cur!.pts.push(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey);
          break;
        }
        case 'Z':
        case 'z':
          if (cur) {
            const c: Subpath = cur;
            const n = c.pts.length;
            if (Math.abs(c.pts[n - 2]! - sx) > EPS || Math.abs(c.pts[n - 1]! - sy) > EPS) line(c.pts[n - 2]!, c.pts[n - 1]!, sx, sy);
            c.closed = true;
            cur = null;
          }
          break;
        default:
          throw new Error(`Unexpected path command ${seg[0]} after normalisation`);
      }
    });
  return out.filter((sp) => sp.pts.length >= 8);
}
