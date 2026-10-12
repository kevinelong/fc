// visual-golden — PIXEL regression harness for the fc engine.
//
// examples-diff proves JS===wasm at the DRAW-COMMAND level; it can't see
// presentation changes that keep the same ops but paint different PIXELS (the
// CVD palette remap, a resolveColor bug, the bitmap font). This harness closes
// that gap: it captures the ACTUAL rendered 128x128 canvas pixels
// deterministically, hashes them (SHA-256 of RGBA bytes), pins the hashes, and
// diffs on change.
//
// How it works (mirrors the *-diff.mjs style: plain `node`, no deps, committed
// golden JSON, exit non-zero on drift, one-line summary):
//   1. In Node, run EVERY examples/*.fc through fc-core-record.mjs the same
//      deterministic way examples-diff does (seed 0 mulberry32, 30 idle frames),
//      collecting the real drawing code's per-frame ops. Write them to the
//      transient _vg-ops.json.
//   2. Serve the repo root with `python3 -m http.server` and load
//      visual-golden.html headless in chromium (--headless=new --dump-dom). The
//      page REPLAYS the ops onto a genuine <canvas> (real pixels: shapes + the
//      3x5 bitmap font + resolved colors), hashes each example's RGBA bytes, and
//      writes {name: hash} into its <title>/#result.
//   3. Scrape the hashes and diff vs visual-golden.json.
//
// Usage:
//   node visual-golden.mjs            # check; exit 1 on drift (per-example diff)
//   node visual-golden.mjs --update   # (re)generate visual-golden.json
//   node visual-golden.mjs --cvd      # render with the CVD palette forced ON
//                                     # (proves the harness catches a pixel change)
// To eyeball pixels, open spec/port/spike/visual-golden.html in a browser after a
// run (the transient _vg-ops.js it reads is left in place, gitignored).
import fs from 'fs'; import path from 'path'; import net from 'net';
import { spawn, spawnSync } from 'child_process';
import { createRequire } from 'module';
import { parse, Runtime, __CMDS, __step, __bindRT } from './fc-core-record.mjs';

const HERE = import.meta.dirname;
const REPO = path.resolve(HERE, '..', '..', '..');
const EXDIR = path.join(REPO, 'examples');
const OPS_FILE = path.join(HERE, '_vg-ops.js');
const GOLDEN = path.join(HERE, 'visual-golden.json');
const HTML_REL = 'spec/port/spike/visual-golden.html';
const N = 30;                                   // idle frames — same as examples-diff
const DRAW = new Set(['rect', 'circle', 'line', 'text']);
// Same finder as the other harnesses (CHROME/CHROMIUM env wins), so the browser path lives in
// one place and this tool can run on CI, whose Chrome is /usr/bin/google-chrome, not chromium.
const { findChrome } = createRequire(import.meta.url)('../../../tools/chrome-path.cjs');
const CHROMIUM = process.env.CHROMIUM || findChrome();
if (!CHROMIUM) { console.error('No Chrome/Chromium found — set CHROME=/path/to/chrome'); process.exit(2); }

const argv = process.argv.slice(2);
const UPDATE = argv.includes('--update');
const CVD = argv.includes('--cvd');

// mulberry32 seeded RNG — identical to examples-diff / run-node.
const mulberry32 = a => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const keep = c => ({ op: c.op, color: c.color, x: c.x, y: c.y, w: c.w, h: c.h, r: c.r, x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2, text: c.text });
const drawOnly = arr => arr.filter(c => DRAW.has(c.op)).map(keep);

// Collect deterministic per-frame draw ops for one example (mirror examples-diff JS side).
function collect(src) {
  Math.random = mulberry32(0);
  __CMDS.length = 0; const rt = new Runtime(); rt.reset(); __bindRT(rt); rt.exec(parse(src));
  const frames = [drawOnly(__CMDS)];
  for (let i = 1; i < N; i++) { __CMDS.length = 0; __step(); frames.push(drawOnly(__CMDS)); }
  return frames;
}

const examples = fs.readdirSync(EXDIR).filter(f => f.endsWith('.fc')).sort();
const ops = {};
for (const f of examples) {
  const name = f.replace(/\.fc$/, '');
  try { ops[name] = { frames: collect(fs.readFileSync(path.join(EXDIR, f), 'utf8')) }; }
  catch (e) { ops[name] = { error: String(e && e.message || e) }; }
}
fs.writeFileSync(OPS_FILE, 'window.__VG_OPS=' + JSON.stringify(ops) + ';');

// --- serve repo root with `python3 -m http.server`, drive chromium, scrape {name: hash} ---
function freePort() {
  return new Promise(resolve => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}
function waitUp(port, tries = 60) {
  return new Promise((resolve, reject) => {
    const tick = () => {
      const s = net.connect(port, '127.0.0.1');
      s.once('connect', () => { s.destroy(); resolve(); });
      s.once('error', () => { s.destroy(); if (--tries <= 0) reject(new Error('server never came up')); else setTimeout(tick, 100); });
    };
    tick();
  });
}

function chromiumHashes(port) {
  const url = `http://127.0.0.1:${port}/${HTML_REL}?cvd=${CVD ? 1 : 0}`;
  const r = spawnSync(CHROMIUM, [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    '--virtual-time-budget=15000', '--dump-dom', url,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const dom = r.stdout || '';
  const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/);
  if (!m) throw new Error('no #result in DOM; chromium stderr: ' + (r.stderr || '').slice(0, 400));
  const body = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
  if (body === 'pending') throw new Error('page did not finish (still "pending") — try a larger virtual-time-budget');
  if (body.startsWith('HARNESS_ERROR')) throw new Error(body);
  return JSON.parse(body);
}

const port = await freePort();
const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'],
  { cwd: REPO, stdio: 'ignore' });
let hashes;
try { await waitUp(port); hashes = chromiumHashes(port); }
finally { srv.kill('SIGKILL'); }

const rendered = Object.keys(hashes);
const failed = examples.map(f => f.replace(/\.fc$/, '')).filter(n => !hashes[n] || String(hashes[n]).startsWith('ERROR'));

if (UPDATE) {
  fs.writeFileSync(GOLDEN, JSON.stringify(hashes, null, 2) + '\n');
  console.log(`wrote ${rendered.length} pixel goldens -> ${path.relative(REPO, GOLDEN)}${CVD ? ' (CVD ON)' : ''}`);
  for (const n of failed) console.log(`  WARN  ${n}: ${hashes[n]}`);
  process.exit(0);
}

if (!fs.existsSync(GOLDEN)) { console.error('no visual-golden.json — run `node visual-golden.mjs --update` first'); process.exit(1); }
const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
let ok = 0, bad = 0; const lines = [];
for (const n of examples.map(f => f.replace(/\.fc$/, ''))) {
  const g = golden[n], h = hashes[n];
  if (h === undefined) { bad++; lines.push(`MISS  ${n.padEnd(16)} not rendered`); continue; }
  if (String(h).startsWith('ERROR')) { bad++; lines.push(`ERR   ${n.padEnd(16)} ${h}`); continue; }
  if (g === undefined) { bad++; lines.push(`NEW   ${n.padEnd(16)} ${h.slice(0, 12)} (no golden)`); continue; }
  if (g === h) { ok++; lines.push(`PASS  ${n.padEnd(16)} ${h.slice(0, 12)}`); }
  else { bad++; lines.push(`DIFF  ${n.padEnd(16)} golden ${g.slice(0, 12)} != now ${h.slice(0, 12)}`); }
}
console.log(lines.join('\n'));
console.log(`\n${ok}/${ok + bad} examples pixel-identical (real 128x128 canvas · SHA-256 RGBA · ${N} frames · seed 0 · idle${CVD ? ' · CVD ON' : ''})`);
process.exit(bad === 0 ? 0 : 1);
