import fs from 'fs'; import path from 'path';
const w = (await WebAssembly.instantiate(fs.readFileSync('target/wasm32-unknown-unknown/release/fc_spike.wasm'),{})).instance.exports;
const enc = new TextEncoder(), dec = new TextDecoder();
function parseProg(src){
  const bytes = enc.encode(src);
  new Uint8Array(w.memory.buffer, w.src_ptr(), bytes.length).set(bytes);
  const n = w.parse_to_json(bytes.length);
  const json = dec.decode(new Uint8Array(w.memory.buffer, w.out_ptr(), n));
  return JSON.parse(json);
}
const out = {};
for (const [d,base] of [['../../corpus','corpus'],['../../../examples','examples']]) {
  for (const f of fs.readdirSync(path.resolve(import.meta.dirname,d)).filter(f=>f.endsWith('.fc')).sort())
    out[f] = parseProg(fs.readFileSync(path.resolve(import.meta.dirname,d,f),'utf8'));
}
fs.writeFileSync('rust-ast.json', JSON.stringify(out));
console.log('wrote rust-ast.json for', Object.keys(out).length, 'programs');
