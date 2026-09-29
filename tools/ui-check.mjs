#!/usr/bin/env node
// UI checks for index.html in a real browser — the behaviours the headless
// node harnesses structurally cannot see: dialog accessibility (role/aria,
// Escape-to-close, focus trap + restore) and the live-inspect / step panel
// (pause, step N frames, variable values updating).
//
// Zero dependencies: drives Chrome over the DevTools protocol with node's
// built-in WebSocket + fetch (the repo has no bundled playwright; CHROME
// overrides the browser path, like tools/visual-golden.cjs).
//
//   node tools/ui-check.mjs [game]        (default: starfield)
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAME = process.argv[2] || 'starfield';
const PORT = 9222 + (process.pid % 200);
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-ui-'));
const CHROME = process.env.CHROME || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome',
].find(p => fs.existsSync(p));
if (!CHROME) { console.error('No Chrome found — set CHROME=/path/to/chrome'); process.exit(2); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  — ' + detail : ''}`); };

// ---- minimal CDP client -----------------------------------------------------
async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find(t => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch (_) {}
    await sleep(250);
  }
  throw new Error('chrome devtools endpoint never came up');
}
function client(url) {
  const ws = new WebSocket(url);
  const waiting = new Map(); let id = 0;
  const events = new Map();
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && waiting.has(msg.id)) { const { resolve, reject } = waiting.get(msg.id); waiting.delete(msg.id); msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result); }
    else if (msg.method && events.has(msg.method)) events.get(msg.method).forEach(f => f(msg.params));
  });
  const ready = new Promise((res, rej) => { ws.addEventListener('open', () => res()); ws.addEventListener('error', e => rej(new Error('ws error'))); });
  return {
    ready,
    send: (method, params) => new Promise((resolve, reject) => { const i = ++id; waiting.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); }),
    on: (method, fn) => { if (!events.has(method)) events.set(method, []); events.get(method).push(fn); },
    close: () => ws.close(),
  };
}

const evaluate = (cdp, expr) => cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }).then(r => {
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception && r.exceptionDetails.exception.description || 'evaluate threw');
  return r.result.value;
});

(async () => {
  const child = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=900,700',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });
  let cdp;
  try {
    cdp = client(await connect());
    await cdp.ready;
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    const loaded = new Promise(res => cdp.on('Page.loadEventFired', res));
    const src = fs.readFileSync(path.join(ROOT, 'examples', `${GAME}.fc`), 'utf8');
    const url = 'file://' + path.join(ROOT, 'index.html') + '?code=' + encodeURIComponent(Buffer.from(src, 'utf8').toString('base64'));
    await cdp.send('Page.navigate', { url });
    await loaded;
    await evaluate(cdp, 'new Promise(r => setTimeout(r, 400))');   // let the engines boot

    // ---- 1. every modal overlay is a labelled dialog --------------------------
    const dialogs = await evaluate(cdp, `(function(){
      var ids = ['help-overlay','code-overlay','settings-overlay','forge-overlay','signin-overlay','verify-overlay'];
      return ids.map(function(id){ var el = document.getElementById(id); return { id: id, found: !!el,
        role: el && el.getAttribute('role'), modal: el && el.getAttribute('aria-modal'), label: el && el.getAttribute('aria-label') }; });
    })()`);
    for (const d of dialogs) {
      check(`dialog ${d.id}: role=dialog + aria-modal + label`, d.found && d.role === 'dialog' && d.modal === 'true' && !!d.label, JSON.stringify(d));
    }

    // ---- 2. Escape closes the help overlay and restores focus -----------------
    // focus the trigger first, the way a keyboard user activates it
    await evaluate(cdp, `(function(){ var b = document.getElementById('tool-help'); b.focus(); b.click(); })()`);
    await sleep(120);
    const opened = await evaluate(cdp, `(function(){ var o = document.getElementById('help-overlay');
      return { open: getComputedStyle(o).display !== 'none', focusInside: o.contains(document.activeElement), active: document.activeElement && document.activeElement.id }; })()`);
    check('help opens and moves focus into the dialog', opened.open && opened.focusInside, JSON.stringify(opened));

    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await sleep(150);
    const closed = await evaluate(cdp, `(function(){ var o = document.getElementById('help-overlay');
      return { open: getComputedStyle(o).display !== 'none', active: document.activeElement && document.activeElement.id }; })()`);
    check('Escape closes the dialog', !closed.open, JSON.stringify(closed));
    check('focus returns to the button that opened it', closed.active === 'tool-help', JSON.stringify(closed));

    // ---- 3. Tab is trapped inside the dialog ---------------------------------
    const trapped = await evaluate(cdp, `(function(){
      document.getElementById('tool-help').click();
      var o = document.getElementById('help-overlay');
      var f = Array.prototype.filter.call(o.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]'),
        function(n){ return n.offsetParent !== null && n.getAttribute('tabindex') !== '-1'; });
      f[f.length - 1].focus();
      return { last: document.activeElement.id || document.activeElement.tagName, count: f.length };
    })()`);
    await sleep(80);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await sleep(60);
    const afterTab = await evaluate(cdp, `document.activeElement && (document.activeElement.id || document.activeElement.tagName)`);
    check('Tab at the last control wraps to the first', afterTab !== trapped.last, `last=${trapped.last} afterTab=${afterTab}`);
    await evaluate(cdp, `document.getElementById('help-close').click()`);
    await sleep(120);

    // ---- 4. live inspect: pause, step, variables change -----------------------
    const panels = await evaluate(cdp, `(function(){
      var t = Array.prototype.find.call(document.querySelectorAll('button'), function(b){ return /Inspect/.test(b.title || ''); });
      return { hasToggle: !!t };
    })()`);
    check('inspect toggle exists', panels.hasToggle, 'no 🔍 toggle button');

    const opened2 = await evaluate(cdp, `(function(){
      var t = Array.prototype.find.call(document.querySelectorAll('button'), function(b){ return /Inspect/.test(b.title || ''); });
      t.click();
      var pause0 = document.querySelector('button[title="Pause"]');
      var bar = pause0.parentElement, panel = bar.parentElement, tree = panel.lastElementChild;
      var step = bar.querySelector('button[title^="Step"]');
      return { rows: tree.children.length, text: tree.textContent.slice(0, 120), stepDisabled: step.disabled, label: bar.lastElementChild.textContent };
    })()`);
    check('panel shows variables while running', opened2.rows > 0, JSON.stringify(opened2));
    check('step is disabled until paused', opened2.stepDisabled === true, JSON.stringify(opened2));

    const stepped = await evaluate(cdp, `new Promise(function(res){
      var pause = document.querySelector('button[title="Pause"]');
      var bar = pause.parentElement, panel = bar.parentElement, tree = panel.lastElementChild;
      var step = bar.querySelector('button[title^="Step"]');
      pause.click();                                     // -> paused
      var before = tree.textContent;
      step.click(); step.click(); step.click();          // three explicit frames
      setTimeout(function(){ res({ before: before, after: tree.textContent, label: bar.lastElementChild.textContent,
                                   stepEnabled: !step.disabled, rows: tree.children.length }); }, 150);
    })`);
    check('pausing reports "paused" and enables step', stepped.label === 'paused' && stepped.stepEnabled, JSON.stringify({ label: stepped.label, stepEnabled: stepped.stepEnabled }));
    check('stepping changes a variable in the panel', stepped.before !== stepped.after, `panel text identical after 3 steps (rows=${stepped.rows})`);
    check('panel stays paused with rows after stepping', stepped.rows > 0, JSON.stringify({ rows: stepped.rows, label: stepped.label }));
  } catch (e) {
    check('ui-check ran without an exception', false, e && e.message);
  } finally {
    try { cdp && cdp.close(); } catch (_) {}
    child.kill();
    await sleep(150);
    try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (_) {}
  }
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} UI checks pass`);
  process.exit(failed ? 1 : 0);
})();
