// Regression check for the fc -> Python/JS transpiler.
//
// Re-runs the transpiler over the corpus + examples and diffs against the pinned
// transpile-golden.json. Exit 0 = no drift; exit 1 = a program's output changed
// (update the golden intentionally with `node dump-transpile.mjs`).
//
// Run:  node transpile-diff.mjs         (from spec/port/spike)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildGolden } from './dump-transpile.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const goldenPath = path.join(__dirname, 'transpile-golden.json');

if (!fs.existsSync(goldenPath)) {
  console.error('No transpile-golden.json — run `node dump-transpile.mjs` first.');
  process.exit(1);
}

const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
const fresh = buildGolden();

const names = new Set([...Object.keys(golden), ...Object.keys(fresh)]);
let mismatches = 0, checked = 0;

function firstDiffLine(a, b) {
  const la = (a || '').split('\n'), lb = (b || '').split('\n');
  const n = Math.max(la.length, lb.length);
  for (let i = 0; i < n; i++) {
    if (la[i] !== lb[i]) return `    line ${i + 1}:\n      golden: ${JSON.stringify(la[i])}\n      fresh : ${JSON.stringify(lb[i])}`;
  }
  return '    (whole-file difference)';
}

for (const name of [...names].sort()) {
  const g = golden[name], f = fresh[name];
  checked++;
  if (!g) { console.log(`+ NEW ${name} (not in golden)`); mismatches++; continue; }
  if (!f) { console.log(`- MISSING ${name} (in golden, not produced now)`); mismatches++; continue; }
  for (const lang of ['python', 'js', 'lua', 'gdscript']) {
    if ((g[lang] || '') !== (f[lang] || '')) {
      console.log(`✗ ${name} [${lang}]`);
      console.log(firstDiffLine(g[lang], f[lang]));
      mismatches++;
    }
  }
}

if (mismatches === 0) {
  console.log(`transpile-diff: OK — ${checked} programs, all four languages identical to golden.`);
  process.exit(0);
}
console.log(`\ntranspile-diff: ${mismatches} mismatch(es). If intentional, run: node dump-transpile.mjs`);
process.exit(1);
