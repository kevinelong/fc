// Multi-frame differential: run N frames on both cores, compare per-frame cmds.
import fs from 'fs'; import path from 'path';
import { parse, Runtime, __CMDS, __step } from './fc-core-record.mjs';
const w = (await WebAssembly.instantiate(fs.readFileSync('target/wasm32-unknown-unknown/release/fc_spike.wasm'),{})).instance.exports;
const enc = new TextEncoder(), dec = new TextDecoder();
const DIR = path.resolve(import.meta.dirname, 'frame-tests');
const N = 6;
const norm = c => JSON.stringify({op:c.op,color:c.color,x:c.x,y:c.y,w:c.w,h:c.h,r:c.r,x1:c.x1,y1:c.y1,x2:c.x2,y2:c.y2,text:c.text});
let ok=0, bad=0;
for (const f of fs.readdirSync(DIR).filter(f=>f.endsWith('.fc')).sort()) {
  const src = fs.readFileSync(path.join(DIR,f),'utf8');
  // JS frames
  __CMDS.length=0; const rt=new Runtime(); rt.reset(); rt.exec(parse(src));
  const jsFrames=[__CMDS.map(norm)];
  for (let i=1;i<N;i++){ __CMDS.length=0; __step(); jsFrames.push(__CMDS.map(norm)); }
  // wasm frames
  const b=enc.encode(src); new Uint8Array(w.memory.buffer,w.src_ptr(),b.length).set(b);
  let n=w.parse_render(b.length,0);
  const wf=[JSON.parse(dec.decode(new Uint8Array(w.memory.buffer,w.res_ptr(),n)))];
  for (let i=1;i<N;i++){ n=w.step_frame(); wf.push(JSON.parse(dec.decode(new Uint8Array(w.memory.buffer,w.res_ptr(),n)))); }
  const wasmFrames = wf.map(fr=>fr.map(norm));
  let same = true;
  for (let i=0;i<N;i++) if (JSON.stringify(jsFrames[i])!==JSON.stringify(wasmFrames[i])) {
    same=false;
    console.log(`DIFF ${f} frame ${i+1}\n  js:   ${jsFrames[i].join(' ')}\n  wasm: ${wasmFrames[i].join(' ')}`);
    break;
  }
  if (same) ok++; else bad++;
}
console.log(`\nFrames (${N} each): ${ok}/${ok+bad} programs match`);
process.exit(bad?1:0);
