// Phase 0 healer eval: scores heal() over cases.mjs, verifies healed code
// actually runs on the fc oracle, and guards against vocab drift from index.html.
//
//   node spec/heal/eval.mjs           # summary + any failures
//   node spec/heal/eval.mjs -v        # also print every change made
//
// Exit code is non-zero if any case fails or vocab has drifted.

import fs from 'fs';
import path from 'path';
import { heal, lint, VERBS, COLORS, DISPATCH, STRUCTURAL, BEHAVIOR_WORDS } from './healer.mjs';
import { validate } from './validate.mjs';
import { CASES } from './cases.mjs';
import { STARTERS, scaffold, scaffoldFor } from './scaffold.mjs';
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
  // the inline Phase 1 healer keeps its own extra-vocab arrays — they must match
  const inlineArr = (name) => { const m = html.match(new RegExp('const ' + name + ' = \\[([^\\]]*)\\]')); return m ? m[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean) : []; };
  const diff = (a, b) => a.filter(x => !b.includes(x));
  const problems = [];
  const cmp = (label, a, b) => { if (diff(a, b).length || diff(b, a).length) problems.push(`${label} drift: only-A=${JSON.stringify(diff(a, b))} only-B=${JSON.stringify(diff(b, a))}`); };
  cmp('VERBS(index LINT_VERBS vs healer)', htmlVerbs, VERBS);
  cmp('COLORS(index vs healer)', htmlColors, COLORS);
  // the transpiler carries its own palette copy (it is inlined into index.html, so it
  // cannot import) — keep all three in step
  const tp = fs.readFileSync(path.join(ROOT, 'spec', 'port', 'spike', 'transpile.mjs'), 'utf8');
  const tm = tp.match(/const FC_TP_COLORS = new Set\(\[([\s\S]*?)\]\);/);
  const tpColors = tm ? [...tm[1].matchAll(/'([^']+)'/g)].map(m => m[1]) : [];
  cmp('COLORS(index vs transpile.mjs)', htmlColors, tpColors);
  cmp('DISPATCH(index FC_DISPATCH vs healer)', inlineArr('FC_DISPATCH'), DISPATCH);
  cmp('STRUCTURAL(index FC_STRUCTURAL vs healer)', inlineArr('FC_STRUCTURAL'), STRUCTURAL);
  cmp('BEHAVIOR(index FC_BEHAVIOR vs healer)', [...(html.match(/FC_BEHAVIOR = new Set\(\[([^\]]*)\]/)?.[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean) || [])], BEHAVIOR_WORDS);
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

// ---- validation gate: real programs pass, broken snippets fail, and heal()
// output always passes (the guarantee the LLM tier will lean on) --------------
function gateCheck() {
  const bad = [];
  const dirs = [path.join(ROOT, 'examples'), path.join(ROOT, 'spec', 'corpus')];
  let n = 0;
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.fc'))) {
      n++;
      const v = validate(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (!v.ok) bad.push(`  ${f}: ${v.error || JSON.stringify(v.lintIssues.slice(0, 2))}`);
    }
  }
  // negatives: broken snippets must NOT pass the gate
  const negatives = ['clera screen to black', 'clear screen to gren', 'draw rect at 1, 1 size 8, 8 in gren'];
  for (const neg of negatives) if (validate(neg).ok) bad.push(`  gate FAILED to reject: ${JSON.stringify(neg)}`);
  // and every heal() output must pass the gate
  for (const c of CASES) { if (!validate(heal(c.src).code).ok) bad.push(`  heal output rejected by gate: ${c.name}`); }
  return { n, bad };
}


// ---- Phase 3 floor: every starter must be gate-valid, and the inlined copy in
// index.html must match this module (data drift would ship a broken floor) -----
function floorCheck() {
  const bad = [];
  for (const s of STARTERS) {
    const v = validate(s.code, 30);
    if (!v.ok) bad.push(`  starter ${s.name}: ${v.error || JSON.stringify(v.lintIssues.slice(0, 2))}`);
    if (!s.keys.length || !s.blurb) bad.push(`  starter ${s.name}: missing keys/blurb`);
  }
  // the scaffold we would actually load must always pass the gate
  const inputs = ['', 'make a dragon eat coins', 'a game where you shoot aliens', 'stars and space',
                  'bounce a ball off the walls', 'please be funky', 'x = 5', 'sdlkfjsldkfj'];
  for (const src of inputs) {
    const sc = scaffold(src);
    for (const code of [sc.code, ...sc.options.map(o => o.code)]) {
      const v = validate(code, 30);
      if (!v.ok) bad.push(`  scaffold(${JSON.stringify(src)}): ${v.error || JSON.stringify(v.lintIssues.slice(0, 2))}`);
    }
    if (!/did not run yet/.test(sc.code)) bad.push(`  scaffold(${JSON.stringify(src)}): header missing`);
  }
  // drift: index.html's inlined FC_STARTERS must equal this module's STARTERS
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const m = html.match(/const FC_STARTERS = (\[[\s\S]*?\]);/);
  if (!m) bad.push('  index.html: FC_STARTERS block not found');
  else {
    let inline = null;
    try { inline = JSON.parse(m[1]); } catch (e) { bad.push('  index.html: FC_STARTERS is not valid JSON: ' + e.message); }
    if (inline) {
      const norm = a => JSON.stringify(a.map(s => ({ name: s.name, blurb: s.blurb, keys: s.keys, code: s.code })));
      if (norm(inline) !== norm(STARTERS)) bad.push('  FC_STARTERS drift: index.html != spec/heal/scaffold.mjs');
    }
  }
  return bad;
}

const floor = floorCheck();
const gate = gateCheck();
const safety = corpusSafety();
const drift = driftCheck();
console.log(`\nHealer Phase 0: ${pass}/${pass + fail} cases pass  (${Math.round(100 * pass / (pass + fail))}%)`);
if (fails.length) console.log('\nFailures:\n' + fails.join('\n'));
console.log(`Corpus safety: ${safety.n - safety.bad.length}/${safety.n} known-good programs untouched`);
if (safety.bad.length) console.log('\nFalse positives on real programs:\n' + safety.bad.join('\n'));
console.log(`Validation gate: ${gate.n} programs accepted, ${gate.bad.length ? 'FAILURES below' : 'negatives rejected, all heals pass'}`);
if (gate.bad.length) console.log('\nGate problems:\n' + gate.bad.join('\n'));
if (drift.length) console.log('\nVOCAB DRIFT:\n  ' + drift.join('\n  '));
console.log(`Phase 3 floor: ${STARTERS.length} starters + ${floor.length ? 'FAILURES below' : 'scaffolds gate-valid, inlined copy matches'}`);
if (floor.length) console.log('\nFloor problems:\n' + floor.join('\n'));
process.exit(fail || safety.bad.length || gate.bad.length || drift.length || floor.length ? 1 : 0);
