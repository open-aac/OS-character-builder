import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

let server: Server;
let base = '';

beforeAll(async () => {
  server = createServer(createApp());
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('HTTP API', () => {
  it('POST /render returns an SVG', async () => {
    const res = await fetch(`${base}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pose: { preset: 'waving' }, avatar: { body: 0.2, colors: { skin: '#8d5524' } }, options: { size: 200 } }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/image\/svg\+xml/);
    const svg = await res.text();
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('fill="#8d5524"');
  });

  it('GET /render.svg works from query parameters, colours with or without #', async () => {
    const res = await fetch(`${base}/render.svg?preset=holding&body=1&top=3366cc&bottom=%23222222&framing=upper&adjust=elbow_R:10`);
    expect(res.status).toBe(200);
    const svg = await res.text();
    expect(svg).toContain('fill="#3366cc"');
    expect(svg).toContain('fill="#222222"');
    expect(svg).toContain('data-pose="holding"');
  });

  it('picks the hair style and expression from query parameters', async () => {
    const svg = await (await fetch(`${base}/render.svg?hairStyle=long_textured&expression=surprised&hair=aa0000`)).text();
    expect(svg).toContain('id="hair_long_textured_back"');
    expect(svg).toContain('id="expression_surprised_mouth_fill"');
    expect(svg).toContain('fill="#aa0000"');
    expect(svg).not.toContain('id="hair_short_straight_front"');
    const bald = await (await fetch(`${base}/render.svg?hairStyle=none`)).text();
    expect(bald).not.toMatch(/id="hair_/);
    expect((await fetch(`${base}/render.svg?hairStyle=mohawk`)).status).toBe(400);
  });

  it('accepts an eyebrow query colour separate from hair', async () => {
    const svg = await (await fetch(`${base}/render.svg?hair=00ff00&eyebrow=ff00ff`)).text();
    expect(svg).toMatch(/id="expression_content_eyebrow_[LR]"[^>]*fill="#ff00ff"/);
    expect(svg).toContain('id="hair_short_straight_front"');
    expect(svg).toContain('fill="#00ff00"');
  });

  it('explains what is wrong with a bad request', async () => {
    const res = await fetch(`${base}/render`, { method: 'POST', body: JSON.stringify({ avatar: { body: 4 } }) });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { problems: string[] };
    expect(body.problems).toEqual(['avatar.body must be between 0 and 1']);
  });

  it('rejects malformed JSON and unknown routes', async () => {
    expect((await fetch(`${base}/render`, { method: 'POST', body: '{nope' })).status).toBe(400);
    expect((await fetch(`${base}/nothing`)).status).toBe(404);
  });

  it('renders batches and reports failures per item', async () => {
    const res = await fetch(`${base}/render/batch`, {
      method: 'POST',
      body: JSON.stringify({ requests: [{ pose: { preset: 'sitting' } }, { pose: { preset: 'nope' } }] }),
    });
    const body = (await res.json()) as { results: ({ svg: string } | { error: string[] })[] };
    expect(body.results).toHaveLength(2);
    expect('svg' in body.results[0]!).toBe(true);
    expect('error' in body.results[1]!).toBe(true);
  });

  it('lists presets for UIs', async () => {
    const body = (await (await fetch(`${base}/presets`)).json()) as { presets: { id: string }[] };
    expect(body.presets.map((p) => p.id)).toContain('sitting-utensil');
  });

  it('lists the hair styles and expressions', async () => {
    const body = (await (await fetch(`${base}/presets`)).json()) as { hairStyles: string[]; expressions: string[] };
    expect(body.hairStyles).toEqual(expect.arrayContaining(['none', 'short_straight', 'long_textured']));
    expect(body.expressions).toEqual(expect.arrayContaining(['content', 'angry']));
  });

  it('supports optional basic auth for private preview', async () => {
    const guarded = createServer(createApp({ basicAuth: { username: 'preview', password: 'secret' } }));
    await new Promise<void>((r) => guarded.listen(0, '127.0.0.1', r));
    const guardedBase = `http://127.0.0.1:${(guarded.address() as AddressInfo).port}`;
    try {
      const denied = await fetch(`${guardedBase}/presets`);
      expect(denied.status).toBe(401);
      expect(denied.headers.get('www-authenticate')).toContain('Basic');

      const wrong = await fetch(`${guardedBase}/presets`, {
        headers: { Authorization: `Basic ${Buffer.from('preview:nope').toString('base64')}` },
      });
      expect(wrong.status).toBe(401);

      const ok = await fetch(`${guardedBase}/presets`, {
        headers: { Authorization: `Basic ${Buffer.from('preview:secret').toString('base64')}` },
      });
      expect(ok.status).toBe(200);
    } finally {
      await new Promise<void>((r) => guarded.close(() => r()));
    }
  });
});
