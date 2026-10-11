#!/usr/bin/env node
// Visual golden screenshots — the one regression class the draw-command
// differentials structurally can't catch: changes in how index.html's RENDERER
// turns commands into PIXELS (font, palette, CRT shader, sprite blitting).
//
// The hard part is determinism: the browser uses unseeded Math.random and a
// wall-clock rAF loop, so naive captures differ run-to-run. We fix both via an
// init script (runs before page scripts): seed Math.random, and replace
// requestAnimationFrame with a CAPTURE-and-hold + window.__fcStep(), so we step
// an exact frame count — the same trick fc-core-record.mjs uses in node. Result:
// pixel-identical captures run-to-run, so any byte diff is a real render change.
//
// Goldens live in spec/golden-shots/<game>.png. First run (or --update) writes
// them; later runs compare sha256 (identical pixels => identical chromium PNG).
//   NODE_PATH=/tmp/pw2/node_modules node tools/visual-golden.cjs [--update] [game...]
// (or install it in the repo root: `npm i playwright-core` — .gitignore covers
// node_modules/package.json/package-lock.json, so the repo stays dependency-free)
const { chromium } = (() => {
  // playwright-core is intentionally not a committed dependency (the repo stays
  // install-free: `npm i playwright-core` in the repo root, or NODE_PATH=…). Say that
  // plainly and exit 2 (a *missing prerequisite*, distinct from exit 1 = pixel diff).
  try { return require('playwright-core'); }
  catch (e) {
    if (e && e.code === 'MODULE_NOT_FOUND') {
      console.error('playwright-core is not installed — the browser goldens need it:');
      console.error('  npm i playwright-core        (repo root; .gitignore keeps it out of git)');
      console.error('  or NODE_PATH=/path/to/node_modules node tools/visual-golden.cjs');
      process.exit(2);
    }
    throw e;
  }
})();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'spec', 'golden-shots');
const { findChrome } = require('./chrome-path.cjs');
const CHROME = findChrome();
if (!CHROME) {
  console.error('No Chrome found — set CHROME=/path/to/chrome');
  process.exit(2);
}
const FRAMES = 24;          // step this many frames before capturing
// Page load / engine boot budget. FC_GOLDEN_TIMEOUT overrides it (seconds -> ms).
const LOAD_TIMEOUT = Number(process.env.FC_GOLDEN_TIMEOUT || 90) * 1000;
const UPDATE = process.argv.includes('--update');

const INIT = `(() => {
  let s = 0x1234567 >>> 0;
  Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let cb = null;
  window.requestAnimationFrame = (f) => { cb = f; return 1; };
  window.cancelAnimationFrame = () => {};
  window.__fcStep = () => { const f = cb; cb = null; if (f) f(16.7); return !!f; };
  window.__fcHasFrame = () => !!cb;   // false until the engine has booted and scheduled a frame
})();`;

const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');

async function capture(browser, game) {
  const src = fs.readFileSync(path.join(ROOT, 'examples', `${game}.fc`), 'utf8');
  const url = 'file://' + path.join(ROOT, 'index.html') + '?code=' + encodeURIComponent(Buffer.from(src, 'utf8').toString('base64'));
  const page = await browser.newPage();
  await page.addInitScript(INIT);
  // Load and boot waits are generous on purpose: the app is one ~850 KB file with the wasm
  // inlined, and a loaded CI runner has produced a 5x-slower job (ui-check 255 s vs 50 s)
  // where Playwright's 30 s default surfaced as a timeout, not as a pixel diff.
  await page.goto(url, { waitUntil: 'load', timeout: LOAD_TIMEOUT });
  await page.waitForFunction('typeof window.__fcStep === "function"', null, { timeout: LOAD_TIMEOUT });
  // Wait until the engine has actually booted (the wasm loads asynchronously; stepping
  // before the first frame is scheduled silently drops those frames, which used to make
  // this tool produce machine-speed-dependent renders for any game that moves on its own).
  await page.waitForFunction('window.__fcHasFrame && window.__fcHasFrame()', null, { timeout: LOAD_TIMEOUT });
  // Settle BEFORE stepping and again before reading: the app boots asynchronously
  // (the wasm loads, then paints frame 1), so stepping or reading too early captured
  // whatever happened to be on the canvas — machine-speed-dependent renders. Both
  // delays are load-bearing: the goldens reproduce with either 400 or 700ms of settle.
  await page.waitForTimeout(400);
  // drive an exact number of frames, deterministically
  await page.evaluate((n) => { for (let i = 0; i < n; i++) window.__fcStep(); }, FRAMES);
  await page.waitForTimeout(75);
  // The PNG bytes are NOT a stable identity across Chrome builds (the encoder emits
  // different IDAT for identical pixels), so the comparison hashes the raw RGBA the
  // canvas holds. The golden is decoded in-page to the same raw form, so a golden
  // stays valid across encoder versions; PNGs are still written for humans.
  const goldenPath = path.join(SHOTS, `${game}.png`);
  const goldenB64 = (!UPDATE && fs.existsSync(goldenPath)) ? fs.readFileSync(goldenPath).toString('base64') : null;
  const res = await page.evaluate(async ({ golden }) => {
    const hash = async (bytes) => {
      const h = await crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
    };
    const c = document.getElementById('screen'), g = c.getContext('2d');
    const raw = g.getImageData(0, 0, c.width, c.height).data;
    const live = await hash(new Uint8Array(raw.buffer.slice(0)));
    let goldenHash = null;
    if (golden) {
      try {
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/png;base64,' + golden; });
        const dc = document.createElement('canvas'); dc.width = img.width; dc.height = img.height;
        const dg = dc.getContext('2d'); dg.drawImage(img, 0, 0);
        const d = dg.getImageData(0, 0, img.width, img.height).data;
        goldenHash = (img.width === c.width && img.height === c.height) ? await hash(new Uint8Array(d.buffer.slice(0))) : 'size-mismatch';
      } catch (_) { goldenHash = 'unreadable'; }
    }
    return { png: c.toDataURL('image/png'), live, goldenHash };
  }, { golden: goldenB64 });
  await page.close();
  return { png: Buffer.from(res.png.split(',')[1], 'base64'), live: res.live, goldenHash: res.goldenHash };
}

(async () => {
  if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
  const arg = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const games = (arg.length ? arg : fs.readdirSync(path.join(ROOT, 'examples')).filter(f => f.endsWith('.fc')).map(f => f.replace(/\.fc$/, ''))).sort();
  // `--disable-gpu` matters: GPU rasterization anti-aliases circles/lines differently
  // from Skia's software path (which is what produced these goldens), so without it
  // every game that draws a circle reports a false pixel diff.
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu', '--force-device-scale-factor=1'] });
  let pass = 0, fail = 0, wrote = 0;
  try {
    for (const g of games) {
      const got = await capture(browser, g);
      const golden = path.join(SHOTS, `${g}.png`);
      if (UPDATE || !fs.existsSync(golden)) { fs.writeFileSync(golden, got.png); wrote++; console.log(`WROTE ${g}.png (${got.png.length}b)`); continue; }
      if (got.goldenHash === got.live) { pass++; console.log(`PASS  ${g}`); }
      else { fail++; const out = path.join(SHOTS, `${g}.actual.png`); fs.writeFileSync(out, got.png); console.log(`FAIL  ${g}  (pixels changed [golden ${String(got.goldenHash).slice(0,10)}… vs live ${got.live.slice(0,10)}…]; wrote ${g}.actual.png)`); }
    }
  } finally { await browser.close(); }
  console.log(`\n${wrote ? `wrote ${wrote} golden(s); ` : ''}${pass}/${pass + fail} visual goldens match`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
