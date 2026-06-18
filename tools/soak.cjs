#!/usr/bin/env node
// Browser soak — run a game's REAL requestAnimationFrame loop in chromium for a
// while and sample the JS heap, to catch leaks the headless frame-soak can't (it
// reuses one wasm instance and never exercises the browser's rAF / GC / canvas
// churn). Forces GC before each sample (precise heap), reports growth, and flags
// sustained growth as a possible leak.
//   NODE_PATH=/tmp/pw2/node_modules node tools/soak.cjs [ms] [game...]
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CHROME = process.env.CHROME || '/usr/bin/chromium';
const args = process.argv.slice(2);
const MS = Number(args.find(a => /^\d+$/.test(a))) || 15000;
const GAMES = args.filter(a => !/^\d+$/.test(a));
const SAMPLE = 1500;

async function soak(browser, game) {
  const src = fs.readFileSync(path.join(ROOT, 'examples', `${game}.fc`), 'utf8');
  const url = 'file://' + path.join(ROOT, 'index.html') + '?code=' + encodeURIComponent(Buffer.from(src, 'utf8').toString('base64'));
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.evaluate(() => document.getElementById('screen') && document.getElementById('screen').click());
  const sample = async () => page.evaluate(() => { if (window.gc) window.gc(); return (performance.memory && performance.memory.usedJSHeapSize) || 0; });
  const samples = [];
  const t0 = Date.now();
  let first = await sample();
  samples.push(first);
  while (Date.now() - t0 < MS) { await page.waitForTimeout(SAMPLE); samples.push(await sample()); }
  await page.close();
  const kb = b => Math.round(b / 1024);
  const init = samples[0], last = samples[samples.length - 1], peak = Math.max(...samples);
  const growth = init ? ((last - init) / init * 100) : 0;
  // leak heuristic: post-GC heap ends >35% above the first post-GC sample
  const leaky = init > 0 && growth > 35;
  return { game, init, last, peak, growth, leaky, errors, kb };
}

(async () => {
  const list = (GAMES.length ? GAMES : ['cycles', 'space-invaders', 'coin-quest']);
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  let bad = 0;
  try {
    for (const g of list) {
      const r = await soak(browser, g);
      const tag = r.errors.length ? 'ERROR' : r.leaky ? 'LEAK?' : 'OK';
      if (r.errors.length || r.leaky) bad++;
      console.log(`${tag.padEnd(6)} ${g.padEnd(16)} heap ${r.kb(r.init)}KB -> ${r.kb(r.last)}KB (peak ${r.kb(r.peak)}KB, ${r.growth >= 0 ? '+' : ''}${r.growth.toFixed(0)}%)${r.errors.length ? '  ' + r.errors[0] : ''}`);
    }
  } finally { await browser.close(); }
  console.log(`\nsoak ${Math.round(MS / 1000)}s/game · ${list.length - bad}/${list.length} clean`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
