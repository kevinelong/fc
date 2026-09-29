// Golden oracle for the fc -> Python/JS transpiler.
//
// Runs the proven JS parse() over the corpus + examples, transpiles each program
// to BOTH Python and JavaScript, and writes the pinned output to
// transpile-golden.json. `transpile-diff.mjs` re-runs this and asserts no drift,
// so any change to transpile.mjs must be an intentional golden update.
//
// Run:  node dump-transpile.mjs         (from spec/port/spike)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from '../../lang/fc-core.mjs';
import { transpile } from './transpile.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const CORPUS = path.join(ROOT, 'spec/corpus');
const EXAMPLES = path.join(ROOT, 'examples');

export function collectFiles() {
  const files = [];
  for (const dir of [CORPUS, EXAMPLES]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).sort()) {
      if (f.endsWith('.fc')) files.push([f, path.join(dir, f)]);
    }
  }
  return files;
}

export function buildGolden() {
  const golden = {};
  for (const [name, full] of collectFiles()) {
    const src = fs.readFileSync(full, 'utf8');
    let program;
    try { program = parse(src); }
    catch (e) { golden[name] = { error: String(e && e.message || e) }; continue; }
    golden[name] = { python: transpile(program, 'python'), js: transpile(program, 'js') };
  }
  return golden;
}

// Main-module check that works on Windows too (process.argv[1] is a native path,
// import.meta.url is a file: URL — a naive string compare never matches there).
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const golden = buildGolden();
  const outPath = path.join(__dirname, 'transpile-golden.json');
  fs.writeFileSync(outPath, JSON.stringify(golden, null, 2) + '\n');
  console.log(`Wrote ${outPath} — ${Object.keys(golden).length} programs (python + js).`);
}
