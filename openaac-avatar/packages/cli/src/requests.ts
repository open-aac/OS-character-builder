import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RequestError, type RenderRequest } from '@openaac-avatar/core';

const decode = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/**
 * Load a request from a JSON file, or recover it from an SVG this tool
 * generated (the request is embedded in its <metadata>).
 */
export function readSavedRequest(file: string): RenderRequest {
  const text = readFileSync(resolve(file), 'utf8');
  if (/\.svg$/i.test(file)) {
    const m = /<metadata[^>]*openaac-avatar-request[^>]*>([\s\S]*?)<\/metadata>/.exec(text);
    if (!m) throw new RequestError(['this SVG has no embedded request (was it made with embedRequest turned off?)']);
    const saved = JSON.parse(decode(m[1]!)) as RenderRequest;
    return { pose: saved.pose, avatar: saved.avatar };
  }
  try {
    return JSON.parse(text) as RenderRequest;
  } catch (e) {
    throw new RequestError([`not valid JSON: ${(e as Error).message}`]);
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Deep-merge requests; later ones win, `undefined` values are ignored. */
export function mergeRequests(...reqs: RenderRequest[]): RenderRequest {
  const merge = (a: unknown, b: unknown): unknown => {
    if (b === undefined) return a;
    if (isObj(a) && isObj(b)) {
      const out: Obj = { ...a };
      for (const [k, v] of Object.entries(b)) out[k] = merge(a[k], v);
      return out;
    }
    return b;
  };
  return reqs.reduce<unknown>((acc, r) => merge(acc, r), {}) as RenderRequest;
}
