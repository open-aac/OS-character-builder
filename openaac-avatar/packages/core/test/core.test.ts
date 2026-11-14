import { describe, expect, it } from 'vitest';
import {
  JOINTS,
  PRESETS,
  RequestError,
  applyToPoint,
  getKit,
  jointForPart,
  blendPoses,
  jointMatrices,
  morph,
  normalizeRequest,
  poseFigure,
  renderSvg,
  resolvePose,
  subpathBox,
  toPathData,
  validateKit,
  presetsForView,
  kitGarments,
} from '../src/index.js';

const kit = getKit('front');

describe('art kit', () => {
  it('has both extremes blendable for every part', () => {
    for (const p of kit.parts) {
      expect(p.shapes.low.length).toBe(p.shapes.high.length);
      p.shapes.low.forEach((s, i) => expect(s.pts.length).toBe(p.shapes.high[i]!.pts.length));
    }
  });

  it('has every pivot the skeleton needs', () => {
    expect(validateKit(kit).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('gives every limb part a joint', () => {
    expect(jointForPart('arm_R_upper')).toBe('shoulder_R');
    expect(jointForPart('shirt_arm_L_upper')).toBe('shoulder_L');
    expect(jointForPart('arm_R_thumb')).toBe('wrist_R');
    expect(jointForPart('pants_leg_R_upper')).toBe('hip_R');
    expect(jointForPart('leg_L_foot')).toBe('ankle_L');
    expect(jointForPart('eye_R_iris')).toBe('neck');
    expect(jointForPart('shirt_body')).toBeNull();
  });
});

describe('clothing in every view', () => {
  it('offers the front view styles in the 3/4 and side views, and draws each', () => {
    const front = kitGarments(getKit('front'));
    for (const view of ['three-quarter', 'side'] as const) {
      const g = kitGarments(getKit(view));
      expect([...g.top].sort()).toEqual([...front.top].sort());
      expect([...g.bottom].sort()).toEqual([...front.bottom].sort());
      for (const style of front.top) {
        const svg = renderSvg({ view, avatar: { clothing: { top: style, bottom: style } } });
        expect(svg).toContain(`id="shirt_${style}_body`);
        expect(svg).not.toMatch(new RegExp(`id="shirt_(?!${style})`));
      }
    }
  });
});

describe('body slider', () => {
  it('reproduces each extreme exactly at 0 and 1', () => {
    const low = morph(kit, 0);
    const high = morph(kit, 1);
    expect(low.parts[0]!.shapes[0]!.pts).toEqual(kit.parts[0]!.shapes.low[0]!.pts);
    expect(high.parts[0]!.shapes[0]!.pts).toEqual(kit.parts[0]!.shapes.high[0]!.pts);
  });

  it('gets wider continuously', () => {
    const width = (t: number) => {
      const body = morph(kit, t).parts.find((p) => p.part.id === 'body')!;
      const b = subpathBox(body.shapes[0]!);
      return b.maxX - b.minX;
    };
    expect(width(0.25)).toBeGreaterThan(width(0));
    expect(width(0.75)).toBeGreaterThan(width(0.25));
    expect(width(1)).toBeGreaterThan(width(0.75));
  });
});

describe('posing', () => {
  it('leaves the art untouched at the rest pose', () => {
    const { pivots } = morph(kit, 0.5);
    const rest = { preset: 'x', angles: {}, scales: {}, order: [], onTop: [], variants: [], locked: [], airborne: false };
    const m = jointMatrices(pivots, rest);
    for (const j of JOINTS) expect(applyToPoint(m.get(j.id)!, [123, 456])).toEqual([123, 456]);
  });

  it('keeps children attached: the wrist follows the elbow', () => {
    const { pivots } = morph(kit, 0.5);
    const pose = resolvePose({ preset: 'waving' }, 0.5);
    const m = jointMatrices(pivots, pose);
    // Where the lower arm puts the wrist must equal where the hand pivots from.
    const viaElbow = applyToPoint(m.get('elbow_R')!, pivots['wrist_R']!);
    const viaWrist = applyToPoint(m.get('wrist_R')!, pivots['wrist_R']!);
    expect(viaElbow[0]).toBeCloseTo(viaWrist[0], 6);
    expect(viaElbow[1]).toBeCloseTo(viaWrist[1], 6);
  });

  it('keeps the lower leg full length when the thigh is foreshortened', () => {
    const { pivots } = morph(kit, 0.5);
    const m = jointMatrices(pivots, resolvePose({ preset: 'sitting' }, 0.5));
    const knee = applyToPoint(m.get('knee_R')!, pivots['knee_R']!);
    const ankle = applyToPoint(m.get('knee_R')!, pivots['ankle_R']!);
    const rest = Math.hypot(pivots['ankle_R']![0] - pivots['knee_R']![0], pivots['ankle_R']![1] - pivots['knee_R']![1]);
    expect(Math.hypot(ankle[0] - knee[0], ankle[1] - knee[1])).toBeCloseTo(rest, 6);
  });

  it('mirrors: the same angle on L and R gives a symmetric figure', () => {
    const { pivots } = morph(kit, 0.5);
    const pose = { preset: 'x', angles: { shoulder_R: 40, shoulder_L: 40 }, scales: {}, order: [], onTop: [], variants: [], locked: [], airborne: false };
    const m = jointMatrices(pivots, pose);
    const r = applyToPoint(m.get('shoulder_R')!, pivots['elbow_R']!);
    const l = applyToPoint(m.get('shoulder_L')!, pivots['elbow_L']!);
    const cx = pivots['neck']![0];
    expect(cx - r[0]).toBeCloseTo(l[0] - cx, 0);
    expect(r[1]).toBeCloseTo(l[1], 0);
    expect(r[1]).toBeLessThan(pivots['elbow_R']![1]); // positive = up
  });

  it('limits adjustments to the template range and the joint limits', () => {
    const p = resolvePose({ preset: 'standing', adjust: { elbow_R: 500, neck: -500 } }, 0.5);
    const base = resolvePose({ preset: 'standing' }, 0.5);
    expect(p.angles['elbow_R']).toBeCloseTo(base.angles['elbow_R']! + 30);
    expect(p.angles['neck']).toBe(-25);
  });

  it('uses the pointing hand only when pointing', () => {
    const parts = (preset: string) => poseFigure(kit, normalizeRequest({ pose: { preset } })).parts.map((p) => p.id);
    expect(parts('pointing')).toContain('arm_R_palm@point');
    expect(parts('pointing')).toContain('arm_L_palm@relaxed');
    expect(parts('waving')).not.toContain('arm_R_palm@point');
  });

  it('has a working preset for every pose in the offer', () => {
    const ids = PRESETS.map((p) => p.id);
    for (const id of ['standing', 'waving', 'reaching', 'holding', 'sitting', 'sitting-utensil', 'pointing', 'jumping', 'cheering']) {
      expect(ids).toContain(id);
      expect(renderSvg({ pose: { preset: id } })).toMatch(/^<svg /);
    }
  });
});

describe('requests', () => {
  it('fills in defaults', () => {
    const r = normalizeRequest({});
    expect(r.pose.preset).toBe('standing');
    expect(r.avatar.body).toBe(0.5);
    expect(r.options.size).toBe(1000);
  });

  it('rejects bad input with every problem listed', () => {
    try {
      normalizeRequest({ pose: { preset: 'flying', adjust: { tail: 3 } }, avatar: { colors: { skin: 'red;evil' } }, options: { idPrefix: '"><' } });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(RequestError);
      expect((e as RequestError).problems.length).toBe(4);
    }
  });
});

describe('SVG output', () => {
  const svg = renderSvg({
    pose: { preset: 'waving' },
    avatar: { body: 0.3, colors: { skin: '#8d5524', top: '#3366cc' }, lineWeight: 1.5 },
    options: { size: 300, idPrefix: 'sym1', title: 'Waving <hello>' },
  });

  it('labels parts by role so colours can be changed afterwards', () => {
    expect(svg).toMatch(/id="sym1-arm_R_upper" class="part fill-skin stroke-body"/);
    expect(svg).toMatch(/class="part fill-top stroke-body" d="[^"]+" fill="#3366cc"/);
    expect(svg).toMatch(/fill="#8d5524"/);
    expect(svg).not.toMatch(/#d59965/); // default skin fully replaced
  });

    it('lets eyebrow colour differ from hair colour', () => {
      const svg = renderSvg({ avatar: { colors: { hair: '#00ff00', eyebrow: '#ff00ff' } } });
      expect(svg).toMatch(/id="expression_content_eyebrow_[LR]"[^>]*fill="#ff00ff"/);
      expect(svg).toMatch(/id="hair_short_straight_front"[^>]*fill="#00ff00"/);
    });

  it('applies the line weight to both weight classes', () => {
    expect(svg).toMatch(/stroke-width="15"/);
    expect(svg).toMatch(/stroke-width="7.5"/);
  });

  it('escapes text and embeds the request for regeneration', () => {
    expect(svg).toContain('<title>Waving &lt;hello&gt;</title>');
    const meta = /<metadata[^>]*>([^<]*)<\/metadata>/.exec(svg)![1]!.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    const saved = JSON.parse(meta);
    expect(saved.pose.preset).toBe('waving');
    expect(saved.avatar.colors.top).toBe('#3366cc');
  });

  it('crops: head framing is smaller than full', () => {
    const vb = (s: string) => Number(/viewBox="[^ ]+ [^ ]+ ([^ ]+)/.exec(s)![1]);
    const full = renderSvg({ options: { framing: 'full' } });
    const head = renderSvg({ options: { framing: 'head' } });
    expect(vb(head)).toBeLessThan(vb(full) / 2);
  });

  it('is deterministic', () => {
    expect(renderSvg({ pose: { preset: 'holding' } })).toBe(renderSvg({ pose: { preset: 'holding' } }));
  });

  it('writes compact path data', () => {
    expect(toPathData([{ closed: true, pts: [0, 0, 1, 1, 2, 2, 3.456, -0.001] }])).toBe('M0 0C1 1 2 2 3.46 0Z');
  });
});

describe('variant art', () => {
  const ids = (preset: string) => poseFigure(kit, normalizeRequest({ pose: { preset } })).parts.map((p) => p.id);

  it('draws the open hands by default and relaxed hands when the arms hang down', () => {
    const waving = ids('waving');
    expect(waving).toContain('arm_R_palm@open'); // the waving hand
    expect(waving).toContain('arm_L_palm@relaxed'); // the hanging hand
    expect(waving).not.toContain('arm_R_palm@grip');
    const standing = ids('standing');
    expect(standing).toEqual(expect.arrayContaining(['arm_R_palm@relaxed', 'arm_L_palm@relaxed']));
    expect(standing).toContain('leg_R_upper');
    expect(standing).not.toContain('leg_R_upper@sit');
  });

  it('switches whole hand sets for a pose, per side when asked', () => {
    const holding = ids('holding');
    expect(holding).toEqual(expect.arrayContaining(['arm_R_palm@grip', 'arm_R_palm_index@grip', 'arm_L_palm@grip']));
    expect(holding).not.toContain('arm_R_palm@open');

    const eating = ids('sitting-utensil');
    expect(eating).toContain('arm_R_palm@grip');
    expect(eating).toContain('arm_L_palm@rest'); // grip_R only affects the right hand; the left rests on the knee
  });

  it('uses the drawn sitting legs and locks the leg joints', () => {
    const fig = poseFigure(kit, normalizeRequest({ pose: { preset: 'sitting', adjust: { knee_R: 20 } } }));
    const parts = fig.parts.map((p) => p.id);
    expect(parts).toEqual(expect.arrayContaining(['leg_R_upper@sit', 'leg_R_lower@sit', 'leg_R_foot@sit', 'pants_tight_short_leg_R_upper@sit']));
    expect(parts).not.toContain('leg_R_upper');
    expect(parts).toEqual(expect.arrayContaining(['arm_R_palm@rest', 'arm_L_palm@rest']));
    expect(fig.pose.scales['wrist_R']).toBe(1); // real resting-hand art: no shortening
    expect(fig.pose.locked).toContain('knee_R');
    expect(fig.pose.angles['knee_R']).toBe(0); // adjustment ignored: the art is already posed
    expect(fig.pose.scales['hip_R']).toBe(1); // no shortened-thigh workaround
  });

  it('falls back to workarounds when a kit has no variant art', () => {
    const plain = { ...kit, parts: kit.parts.filter((p) => !p.id.includes('@') || p.id.endsWith('@open')) };
    const fig = poseFigure(plain, normalizeRequest({ pose: { preset: 'holding' } }));
    expect(fig.pose.scales['wrist_R']).toBeCloseTo(0.55);
    expect(fig.parts.map((p) => p.id)).toContain('arm_R_palm@open');
    const sit = poseFigure(plain, normalizeRequest({ pose: { preset: 'sitting' } }));
    expect(sit.pose.scales['hip_R']).toBeCloseTo(0.2);
    expect(sit.pose.locked).toEqual([]);
  });

  it('draws a limb reaching towards the viewer in front of the face', () => {
    const fig = poseFigure(kit, normalizeRequest({ pose: { preset: 'sitting-utensil' } }));
    const order = fig.parts.map((p) => p.id);
    expect(order.indexOf('arm_R_palm@grip')).toBeGreaterThan(order.indexOf('head'));
  });
});

describe('animation support', () => {
  it('blends poses smoothly and switches art halfway', () => {
    const a = resolvePose({ preset: 'standing' }, 0.5);
    const b = resolvePose({ preset: 'waving' }, 0.5);
    const mid = blendPoses(a, b, 0.5);
    expect(mid.angles['shoulder_R']).toBeCloseTo((a.angles['shoulder_R']! + b.angles['shoulder_R']!) / 2);
    expect(blendPoses(a, b, 0.4).preset).toBe('standing');
    expect(blendPoses(a, b, 0.6).preset).toBe('waving');
    expect(blendPoses(a, b, 1).angles).toEqual(b.angles);
  });

  it('renders an explicit pose', () => {
    const waving = resolvePose({ preset: 'waving' }, 0.5);
    const paths = (svg: string) => svg.match(/<path [^>]+>/g)!.join('');
    const opts = { options: { embedRequest: false } };
    expect(paths(renderSvg({ pose: { preset: 'standing' }, ...opts }, 'front', waving))).toBe(paths(renderSvg({ pose: { preset: 'waving' }, ...opts })));
  });

  it('merges hanging sleeves into the shirt and outlines the arm below the cuff', () => {
    const svg = (preset: string, body = 0.5) => renderSvg({ pose: { preset }, avatar: { body } });
    for (const body of [0, 0.25, 0.5, 0.75, 1]) {
      const standing = svg('standing', body);
      expect(standing).toMatch(/id="shirt_tight_short_body"[^>]+data-merged="shirt_tight_short_arm_[LR]_upper shirt_tight_short_arm_[LR]_upper"/);
      for (const side of ['L', 'R']) {
        expect(standing).not.toContain(`id="shirt_tight_short_arm_${side}_upper"`);
        expect(standing).toContain(`id="arm_${side}_upper_line"`);
      }
      expect(standing).not.toContain('<mask');
    }
    // Waving: only the hanging left arm; the raised right arm is behind the torso.
    const waving = svg('waving');
    expect(waving).toContain('data-merged="shirt_tight_short_arm_L_upper"');
    expect(waving).toContain('id="shirt_tight_short_arm_R_upper"');
    // Forearms brought across the body keep the full sleeve outline.
    expect(svg('holding')).not.toContain('data-merged');
    expect(svg('cheering')).not.toContain('data-merged');
  });

  it('outlines the shorts where they meet a seated thigh', () => {
    expect(renderSvg({ pose: { preset: 'sitting' } })).toContain('id="pants_tight_short_body_fill_edge"');
    expect(renderSvg({ pose: { preset: 'standing' } })).not.toContain('_body_fill_edge');
  });

  it('wears one garment per slot, chosen by style', () => {
    const ids = (clothing?: object) => [...renderSvg({ avatar: { clothing } }).matchAll(/<path id="((?:shirt|pants)_[^"]+)"/g)].map((m) => m[1]!);
    expect(new Set(ids().map((id) => id.split('_').slice(1, 3).join('_')))).toEqual(new Set(['tight_short']));
    const long = ids({ top: 'tight_long', bottom: 'tight_long' });
    expect(long.every((id) => id.includes('_tight_long_'))).toBe(true);
    // Each long sleeve and trouser leg is drawn as one piece, so no outline crosses the elbow or knee.
    expect(long).toContain('pants_tight_long_leg_L_upper');
    expect(long).not.toContain('pants_tight_long_leg_L_lower');
    expect(long).not.toContain('shirt_tight_long_arm_R_lower');
    expect(() => renderSvg({ avatar: { clothing: { top: 'fancy_hat' } } })).toThrow(RequestError);
    expect(() => renderSvg({ avatar: { clothing: { hat: 'tight_short' } } })).toThrow(RequestError);
  });

  it('sits in each bottom on the seated legs, trousers included', () => {
    for (const bottom of ['tight_short', 'loose_short', 'tight_long']) {
      const svg = renderSvg({ pose: { preset: 'sitting' }, avatar: { clothing: { bottom } } });
      expect(svg).toContain('leg_L_upper--sit');
      expect(svg).toContain(`pants_${bottom}_leg_L_upper--sit`);
      // Only the worn style's seated piece, and no standing trouser leg left over.
      expect(svg.match(/id="pants_[a-z_]+_leg_L_upper/g)).toHaveLength(1);
      expect(svg).not.toMatch(/id="pants_[a-z_]+_leg_L_lower"/);
    }
  });

  it('fits the hips to the thigh in the side view at any bent hip, not just in the sitting pose', () => {
    const side = getKit('side');
    for (const preset of ['standing', 'sitting']) {
      for (const hip of [-30, -20, 20, 30]) {
        for (const body of [0, 0.5, 1]) {
          for (const bottom of ['tight_short', 'loose_short', 'tight_long']) {
            const req = normalizeRequest({ view: 'side', pose: { preset, adjust: { hip_L: hip } }, avatar: { body, clothing: { bottom, top: 'tight_long' } } });
            const parts = poseFigure(side, req).parts;
            // Every case here bends the hip well past the threshold, so no standing hips piece should remain...
            const standingHips = parts.filter((p) => /^pants_[a-z_]+_body_(fill|line)$/.test(p.id) && p.shapes.length > 0);
            expect(standingHips.length, `${preset} hip ${hip} body ${body} ${bottom}`).toBe(0);
            // ...and one fused bottom piece covers the hips and thigh, drawn over the shirt, with a single outline.
            const bottoms = parts.filter((p) => p.fillRole === 'bottom' && p.shapes.length > 0);
            expect(bottoms.length).toBeGreaterThan(0);
            const shirt = parts.findIndex((p) => p.id.startsWith('shirt_') && p.id.endsWith('_body'));
            expect(shirt).toBeGreaterThanOrEqual(0);
            expect(shirt).toBeLessThan(parts.indexOf(bottoms[0]!));
            expect(parts.filter((p) => p.id.endsWith('_line') && p.id.startsWith('pants_') && p.shapes.length > 0).length).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('keeps the standing hips piece when the hip is barely bent', () => {
    const side = getKit('side');
    for (const hip of [0, 5, 10]) {
      const req = normalizeRequest({ view: 'side', pose: { preset: 'standing', adjust: { hip_L: hip } }, avatar: { clothing: { bottom: 'tight_long', top: 'tight_long' } } });
      const parts = poseFigure(side, req).parts;
      const standingHips = parts.filter((p) => /^pants_[a-z_]+_body_(fill|line)$/.test(p.id) && p.shapes.length > 0);
      expect(standingHips.length, `hip ${hip}`).toBeGreaterThan(0);
    }
  });

  it('renders the three-quarter and side views', () => {
    for (const view of ['three-quarter', 'side']) {
      for (const p of presetsForView(view)) {
        for (const body of [0, 0.5, 1]) {
          const svg = renderSvg({ view, pose: { preset: p.id }, avatar: { body } });
          expect(svg).toContain(`data-view="${view}"`);
          expect(svg).not.toMatch(/NaN/);
        }
      }
    }
    expect(presetsForView('side').map((p) => p.id)).toEqual(expect.arrayContaining(['sitting', 'sitting-utensil']));
    expect(presetsForView('three-quarter').map((p) => p.id)).toContain('sitting');
    expect(() => renderSvg({ view: 'three-quarter', pose: { preset: 'holding' } })).toThrow(RequestError);
    expect(() => renderSvg({ view: 'upside-down' })).toThrow(/No art for view/);
    // The view is saved with the request, so the file re-renders the same way.
    expect(renderSvg({ view: 'side' })).toContain('&quot;view&quot;:&quot;side&quot;');
  });

  it('raises the near arm forward in the side view', () => {
    const fig = poseFigure(getKit('side'), normalizeRequest({ view: 'side', pose: { preset: 'pointing' } }));
    const hand = fig.parts.find((p) => p.id === 'arm_L_hand')!;
    const head = fig.parts.find((p) => p.id === 'head')!;
    const box = (p: typeof hand) => p.shapes.reduce((b, s) => subpathBox(s, b), subpathBox(p.shapes[0]!));
    // Facing the viewer's left: the pointing hand is out in front of (left of) the face, at about shoulder height.
    expect(box(hand).maxX).toBeLessThan(box(head).minX);
  });
});
