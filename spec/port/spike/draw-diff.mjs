import fs from 'fs'; import path from 'path';
import { parse, Runtime, __CMDS } from './fc-core-record.mjs';
const w = (await WebAssembly.instantiate(fs.readFileSync('target/wasm32-unknown-unknown/release/fc_spike.wasm'),{})).instance.exports;
const enc = new TextEncoder(), dec = new TextDecoder();
const DIR = path.resolve(import.meta.dirname, 'draw-tests');
function jsCmds(src){ __CMDS.length=0; const rt=new Runtime(); rt.exec(parse(src)); return __CMDS.map(c=>({...c})); }
function wasmCmds(src){ const b=enc.encode(src); new Uint8Array(w.memory.buffer,w.src_ptr(),b.length).set(b); const n=w.parse_render(b.length,0); return JSON.parse(dec.decode(new Uint8Array(w.memory.buffer,w.res_ptr(),n))); }
const norm = c => ({op:c.op,color:c.color,x:c.x,y:c.y,w:c.w,h:c.h,r:c.r,x1:c.x1,y1:c.y1,x2:c.x2,y2:c.y2,text:c.text});
const eq = (a,b)=>JSON.stringify(a.map(norm))===JSON.stringify(b.map(norm));
let ok=0,bad=0;
for(const f of fs.readdirSync(DIR).filter(f=>f.endsWith('.fc')).sort()){
  const src=fs.readFileSync(path.join(DIR,f),'utf8'); const j=jsCmds(src), m=wasmCmds(src);
  if(eq(j,m)) ok++; else { bad++; console.log(`DIFF ${f}\n  js:   ${JSON.stringify(j)}\n  wasm: ${JSON.stringify(m)}`); }
}
console.log(`\nRender cmds: ${ok}/${ok+bad} match`);
process.exit(bad?1:0);
