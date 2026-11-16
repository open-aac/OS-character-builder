/**
 * HTTP API around the render core. Plain node:http, no framework, so it
 * can be mounted inside another Node server or run on its own.
 *
 *   POST /render            JSON request in, SVG out
 *   GET  /render.svg?...    Same, from query parameters (usable directly as an <img src>)
 *   POST /render/batch      { requests: [...] } in, { results: [{ svg } | { error }] } out
 *   GET  /presets           Poses, joints, colour roles and framings, for building UIs
 *   GET  /health
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import {
  COLOR_ROLES,
  DEFAULT_COLORS,
  DEFAULT_ADJUST_RANGE,
  FRAMINGS,
  JOINTS,
  KITS,
  getKit,
  kitGarments,
  kitExpressions,
  kitHairStyles,
  PRESETS,
  RequestError,
  renderSvg,
  type Framing,
  type RenderRequest,
} from '@openaac-avatar/core';

export interface AppOptions {
  /** Value for Access-Control-Allow-Origin. `null` disables CORS headers. Default '*'. */
  corsOrigin?: string | null;
  /** Largest accepted request body in bytes. Default 256 KB. */
  maxBodyBytes?: number;
  /** Most requests accepted by /render/batch. Default 200. */
  maxBatch?: number;
  /** Optional HTTP Basic Auth guard for temporary private preview deployments. */
  basicAuth?: { username: string; password: string };
}

function decodeBasicAuth(header: string | undefined): { username: string; password: string } | null {
  if (!header) return null;
  const m = /^Basic\s+(.+)$/i.exec(header);
  if (!m) return null;
  let raw = '';
  try {
    raw = Buffer.from(m[1]!, 'base64').toString('utf8');
  } catch {
    return null;
  }
  const i = raw.indexOf(':');
  if (i < 0) return null;
  return { username: raw.slice(0, i), password: raw.slice(i + 1) };
}

function safeEq(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function isAuthorised(header: string | undefined, expected: { username: string; password: string }): boolean {
  const got = decodeBasicAuth(header);
  return !!got && safeEq(got.username, expected.username) && safeEq(got.password, expected.password);
}

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public problems?: string[],
  ) {
    super(message);
  }
}

function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, `request body larger than ${limit} bytes`));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJson(req: IncomingMessage, limit: number): Promise<unknown> {
  const text = await readBody(req, limit);
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'body is not valid JSON');
  }
}

const COLOR_PARAMS = new Set<string>(COLOR_ROLES);

/** Build a request from query parameters. Colours may be given with or without '#'. */
export function requestFromQuery(q: URLSearchParams): RenderRequest {
  const num = (k: string) => {
    const v = q.get(k);
    if (v === null || v === '') return undefined;
    const n = Number(v);
    if (!Number.isFinite(n)) throw new RequestError([`${k} must be a number`]);
    return n;
  };
  const hex = (v: string) => (v.startsWith('#') ? v : `#${v}`);
  const adjust: Record<string, number> = {};
  const colors: Record<string, string> = {};
  for (const [k, v] of q) {
    if (k.startsWith('adjust.')) adjust[k.slice(7)] = Number(v);
    else if (k === 'adjust') {
      // adjust=elbow_R:15,neck:-5
      for (const pair of v.split(',')) {
        const [joint, deg] = pair.split(':');
        if (joint) adjust[joint] = Number(deg);
      }
    } else if (COLOR_PARAMS.has(k)) colors[k] = hex(v);
  }
  const bg = q.get('background');
  return {
    pose: { preset: q.get('preset') ?? undefined, adjust },
    avatar: {
      body: num('body'),
      lineWeight: num('lineWeight'),
      colors,
      clothing: { top: q.get('wearTop') ?? undefined, bottom: q.get('wearBottom') ?? undefined },
      hair: q.get('hairStyle') ?? undefined,
      expression: q.get('expression') ?? undefined,
    },
    options: {
      framing: (q.get('framing') ?? undefined) as Framing | undefined,
      size: num('size'),
      padding: num('padding'),
      background: bg ? hex(bg) : undefined,
      title: q.get('title') ?? undefined,
      idPrefix: q.get('idPrefix') ?? undefined,
      embedRequest: q.get('embedRequest') === 'false' ? false : undefined,
    },
  };
}

export function describeApi() {
  return {
    views: Object.keys(KITS),
    presets: PRESETS.map((p) => ({ id: p.id, label: p.label, description: p.description, views: ['front', ...Object.keys(p.views ?? {})] })),
    garments: kitGarments(getKit('front')),
    hairStyles: ['none', ...kitHairStyles(getKit('front'))],
    expressions: kitExpressions(getKit('front')),
    joints: JOINTS.map((j) => ({ id: j.id, limits: j.limits })),
    adjustRange: DEFAULT_ADJUST_RANGE,
    colorRoles: COLOR_ROLES,
    defaultColors: DEFAULT_COLORS,
    framings: FRAMINGS,
  };
}

export function createApp(opts: AppOptions = {}): Handler {
  const cors = opts.corsOrigin === undefined ? '*' : opts.corsOrigin;
  const maxBody = opts.maxBodyBytes ?? 256 * 1024;
  const maxBatch = opts.maxBatch ?? 200;
  const basicAuth = opts.basicAuth;

  const send = (res: ServerResponse, status: number, type: string, body: string, extra: Record<string, string> = {}) => {
    res.writeHead(status, {
      'Content-Type': type,
      'Content-Length': Buffer.byteLength(body),
      'X-Content-Type-Options': 'nosniff',
      ...(cors ? { 'Access-Control-Allow-Origin': cors, Vary: 'Origin' } : {}),
      ...extra,
    });
    res.end(body);
  };
  const json = (res: ServerResponse, status: number, data: unknown) => send(res, status, 'application/json; charset=utf-8', JSON.stringify(data));
  const svg = (res: ServerResponse, body: string, cache: boolean) =>
    send(res, 200, 'image/svg+xml; charset=utf-8', body, cache ? { 'Cache-Control': 'public, max-age=86400' } : {});

  const viewOf = (url: URL) => url.searchParams.get('view') ?? undefined;

  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const route = `${req.method} ${url.pathname.replace(/\/+$/, '') || '/'}`;
    try {
      if (basicAuth && route !== 'GET /health') {
        const authHeader = req.headers.authorization;
        if (!isAuthorised(authHeader, basicAuth)) {
          res.writeHead(401, {
            'Content-Type': 'application/json; charset=utf-8',
            'WWW-Authenticate': 'Basic realm="Preview", charset="UTF-8"',
            ...(cors ? { 'Access-Control-Allow-Origin': cors, Vary: 'Origin' } : {}),
          });
          res.end(JSON.stringify({ error: 'authentication required' }));
          return;
        }
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          ...(cors ? { 'Access-Control-Allow-Origin': cors } : {}),
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        });
        res.end();
        return;
      }
      switch (route) {
        case 'GET /health':
          return json(res, 200, { ok: true });
        case 'GET /presets':
          return json(res, 200, describeApi());
        case 'GET /render.svg':
        case 'GET /render': {
          const q = new URLSearchParams(url.searchParams);
          q.delete('view');
          return svg(res, renderSvg(requestFromQuery(q), viewOf(url)), true);
        }
        case 'POST /render':
          return svg(res, renderSvg(await readJson(req, maxBody), viewOf(url)), false);
        case 'POST /render/batch': {
          const body = (await readJson(req, maxBody * 8)) as { requests?: unknown };
          if (!Array.isArray(body.requests)) throw new HttpError(400, 'body must be { "requests": [ ... ] }');
          if (body.requests.length > maxBatch) throw new HttpError(413, `at most ${maxBatch} requests per batch`);
          const results = body.requests.map((r) => {
            try {
              return { svg: renderSvg(r, viewOf(url)) };
            } catch (e) {
              return { error: e instanceof RequestError ? e.problems : [(e as Error).message] };
            }
          });
          return json(res, 200, { results });
        }
        default:
          throw new HttpError(404, `no route for ${route}`);
      }
    } catch (e) {
      if (e instanceof RequestError) return json(res, 400, { error: 'invalid request', problems: e.problems });
      if (e instanceof HttpError) return json(res, e.status, { error: e.message, ...(e.problems ? { problems: e.problems } : {}) });
      if (e instanceof Error && /^No art for view/.test(e.message)) return json(res, 400, { error: e.message });
      console.error(e);
      return json(res, 500, { error: 'internal error' });
    }
  };
}
