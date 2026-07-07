#!/usr/bin/env node
// Generate a launcher thumbnail (examples/thumbs/<game>.png, 128x128) by running
// a game in a real headless browser and screenshotting the #screen canvas — the
// only faithful way to capture the CRT shader / pixel font / anti-aliasing.
//
// Loads the LOCAL single-file build via file://...?code=<base64> (no network, no
// fetch of examples/), so it screenshots exactly what ships. Per-game "recipes"
// below drive a little input so the shot shows real play, not a title screen.
//
// Needs playwright-core + a chromium binary. In this repo neither is a dep, so:
//   NODE_PATH=/tmp/pw2/node_modules node tools/gen-thumb.cjs <game> [<game> ...]
// (or `npm i -D playwright-core` and drop NODE_PATH). CHROME env overrides the
// browser path. With no game args it regenerates every recipe below.
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CHROME = process.env.CHROME || '/usr/bin/chromium';
const press = (key, times = 1, gap = 90) => ({ key, times, gap });
const wait = ms => ({ wait: ms });

// per-game input: click the canvas, then a few keystrokes so the trail/scene fills out
const RECIPES = {
  cycles: [wait(250), press('ArrowDown', 1), wait(450)],   // ride inward, one bend, still alive
  'pong-online': [wait(120), press('ArrowDown', 2), wait(380)],   // ball mid-flight, paddle nudged
  joust: [wait(100), press('Space', 2, 140), press('ArrowRight', 3, 90), wait(200)],   // bird aloft, mid-drift
  'bubble-pop': [wait(650)],   // several bubbles risen
  // generative "toy" demos — let the pattern develop before the shot
  life: [wait(2500)],
  matrix: [wait(1400)],
  langton: [wait(5000)],       // enough steps to show the growing region
  chaos: [wait(5000)],         // the Sierpinski triangle fills in
  starfield: [wait(1200)],
  sand: [wait(4000)],          // let the pile build up under the faucet
  // add more games here to (re)capture them with this tool
};

async function shoot(browser, game) {
  const src = fs.readFileSync(path.join(ROOT, 'examples', `${game}.fc`), 'utf8');
  const url = 'file://' + path.join(ROOT, 'index.html') + '?code=' + encodeURIComponent(Buffer.from(src, 'utf8').toString('base64'));
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(700);
  const cv = await page.$('#screen');
  if (!cv) throw new Error('no #screen canvas (check the index.html canvas id)');
  await cv.click().catch(() => {});
  for (const step of (RECIPES[game] || [wait(800)])) {
    if (step.wait) { await page.waitForTimeout(step.wait); continue; }
    for (let i = 0; i < step.times; i++) { await page.keyboard.press(step.key); await page.waitForTimeout(step.gap); }
  }
  const data = await page.evaluate(() => document.getElementById('screen').toDataURL('image/png'));
  const out = path.join(ROOT, 'examples', 'thumbs', `${game}.png`);
  fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
  await page.close();
  console.log(`captured ${out}`);
}

(async () => {
  const games = process.argv.slice(2);
  const list = games.length ? games : Object.keys(RECIPES);
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  try { for (const g of list) await shoot(browser, g); }
  finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
