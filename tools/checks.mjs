#!/usr/bin/env node
// checks.mjs — one command that runs every harness and asserts each one's *summary*.
//
// Why: `frames-run.mjs` spent an unknown stretch throwing before its first frame (an
// unbound `mouse` map) while its "12/12" claim kept being repeated, and the spike's
// visual-golden still cannot run on a machine without Linux paths. Exit code alone is
// not a guard — a harness that dies silently, runs zero cases, or stops printing its
// summary must fail here. Every check therefore needs:
//   * exit status 0,
//   * a summary line matching a regex that encodes "N/N passed",
//   * at least `min` cases in that summary (so 0/0 is not a pass).
//
//   node tools/checks.mjs              fast set (fuzz 500)
//   node tools/checks.mjs --full       fuzz 2000 as well
//   node tools/checks.mjs --only ast   one check (substring match)
//   node tools/checks.mjs --list
//
// Checks that need something this machine may not have (a built wasm, Chrome, apid's
// node_modules, playwright-core for the browser goldens) SKIP loudly rather than
// pretending. A check whose *input* is generated rather than committed declares a
// `pre` step (ast) — otherwise it fails on every clean checkout, which is how it
// looked like a parser bug for the three CI runs before this one.
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPIKE = path.join(ROOT, 'spec', 'port', 'spike');
const require = createRequire(import.meta.url);
// The same finder the harnesses use, so a gate and the harness it gates agree.
const { findChrome } = require('./chrome-path.cjs');
const N = '(\\d+)';
const same = re => new RegExp(re, 'm');

const CHECKS = [
  // ---- language cores: the same program must behave identically everywhere ----
  { name: 'tokenize', cwd: SPIKE, run: 'node tokenize-diff.mjs', min: 1000, expect: same(`Lexer differential test: ${N}/${N} lines match, 0 diff`) },
  // The candidate AST is generated from the built wasm and is gitignored (spike/.gitignore),
  // so it must be produced here: ast-diff compares it against the committed golden.
  { name: 'ast', cwd: SPIKE, pre: 'node parse-ast.mjs', run: 'node ast-diff.mjs', min: 40, expect: same(`Parser differential test: (\\d+)/\\1 programs match`) },
  { name: 'exec', cwd: SPIKE, run: 'node exec-diff.mjs', min: 40, expect: same(`Runtime exec: (\\d+)/\\1 match`) },
  { name: 'draw', cwd: SPIKE, run: 'node draw-diff.mjs', min: 8, expect: same(`Render cmds: (\\d+)/\\1 match`) },
  { name: 'examples', cwd: SPIKE, run: 'node examples-diff.mjs', min: 15, expect: same(`(\\d+)/\\1 examples render bit-identical`) },
  { name: 'dump-vars', cwd: SPIKE, run: 'node dump-vars-diff.mjs', min: 15, expect: same(`(\\d+)/\\1 examples: dump_vars`) },
  { name: 'frames', cwd: SPIKE, run: 'node frames-run.mjs', min: 5, expect: same(`Frames \\(\\d+ each\\): (\\d+)/\\1 programs match`) },
  { name: 'smoke', cwd: SPIKE, run: 'node smoke.mjs', min: 8, expect: same(`(\\d+)/\\1 games pass interaction-aware smoke`) },
  { name: 'mp-smoke', cwd: SPIKE, run: 'node mp-smoke.mjs', min: 3, expect: same(`(\\d+)/\\1 multiplayer games pass`) },
  { name: 'shape', cwd: SPIKE, run: 'node shape-diff.mjs', min: 0, expect: same(`shape-diff: .*· OK$`) },
  { name: 'err', cwd: SPIKE, run: 'node err-diff.mjs', min: 0, expect: same(`err-diff: .*· OK$`) },
  { name: 'transpile', cwd: SPIKE, run: 'node transpile-diff.mjs', min: 40, expect: same(`transpile-diff: OK`) },
  { name: 'embed', cwd: SPIKE, run: 'node transpile-embed-check.mjs', min: 0, expect: same(`transpile-embed-check: OK`) },
  { name: 'core-copy', cwd: ROOT, run: 'node tools/core-copy-check.mjs', min: 0, expect: same(`core-copy-check: OK`) },
  { name: 'mirror', cwd: SPIKE, run: 'node transpile-mirror.mjs', min: 1, expect: same('transpile-mirror: .*· OK$') },
  { name: 'fuzz', cwd: SPIKE, run: 'node fuzz.mjs 500 1', min: 400, expect: same(`fuzz: (\\d+)/\\1 programs match`) },
  { name: 'heal', cwd: ROOT, run: 'node spec/heal/eval.mjs', min: 0, expect: same(`Phase 3 floor: .*(valid|matches)`) },
  // The teaching material is executable, so it gets tested like the engine: every HOW-TO recipe on
  // the learn page must parse, run and stay quiet (they are the snippets people copy).
  { name: 'learn-recipes', cwd: ROOT, run: 'node tools/learn-recipes-check.mjs', min: 10, expect: same(`(\\d+)/\\1 learn recipes run clean`) },
  // The command reference is where users are sent for "how do I…?"; it is executable content too,
  // and LINT_VERBS is the definition of the verbs it must cover.
  { name: 'reference-docs', cwd: ROOT, run: 'node tools/reference-check.mjs', min: 20, expect: same(`(\\d+)/\\1 reference examples run clean`) },
  // Deploy safety: the service worker's strategy (a wrong one pins PWA users to a stale build),
  // its precache paths, and fc-version.js against the newest published release.
  { name: 'release-check', cwd: ROOT, run: 'node tools/release-check.mjs', min: 8, expect: same(`(\\d+)/\\1 release checks pass`) },
  // ---- browser and server surfaces ----
  { name: 'visual-golden', cwd: ROOT, run: 'node tools/visual-golden.cjs', min: 15, needs: ['chrome', 'pw'], expect: same(`(\\d+)/\\1 visual goldens match`) },
  // The colourblind-safe palette has its own pinned set (spec/golden-shots/cvd/), because it is
  // a shipped accessibility feature whose only previous coverage was a "prove it bites" mode.
  { name: 'visual-golden-cvd', cwd: ROOT, run: 'node tools/visual-golden.cjs --cvd', min: 15, needs: ['chrome', 'pw'], expect: same(`(\\d+)/\\1 visual goldens match`) },
  // The spike's independent pixel harness (ops replayed onto a real canvas) was never wired into
  // this runner, so it could rot silently; it needs python3 for its static server.
  { name: 'spike-golden', cwd: SPIKE, run: 'node visual-golden.mjs', min: 15, needs: ['chrome', 'python'], expect: same(`(\\d+)/\\1 examples pixel-identical`) },
  { name: 'ui-check', cwd: ROOT, run: 'node tools/ui-check.mjs starfield', min: 60, needs: ['chrome'], expect: same(`(\\d+)/\\1 UI checks pass`) },
  { name: 'class-e2e', cwd: ROOT, run: 'node tools/class-e2e.mjs', min: 8, needs: ['chrome', 'apid'], expect: same(`(\\d+)/\\1 classroom end-to-end checks pass`) },
  { name: 'share-e2e', cwd: ROOT, run: 'node tools/share-e2e.mjs', min: 4, needs: ['apid'], expect: same(`(\\d+)/\\1 share-page checks pass`) },
  { name: 'api-e2e', cwd: ROOT, run: 'node tools/api-e2e.mjs', min: 6, needs: ['apid'], expect: same(`(\\d+)/\\1 api checks pass`) },
  // The app↔server contract: the endpoints the app calls, the CSRF header it sends, the state
  // round trip a running game performs — none of which ui-check's stubs or class-e2e cover.
  { name: 'app-api-e2e', cwd: ROOT, run: 'node tools/app-api-e2e.mjs', min: 10, needs: ['chrome', 'apid'], expect: same(`(\\d+)/\\1 app-server contract checks pass`) },
];

const argv = process.argv.slice(2);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
const full = argv.includes('--full');
if (argv.includes('--list')) { for (const c of CHECKS) console.log(c.name.padEnd(14) + (c.needs || []).join(',')); process.exit(0); }

const have = {
  chrome: !!findChrome(),
  apid: fs.existsSync(path.join(ROOT, 'apid', 'node_modules')),
  wasm: fs.existsSync(path.join(SPIKE, 'target', 'wasm32-unknown-unknown', 'release', 'fc_spike.wasm')),
  // The browser goldens drive Chrome through playwright-core, which is deliberately not
  // a committed dependency (the repo stays install-free): without it that check has to
  // SKIP, not die as a MODULE_NOT_FOUND.
  pw: spawnSync(process.execPath, ['-e', "require.resolve('playwright-core')"], { cwd: ROOT, encoding: 'utf8' }).status === 0,
  // The spike's pixel harness serves the repo with `python3 -m http.server`.
  python: spawnSync('python3', ['--version'], { encoding: 'utf8' }).status === 0,
};

const results = [];
// Keep a failing harness's own words: the table has room only for an exit code, and
// "exit 2" on its own cost a blind CI diagnosis (the cause was a missing generated input).
const tailOut = r => ((r.stdout || '') + (r.stderr || '')).split(/\r?\n/).filter(l => l.trim()).slice(-12).join('\n');
for (const c of CHECKS) {
  if (only && !(CHECKS.some(c => c.name === only) ? c.name === only : c.name.includes(only))) continue;
  const missing = (c.needs || []).filter(k => !have[k]);
  if (missing.length) { results.push({ ...c, status: 'SKIP', why: 'needs ' + missing.join('+') }); continue; }
  if (!c.needs) c.needs = [];
  if (['tokenize', 'ast', 'exec', 'draw', 'examples', 'dump-vars', 'frames', 'smoke', 'mp-smoke', 'shape', 'err', 'transpile', 'embed', 'fuzz'].includes(c.name) && !have.wasm) {
    results.push({ ...c, status: 'SKIP', why: 'needs the built wasm' }); continue;
  }
  const cmd = full && c.name === 'fuzz' ? 'node fuzz.mjs 2000 1' : c.run;
  const started = Date.now();
  // A generated input (ast's rust-ast.json) is produced here, before the diff: a missing
  // candidate file is a harness-setup failure, not a verdict on the parser.
  if (c.pre) {
    const p = spawnSync(c.pre, { cwd: c.cwd, shell: true, encoding: 'utf8' });
    if (p.status !== 0) {
      results.push({ ...c, status: 'FAIL', why: `prepare failed (exit ${p.status})`, out: tailOut(p), ms: Date.now() - started });
      continue;
    }
  }
  const r = spawnSync(cmd, { cwd: c.cwd, shell: true, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(c.expect);
  const cases = m && m[1] ? Number(m[1]) : null;
  let status = 'PASS', why = '';
  if (r.status !== 0) { status = 'FAIL'; why = 'exit ' + r.status; }
  else if (!m) { status = 'FAIL'; why = 'no summary line — the harness may have gone silent'; }
  else if (cases !== null && cases < c.min) { status = 'FAIL'; why = `${cases} cases (min ${c.min})`; }
  results.push({ ...c, status, why, ms: Date.now() - started, out: tailOut(r) });
}

const pad = (s, n) => String(s).padEnd(n);
for (const r of results.filter(r => r.status === 'FAIL' && r.out)) {
  console.log(`\n--- ${r.name} · ${r.why}`);
  console.log(r.out.split('\n').map(l => '    ' + l).join('\n'));
}
console.log('\n' + pad('check', 15) + pad('', 2) + 'detail');
for (const r of results) {
  const detail = r.status === 'PASS' ? `${(r.ms / 1000).toFixed(1)}s` : (r.why || '');
  console.log(pad(r.name, 15) + (r.status === 'PASS' ? 'ok  ' : (r.status === 'SKIP' ? 'skip' : 'FAIL')) + '  ' + detail);
}
const pass = results.filter(r => r.status === 'PASS').length;
const fail = results.filter(r => r.status === 'FAIL').length;
const skip = results.filter(r => r.status === 'SKIP').length;
console.log(`\n${pass} passed · ${fail} failed · ${skip} skipped of ${results.length}`);
process.exit(fail ? 1 : 0);
