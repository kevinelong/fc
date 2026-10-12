#!/usr/bin/env node
// perf-check — per-frame cost of the heaviest examples, on both engines.
//
// Nothing here noticed a frame-time regression: the differentials prove the engines *agree*, not
// that they are fast, and a hot path can quietly go quadratic without changing a single pixel. This
// measures the engine step itself — parse once, then time every frame — for the examples most
// likely to hurt (the particle and generative ones), on the wasm core (the default) and the JS core.
//
// It is deliberately NOT part of tools/checks.mjs: an absolute millisecond budget on a shared CI
// runner measures the runner, not the code, and a flaky perf gate gets ignored. Run it before and
// after a change that touches the frame loop, and compare the table.
//
//   node tools/perf-check.mjs [frames]
//
// Budgets are generous on purpose (a frame is 16.7 ms at 60 fps): this is a catastrophe detector,
// not a benchmark.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse, Runtime, __step, __bindRT } from '../spec/port/spike/fc-core-record.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WASM = path.join(ROOT, 'spec', 'port', 'spike', 'target', 'wasm32-unknown-unknown', 'release', 'fc_spike.wasm');
const FRAMES = Number(process.argv[2] || 240);
const FRAME_MS = 16.7;                        // a 60 fps frame
const BUDGET_MS = Number(process.env.FC_PERF_BUDGET_MS || (FRAME_MS / 2));  // half a frame by default
const RATIO_MAX = Number(process.env.FC_PERF_RATIO_MAX || 6);               // wasm vs JS: the wasm is the default, it should not be 6x slower

const EXAMPLES = ['space-invaders', 'cycles', 'matrix', 'sand', 'starfield', 'chaos', 'langton', 'coin-quest', 'hunt', 'frogger'];

if (!fs.existsSync(WASM)) {
  console.error(`no built wasm at ${path.relative(ROOT, WASM)} — cd spec/port/spike && cargo build --release --target wasm32-unknown-unknown`);
  process.exit(2);
}
const bytes = fs.readFileSync(WASM);
const inst = (await WebAssembly.instantiate(bytes, {})).instance.exports;
const enc = new TextEncoder(), dec = new TextDecoder();
const writeSrc = (code) => { const b = enc.encode(code); new Uint8Array(inst.memory.buffer, inst.src_ptr(), b.length).set(b); return b.length; };

const timeSteps = (n, step) => {
  step();                                     // warm: the first frame carries the parse/first-draw cost
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < n; i++) step();
  return Number(process.hrtime.bigint() - t0) / 1e6 / n;
};

const rows = [];
for (const name of EXAMPLES) {
  const file = path.join(ROOT, 'examples', `${name}.fc`);
  if (!fs.existsSync(file)) continue;         // an example may be renamed; skip rather than lie
  const src = fs.readFileSync(file, 'utf8');

  inst.parse_render(writeSrc(src), 0);
  const wasmMs = timeSteps(FRAMES, () => inst.step_frame());

  const rt = new Runtime(); rt.reset(); __bindRT(rt);
  rt.exec(parse(src));
  const jsMs = timeSteps(FRAMES, () => __step());

  rows.push({ name, wasmMs, jsMs, ratio: jsMs > 0 ? wasmMs / jsMs : 0 });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('example', 16)}${pad('wasm ms/frame', 15)}${pad('js ms/frame', 14)}wasm/js`);
for (const r of rows) {
  console.log(`${pad(r.name, 16)}${pad(r.wasmMs.toFixed(3), 15)}${pad(r.jsMs.toFixed(3), 14)}${r.ratio.toFixed(2)}x`);
}
console.log(`\n${FRAMES} frames each · budget ${BUDGET_MS.toFixed(1)} ms/frame (half of a 60 fps frame) · wasm/js limit ${RATIO_MAX}x`);
console.log(`slowest frame step: ${Math.max(...rows.map(r => Math.max(r.wasmMs, r.jsMs))).toFixed(3)} ms`);

const overBudget = rows.filter(r => Math.max(r.wasmMs, r.jsMs) > BUDGET_MS);
const skewed = rows.filter(r => r.ratio > RATIO_MAX);
for (const r of overBudget) console.log(`FAIL  ${r.name} needs ${Math.max(r.wasmMs, r.jsMs).toFixed(2)} ms/frame`);
for (const r of skewed) console.log(`FAIL  ${r.name}: wasm is ${r.ratio.toFixed(2)}x the JS core`);
console.log(`\n${rows.length - Math.max(overBudget.length, skewed.length)}/${rows.length} examples within budget`);
process.exitCode = (overBudget.length || skewed.length) ? 1 : 0;
