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
});
