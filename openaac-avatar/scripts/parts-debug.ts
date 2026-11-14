/**
 * Debug view of the posed parts: every part outlined in its own colour (and the joints marked), for
 * checking how the pieces fit together.  pnpm tsx --conditions=source scripts/parts-debug.ts side sitting 1 out.svg
 */
import { writeFileSync } from 'node:fs';
import { getKit, morph, normalizeRequest, poseFigure } from '@openaac-avatar/core';
const [view = 'side', preset = 'sitting', body = '1', out, top = 'tight_long', bottom = 'tight_long'] = process.argv.slice(2);
const req = normalizeRequest({ pose: { preset }, avatar: { body: +body, clothing: { top, bottom } }, options: {} });
const kit = getKit(view);
const fig = poseFigure(kit, req);
const colors = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#008080', '#9a6324', '#800000', '#808000', '#000075'];
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${kit.canvas.width} ${kit.canvas.height}" width="900"><rect width="100%" height="100%" fill="#fff"/>`;
fig.parts.forEach((p, i) => {
  const d = p.shapes.map((s) => {
    let t = `M${s.pts[0]} ${s.pts[1]}`;
    for (let k = 2; k + 5 < s.pts.length; k += 6) t += `C${s.pts.slice(k, k + 6).join(' ')}`;
    return t + (s.closed ? 'Z' : '');
  }).join('');
  if (d) svg += `<path d="${d}" fill="${p.fillRole ? colors[i % colors.length] : 'none'}" fill-opacity="0.18" stroke="${colors[i % colors.length]}" stroke-width="2"><title>${p.id}</title></path>`;
});
const m = morph(kit, +body);
for (const [k, v] of Object.entries(m.pivots)) if (/hip|knee/.test(k)) svg += `<circle cx="${v[0]}" cy="${v[1]}" r="4" fill="#000"/>`;
svg += '</svg>';
if (out) writeFileSync(out, svg);
for (const p of fig.parts) {
  const ys = p.shapes.flatMap((s) => s.pts.filter((_, i) => i % 2));
  const xs = p.shapes.flatMap((s) => s.pts.filter((_, i) => !(i % 2)));
  if (!out) console.log(p.id.padEnd(46), p.unit.padEnd(6), String(p.fillRole).padEnd(6), p.shapes.length ? `x ${Math.min(...xs).toFixed(0)}..${Math.max(...xs).toFixed(0)} y ${Math.min(...ys).toFixed(0)}..${Math.max(...ys).toFixed(0)}` : 'empty');
}
