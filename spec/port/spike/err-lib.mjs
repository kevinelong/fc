import fs from 'fs';
import { parse, Runtime, __bindRT, __step } from './fc-core-record.mjs';

const w = (await WebAssembly.instantiate(fs.readFileSync('target/wasm32-unknown-unknown/release/fc_spike.wasm', {}))).instance.exports;
const enc = new TextEncoder(), dec = new TextDecoder();
const DIR = new URL('./err-tests/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const FRAMES = 6;

// The oracle: the JS core, stepped exactly like frames-run.mjs drives it.
export function jsErrors(src, frames = FRAMES) {
  const rt = new Runtime(); rt.reset(); __bindRT(rt);
  rt.exec(parse(src));
  for (let i = 1; i < frames; i++) __step();
  return rt.errors.slice();
}

// The shipped engine: parse_render + step_frame, then ask it what it reported.
export function wasmErrors(src, frames = FRAMES) {
  const b = enc.encode(src);
  new Uint8Array(w.memory.buffer, w.src_ptr(), b.length).set(b);
  w.parse_render(b.length, 0);
  for (let i = 1; i < frames; i++) w.step_frame();
  const n = w.errors_json();
  return JSON.parse(dec.decode(new Uint8Array(w.memory.buffer, w.res_ptr(), n)));
}

export function programs(dir = 'err-tests') {
  const root = new URL('./' + dir + '/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  return fs.readdirSync(root).filter(f => f.endsWith('.fc')).sort().map(f => ({ name: f, src: fs.readFileSync(root + f, 'utf8') }));
}
