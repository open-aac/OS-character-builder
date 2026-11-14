import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const bin = resolve(import.meta.dirname, '../bin/openaac-avatar.js');
const examples = resolve(import.meta.dirname, '../../../examples/requests');
const run = (...args: string[]) => spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });

describe('CLI', () => {
  it('renders one symbol to stdout', () => {
    const r = run('render', '--preset', 'waving', '--skin', '#8d5524', '--size', '100');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^<svg /);
    expect(r.stdout).toContain('fill="#8d5524"');
  });

  it('picks the hair style and expression, and lists them', () => {
    const r = run('render', '--hair-style', 'long_straight', '--expression', 'angry', '--hair', '#aa0000');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('id="hair_long_straight_back"');
    expect(r.stdout).toContain('id="expression_angry_mouth"');
    expect(r.stdout).not.toContain('expression_content_');
    expect(run('render', '--hair-style', 'none').stdout).not.toMatch(/id="hair_/);
    expect(run('render', '--hair-style', 'mohawk').stderr).toContain('avatar.hair');
    expect(run('presets').stdout).toMatch(/Hair \(--hair-style\): none, .*long_textured[\s\S]*Expressions \(--expression\): .*angry/);
  });

  it('reports every input problem and exits non-zero', () => {
    const r = run('render', '--preset', 'flying', '--body', '3');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('pose.preset');
    expect(r.stderr).toContain('avatar.body');
  });

  it('bulk-regenerates a folder, and again from its own output with new settings', () => {
    const out1 = mkdtempSync(join(tmpdir(), 'oa-'));
    const r1 = run('batch', examples, '--out-dir', out1);
    expect(r1.status).toBe(0);
    const files = readdirSync(out1);
    expect(files.length).toBe(readdirSync(examples).filter((f) => f.endsWith('.json')).length);

    // Re-render the generated SVGs (their settings are embedded) with a different line weight.
    const out2 = mkdtempSync(join(tmpdir(), 'oa-'));
    const r2 = run('batch', out1, '--out-dir', out2, '--avatar', join(examples, '../avatar-thick-lines.json'));
    expect(r2.status).toBe(0);
    const again = readFileSync(join(out2, 'wave-hello.svg'), 'utf8');
    expect(again).toContain('fill="#e53935"'); // colour carried over from the original
    expect(again).toContain('stroke-width="20"'); // new setting applied
  });
});
