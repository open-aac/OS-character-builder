/**
 * Renders every preset at three body sizes into out/preview/ and builds a
 * contact sheet (out/preview/index.html) for a quick visual check.
 *
 *   pnpm preview
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PRESETS, renderSvg } from '@openaac-avatar/core';

const outDir = resolve(import.meta.dirname, '../out/preview');
mkdirSync(outDir, { recursive: true });
const bodies = [0, 0.5, 1];
const framing = (process.argv[2] ?? 'full') as 'full' | 'upper' | 'head' | 'canvas';
const cells: string[] = [];
for (const p of PRESETS) {
  for (const body of bodies) {
    const name = `${p.id}_${String(body).replace('.', '')}_${framing}.svg`;
    writeFileSync(join(outDir, name), renderSvg({ pose: { preset: p.id }, avatar: { body }, options: { framing, size: 300 } }));
    cells.push(`<figure><img src="${name}" width="300" height="300"><figcaption>${p.id} · body ${body}</figcaption></figure>`);
  }
}
writeFileSync(
  join(outDir, `index-${framing}.html`),
  `<!doctype html><meta charset="utf-8"><style>body{margin:0;display:grid;grid-template-columns:repeat(${bodies.length},310px);gap:6px;padding:6px;background:#eee;font:12px sans-serif}figure{margin:0;background:#fff;border:1px solid #ccc}figcaption{text-align:center;padding:2px}</style>${cells.join('')}`,
);
console.log(`wrote ${cells.length} previews to ${outDir}`);
