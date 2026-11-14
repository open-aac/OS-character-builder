/**
 * openaac-avatar: render symbols from the command line.
 *
 *   openaac-avatar render [options] [-o out.svg]
 *   openaac-avatar batch <files or folders...> --out-dir <dir> [--avatar a.json] [--options o.json]
 *   openaac-avatar presets
 *   openaac-avatar joints
 *
 * Run `openaac-avatar help` for the full option list.
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  COLOR_ROLES,
  FRAMINGS,
  JOINTS,
  PRESETS,
  RequestError,
  renderSvg,
  getKit,
  kitGarments,
  kitExpressions,
  kitHairStyles,
  type Framing,
  type RenderRequest,
} from '@openaac-avatar/core';
import { mergeRequests, readSavedRequest } from './requests.js';

const HELP = `openaac-avatar — posable AAC person symbols

Commands
  render            Render one symbol (to stdout, or -o file)
  batch <paths...>  Re-render every saved request (.json) or generated symbol (.svg)
                    in the given files/folders, e.g. after new art is added
  presets           List template poses
  joints            List joints and how far they bend

render options
  --request <file>      Start from a saved request (JSON or a generated SVG)
  --view <v>            front | three-quarter | side (default front)
  --preset <id>         Template pose (default: standing)
  --adjust <joint=deg>  Adjust a joint from the template; repeatable, e.g. --adjust elbow_R=15
  --body <0..1>         Body size, 0 = slim, 1 = broad (default 0.5)
  --skin, --hair, --eyebrow, --iris, --eye-white, --top, --bottom, --ink <#hex>
  --wear <slot=style>   Garment, repeatable: --wear top=tight_long --wear bottom=loose_short
  --hair-style <style>  Hair style, or none (see "presets" for the list)
  --expression <name>   Facial expression (see "presets" for the list)
  --line-weight <n>     Multiply all line weights (default 1)
  --framing <f>         ${FRAMINGS.join(' | ')} (default full)
  --size <px>           Output width/height (default 1000)
  --padding <0..0.5>    Space around the figure (default 0.04)
  --background <#hex>   Solid background (default transparent)
  --title <text>        Accessible title
  --id-prefix <id>      Prefix for element ids
  -o, --out <file>      Write to a file instead of stdout

batch options
  --out-dir <dir>       Where to write the SVGs (required)
  --avatar <file>       JSON avatar settings applied on top of every request
  --options <file>      JSON render options applied on top of every request
`;

const COLOR_FLAGS: Record<string, (typeof COLOR_ROLES)[number]> = {
  skin: 'skin',
  hair: 'hair',
  eyebrow: 'eyebrow',
  iris: 'iris',
  'eye-white': 'eyeWhite',
  top: 'top',
  bottom: 'bottom',
  ink: 'ink',
};

function numberFlag(v: string | undefined, name: string): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new RequestError([`--${name} must be a number`]);
  return n;
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(resolve(file), 'utf8'));
}

function cmdRender(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: {
      request: { type: 'string' },
      view: { type: 'string' },
      preset: { type: 'string' },
      wear: { type: 'string', multiple: true },
      'hair-style': { type: 'string' },
      expression: { type: 'string' },
      adjust: { type: 'string', multiple: true },
      body: { type: 'string' },
      ...Object.fromEntries(Object.keys(COLOR_FLAGS).map((k) => [k, { type: 'string' as const }])),
      'line-weight': { type: 'string' },
      framing: { type: 'string' },
      size: { type: 'string' },
      padding: { type: 'string' },
      background: { type: 'string' },
      title: { type: 'string' },
      'id-prefix': { type: 'string' },
      out: { type: 'string', short: 'o' },
    },
  });
  const v = values as Record<string, string | string[] | undefined>;
  const base: RenderRequest = v.request ? readSavedRequest(v.request as string) : {};

  const adjust: Record<string, number> = {};
  for (const a of (v.adjust as string[] | undefined) ?? []) {
    const m = /^([A-Za-z_]+)=(-?[\d.]+)$/.exec(a);
    if (!m) throw new RequestError([`--adjust "${a}" should look like joint=degrees, e.g. elbow_R=15`]);
    adjust[m[1]!] = Number(m[2]);
  }
  const clothing: Record<string, string> = {};
  for (const w of (v.wear as string[] | undefined) ?? []) {
    const m = /^(top|bottom)=([a-z]+_[a-z]+)$/.exec(w);
    if (!m) throw new RequestError([`--wear "${w}" should look like slot=style, e.g. top=tight_long or bottom=loose_short`]);
    clothing[m[1]!] = m[2]!;
  }
  const colors: Record<string, string> = {};
  for (const [flag, role] of Object.entries(COLOR_FLAGS)) if (typeof v[flag] === 'string') colors[role] = v[flag] as string;

  const fromFlags: RenderRequest = {
    view: v.view as string | undefined,
    pose: { preset: v.preset as string | undefined, adjust: Object.keys(adjust).length ? adjust : undefined },
    avatar: {
      body: numberFlag(v.body as string | undefined, 'body'),
      lineWeight: numberFlag(v['line-weight'] as string | undefined, 'line-weight'),
      colors: Object.keys(colors).length ? colors : undefined,
      clothing: Object.keys(clothing).length ? clothing : undefined,
      hair: v['hair-style'] as string | undefined,
      expression: v.expression as string | undefined,
    },
    options: {
      framing: v.framing as Framing | undefined,
      size: numberFlag(v.size as string | undefined, 'size'),
      padding: numberFlag(v.padding as string | undefined, 'padding'),
      background: v.background as string | undefined,
      title: v.title as string | undefined,
      idPrefix: v['id-prefix'] as string | undefined,
    },
  };
  const svg = renderSvg(mergeRequests(base, fromFlags));
  if (v.out) {
    writeFileSync(resolve(v.out as string), svg + '\n');
    console.error(`wrote ${v.out}`);
  } else {
    process.stdout.write(svg + '\n');
  }
}

function collect(paths: string[]): string[] {
  const out: string[] = [];
  for (const p of paths) {
    const full = resolve(p);
    if (statSync(full).isDirectory()) {
      for (const f of readdirSync(full).sort()) {
        if (/\.(json|svg)$/i.test(f)) out.push(join(full, f));
      }
    } else {
      out.push(full);
    }
  }
  return out;
}

function cmdBatch(argv: string[]): void {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      'out-dir': { type: 'string' },
      avatar: { type: 'string' },
      options: { type: 'string' },
    },
  });
  if (!values['out-dir']) throw new RequestError(['batch needs --out-dir']);
  if (!positionals.length) throw new RequestError(['batch needs at least one file or folder']);
  const outDir = resolve(values['out-dir']);
  mkdirSync(outDir, { recursive: true });
  const override: RenderRequest = {
    avatar: values.avatar ? (readJson(values.avatar) as RenderRequest['avatar']) : undefined,
    options: values.options ? (readJson(values.options) as RenderRequest['options']) : undefined,
  };

  let ok = 0;
  let failed = 0;
  for (const file of collect(positionals)) {
    const name = basename(file, extname(file)) + '.svg';
    try {
      const req = mergeRequests(readSavedRequest(file), override);
      writeFileSync(join(outDir, name), renderSvg(req) + '\n');
      ok++;
    } catch (e) {
      failed++;
      const msg = e instanceof RequestError ? e.problems.join('; ') : (e as Error).message;
      console.error(`✖ ${basename(file)}: ${msg}`);
    }
  }
  console.error(`rendered ${ok} symbol(s) to ${outDir}${failed ? `, ${failed} failed` : ''}`);
  if (failed) process.exitCode = 1;
}

function cmdPresets(): void {
  for (const p of PRESETS) {
    const views = ['front', ...Object.keys(p.views ?? {})].join(', ');
    console.log(`${p.id.padEnd(16)} ${p.description} (${views})`);
  }
  const g = kitGarments(getKit('front'));
  console.log(`\nGarments (--wear): top = ${g.top.join(', ')}; bottom = ${g.bottom.join(', ')}`);
  const front = getKit('front');
  console.log(`Hair (--hair-style): none, ${kitHairStyles(front).join(', ')}`);
  console.log(`Expressions (--expression): ${kitExpressions(front).join(', ')}`);
}

function cmdJoints(): void {
  for (const j of JOINTS) console.log(`${j.id.padEnd(12)} ${String(j.limits[0]).padStart(4)}° … ${j.limits[1]}°`);
  console.log('\nAngles are relative to the template; positive = up / away from the body. Adjustments are limited to ±30° from the template.');
}

const [command, ...rest] = process.argv.slice(2);
try {
  switch (command) {
    case 'render':
      cmdRender(rest);
      break;
    case 'batch':
      cmdBatch(rest);
      break;
    case 'presets':
      cmdPresets();
      break;
    case 'joints':
      cmdJoints();
      break;
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      console.log(HELP);
      break;
    default:
      console.error(`Unknown command "${command}"\n`);
      console.error(HELP);
      process.exitCode = 1;
  }
} catch (e) {
  if (e instanceof RequestError) {
    console.error('Invalid input:\n' + e.problems.map((p) => `  - ${p}`).join('\n'));
  } else {
    console.error((e as Error).message);
  }
  process.exitCode = 1;
}
