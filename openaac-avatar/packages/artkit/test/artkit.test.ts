import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blendQuality, compileKit, matchSubpaths, parseInkscapeSvg, subdivideTo, toCubicSubpaths } from '../src/index.js';

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="1000" height="1000" viewBox="0 0 1000 1000">${body}</svg>`;

const pivots = (dx = 0) =>
  `<g inkscape:label="pivots">${['neck', 'shoulder_R', 'elbow_R', 'wrist_R', 'hip_R', 'knee_R', 'ankle_R', 'shoulder_L', 'elbow_L', 'wrist_L', 'hip_L', 'knee_L', 'ankle_L']
    .map((n, i) => `<circle inkscape:label="pivot_${n}" cx="${400 + i * 10 + dx}" cy="${100 + i * 50}" r="5"/>`)
    .join('')}</g>`;

describe('path normalisation', () => {
  it('turns lines, H/V, quadratics and arcs into cubics', () => {
    const sps = toCubicSubpaths('M0 0 L10 0 H20 V10 Q20 20 10 20 A5 5 0 0 1 0 10 Z');
    expect(sps).toHaveLength(1);
    expect(sps[0]!.closed).toBe(true);
    const n = (sps[0]!.pts.length - 2) / 6;
    expect(n).toBeGreaterThanOrEqual(5);
    // ends where it started
    expect(sps[0]!.pts.at(-2)).toBeCloseTo(0);
    expect(sps[0]!.pts.at(-1)).toBeCloseTo(0);
  });

  it('applies nested group transforms and reports page stroke width', () => {
    const art = parseInkscapeSvg(
      svg(`<g transform="translate(100,0)"><path inkscape:label="arm_R_upper" transform="scale(2)" d="M0 0 L10 0" style="fill:#d59965;stroke:#000000;stroke-width:5"/></g>`),
      't',
    );
    const p = art.parts[0]!;
    expect(p.subpaths[0]!.pts.slice(0, 2)).toEqual([100, 0]);
    expect(p.subpaths[0]!.pts.slice(-2)).toEqual([120, 0]);
    expect(p.strokeWidth).toBeCloseTo(10);
  });

  it('skips reference images and working layers', () => {
    const art = parseInkscapeSvg(svg(`<g inkscape:label="ratios_low"><path d="M0 0L1 1"/></g><image href="x.jpg"/>`), 't');
    expect(art.parts).toHaveLength(0);
    expect(art.problems.length).toBe(2);
  });
});

describe('matching extremes', () => {
  const square = { closed: true, pts: toCubicSubpaths('M0 0 L10 0 L10 10 L0 10 Z')[0]!.pts };

  it('adds nodes without changing the outline', () => {
    const s = subdivideTo(square, 6);
    expect((s.pts.length - 2) / 6).toBe(6);
    expect(s.pts.slice(0, 2)).toEqual([0, 0]);
  });

  it('fixes a shape drawn from a different start point', () => {
    const shifted = { closed: true, pts: toCubicSubpaths('M10 10 L0 10 L0 0 L10 0 Z')[0]!.pts };
    const m = matchSubpaths(square, shifted);
    expect(m.notes.join()).toMatch(/re-ordered/);
    expect(m.high.pts.slice(0, 2)).toEqual([0, 0]);
  });

  it('handles a part closed in one file and open in the other', () => {
    const open = { closed: false, pts: toCubicSubpaths('M0 0 L10 0 L10 10 L0 10')[0]!.pts };
    const m = matchSubpaths(open, square);
    expect(m.low.closed).toBe(false);
    expect(m.high.closed).toBe(false);
    expect(m.low.pts.length).toBe(m.high.pts.length);
  });
});

describe('pairing by outline position', () => {
  it('pairs shapes whose nodes are spread very differently, without twisting', () => {
    // A thin bar with its nodes bunched at the top, and a wider one with them bunched at the bottom.
    const low = toCubicSubpaths('M 0 0 L 2 0 L 4 0 L 10 0 L 10 100 L 0 100 Z')[0]!;
    const high = toCubicSubpaths('M 0 0 L 20 0 L 20 50 L 20 90 L 16 100 L 0 100 Z')[0]!;
    const m = matchSubpaths(low, high);
    expect(m.notes.join(' ')).toMatch(/paired by position along the outline/);
    // Much closer than pairing the nodes in drawing order.
    const byOrder = blendQuality(subdivideTo(low, 6), high);
    expect(blendQuality(m.low, m.high)).toBeLessThan(byOrder * 0.5);
  });

  it('opens both at the same place when the outlines are left open in different places', () => {
    const low = toCubicSubpaths('M 0 0 L 0 100 L 10 100 L 10 0')[0]!; // open at the top
    const high = toCubicSubpaths('M 60 100 L 60 0 L 0 0 L 0 100')[0]!; // open at the bottom
    const m = matchSubpaths(low, high);
    expect(m.low.closed || m.high.closed).toBe(false);
    // Both open across the top (low's gap): their ends sit at the top corners.
    const ends = (sp: typeof low) => [sp.pts[1]!, sp.pts[sp.pts.length - 1]!];
    expect(ends(m.low).every((y) => y < 1)).toBe(true);
    expect(ends(m.high).every((y) => y < 1)).toBe(true);
  });
});

describe('compileKit', () => {
  const part = (d: string) => `<path inkscape:label="arm_R_upper" d="${d}" style="fill:#d59965;stroke:#000;stroke-width:10"/>`;

  it('builds a kit and assigns colour and line roles', () => {
    const r = compileKit({
      low: { name: 'low', xml: svg(part('M0 0 L10 0 L10 10 Z') + pivots()) },
      high: { name: 'high', xml: svg(part('M0 0 L20 0 L20 20 Z') + pivots(5)) },
    });
    expect(r.findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(r.kit!.parts[0]).toMatchObject({ id: 'arm_R_upper', fillRole: 'skin', strokeRole: 'body' });
    expect(r.kit!.pivots['shoulder_R']).toEqual({ low: [410, 150], high: [415, 150] });
  });

  it('refuses parts that exist in only one file', () => {
    const r = compileKit({ low: { name: 'low', xml: svg(part('M0 0 L1 1') + pivots()) }, high: { name: 'high', xml: svg(pivots()) } });
    expect(r.kit).toBeNull();
    expect(r.findings.some((f) => f.severity === 'error' && /missing from high/.test(f.message))).toBe(true);
  });

  describe('hair and expression add-ons', () => {
    const shape = (id: string, d: string, fill = '#2b190d') => `<path inkscape:label="${id}" d="${d}" style="fill:${fill};stroke:#000;stroke-width:5"/>`;
    const base = (dx: number) =>
      svg(
        shape('hair', `M${dx} 0 L10 0 L10 10 Z`) +
          shape('head', `M${dx} 0 L${40 + dx} 0 L${40 + dx} 40 L${dx} 40 Z`, '#d59965') +
          shape('mouth', `M${dx} 20 L30 20 L30 25 Z`, '#ffffff') +
          pivots(dx),
      );
    const addon = (name: string, ...parts: string[]) => ({ name, xml: svg(parts.join('')) });
    const compile = (view = 'front') =>
      compileKit({
        low: { name: 'low', xml: base(0) },
        high: { name: 'high', xml: base(6) },
        addons: {
          low: [
            addon('addons/expressions.low.svg', shape('expression_content_mouth', 'M0 20 L30 20 L30 25 Z', '#ffffff')),
            addon('addons/hair-short_straight.low.svg', shape('hair_short_straight_front', 'M0 0 L10 0 L10 10 Z')),
            addon('addons/hair-long_straight.low.svg', shape('hair_long_straight_back', 'M0 0 L10 0 L10 50 Z'), shape('hair_long_straight_front', 'M0 0 L10 0 L10 5 Z')),
          ],
          high: [],
        },
        view,
      });

    it('uses low-only art at both ends, moved with the head, and drops the plain parts it replaces', () => {
      const r = compile();
      expect(r.findings.filter((f) => f.severity === 'error')).toEqual([]);
      const ids = r.kit!.parts.map((p) => p.id);
      expect(ids).toEqual(expect.arrayContaining(['expression_content_mouth', 'hair_short_straight_front', 'hair_long_straight_back']));
      expect(ids).not.toContain('hair');
      expect(ids).not.toContain('mouth');
      const mouth = r.kit!.parts.find((p) => p.id === 'expression_content_mouth')!;
      const minX = (pts: number[]) => Math.min(...pts.filter((_, i) => i % 2 === 0));
      expect(minX(mouth.shapes.high[0]!.pts) - minX(mouth.shapes.low[0]!.pts)).toBeCloseTo(6);
    });

    it('draws back hair first, except in the side view where it follows the head', () => {
      const ids = (view: string) => compile(view).kit!.parts.map((p) => p.id);
      expect(ids('front')[0]).toBe('hair_long_straight_back');
      expect(ids('three-quarter')[0]).toBe('hair_long_straight_back');
      const side = ids('side');
      expect(side.indexOf('hair_long_straight_back')).toBeGreaterThan(side.indexOf('head'));
      expect(side.indexOf('hair_long_straight_back')).toBeLessThan(side.indexOf('expression_content_mouth'));
    });

    it('draws short hair behind the face outside the front view', () => {
      const ids = (view: string) => compile(view).kit!.parts.map((p) => p.id);
      expect(ids('three-quarter').indexOf('hair_short_straight_front')).toBeLessThan(ids('three-quarter').indexOf('expression_content_mouth'));
      expect(ids('front').indexOf('hair_short_straight_front')).toBeGreaterThan(ids('front').indexOf('head'));
    });
  });

  it("compiles the designer's real files without errors", () => {
    const dir = resolve(import.meta.dirname, '../../../art/source/front');
    const r = compileKit({
      low: { name: 'bm_low.svg', xml: readFileSync(resolve(dir, 'bm_low.svg'), 'utf8') },
      high: { name: 'bm_high.svg', xml: readFileSync(resolve(dir, 'bm_high.svg'), 'utf8') },
    });
    expect(r.findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(r.kit!.parts.length).toBeGreaterThan(30);
  });
});
