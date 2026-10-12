#!/usr/bin/env node
// a11y-check — the accessibility of the pages that are not the app.
//
// The app has shipped accessibility work with partial guards (ui-check asserts the dialog roles,
// the reduced-motion gate, and that high-contrast / larger-text actually change the page), but the
// pages around it — the command reference, the tutorial, the teacher pages, the projects, the
// privacy policy — had never been audited at all. They are the pages a teacher prints, a parent
// reads, and a search engine indexes.
//
// Two layers, because they fail differently:
//   1. axe-core (if installed; the repo stays dependency-free otherwise) over each page, failing on
//      serious/critical violations — the engine catches contrast, ARIA, landmark and form problems
//      that are easy to get wrong by eye.
//   2. a dependency-free structural pass — lang, one h1, no skipped heading levels, alt text on
//      images, labelled controls, discernible link text — which keeps working without axe.
//
// Needs Chrome (CHROME=... to override) and playwright-core; axe-core is optional (a SKIP is
// reported in the output, never silent).
//
//   node tools/a11y-check.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8097;
const require = createRequire(import.meta.url);
const { findChrome } = require('./chrome-path.cjs');
const CHROME = findChrome();
if (!CHROME) { console.error('No Chrome found — set CHROME=/path/to/chrome'); process.exit(2); }

let chromium = null, axeSource = null;
try { ({ chromium } = require('playwright-core')); } catch (_) {}
try { axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'); } catch (_) {}

const PAGES = ['docs/index.html', 'learn/index.html', 'teachers/index.html', 'teachers/cheatsheet.html', 'projects/index.html', 'privacy/index.html'];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.mp4': 'video/mp4' };

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  — ' + detail : ''}`); };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const p = path.join(ROOT, rel);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('nope'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  res.end(fs.readFileSync(p));
});
await new Promise(r => server.listen(PORT, r));

const structural = () => `(function(){
  const q = (s) => Array.prototype.slice.call(document.querySelectorAll(s));
  const levels = q('h1,h2,h3,h4,h5,h6').map(h => Number(h.tagName[1]));
  let skipped = null;
  for (let i = 1; i < levels.length; i++) if (levels[i] - levels[i - 1] > 1) skipped = levels[i - 1] + '→' + levels[i];
  const imgsNoAlt = q('img').filter(i => !i.hasAttribute('alt')).length;
  const controls = q('input,select,textarea').filter(c => {
    if (c.type === 'hidden') return false;
    if (c.getAttribute('aria-label') || c.getAttribute('aria-labelledby')) return false;
    if (c.id && document.querySelector('label[for="' + c.id + '"]')) return false;
    return !c.closest('label');
  }).length;
  const emptyLinks = q('a').filter(a => !a.textContent.trim() && !a.querySelector('img[alt]:not([alt=""])') && !a.getAttribute('aria-label')).length;
  const emptyButtons = q('button').filter(b => !b.textContent.trim() && !b.getAttribute('aria-label')).length;
  return { lang: document.documentElement.getAttribute('lang'), title: (document.title||'').trim(),
           h1: q('h1').length, skipped, imgsNoAlt, controls, emptyLinks, emptyButtons };
})()`;

try {
  if (!chromium) {
    check('playwright-core is available to drive Chrome', false, 'npm i playwright-core (repo root)');
  } else {
    const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu'] });
    for (const page of PAGES) {
      const tab = await browser.newPage();
      await tab.goto(`http://127.0.0.1:${PORT}/${page}`, { waitUntil: 'load' });
      await tab.waitForTimeout(400);

      const s = await tab.evaluate(structural());
      const where = page.split('/')[0] + (page.endsWith('cheatsheet.html') ? '/cheatsheet' : '');
      check(`${where}: html lang is set`, !!s.lang, JSON.stringify(s.lang));
      check(`${where}: has a title and exactly one h1`, !!s.title && s.h1 === 1, JSON.stringify({ title: s.title, h1: s.h1 }));
      check(`${where}: no skipped heading level`, !s.skipped, String(s.skipped));
      check(`${where}: every img has alt`, s.imgsNoAlt === 0, `${s.imgsNoAlt} missing`);
      check(`${where}: every control is labelled`, s.controls === 0, `${s.controls} unlabelled`);
      check(`${where}: links and buttons have discernible text`, s.emptyLinks === 0 && s.emptyButtons === 0, JSON.stringify({ emptyLinks: s.emptyLinks, emptyButtons: s.emptyButtons }));

      if (axeSource) {
        await tab.addScriptTag({ content: axeSource });
        const axe = await tab.evaluate(`(async () => {
          const r = await window.axe.run(document, { resultTypes: ['violations'] });
          return r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
            .map(v => v.impact + ' ' + v.id + ' x' + v.nodes.length + ' [' +
              v.nodes.slice(0, 3).map(n => (n.target || []).join(' ') + (n.any && n.any[0] && n.any[0].data ? ' (' + (n.any[0].data.fgColor || '') + ' on ' + (n.any[0].data.bgColor || '') + ')' : '')).join('; ') + ']');
        })()`);
        check(`${where}: axe finds no serious/critical violations`, axe.length === 0, axe.join(', '));
      }
      await tab.close();
    }
    await browser.close();
  }
} catch (e) {
  check('a11y-check ran without an exception', false, e && e.message);
} finally {
  server.close();
}

if (!axeSource) console.log('note: axe-core is not installed, so only the structural pass ran (npm i axe-core)');
const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} accessibility checks pass`);
process.exitCode = failed ? 1 : 0;
