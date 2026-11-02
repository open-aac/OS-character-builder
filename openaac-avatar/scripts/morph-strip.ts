/** Dev helper: the body slider at five steps, standing and waving, for spotting blend artefacts. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { renderSvg } from '@openaac-avatar/core';
mkdirSync('out/morph', { recursive: true });
const cells: string[] = [];
for (const preset of ['standing', 'waving']) {
  for (const body of [0, 0.25, 0.5, 0.75, 1]) {
    const name = `${preset}-${body}.svg`;
    writeFileSync(`out/morph/${name}`, renderSvg({ pose: { preset }, avatar: { body }, options: { framing: 'canvas', size: 380 } }));
    cells.push(`<figure><img src="${name}" width="380" height="380"><figcaption>${preset} ${body}</figcaption></figure>`);
  }
}
writeFileSync('out/morph/index.html', `<!doctype html><style>body{margin:0;display:grid;grid-template-columns:repeat(5,384px);gap:2px;font:12px sans-serif}figure{margin:0;border:1px solid #ccc}</style>${cells.join('')}`);
