/**
 * Dev helper: render ad-hoc variants of a preset side by side.
 *   tsx scripts/try.ts '<json array of {label, preset, patch, body, framing}>'
 * `patch` is merged into the preset (angles/scales/order) for that render only.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PRESET_BY_ID, renderSvg, type PosePreset } from '@openaac-avatar/core';

const outDir = resolve(import.meta.dirname, '../out/try');
mkdirSync(outDir, { recursive: true });
const variants = JSON.parse(process.argv[2] ?? '[]') as { label: string; preset: string; patch?: Partial<PosePreset>; body?: number; framing?: string; adjust?: Record<string, number> }[];
const cells: string[] = [];
variants.forEach((v, i) => {
  const p = PRESET_BY_ID.get(v.preset) as PosePreset & Record<string, unknown>;
  const saved = { angles: p.angles, scales: p.scales, order: p.order, onTop: p.onTop };
  if (v.patch?.angles) p.angles = { ...p.angles, ...v.patch.angles };
  if (v.patch?.scales) p.scales = { ...p.scales, ...v.patch.scales };
  if (v.patch?.order) p.order = v.patch.order;
  if (v.patch?.onTop) p.onTop = v.patch.onTop;
  const name = `v${i}.svg`;
  writeFileSync(join(outDir, name), renderSvg({ pose: { preset: v.preset, adjust: v.adjust }, avatar: { body: v.body ?? 0.5 }, options: { framing: v.framing ?? 'full', size: 300 } }));
  Object.assign(p, saved);
  cells.push(`<figure><img src="${name}" width="300" height="300"><figcaption>${v.label}</figcaption></figure>`);
});
writeFileSync(join(outDir, 'index.html'), `<!doctype html><meta charset="utf-8"><style>body{margin:0;display:grid;grid-template-columns:repeat(3,310px);gap:6px;padding:6px;background:#eee;font:12px sans-serif}figure{margin:0;background:#fff;border:1px solid #ccc}figcaption{text-align:center;padding:2px}</style>${cells.join('')}`);
