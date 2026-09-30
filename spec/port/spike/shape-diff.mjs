// shape-diff.mjs — the coverage audit, plus a cross-engine check for the language
// shapes no other suite exercises.
//
// Why this exists: every gap found in the 2026-09-29 sessions was invisible because
// the test corpus lacked a SHAPE, not because a test failed (a bare `list of sprites`,
// a props-less sprite list, a game-shaped corpus program, a user-defined sprite). So:
//
//   COVERAGE  every parse node type the JS parser can emit is enumerated from the core
//             (lexer token types excluded, taken from the tokenizer itself); node types
//             that appear in NO test program are listed and pinned. A NEW node type is
//             either covered by a program or must be acknowledged here — the pin fails
//             loudly otherwise.
//   DIVERGENCE  one tiny program per unexercised statement/condition shape, run through
//             the JS oracle and the wasm: draw commands, variables and diagnostics must
//             match exactly (canonical keys, as exec-diff does).
//
// Run from spec/port/spike:  node shape-diff.mjs        (--update re-pins the list)
import fs from 'fs';
import path from 'path';
import { parse, Runtime, __CMDS, __bindRT, __step } from './fc-core-record.mjs';

const w = (await WebAssembly.instantiate(fs.readFileSync('target/wasm32-unknown-unknown/release/fc_spike.wasm', {}))).instance.exports;
const enc = new TextEncoder(), dec = new TextDecoder();
const CORE = fs.readFileSync('../../lang/fc-core.mjs', 'utf8');
const PIN = 'shape-golden.json';

// ---------------------------------------------------------------- coverage
function tokenTypeNames() {
  // the tokenizer's own `type: '...'` literals are tokens, not AST nodes
  const start = CORE.indexOf('function tokenizeLine');
  const end = CORE.indexOf('\nfunction ', start + 10);
  const body = CORE.slice(start, end < 0 ? undefined : end);
  return new Set([...body.matchAll(/type:\s*'([a-z_]+)'/g)].map(m => m[1]));
}
const TOKENS = tokenTypeNames();
const DECLARED = new Set([...CORE.matchAll(/type:\s*'([a-z_]+)'/g)].map(m => m[1]).filter(t => !TOKENS.has(t)));

const DIRS = ['../../corpus', '../../../examples', 'draw-tests', 'frame-tests', 'err-tests'];
const walkTypes = (n, seen) => {
  if (!n || typeof n !== 'object') return;
  if (Array.isArray(n)) { n.forEach(x => walkTypes(x, seen)); return; }
  if (typeof n.type === 'string') seen.add(n.type);
  for (const k of Object.keys(n)) if (k !== 'type') walkTypes(n[k], seen);
};
const covered = new Set();
let programs = 0;
for (const dir of DIRS) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.fc'))) {
    programs++;
    try { walkTypes(parse(fs.readFileSync(path.join(dir, f), 'utf8')), covered); } catch (_) {}
  }
}
const uncovered = [...DECLARED].filter(t => !covered.has(t)).sort();

// ------------------------------------------------------------------ field shapes
// A node type can be exercised with only ONE of its variants (`if` always with a body,
// `every` always in frames, `tween` never with an ease). Read the keys each parser
// literal can emit, then compare against the keys any test program actually produces.
// The window is deliberately small (±2 lines): over-capturing only adds a pinned,
// harmless entry, while under-capturing hides nothing that matters.
function declaredFields() {
  const pairs = new Map();
  const lines = CORE.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/type:\s*'([a-z_]+)'/);
    if (!m) continue;
    const chunk = lines.slice(Math.max(0, i - 2), i + 3).join(' ');
    const at = chunk.indexOf(m[0]);
    const open = chunk.lastIndexOf('{', at), close = chunk.indexOf('}', at);
    const lit = (open >= 0 && close > open) ? chunk.slice(open + 1, close) : chunk;
    const set = pairs.get(m[1]) || new Set();
    // a key is an identifier followed by `:` or by `,`/`}` — but never one that follows a
    // `:` itself (that is a value, e.g. `name: sname`)
    for (const k of lit.matchAll(/([A-Za-z_$][\w$]*)\s*(?::|(?=[,}]))/g)) {
      const before = lit.slice(0, k.index).replace(/\s+$/, '');
      if (before.endsWith(':') || before.endsWith('.')) continue;   // a value, or a member access
      set.add(k[1]);
    }
    set.delete('type');
    pairs.set(m[1], set);
  }
  return pairs;
}
const walkFields = (n, seen) => {
  if (!n || typeof n !== 'object') return;
  if (Array.isArray(n)) { n.forEach(x => walkFields(x, seen)); return; }
  if (typeof n.type === 'string') {
    const set = seen.get(n.type) || new Set();
    for (const k of Object.keys(n)) if (k !== 'type') set.add(k);
    seen.set(n.type, set);
  }
  for (const k of Object.keys(n)) if (k !== 'type') walkFields(n[k], seen);
};
const observedFields = new Map();
for (const dir of DIRS) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.fc'))) {
    try { walkFields(parse(fs.readFileSync(path.join(dir, f), 'utf8')), observedFields); } catch (_) {}
  }
}
const declared = declaredFields();
const uncoveredFields = [];
for (const [type, keys] of [...declared].sort()) {
  if (!observedFields.has(type)) continue;            // whole type uncovered: pinned above
  const seen = observedFields.get(type) || new Set();
  for (const k of [...keys].sort()) if (!seen.has(k)) uncoveredFields.push(`${type}.${k}`);
}
uncoveredFields.sort();

if (process.argv.includes('--update')) {
  fs.writeFileSync(PIN, JSON.stringify({ programs, declared: DECLARED.size, uncovered, uncoveredFields }, null, 2) + '\n');
  console.log(`wrote ${PIN} — ${uncovered.length} unexercised node types, ${uncoveredFields.length} unexercised fields`);
  process.exit(0);
}

let bad = 0;
const fail = msg => { bad++; console.log('FAIL ' + msg); };

if (fs.existsSync(PIN)) {
  const pin = JSON.parse(fs.readFileSync(PIN, 'utf8'));
  const known = new Set(pin.uncovered || []);
  const fresh = uncovered.filter(t => !known.has(t));
  const gone = (pin.uncovered || []).filter(t => !uncovered.includes(t));
  if (fresh.length) fail(`new node type(s) with no covering program and no acknowledgement: ${fresh.join(', ')} — add a case, or re-pin with --update`);
  if (gone.length) console.log(`note: now covered (re-pin with --update): ${gone.join(', ')}`);

  const knownFields = new Set(pin.uncoveredFields || []);
  const freshFields = uncoveredFields.filter(f => !knownFields.has(f));
  const goneFields = (pin.uncoveredFields || []).filter(f => !uncoveredFields.includes(f));
  if (freshFields.length) fail(`new unexercised field(s): ${freshFields.join(', ')} — add a case, or re-pin with --update`);
  if (goneFields.length) console.log(`note: new field coverage (re-pin with --update): ${goneFields.length} pair(s)`);
} else {
  fail(`${PIN} missing — run with --update once`);
}

// ---------------------------------------------------------------- divergence table
const canon = v => Array.isArray(v) ? v.map(canon)
  : (v && typeof v === 'object') ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
const normCmds = cs => cs.filter(c => c.op !== 'sound').map(c => JSON.stringify({ op: c.op, color: c.color, x: c.x, y: c.y, w: c.w, h: c.h, r: c.r, x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2, text: c.text, magnitude: c.magnitude, kind: c.kind, name: c.name }));

function jsRun(src) {
  const rt = new Runtime(); rt.reset(); __bindRT(rt);
  Math.random = (() => { let a = 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
  __CMDS.length = 0;
  try { rt.exec(parse(src)); } catch (e) { rt.error('threw ' + e.message); }
  const vars = {}; for (const k of Object.keys(rt.vars).sort()) vars[k] = canon(rt.vars[k]);
  return { cmds: normCmds(__CMDS), vars, errors: rt.errors.slice(), say: (rt.sayBuffer || []).slice() };
}
function wasmRun(src) {
  const b = enc.encode(src);
  new Uint8Array(w.memory.buffer, w.src_ptr(), b.length).set(b);
  const ncmds = w.parse_render(b.length, 0);
  const cmds = JSON.parse(dec.decode(new Uint8Array(w.memory.buffer, w.res_ptr(), ncmds)));
  const ne = w.errors_json();
  const errors = JSON.parse(dec.decode(new Uint8Array(w.memory.buffer, w.res_ptr(), ne)));
  new Uint8Array(w.memory.buffer, w.src_ptr(), b.length).set(b);
  const nj = w.parse_exec_to_json(b.length, 0);
  const out = JSON.parse(dec.decode(new Uint8Array(w.memory.buffer, w.res_ptr(), nj)));
  return { cmds: normCmds(cmds.map(c => ({ op: c.op, color: c.color, x: c.x, y: c.y, w: c.w, h: c.h, r: c.r, x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2, text: c.text, magnitude: c.magnitude, kind: c.kind, name: c.name }))),
           vars: out.vars || {}, errors, say: out.say || [] };
}

// One program per uncovered shape (a shape needing frames lives in frame-tests/).
// Each case: [name, program, what the runtime must produce] — agreement between the two
// engines is necessary but not sufficient (a shared mistake would otherwise pass).
const CASES = [
  ['between', 'x is 3\nticks is 0\nif x is between 1 and 5\n  ticks is 1\n', r => r.vars.ticks === 1],
  ['between (false)', 'x is 9\nticks is 0\nif x is between 1 and 5\n  ticks is 1\n', r => r.vars.ticks === 0],
  ['halve', 'score is 10\nhalve score\n', r => r.vars.score === 5],
  ['repeat until', 'x is 0\nrepeat until x is 3\n  x is x + 1\n', r => r.vars.x === 3],
  ['repeat while', 'x is 0\nrepeat while x is less than 3\n  x is x + 1\n', r => r.vars.x === 3],
  ['has (list)', 'hands is ["a", "b"]\nfound is 0\nif hands has "b"\n  found is 1\n', r => r.vars.found === 1],
  ['has (text)', 'word is "hello"\nfound is 0\nif word has "ell"\n  found is 1\n', r => r.vars.found === 1],
  ['walk then stop walking', 'player is {x: 10, y: 10, dx: 1, dy: 0}\nwalk player right\nstop walking player\n',
    r => r.vars.player && r.vars.player.walking === false && r.vars.player.dx === 1],
  // the docs spell it `face <mover> <direction>`; a bare `face up` is a call to a verb
  ['face player up', 'player is {x: 10, y: 10, facing: "down"}\nface player up\n',
    r => r.vars.player && r.vars.player.facing === 'up' && r.vars.player.dy === -1],
  ['clear a list', 'hands is ["a", "b"]\nclear hands\n',
    r => Array.isArray(r.vars.hands) && r.vars.hands.length === 0],
  ['restore (exec-only: nothing to roll back)', 'save 7 as "k"\nrestore "k"\n', r => true],
  ['def song registers, never a variable', 'song "tune" is 120\nplay music "tune"\n',
    r => !('songtune' in r.vars)],
  // the docs write the name in quotes (`draw sprite "heart"`); a bare word is a variable
  ['def sprite draws the art', 'sprite "ball" is "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"\nto draw\n  clear screen to black\n  draw sprite "ball" at 4, 4\nrun game with update and draw\n',
    r => r.cmds.length > 1],
  ['user art in a sprite list', 'sprite "gem" is "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"\ngems is list of 2 sprites {image: "gem"}\n',
    r => Array.isArray(r.vars.gems) && r.vars.gems.length === 2 && r.vars.gems[0].image === 'gem'],
  ['forever bounded by stop', 'x is 0\nforever\n  x is x + 1\n  if x is 3\n    stop\n', r => r.vars.x === 3],
  ['inline else runs the action', 'a is 1\nb is 0\nif a is 2\n  b is 2\nelse b is 3\n', r => r.vars.b === 3],
];

let checked = 0;
for (const [name, src, expect] of CASES) {
  let js, wasm;
  try { js = jsRun(src); } catch (e) { js = { threw: e.message }; }
  try { wasm = wasmRun(src); } catch (e) { wasm = { threw: e.message }; }
  checked++;
  try {
    if (!expect(js)) { fail(`${name}: the runtime does not do what the docs promise`); console.log('  vars: ' + JSON.stringify(js.vars).slice(0, 160)); }
  } catch (e) { fail(`${name}: expectation threw (${e.message})`); }
  if (JSON.stringify(js) !== JSON.stringify(wasm)) {
    fail(`${name}: engines disagree`);
    for (const k of ['cmds', 'vars', 'errors', 'say']) {
      if (JSON.stringify(js[k]) !== JSON.stringify(wasm[k])) {
        console.log(`  ${k}:`);
        console.log(`    js:   ${JSON.stringify(js[k]).slice(0, 220)}`);
        console.log(`    wasm: ${JSON.stringify(wasm[k]).slice(0, 220)}`);
      }
    }
  }
}

let declaredTotal = 0;
for (const keys of declared.values()) declaredTotal += keys.size;
console.log(`shape-diff: ${programs} programs · ${DECLARED.size - uncovered.length}/${DECLARED.size} node types exercised · ` +
  `${declaredTotal - uncoveredFields.length}/${declaredTotal} fields exercised · ` +
  `${checked} shape cases (agreement + expected values) ${bad ? '· ' + bad + ' FAILURES' : '· OK'}`);
if (uncovered.length) console.log('unexercised types: ' + uncovered.join(', '));
if (uncoveredFields.length) console.log('unexercised fields (heuristic window; a few entries are local names near the literal): ' + uncoveredFields.join(', '));
process.exit(bad ? 1 : 0);
