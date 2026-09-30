import fs from 'fs'; import path from 'path'; import os from 'os';
import { parse, Runtime, __CMDS, __step, __setKey, __setMouse, __bindRT } from './fc-core-record.mjs';
const enc = new TextEncoder(), dec = new TextDecoder();
const DIR = path.resolve(import.meta.dirname, 'frame-tests');
const N = 6;
const out = [];
const norm = c => JSON.stringify({op:c.op,color:c.color,x:c.x,y:c.y,w:c.w,h:c.h,r:c.r,x1:c.x1,y1:c.y1,x2:c.x2,y2:c.y2,text:c.text,magnitude:c.magnitude,kind:c.kind,name:c.name});
// `<game>.mouse` — one `frame:x:y` per line: a click dispatched before that frame's step
function loadMouse(f){ const p=path.join(DIR,f.replace(/\.fc$/,'.mouse')); const m={}; if(!fs.existsSync(p))return m;
  for(const line of fs.readFileSync(p,'utf8').split('\n')){const t=line.trim(); if(!t)continue; const [fr,x,y]=t.split(':').map(Number); (m[fr]=m[fr]||[]).push([x,y]);} return m; }
function loadKeys(f){ const p=path.join(DIR,f.replace(/\.fc$/,'.keys')); const m={}; if(!fs.existsSync(p))return m;
  for(const line of fs.readFileSync(p,'utf8').split('\n')){const t=line.trim(); if(!t)continue; const [fr,c,o]=t.split(':').map(Number); (m[fr]=m[fr]||[]).push([c,o]);} return m; }
// Seed Math.random with the SAME mulberry32 the wasm core uses (seed 0 per
// program, matching parse_render(len, 0)), so wander/particle rng draws line up.
const mulberry32 = a => () => { a=(a+0x6D2B79F5)|0; let t=Math.imul(a^(a>>>15),1|a); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; };
let ok=0,bad=0;
for(const f of fs.readdirSync(DIR).filter(f=>f.endsWith('.fc')).sort()){
  const src=fs.readFileSync(path.join(DIR,f),'utf8'); const keys=loadKeys(f), mouse=loadMouse(f);
  Math.random = mulberry32(0);
  __CMDS.length=0; const rt=new Runtime(); rt.reset(); __bindRT(rt); rt.exec(parse(src));
  const jf=[__CMDS.map(norm)];
  for(let i=1;i<N;i++){ for(const [c,o] of (keys[i]||[])) __setKey(c,o); for(const [mx,my] of (mouse[i]||[])) __setMouse(mx,my); __CMDS.length=0; __step(); jf.push(__CMDS.map(norm)); }
  const w = (await WebAssembly.instantiate(fs.readFileSync('target/wasm32-unknown-unknown/release/fc_spike.wasm'),{})).instance.exports;
  const b=enc.encode(src); new Uint8Array(w.memory.buffer,w.src_ptr(),b.length).set(b);
  let n=w.parse_render(b.length,0); const wf=[JSON.parse(dec.decode(new Uint8Array(w.memory.buffer,w.res_ptr(),n)))];
  for(let i=1;i<N;i++){ for(const [c,o] of (keys[i]||[])) w.set_key(c,o);
    // the JS side gets a one-shot click per `mouse[i]` entry; mirror it into the
    // wasm (down before the step, up after — the smoke harness pattern)
    for(const [mx,my] of (mouse[i]||[])) w.set_mouse(Math.round(mx),Math.round(my),1);
    n=w.step_frame();
    for(const [mx,my] of (mouse[i]||[])) w.set_mouse(Math.round(mx),Math.round(my),0);
    wf.push(JSON.parse(dec.decode(new Uint8Array(w.memory.buffer,w.res_ptr(),n)))); }
  const wn=wf.map(fr=>fr.map(norm)); let same=true;
  for(let i=0;i<N;i++) if(JSON.stringify(jf[i])!==JSON.stringify(wn[i])){ same=false; out.push(`DIFF ${f} frame ${i+1}`); out.push('  js:   '+jf[i].join(' ')); out.push('  wasm: '+wn[i].join(' ')); break; }
  if(same) ok++; else bad++;
}
out.push(`Frames (${N} each): ${ok}/${ok+bad} programs match`);
console.log(out[out.length-1]);   // the summary must be visible, not only in the temp file
fs.writeFileSync(path.join(os.tmpdir(), 'frames-result.txt'), out.join('\n')+'\n');
