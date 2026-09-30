// err-diff.mjs — the runtime-diagnostics guard.
//
// Two claims, both checked here:
//   1. the SHIPPED engine (wasm) and the reference (JS core) report the same
//      messages, on the same lines, for the same programs — a kid must not get a
//      different explanation depending on which engine the browser picked;
//   2. the messages are the pinned ones (err-golden.json, from `node dump-err.mjs`),
//      so a reworded or re-lined message is a deliberate act, not drift.
//
// Then it sweeps the corpus + examples + the other test dirs and insists the two
// engines still agree — that is the false-positive guard: a program that plays by
// the rules must stay silent on both.
//
// Run from spec/port/spike:  node err-diff.mjs
import fs from 'fs';
import path from 'path';
import { programs, jsErrors, wasmErrors } from './err-lib.mjs';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let bad = 0;
const fail = (msg) => { bad++; console.log('FAIL ' + msg); };

const golden = JSON.parse(fs.readFileSync('err-golden.json', 'utf8'));

for (const p of programs()) {
  const js = jsErrors(p.src), w = wasmErrors(p.src);
  if (!same(js, w)) {
    fail(`${p.name}: engines disagree`);
    console.log('  js:   ' + JSON.stringify(js));
    console.log('  wasm: ' + JSON.stringify(w));
  }
  if (!same(js, golden[p.name] === undefined ? null : golden[p.name])) {
    fail(`${p.name}: not the pinned messages`);
    console.log('  pinned: ' + JSON.stringify(golden[p.name]));
    console.log('  now:    ' + JSON.stringify(js));
  }
}

// --- sweep: both engines agree everywhere else too (usually: silence) ---------
const DIRS = ['../../corpus', '../../../examples', 'draw-tests', 'frame-tests'];
let swept = 0, chatty = 0;
for (const dir of DIRS) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.fc')).sort()) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const js = jsErrors(src), w = wasmErrors(src);
    swept++;
    if (js.length) chatty++;
    if (!same(js, w)) {
      fail(`${dir}/${f}: engines disagree`);
      console.log('  js:   ' + JSON.stringify(js.slice(0, 3)));
      console.log('  wasm: ' + JSON.stringify(w.slice(0, 3)));
    }
  }
}

console.log(`err-diff: ${programs().length} cases pinned · sweep ${swept} programs (${chatty} report diagnostics) · ${bad ? bad + ' FAILURES' : 'OK'}`);
process.exit(bad ? 1 : 0);
