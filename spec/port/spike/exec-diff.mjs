import fs from 'fs'; import path from 'path';
const w = (await WebAssembly.instantiate(fs.readFileSync('target/wasm32-unknown-unknown/release/fc_spike.wasm'),{})).instance.exports;
const enc = new TextEncoder(), dec = new TextDecoder();
const CORPUS = path.resolve(import.meta.dirname, '../../corpus');
const golden = JSON.parse(fs.readFileSync(path.join(CORPUS,'_goldens.json'),'utf8'));
function run(src, seed) {
  const b = enc.encode(src);
  new Uint8Array(w.memory.buffer, w.src_ptr(), b.length).set(b);
  const n = w.parse_exec_to_json(b.length, seed>>>0);
  return JSON.parse(dec.decode(new Uint8Array(w.memory.buffer, w.res_ptr(), n)));
}
function deepEq(a, b) {
  if (a===b) return true;
  if (typeof a!==typeof b) return false;
  if (Array.isArray(a)) return Array.isArray(b) && a.length===b.length && a.every((x,i)=>deepEq(x,b[i]));
  if (a && typeof a==='object') { const ka=Object.keys(a).sort(), kb=Object.keys(b).sort(); return ka.length===kb.length && ka.every((k,i)=>k===kb[i]) && ka.every(k=>deepEq(a[k],b[k])); }
  return false;
}
let ok=0, bad=0;
for (const f of fs.readdirSync(CORPUS).filter(f=>f.endsWith('.fc')).sort()) {
  const seed = /random/.test(f) ? 12345 : 0;
  const got = run(fs.readFileSync(path.join(CORPUS,f),'utf8'), seed);
  const exp = golden[f];
  if (deepEq(got, exp)) ok++;
  else { bad++; console.log(`DIFF ${f}\n  got: ${JSON.stringify(got.vars)}\n  exp: ${JSON.stringify(exp.vars)}`); }
}
console.log(`\nRuntime exec: ${ok}/${ok+bad} match`);
process.exit(bad?1:0);
