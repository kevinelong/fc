import fs from 'fs';
const w = (await WebAssembly.instantiate(fs.readFileSync('target/wasm32-unknown-unknown/release/fc_spike.wasm'),{})).instance.exports;
const enc=new TextEncoder(), dec=new TextDecoder();
const game = fs.readFileSync('/tmp/game.fc','utf8');
const b=enc.encode(game); new Uint8Array(w.memory.buffer,w.src_ptr(),b.length).set(b);
const memPages = () => w.memory.buffer.byteLength / 65536;
let n = w.parse_render(b.length, 0);
const p0 = memPages();
const FRAMES = 3000;
let lastLen = 0;
try {
  for (let i = 0; i < FRAMES; i++) {
    // simulate input: hold right
    w.set_key(3, 1);
    n = w.step_frame();
    lastLen = n;
    if (i === 100) var p100 = memPages();
  }
} catch (e) {
  console.log('TRAPPED at frame', '— ' + e.message); process.exit(1);
}
const pEnd = memPages();
// sanity: frame still produces a valid command buffer
const cmds = JSON.parse(dec.decode(new Uint8Array(w.memory.buffer, w.res_ptr(), lastLen)));
console.log(`survived ${FRAMES} frames; last frame ${cmds.length} cmds`);
console.log(`memory pages: start=${p0}  @100=${p100}  end=${pEnd}  (64KB each) — bounded:`, (pEnd - p100) <= 4);
