// Two-instance MULTIPLAYER smoke test — the headless answer to "open it on two
// phones". The solo smoke (smoke.mjs) feeds each game an empty peer list, so the
// broadcast->peers->tag/frag path is never exercised. Here we co-simulate TWO
// players of the same game in one process and WIRE THEM TOGETHER: each frame,
// instance A's `broadcast {...}` becomes instance B's `peers` (and B's -> A's),
// with one broadcast-cycle of latency — exactly what a real relay does. No
// browser, no Playwright: deterministic, fast, reproducible.
//
// The two instances are seeded DIFFERENTLY (0 and 1) so they get distinct random
// spawns / tag numbers — a real two-player condition — while each player's JS and
// wasm cores share that player's seed and stay in lockstep.
//
// Per game we assert:
//   PARITY      — each player's JS and wasm draw ops match every frame, now with
//                 a LIVE peer stream (exercises json_to_val + the peers loop).
//   MECHANIC    — the multiplayer interaction actually fires. For mp-dots: drive
//                 both dots into one corner; the lower-tag runner must get TAGGED
//                 (its broadcast tag jumps above its start), proving it transfers.
//   DETERMINISM — re-running the wired session yields byte-identical draws.
//   NO-TRAP     — neither core throws.
//
// Input codes: 0=up 1=down 2=left 3=right 4=space 5=a 6=b.
// Run: node mp-smoke.mjs   (needs target/.../fc_spike.wasm built via cargo build)
import fs from 'fs'; import path from 'path';
import { parse, Runtime, __CMDS, __step, __setKey, __bindRT, __setNet } from './fc-core-record.mjs';

const enc = new TextEncoder(), dec = new TextDecoder();
const DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'examples');
const WASM = fs.readFileSync(path.resolve(import.meta.dirname, 'target/wasm32-unknown-unknown/release/fc_spike.wasm'));
const DRAW = new Set(['rect', 'circle', 'line', 'text']);
const norm = c => JSON.stringify({ op: c.op, color: c.color, x: c.x, y: c.y, w: c.w, h: c.h, r: c.r, x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2, text: c.text });
const drawOnly = arr => arr.filter(c => DRAW.has(c.op)).map(norm);
const mulberry32 = a => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const keysByFrame = keys => { const m = {}; for (const k of (keys || [])) (m[k.frame] = m[k.frame] || []).push([k.code, k.down]); return m; };
// Pull the latest `broadcast {...}` payload (a JSON string) out of a frame's command list.
const lastBroadcast = cmds => { let v = null; for (const c of cmds) if (c.op === 'net' && c.kind === 'broadcast') v = c.a; return v; };

// --- scenarios -------------------------------------------------------------
// hold = press at frame 1 and never release (steady input for the whole run).
const hold = codes => codes.map(c => ({ frame: 1, code: c, down: 1 }));
const SCENARIOS = {
  // Both dots march into the top-left corner (up+left); they pile onto (2,2),
  // so the runner ends up within 6px of "it" and gets tagged.
  'mp-dots': { N: 90, seeds: [0, 1], keys: [hold([0, 2]), hold([0, 2])], mechanic: 'tag-transfer', minDraw: 2 },
  // Maze deathmatch. A scripted frag across two instances is too fragile to line
  // up (aim + kill-mark window + victim detect), so here we only assert that the
  // two wired instances stay in JS<->wasm parity, are deterministic, and keep
  // rendering while consuming each other's peer stream. Frag is NOT asserted.
  'hunt': { N: 40, seeds: [0, 1],
    keys: [ [{ frame: 2, code: 3, down: 1 }, { frame: 10, code: 3, down: 0 }, { frame: 12, code: 4, down: 1 }, { frame: 13, code: 4, down: 0 }, { frame: 16, code: 1, down: 1 }, { frame: 28, code: 1, down: 0 }],
            [{ frame: 2, code: 2, down: 1 }, { frame: 10, code: 2, down: 0 }, { frame: 12, code: 4, down: 1 }, { frame: 13, code: 4, down: 0 }, { frame: 16, code: 0, down: 1 }, { frame: 28, code: 0, down: 0 }] ],
    mechanic: null, minDraw: 8 },
};

// --- wasm pair: run two wired instances, return per-frame draws + peer streams + broadcast tags ---
async function runWasmPair(src, N, seeds, kms) {
  const inst = await Promise.all(seeds.map(async () => {
    const w = (await WebAssembly.instantiate(WASM, {})).instance.exports;
    const writeSrc = s => { const b = enc.encode(s); new Uint8Array(w.memory.buffer, w.src_ptr(), b.length).set(b); return b.length; };
    const readCmds = n => JSON.parse(dec.decode(new Uint8Array(w.memory.buffer, w.res_ptr(), n)));
    return { w, writeSrc, readCmds };
  }));
  const draws = [[], []], peerFed = [[], []], bcastTag = [[], []];
  let lastBcast = [null, null];
  for (let f = 0; f < N; f++) {
    const incoming = [lastBcast[1], lastBcast[0]];          // A hears B, B hears A
    const nextBcast = [null, null];
    for (let p = 0; p < 2; p++) {
      const { w, writeSrc, readCmds } = inst[p];
      const peersJson = incoming[p] ? '[' + incoming[p] + ']' : '[]';
      peerFed[p].push(peersJson);
      let n;
      if (f === 0) { n = w.parse_render(writeSrc(src), seeds[p]); }   // frame 0: no peers yet
      else { w.set_net(writeSrc(peersJson), 0); for (const [c, o] of (kms[p][f] || [])) w.set_key(c, o); n = w.step_frame(); }
      const cmds = readCmds(n);
      draws[p].push(drawOnly(cmds));
      const b = lastBroadcast(cmds);
      if (b !== null) { nextBcast[p] = b; try { bcastTag[p].push(JSON.parse(b).tag); } catch (_) {} }
    }
    for (let p = 0; p < 2; p++) if (nextBcast[p] !== null) lastBcast[p] = nextBcast[p];
  }
  return { draws, peerFed, bcastTag };
}

// --- one JS instance, fed the SAME inputs + the peer stream captured from wasm ---
function runJsInstance(src, N, seed, km, peerFed) {
  Math.random = mulberry32(seed);
  __CMDS.length = 0; const rt = new Runtime(); rt.reset(); __bindRT(rt); __setNet([]); rt.exec(parse(src));
  const out = [drawOnly(__CMDS)];
  for (let f = 1; f < N; f++) {
    __bindRT(rt);
    let peers = []; try { peers = JSON.parse(peerFed[f]); } catch (_) {}
    __setNet(peers);
    for (const [c, o] of (km[f] || [])) __setKey(c, o);
    __CMDS.length = 0; __step(); out.push(drawOnly(__CMDS));
  }
  return out;
}

const firstDiff = (a, b) => { const n = Math.max(a.length, b.length); for (let i = 0; i < n; i++) if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return i; return -1; };

const out = [];
let pass = 0, fail = 0;
for (const game of Object.keys(SCENARIOS).filter(g => fs.existsSync(path.join(DIR, g + '.fc')))) {
  const spec = SCENARIOS[game];
  const src = fs.readFileSync(path.join(DIR, game + '.fc'), 'utf8');
  const kms = spec.keys.map(keysByFrame);
  const fails = [];
  let wp;
  try { wp = await runWasmPair(src, spec.N, spec.seeds, kms); }
  catch (e) { fails.push(`wasm pair trap: ${e.message}`); }

  if (wp) {
    // PARITY: each player's JS run must match its wasm run frame-by-frame
    for (let p = 0; p < 2; p++) {
      let js;
      try { js = runJsInstance(src, spec.N, spec.seeds[p], kms[p], wp.peerFed[p]); }
      catch (e) { fails.push(`JS p${p} trap: ${e.message}`); continue; }
      const d = firstDiff(js, wp.draws[p]);
      if (d >= 0) fails.push(`parity p${p} @frame ${d + 1} (js ${js[d] ? js[d].length : '-'} / wasm ${wp.draws[p][d] ? wp.draws[p][d].length : '-'} ops)`);
    }
    // LIVENESS: both players keep rendering a real scene
    for (let p = 0; p < 2; p++) { const fin = wp.draws[p][spec.N - 1].length; if (fin < spec.minDraw) fails.push(`liveness p${p}: final ${fin} ops < ${spec.minDraw}`); }
    // MECHANIC
    if (spec.mechanic === 'tag-transfer') {
      const init = wp.bcastTag.map(t => t[0]), finl = wp.bcastTag.map(t => t[t.length - 1]);
      if (init[0] === undefined || init[1] === undefined) fails.push('mechanic: no broadcasts captured');
      else if (init[0] === init[1]) fails.push(`mechanic: both seeds gave equal tag ${init[0]} (no clear it/runner)`);
      else { const lo = init[0] < init[1] ? 0 : 1; if (!(finl[lo] > init[lo])) fails.push(`mechanic: runner p${lo} tag did not rise (start ${init[lo]} -> end ${finl[lo]}); tag never transferred`); }
    }
    // DETERMINISM: re-run the wired session, expect identical draws
    let wp2; try { wp2 = await runWasmPair(src, spec.N, spec.seeds, kms); } catch (e) { fails.push(`determinism re-run trap: ${e.message}`); }
    if (wp2) for (let p = 0; p < 2; p++) { const d = firstDiff(wp.draws[p], wp2.draws[p]); if (d >= 0) fails.push(`nondeterministic p${p} @frame ${d + 1}`); }
  }

  if (fails.length === 0) {
    pass++;
    const extra = spec.mechanic === 'tag-transfer' ? ` · tag ${wp.bcastTag[0][0]}/${wp.bcastTag[1][0]} -> ${wp.bcastTag[0].at(-1)}/${wp.bcastTag[1].at(-1)} (transfer ok)` : ' · parity+determinism (frag not asserted)';
    out.push(`PASS  ${game.padEnd(10)} 2 wired instances · ${spec.N}f${extra}`);
  } else { fail++; out.push(`FAIL  ${game.padEnd(10)} ` + fails.join(' | ')); }
}

out.push(`\n${pass}/${pass + fail} multiplayer games pass two-instance smoke (parity · mechanic · determinism · no-trap)`);
const report = out.join('\n');
console.log(report);
fs.writeFileSync('/tmp/mp-smoke-result.txt', report + '\n');
process.exit(fail ? 1 : 0);
