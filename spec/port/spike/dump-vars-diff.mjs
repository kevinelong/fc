// dump_vars differential: the live-inspect panel reads dump_vars() (wasm) /
// runtime.vars (JS). This proves they agree — runs every examples/*.fc for N
// frames in both engines (seeded, empty peers) and deep-compares the variable
// snapshot the inspector would show. Extends exec-diff from top-level scripts to
// LIVE game state.
import fs from 'fs'; import path from 'path';
import { parse, Runtime, __CMDS, __step, __bindRT, __setNet } from './fc-core-record.mjs';
const enc = new TextEncoder(), dec = new TextDecoder();
const DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'examples');
const WASM = fs.readFileSync(path.resolve(import.meta.dirname, 'target/wasm32-unknown-unknown/release/fc_spike.wasm'));
const N = 20;
const mulberry32 = a => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
// canonical JSON: sort object keys recursively so key-order differences don't matter
const canon = v => Array.isArray(v) ? v.map(canon) : (v && typeof v === 'object') ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
const norm = o => JSON.stringify(canon(o));

let ok = 0, bad = 0; const out = [];
for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.fc')).sort()) {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8');
  // JS reference
  Math.random = mulberry32(0);
  __CMDS.length = 0; const rt = new Runtime(); rt.reset(); __bindRT(rt); __setNet([]); rt.exec(parse(src));
  for (let i = 1; i < N; i++) { __bindRT(rt); __setNet([]); __CMDS.length = 0; __step(); }
  const jv = {}; for (const [k, v] of Object.entries(rt.vars)) if (typeof v !== 'function') jv[k] = v;
  // wasm
  const w = (await WebAssembly.instantiate(WASM, {})).instance.exports;
  const writeSrc = s => { const b = enc.encode(s); new Uint8Array(w.memory.buffer, w.src_ptr(), b.length).set(b); return b.length; };
  w.parse_render(writeSrc(src), 0);
  for (let i = 1; i < N; i++) { if (w.set_net) w.set_net(writeSrc('[]'), 0); w.step_frame(); }
  const wn = w.dump_vars();
  const wv = JSON.parse(dec.decode(new Uint8Array(w.memory.buffer, w.res_ptr(), wn)));
  // compare the union of keys (the inspector shows whatever each has)
  const keys = [...new Set([...Object.keys(jv), ...Object.keys(wv)])].sort();
  const diffs = keys.filter(k => norm(jv[k]) !== norm(wv[k]));
  if (diffs.length === 0) { ok++; out.push(`PASS  ${f.padEnd(20)} ${keys.length} vars`); }
  else { bad++; out.push(`DIFF  ${f.padEnd(20)} ` + diffs.map(k => `${k}: js=${norm(jv[k])} wasm=${norm(wv[k])}`).slice(0, 3).join(' | ')); }
}
out.push(`\n${ok}/${ok + bad} examples: dump_vars (wasm) == runtime.vars (JS) after ${N} frames`);
console.log(out.join('\n'));
process.exit(bad ? 1 : 0);
