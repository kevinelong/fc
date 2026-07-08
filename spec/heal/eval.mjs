// Phase 0 healer eval: scores heal() over cases.mjs, verifies healed code
// actually runs on the fc oracle, and guards against vocab drift from index.html.
//
//   node spec/heal/eval.mjs           # summary + any failures
//   node spec/heal/eval.mjs -v        # also print every change made
//
// Exit code is non-zero if any case fails or vocab has drifted.

import fs from 'fs';
import path from 'path';
import { heal, lint, VERBS, COLORS } from './healer.mjs';
import { CASES } from './cases.mjs';
import { parse, Runtime, __CMDS, __bindRT } from '../port/spike/fc-core-record.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const verbose = process.argv.includes('-v');

// ---- drift guard: healer vocab must match index.html source of truth --------
function driftCheck() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const vm = html.match(/const LINT_VERBS = \[([^\]]*)\]/);
  const htmlVerbs = vm ? vm[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean) : [];
  const cm = html.match(/const COLORS = \{([\s\S]*?)\}/);
  const htmlColors = cm ? [...cm[1].matchAll(/'([^']+)'\s*:/g)].map(m => m[1]) : [];
  const diff = (a, b) => a.filter(x => !b.includes(x));
  const problems = [];
  if (diff(htmlVerbs, VERBS).length || diff(VERBS, htmlVerbs).length)
    problems.push(`VERBS drift: only-in-index=${JSON.stringify(diff(htmlVerbs, VERBS))} only-in-healer=${JSON.stringify(diff(VERBS, htmlVerbs))}`);
  if (diff(htmlColors, COLORS).length || diff(COLORS, htmlColors).length)
    problems.push(`COLORS drift: only-in-index=${JSON.stringify(diff(htmlColors, COLORS))} only-in-healer=${JSON.stringify(diff(COLORS, htmlColors))}`);
  return problems;
}

// ---- run check: healed code must execute on the oracle without throwing -----
function runs(code) {
  try {
    __CMDS.length = 0;
    const rt = new Runtime(); rt.reset(); __bindRT(rt); rt.exec(parse(code));
    return true;
  } catch (_) { return false; }
}

let pass = 0, fail = 0;
const fails = [];
for (const c of CASES) {
  const r = heal(c.src);
  let ok = r.remaining.length === 0 && runs(r.code);
  let why = '';
  if (r.remaining.length) why = 'remaining: ' + JSON.stringify(r.remaining);
  else if (!runs(r.code)) why = 'healed code does not run';
  if (c.clean) {
    if (r.changes.length) { ok = false; why = 'touched clean code: ' + JSON.stringify(r.changes.map(x => x.to)); }
  } else if (c.want != null) {
    if (r.code !== c.want) { ok = false; why = `want ${JSON.stringify(c.want)} got ${JSON.stringify(r.code)}`; }
  }
  if (ok) { pass++; if (verbose && r.changes.length) console.log(`  ✓ ${c.name}: ` + r.changes.map(x => x.reason).join('; ')); }
  else { fail++; fails.push(`  ✗ ${c.name}: ${why}`); }
}

// ---- corpus safety: healer must NOT touch known-good programs ---------------
// Every examples/*.fc and spec/corpus/*.fc is valid fc, so heal() must make zero
// changes and report zero remaining issues. Any hit is a false positive.
// Parser-edge fixtures that deliberately use degenerate/no-op constructs the
// healer legitimately improves (e.g. `set x to 99`, a documented no-op, becomes
// a real assignment). Changing these is correct, not a false positive.
const ALLOW = new Set(['set_make_noop.fc']);
function corpusSafety() {
  const dirs = [path.join(ROOT, 'examples'), path.join(ROOT, 'spec', 'corpus')];
  const bad = [];
  let n = 0;
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.fc'))) {
      if (ALLOW.has(f)) continue;
      n++;
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      const r = heal(src);
      if (r.changes.length) bad.push(`  ${f}: changed ${JSON.stringify(r.changes.map(c => `${c.from} → ${c.to}`).slice(0, 3))}`);
      else if (r.remaining.length) bad.push(`  ${f}: flagged ${JSON.stringify(r.remaining.map(x => `${x.kind}:${x.token}`).slice(0, 3))}`);
    }
  }
  return { n, bad };
}

const safety = corpusSafety();
const drift = driftCheck();
console.log(`\nHealer Phase 0: ${pass}/${pass + fail} cases pass  (${Math.round(100 * pass / (pass + fail))}%)`);
if (fails.length) console.log('\nFailures:\n' + fails.join('\n'));
console.log(`Corpus safety: ${safety.n - safety.bad.length}/${safety.n} known-good programs untouched`);
if (safety.bad.length) console.log('\nFalse positives on real programs:\n' + safety.bad.join('\n'));
if (drift.length) console.log('\nVOCAB DRIFT:\n  ' + drift.join('\n  '));
process.exit(fail || safety.bad.length || drift.length ? 1 : 0);
