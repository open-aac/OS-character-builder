/** Turning the rendered SVG into files the user can keep. */
import { h } from './dom';

export function downloadBlob(blob: Blob, name: string): void {
  downloadUrl(URL.createObjectURL(blob), name);
}

export function downloadUrl(href: string, name: string): void {
  const a = h('a', { href, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  if (href.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/** Rasterise an SVG string to a PNG data URL at the given square size. */
export async function svgToPng(svg: string, size: number): Promise<string> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = h('canvas', { width: size, height: size });
    canvas.getContext('2d')!.drawImage(img, 0, 0, size, size);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}
