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
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'spec', 'golden-shots');
const CHROME = process.env.CHROME || '/usr/bin/chromium';
const FRAMES = 24;          // step this many frames before capturing
const UPDATE = process.argv.includes('--update');

const INIT = `(() => {
  let s = 0x1234567 >>> 0;
  Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let cb = null;
  window.requestAnimationFrame = (f) => { cb = f; return 1; };
  window.cancelAnimationFrame = () => {};
  window.__fcStep = () => { const f = cb; cb = null; if (f) f(16.7); return !!f; };
})();`;

const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');

async function capture(browser, game) {
  const src = fs.readFileSync(path.join(ROOT, 'examples', `${game}.fc`), 'utf8');
  const url = 'file://' + path.join(ROOT, 'index.html') + '?code=' + encodeURIComponent(Buffer.from(src, 'utf8').toString('base64'));
  const page = await browser.newPage();
  await page.addInitScript(INIT);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction('typeof window.__fcStep === "function"');
  await page.waitForTimeout(150);
  // drive an exact number of frames, deterministically
  await page.evaluate((n) => { for (let i = 0; i < n; i++) window.__fcStep(); }, FRAMES);
  const data = await page.evaluate(() => document.getElementById('screen').toDataURL('image/png'));
  await page.close();
  return Buffer.from(data.split(',')[1], 'base64');
}

(async () => {
  if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
  const arg = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const games = (arg.length ? arg : fs.readdirSync(path.join(ROOT, 'examples')).filter(f => f.endsWith('.fc')).map(f => f.replace(/\.fc$/, ''))).sort();
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  let pass = 0, fail = 0, wrote = 0;
  try {
    for (const g of games) {
      const got = await capture(browser, g);
      const golden = path.join(SHOTS, `${g}.png`);
      if (UPDATE || !fs.existsSync(golden)) { fs.writeFileSync(golden, got); wrote++; console.log(`WROTE ${g}.png (${got.length}b)`); continue; }
      if (sha(got) === sha(fs.readFileSync(golden))) { pass++; console.log(`PASS  ${g}`); }
      else { fail++; const out = path.join(SHOTS, `${g}.actual.png`); fs.writeFileSync(out, got); console.log(`FAIL  ${g}  (render changed; wrote ${g}.actual.png)`); }
    }
  } finally { await browser.close(); }
  console.log(`\n${wrote ? `wrote ${wrote} golden(s); ` : ''}${pass}/${pass + fail} visual goldens match`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
