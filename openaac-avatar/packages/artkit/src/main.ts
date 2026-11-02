/**
 * Art kit command line.
 *
 *   pnpm art:compile            compile art/source/front/{bm_low,bm_high}.svg into the core's kit
 *   pnpm art:validate           check the art without writing anything
 *
 * Options: --view <name>  --src <dir>  --out <file>  --strict (warnings fail validation)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { validateKit } from '@openaac-avatar/core';
import { compileKit, type Finding } from './compile.js';

const repoRoot = resolve(import.meta.dirname, '../../..');

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    view: { type: 'string', default: 'front' },
    src: { type: 'string' },
    out: { type: 'string' },
    strict: { type: 'boolean', default: false },
  },
});

const command = positionals[0] ?? 'validate';
const view = values.view!;
const srcDir = resolve(repoRoot, values.src ?? join('art/source', view));
const outFile = resolve(repoRoot, values.out ?? join('packages/core/src/kits', `${view}.json`));
const reportFile = resolve(repoRoot, 'art/reports', `${view}.md`);

const read = (name: string) => ({ name, xml: readFileSync(join(srcDir, name), 'utf8') });
// Add-on art (e.g. generated stand-ins) lives in addons/<name>.low.svg and <name>.high.svg.
const addonDir = join(srcDir, 'addons');
const addonFiles = existsSync(addonDir) ? readdirSync(addonDir).sort() : [];
const addons = {
  low: addonFiles.filter((f) => f.endsWith('.low.svg')).map((f) => read(join('addons', f))),
  high: addonFiles.filter((f) => f.endsWith('.high.svg')).map((f) => read(join('addons', f))),
};
const result = compileKit({ low: read('bm_low.svg'), high: read('bm_high.svg'), addons, view });
if (addonFiles.length) console.log(`  with add-ons: ${addonFiles.join(', ')}`);
const findings: Finding[] = [...result.findings];
if (result.kit) {
  for (const issue of validateKit(result.kit)) findings.push({ severity: issue.severity, part: issue.part, message: issue.message });
}

const errors = findings.filter((f) => f.severity === 'error');
const warnings = findings.filter((f) => f.severity === 'warning');
const icon = { error: '✖', warning: '⚠', info: 'ℹ' } as const;

console.log(`Art kit "${view}" from ${relative(repoRoot, srcDir)}`);
for (const f of findings) console.log(`  ${icon[f.severity]} ${f.part ? `${f.part}: ` : ''}${f.message}`);
console.log(`  ${result.kit?.parts.length ?? 0} parts, ${Object.keys(result.kit?.pivots ?? {}).length} pivots, ${errors.length} error(s), ${warnings.length} warning(s)`);

// Plain-language report the designer can read.
const lines = [
  `# Art check: ${view}`,
  '',
  `Files: \`${relative(repoRoot, join(srcDir, 'bm_low.svg'))}\`, \`${relative(repoRoot, join(srcDir, 'bm_high.svg'))}\``,
  '',
  errors.length ? `**${errors.length} problem(s) must be fixed before the kit can be built.**` : '**The kit builds.**',
  '',
];
for (const sev of ['error', 'warning', 'info'] as const) {
  const list = findings.filter((f) => f.severity === sev);
  if (!list.length) continue;
  lines.push(`## ${sev === 'error' ? 'Must fix' : sev === 'warning' ? 'Worked around automatically (better fixed in the art)' : 'For information'}`, '');
  for (const f of list) lines.push(`- ${f.part ? `\`${f.part}\`: ` : ''}${f.message}`);
  lines.push('');
}
mkdirSync(dirname(reportFile), { recursive: true });
writeFileSync(reportFile, lines.join('\n'));
console.log(`  report: ${relative(repoRoot, reportFile)}`);

if (command === 'compile') {
  if (!result.kit || errors.length) {
    console.error('Not written: fix the errors above first.');
    process.exit(1);
  }
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(result.kit) + '\n');
  console.log(`  wrote ${relative(repoRoot, outFile)}`);
} else if (errors.length || (values.strict && warnings.length)) {
  process.exit(1);
}
