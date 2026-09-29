// Interaction-aware smoke test for the live game library (examples/*.fc).
//
// The other harnesses are all *parity* checks and run IDLE — which for a
// screen/play game means they only ever see the title/play scene sitting
// still. That blind spot is exactly what let the COIN QUEST "no sprites"
// bug ship (HUD rendered, scene dead, idle differential stayed green).
//
// This harness drives each game through a SCRIPTED INPUT sequence (authored
// per game in smoke-specs.json) and asserts three things per game:
//   1. PARITY   — JS and wasm cores emit bit-identical draw ops every frame
//                 under that input (extends examples-diff into the input axis).
//   2. LIVENESS — the final frame has >= expect.min_draw_ops draw ops (a
//                 silently-dead game renders only HUD/background).
//   3. MOTION   — by expect.must_change_by_frame the draw-op set differs from
//                 frame 1 (proves input/update actually drives state).
//   4. NO-TRAP  — neither engine throws while running the script.
//
// Input codes (set_key / __setKey): 0=up 1=down 2=left 3=right 4=space 5=a 6=b.
// Run: node smoke.mjs   (needs target/.../fc_spike.wasm built via cargo build)
import fs from 'fs'; import path from 'path'; import os from 'os';
import { parse, Runtime, __CMDS, __step, __setKey, __bindRT } from './fc-core-record.mjs';

const enc = new TextEncoder(), dec = new TextDecoder();
const DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'examples');
const SPECS = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, 'smoke-specs.json'), 'utf8'));
const N = 30;
const DRAW = new Set(['rect', 'circle', 'line', 'text']);
const norm = c => JSON.stringify({ op: c.op, color: c.color, x: c.x, y: c.y, w: c.w, h: c.h, r: c.r, x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2, text: c.text });
const drawOnly = arr => arr.filter(c => DRAW.has(c.op)).map(norm);
const mulberry32 = a => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const WASM = fs.readFileSync(path.resolve(import.meta.dirname, 'target/wasm32-unknown-unknown/release/fc_spike.wasm'));

// keys: array of {frame, code, down} -> map frame -> [[code,down],...]
const keysByFrame = keys => { const m = {}; for (const k of (keys || [])) (m[k.frame] = m[k.frame] || []).push([k.code, k.down]); return m; };

let pass = 0, fail = 0; const out = [];

for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.fc')).sort()) {
  const game = f.replace(/\.fc$/, '');
  const spec = SPECS[game];
  if (!spec) { out.push(`SKIP  ${game.padEnd(16)} (no spec)`); continue; }
  const src = fs.readFileSync(path.join(DIR, f), 'utf8');
  const km = keysByFrame(spec.keys);
  const click = spec.start_click; // optional {frame,x,y}: enter play via a button click
  const fails = [];

  // --- JS reference ---
  let jf;
  try {
    Math.random = mulberry32(0);
    __CMDS.length = 0; const rt = new Runtime(); rt.reset(); __bindRT(rt); rt.exec(parse(src));
    jf = [drawOnly(__CMDS)];
    for (let i = 1; i < N; i++) {
      for (const [c, o] of (km[i] || [])) __setKey(c, o);
      // a click is a single-frame edge: set clicked before the step (auto-cleared by frame()).
      if (click && click.frame === i) { rt.mouseState.x = click.x; rt.mouseState.y = click.y; rt.mouseState.down = true; rt.mouseState.clicked = true; }
      __CMDS.length = 0; __step(); jf.push(drawOnly(__CMDS));
    }
  } catch (e) { fails.push(`JS trap: ${e.message}`); }

  // --- wasm core ---
  let wf;
  try {
    const w = (await WebAssembly.instantiate(WASM, {})).instance.exports;
    const writeSrc = s => { const b = enc.encode(s); new Uint8Array(w.memory.buffer, w.src_ptr(), b.length).set(b); return b.length; };
    const readCmds = n => JSON.parse(dec.decode(new Uint8Array(w.memory.buffer, w.res_ptr(), n)));
    let n = w.parse_render(writeSrc(src), 0); wf = [drawOnly(readCmds(n))];
    for (let i = 1; i < N; i++) {
      if (w.set_net) w.set_net(writeSrc('[]'), 0);
      for (const [c, o] of (km[i] || [])) w.set_key(c, o);
      // wasm dispatches on mouse-down; press before the step, release right after so it's a single-frame click.
      if (click && click.frame === i && w.set_mouse) w.set_mouse(click.x, click.y, 1);
      n = w.step_frame(); wf.push(drawOnly(readCmds(n)));
      if (click && click.frame === i && w.set_mouse) w.set_mouse(click.x, click.y, 0);
    }
  } catch (e) { fails.push(`wasm trap: ${e.message}`); }

  if (jf && wf) {
    // 1. PARITY
    let diffFrame = -1;
    for (let i = 0; i < N; i++) if (JSON.stringify(jf[i]) !== JSON.stringify(wf[i])) { diffFrame = i; break; }
    if (diffFrame >= 0) fails.push(`parity diff @frame ${diffFrame + 1} (js ${jf[diffFrame].length} ops / wasm ${wf[diffFrame].length})`);
    // 2. LIVENESS
    const finalOps = wf[N - 1].length;
    if (finalOps < spec.expect.min_draw_ops) fails.push(`liveness: final frame ${finalOps} ops < expected min ${spec.expect.min_draw_ops} (scene may be dead)`);
    // 3. MOTION
    const f1 = JSON.stringify(jf[0]);
    let changed = false;
    for (let i = spec.expect.must_change_by_frame - 1; i < N; i++) if (JSON.stringify(jf[i]) !== f1) { changed = true; break; }
    if (!changed) fails.push(`motion: scene never changed from frame 1 by frame ${spec.expect.must_change_by_frame} (input/update not driving state)`);
  }

  if (fails.length === 0) { pass++; out.push(`PASS  ${game.padEnd(16)} ${N}f · ${wf[N-1].length} ops final · parity+liveness+motion ok`); }
  else { fail++; out.push(`FAIL  ${game.padEnd(16)} ` + fails.join(' | ')); }
}

out.push(`\n${pass}/${pass + fail} games pass interaction-aware smoke (parity · liveness · motion · no-trap · ${N}f · seed 0)`);
const report = out.join('\n');
console.log(report);
fs.writeFileSync(path.join(os.tmpdir(), 'smoke-result.txt'), report + '\n');
process.exit(fail ? 1 : 0);
