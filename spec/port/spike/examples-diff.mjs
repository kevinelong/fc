// Full-library JS<->wasm differential: runs EVERY examples/*.fc through both the
// JS reference (fc-core-record) and the wasm core for N idle frames (seeded RNG)
// and diffs the DRAW commands (rect/circle/line/text). Host effects (sound/net/
// defsfx) are emitted by wasm but no-op'd in the JS oracle, so they're excluded —
// this validates RENDERING parity across the live game library, the real risk of
// making wasm the default. No input (idle) — exercises draw/behaviors/particles/
// animation/screens; deeper input coverage lives in frame-tests/.
import fs from 'fs'; import path from 'path';
import { parse, Runtime, __CMDS, __step, __bindRT } from './fc-core-record.mjs';
const enc = new TextEncoder(), dec = new TextDecoder();
const DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'examples');
const N = 30;
const DRAW = new Set(['rect', 'circle', 'line', 'text']);
const norm = c => JSON.stringify({ op: c.op, color: c.color, x: c.x, y: c.y, w: c.w, h: c.h, r: c.r, x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2, text: c.text });
const drawOnly = arr => arr.filter(c => DRAW.has(c.op)).map(norm);
const mulberry32 = a => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const WASM = fs.readFileSync(path.resolve(import.meta.dirname, 'target/wasm32-unknown-unknown/release/fc_spike.wasm'));

let ok = 0, bad = 0; const out = [];
for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.fc')).sort()) {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8');
  // JS reference
  Math.random = mulberry32(0);
  __CMDS.length = 0; const rt = new Runtime(); rt.reset(); __bindRT(rt); rt.exec(parse(src));
  const jf = [drawOnly(__CMDS)];
  for (let i = 1; i < N; i++) { __CMDS.length = 0; __step(); jf.push(drawOnly(__CMDS)); }
  // wasm core (fresh instance per program; mirror JS's peers=[]/disconnected via set_net)
  const w = (await WebAssembly.instantiate(WASM, {})).instance.exports;
  const writeSrc = s => { const b = enc.encode(s); new Uint8Array(w.memory.buffer, w.src_ptr(), b.length).set(b); return b.length; };
  const readCmds = n => JSON.parse(dec.decode(new Uint8Array(w.memory.buffer, w.res_ptr(), n)));
  let n = w.parse_render(writeSrc(src), 0); const wf = [drawOnly(readCmds(n))];
  for (let i = 1; i < N; i++) { if (w.set_net) w.set_net(writeSrc('[]'), 0); n = w.step_frame(); wf.push(drawOnly(readCmds(n))); }
  // diff frame-by-frame
  let firstDiff = -1;
  for (let i = 0; i < N; i++) { if (JSON.stringify(jf[i]) !== JSON.stringify(wf[i])) { firstDiff = i; break; } }
  if (firstDiff < 0) { ok++; out.push(`PASS  ${f.padEnd(20)} ${N} frames, draw-ops bit-identical`); }
  else {
    bad++;
    out.push(`DIFF  ${f.padEnd(20)} frame ${firstDiff + 1} (js ${jf[firstDiff].length} cmds / wasm ${wf[firstDiff].length})`);
    out.push('   js:   ' + (jf[firstDiff] || []).slice(0, 4).join(' '));
    out.push('   wasm: ' + (wf[firstDiff] || []).slice(0, 4).join(' '));
  }
}
out.push(`\n${ok}/${ok + bad} examples render bit-identical (JS vs wasm · draw ops · ${N} frames · seed 0 · idle)`);
console.log(out.join('\n'));
process.exit(bad === 0 ? 0 : 1);
