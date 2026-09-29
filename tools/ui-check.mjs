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
    // record timer creation/clearing before any page script runs (proves the music
    // loop is really stopped by `stop music`)
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
      window.__io = { set: [], clear: [] };
      const si = window.setInterval, ci = window.clearInterval;
      window.setInterval = function () { const id = si.apply(this, arguments); window.__io.set.push(id); return id; };
      window.clearInterval = function (id) { window.__io.clear.push(id); return ci.apply(this, arguments); };
    })();` });
    const loaded = new Promise(res => cdp.on('Page.loadEventFired', res));
    const src = fs.readFileSync(path.join(ROOT, 'examples', `${GAME}.fc`), 'utf8');
    const loadSource = async (source, query) => {
      await cdp.send('Page.navigate', { url: 'file://' + path.join(ROOT, 'index.html') + '?code=' + encodeURIComponent(Buffer.from(source, 'utf8').toString('base64')) + (query || '') });
      await sleep(900);
    };
    await loadSource(src);
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

    // ---- 5. `say` renders in script mode on BOTH engines ---------------------
    // (regression: the wasm core had no `say` at all, so a beginner's first
    // program — just `say "hello"` — drew nothing on the default engine)
    const countPixels = () => evaluate(cdp, `(function(){
      var c = document.getElementById('screen'), g = c.getContext('2d');
      var d = g.getImageData(0, 0, 128, 128).data, n = 0;
      for (var i = 0; i < d.length; i += 4) if (d[i] > 8 || d[i+1] > 8 || d[i+2] > 8) n++;
      return n;
    })()`);
    const saySrc = 'say "hello there"\nscore is 42\n';
    await loadSource(saySrc);
    const wasmPixels = await countPixels();
    await loadSource(saySrc, '&core=js');
    const jsPixels = await countPixels();
    check('say paints on the default (wasm) engine', wasmPixels > 0, `${wasmPixels} non-black pixels`);
    check('say paints identically on the JS core', wasmPixels > 0 && wasmPixels === jsPixels, `wasm=${wasmPixels} js=${jsPixels}`);
    // a game must NOT get say lines painted over it
    await loadSource('say "no"\nto draw\n  clear screen to black\n  draw rect at 0, 0 size 40, 40 in blue\nrun game with update and draw\n');
    const gamePixels = await countPixels();
    check('a game ignores say lines (no overlay)', gamePixels === 40 * 40, `${gamePixels} non-black pixels`);

    // ---- 6. the Phase 3 floor: something that runs, never a dead end --------
    // (a program that parses to nothing must OFFER a runnable starter, not just
    // sit there — the floor of the "type English, it always runs" promise)
    await loadSource('make a dragon eat coins\nplease be funky\n');
    await evaluate(cdp, `(function(){ var b = document.getElementById('tool-run'); if (b) b.click(); })()`);
    await sleep(900);
    const floor = await evaluate(cdp, `(function(){
      var bar = document.querySelector('.fc-floor');
      if (!bar) return { found: false, errorText: (document.getElementById('errors') || {}).textContent };
      var btns = bar.querySelectorAll('button');
      return { found: true, options: btns.length - 1, text: bar.textContent.slice(0, 90) };
    })()`);
    check('a dead-end program offers the runnable floor', floor.found === true, JSON.stringify(floor));
    check('the floor offers two directions (A/B)', floor.options === 2, JSON.stringify(floor));
    const picked = await evaluate(cdp, `new Promise(function(res){
      var bar = document.querySelector('.fc-floor');
      var a = bar.querySelectorAll('button')[0];
      a.click();
      setTimeout(function(){
        var ed = document.querySelector('textarea');
        res({ editorStart: (ed ? ed.value : '').slice(0, 24) });
      }, 600);
    })`);
    check('picking a starter loads it into the editor', picked.editorStart.startsWith('-- What you wrote'), JSON.stringify(picked));
    const afterStarter = await countPixels();
    check('the picked starter actually draws', afterStarter > 0, `${afterStarter} non-black pixels`);

    // ---- 7. safety-net telemetry is recorded locally and shown in Settings ---
    await loadSource('clera screen to gren\nscore is 0\n');
    await evaluate(cdp, `(function(){ var b = document.getElementById('tool-run'); if (b) b.click(); })()`);
    await sleep(700);
    const stats = await evaluate(cdp, `(function(){ return typeof window.FC_NET_STATS === 'function' ? window.FC_NET_STATS() : null; })()`);
    check('net stats exist and record the run', !!stats && stats.runs > 0, JSON.stringify(stats));
    check('net stats record the offered heal', !!stats && Object.keys(stats.offered || {}).length > 0, JSON.stringify(stats && stats.offered));
    await evaluate(cdp, `(function(){ var b = document.getElementById('tool-settings'); if (b) b.click(); })()`);
    await sleep(250);
    const shown = await evaluate(cdp, `(function(){ var s = document.getElementById('net-stats-body'); return s ? s.textContent : null; })()`);
    check('Settings shows the safety-net log summary', !!shown && /runs \d/.test(shown), JSON.stringify(shown));

    // ---- 8. describe → generate → offered (never applied on its own) ---------
    // The endpoint ships dark (503 without a key); this stubs it to prove the
    // client path, the CSRF header, the offered banner, and the offer→apply tap.
    const canned = 'to draw\n  clear screen to black\n  draw rect at 10, 10 size 20, 20 in red\nrun game with update and draw\n';
    await evaluate(cdp, `(function(){
      window.__genCalls = [];
      window.fetch = function (url, opts) {
        if (String(url).indexOf('/api/generate') === 0) {
          window.__genCalls.push({ body: opts && opts.body, headers: opts && opts.headers });
          var payload = window.__genPayload || { ok: true, code: ${JSON.stringify(canned)}, attempts: 2 };
          return Promise.resolve({ status: window.__genStatus || 200, json: function () { return Promise.resolve(payload); } });
        }
        return Promise.reject(new Error('blocked in test'));
      };
    })()`);
    await evaluate(cdp, `(function(){ document.getElementById('tool-describe').click();
      var i = document.querySelector('.fc-describe input'); i.value = 'a red square';
      document.querySelector('.fc-describe button').click(); })()`);
    await sleep(400);
    const gen = await evaluate(cdp, `(function(){
      var b = document.querySelector('.fc-generated');
      return { found: !!b, text: b ? b.textContent.slice(0, 70) : null, calls: (window.__genCalls || []).length, body: (window.__genCalls || [])[0] && window.__genCalls[0].body, csrf: (window.__genCalls || [])[0] && window.__genCalls[0].headers && window.__genCalls[0].headers['X-CO'] };
    })()`);
    check('describe POSTs to /api/generate', gen.calls === 1, JSON.stringify(gen));
    check('the request carries the prompt + CSRF header', /a red square/.test(String(gen.body)) && gen.csrf === '1', JSON.stringify({ body: gen.body, csrf: gen.csrf }));
    check('the generated code is OFFERED, not applied', gen.found === true, JSON.stringify(gen));
    const applied = await evaluate(cdp, `new Promise(function(res){
      var b = document.querySelector('.fc-generated button');
      b.click();
      setTimeout(function(){ res({ editor: document.querySelector('textarea').value.slice(0, 30) }); }, 500);
    })`);
    check('tapping "use it & run" loads the code into the editor', applied.editor.startsWith('to draw'), JSON.stringify(applied));
    check('the generated game draws', (await countPixels()) === 400, `${await countPixels()} non-black pixels`);
    // dark endpoint: the client must say so in plain English
    await evaluate(cdp, `(function(){ window.__genStatus = 503; window.__genPayload = { error: 'generate is not enabled' };
      document.getElementById('tool-describe').click();
      var i = document.querySelector('.fc-describe input'); i.value = 'anything';
      document.querySelector('.fc-describe button').click(); })()`);
    await sleep(400);
    const dark = await evaluate(cdp, `(function(){ var s = document.querySelector('.fc-describe-status'); return s ? s.textContent : null; })()`);
    check('a dark endpoint explains itself', /not enabled/.test(String(dark)), JSON.stringify(dark));

    // ---- 9. `stop music` really stops the track (both engines) --------------
    // Regression: the generic `stop X` (sprite) parse shadowed `stop music` in the
    // JS parser, so the documented verb did nothing anywhere — the wasm had no
    // stop node at all.
    const musicSrc = 'time limit is 1 seconds\nwhen time runs out\n  stop music\nplay music "theme"\nto update\n  tick is 1\nto draw\n  clear screen to black\nrun game with update and draw\n';
    const musicCheck = async (query, label) => {
      await loadSource(musicSrc, query);
      await sleep(2200);
      return evaluate(cdp, `(function(){
        var set = window.__io ? window.__io.set : [], clear = window.__io ? window.__io.clear : [];
        return { started: set.length, stopped: clear.filter(function (id) { return set.indexOf(id) !== -1; }).length };
      })()`);
    };
    const mWasm = await musicCheck('', 'wasm');
    check('stop music stops the music loop (default wasm engine)', mWasm.started > 0 && mWasm.stopped > 0, JSON.stringify(mWasm));
    const mJs = await musicCheck('&core=js', 'js');
    check('stop music stops the music loop (JS core)', mJs.started > 0 && mJs.stopped > 0, JSON.stringify(mJs));
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
