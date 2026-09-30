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
      window.__osc = 0;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) { const co = AC.prototype.createOscillator; AC.prototype.createOscillator = function () { window.__osc++; return co.apply(this, arguments); }; }
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
      var ids = ['help-overlay','code-overlay','settings-overlay','forge-overlay','signin-overlay','verify-overlay','class-overlay'];
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

    // ---- 10. first-run blip: one tiny sound, once per session --------------
    await evaluate(cdp, `(function(){ try { sessionStorage.removeItem('fc:first-run-blip'); } catch (_) {} return 1; })()`);
    await loadSource('to update\n  tick is 1\nto draw\n  clear screen to black\n  draw rect at 10, 10 size 20, 20 in blue\nrun game with update and draw\n');
    await evaluate(cdp, `(function(){ document.getElementById('tool-run').click(); })()`);
    await sleep(700);
    const blip1 = await evaluate(cdp, `(function(){ return { osc: window.__osc, flag: sessionStorage.getItem('fc:first-run-blip'), playing: document.body.classList.contains('playing') }; })()`);
    await evaluate(cdp, `(function(){ document.getElementById('tool-run').click(); })()`);
    await sleep(500);
    const blip2 = await evaluate(cdp, `(function(){ return { osc: window.__osc }; })()`);
    check('the first game run plays one blip', blip1.playing === true && blip1.flag === '1' && blip1.osc >= 1, JSON.stringify(blip1));
    check('the blip is once per session (a re-run adds none)', blip2.osc === blip1.osc, JSON.stringify({ first: blip1.osc, second: blip2.osc }));

    // ---- 11. `flash screen` / `shake camera`: rendered, and gated by a11y -----
    const fxSrc = 'mode is "play"\ntime limit is 6 frames\nwhen time runs out\n  flash screen red for 90 frames\n  shake camera for 90 frames by 4 pixels\nto update\n  tick is 1\nto draw\n  clear screen to dark blue\nrun game with update and draw\n';
    const fxSample = () => evaluate(cdp, `(function(){
      var c = document.getElementById('screen'), g = c.getContext('2d');
      var d = g.getImageData(64, 64, 1, 1).data;
      var f = document.getElementById('screen-frame');
      return { red: (d[0] > 200 && d[1] < 60 && d[2] < 100), transform: f.style.transform || '' };
    })()`);
    const fxRun = async (reduce, query) => {
      await evaluate(cdp, "localStorage.setItem('fc:save:a11y:reduce-motion', '" + String(reduce) + "')");
      await loadSource(fxSrc, query);
      let red = 0, shaken = 0, firstRed = -1, px0 = null;
      for (let i = 0; i < 25; i++) {
        const s = await fxSample();
        if (px0 === null) px0 = s.px;
        if (s.red) { red++; if (firstRed < 0) firstRed = i; }
        if (s.transform) shaken++;
        await sleep(100);
      }
      const dbg = await evaluate(cdp, `(function(){
        var r = (typeof runtime !== 'undefined' && runtime) ? runtime : null;
        var c = document.getElementById('screen'), g = c.getContext('2d');
        var d = g.getImageData(64, 64, 1, 1).data;
        var ed = document.querySelector('textarea');
        var badge = document.getElementById('wasm-badge');
        return { cls: document.body.className, flashFrames: r ? r.flashFrames : 'n/a',
                 px: d[0] + ',' + d[1] + ',' + d[2],
                 src: ed ? ed.value.slice(0, 26).split(String.fromCharCode(10)).join('|') : 'no-editor',
                 core: badge ? badge.textContent : 'no-badge' };
      })()`);
      return { red, shaken, firstRed, px0, dbg };
    };
    const fxOn = await fxRun(false, '');
    check('flash paints the screen (motion allowed)', fxOn.red > 0, JSON.stringify(fxOn));
    check('shake moves the frame (motion allowed)', fxOn.shaken > 0, JSON.stringify(fxOn));
    const fxOff = await fxRun(true, '');
    check('reduced motion suppresses flash AND shake', fxOff.red === 0 && fxOff.shaken === 0, JSON.stringify(fxOff));
    await evaluate(cdp, `localStorage.setItem('fc:save:a11y:reduce-motion', 'false')`);

    // ---- 12. talking works through the APP's input plumbing ------------------
    // The engine-level test lives in frame-tests/f_talk.fc; this one proves the page
    // routes the space key into the wasm core, shows the dialog box, and that the
    // engine (not the game) draws it.
    const talkSrc = 'player is {x: 40, y: 40}\nwizard is {x: 44, y: 40}\nwizard are talkers\nwhen player talks to "wizard"\n  show dialog "Hello, traveler!" at 2, 92\nto update\n  tick is 1\nto draw\n  clear screen to dark blue\n  draw sprite player at player.x, player.y\nrun game with update and draw\n';
    await loadSource(talkSrc, '&gamepad');
    const boxPixel = () => evaluate(cdp, `(function(){
      var c = document.getElementById('screen'), d = c.getContext('2d').getImageData(10, 100, 1, 1).data;
      return d[0] + ',' + d[1] + ',' + d[2];
    })()`);
    const before = await boxPixel();
    // press the on-screen A button (data-gp-key="space") — the same pressKey path the
    // keyboard uses, and the pad is what mobile players actually touch
    await evaluate(cdp, `(function(){
      var b = document.querySelector('#gamepad .gp-btn[data-gp-key="space"]');
      if (!b) return 'no-button';
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
      return 'pressed';
    })()`);
    await sleep(250);
    const during = await boxPixel();
    await evaluate(cdp, `(function(){
      var b = document.querySelector('#gamepad .gp-btn[data-gp-key="space"]');
      b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
      return 1;
    })()`);
    await sleep(200);
    const after = await boxPixel();
    check('the talk key opens the dialog box (app input path)', during === '255,241,232', `before=${before} during=${during}`);
    check('the box persists while the dialog is set', after === '255,241,232', JSON.stringify({ during, after }));

    // ---- 13. true subpixel mode (opt-in) -------------------------------------
    // Off by default (the goldens capture #screen, which must stay untouched);
    // switched on it renders real R/G/B stripes from the picture's own colours.
    await loadSource('to draw\n  clear screen to white\n  draw rect at 0, 0 size 128, 128 in white\nrun game with update and draw\n');
    const subState = () => evaluate(cdp, `(function(){
      var d = document.getElementById('display'), scr = document.getElementById('screen');
      var on = !!d && getComputedStyle(d).display !== 'none';
      var stripes = null, srcPx = null, cost = null;
      var sd = scr.getContext('2d').getImageData(10, 10, 1, 1).data;
      srcPx = sd[0] + ',' + sd[1] + ',' + sd[2];
      if (on) {
        var g = d.getContext('2d');
        var px = [];
        for (var i = 0; i < 3; i++) { var p = g.getImageData(30 + i, 30, 1, 1).data; px.push(p[0] + '/' + p[1] + '/' + p[2]); }
        stripes = px;
        var t0 = performance.now();
        for (var k = 0; k < 60; k++) window.FC_SUBPIXEL.frame();
        cost = (performance.now() - t0) / 60;
      }
      return { on: on, stripes: stripes, srcPx: srcPx, costMs: cost, body: document.body.className };
    })()`);
    const subOff = await subState();
    check('subpixel is off by default', subOff.on === false, JSON.stringify(subOff));
    // flip it from the settings panel, the way a user does
    const panelToggle = await evaluate(cdp, `(function(){
      document.getElementById('tool-settings').click();
      var sw = Array.prototype.find.call(document.querySelectorAll('#settings-list button[role="switch"]'),
        function(b){ return /subpixel/i.test(b.getAttribute('aria-label') || ''); });
      if (!sw) return 'missing-row';
      sw.click();
      return sw.getAttribute('aria-checked');
    })()`);
    check('the settings panel has a subpixel switch that turns it on', panelToggle === 'true', JSON.stringify(panelToggle));
    await sleep(300);
    const subOn = await subState();
    check('enabling shows the stripe display canvas', subOn.on === true, JSON.stringify(subOn));
    check('sub-stripes are per-channel (R,G,B dominant)',
      !!subOn.stripes && subOn.stripes[0].split('/')[0] > 200 && subOn.stripes[0].split('/')[1] < 160
      && subOn.stripes[1].split('/')[1] > 200 && subOn.stripes[1].split('/')[0] < 160
      && subOn.stripes[2].split('/')[2] > 200 && subOn.stripes[2].split('/')[0] < 160,
      JSON.stringify(subOn.stripes));
    check('the source canvas the goldens capture is unchanged', subOn.srcPx === '255,241,232', JSON.stringify({ srcPx: subOn.srcPx }));
    // taps must still reach the SOURCE canvas (the display is pointer-events: none)
    await loadSource('hits is 0\nwhen mouse is clicked\n  hits is hits + 1\nto update\n  tick is 1\nto draw\n  clear screen to black\n  write "hits {hits}" at 2, 2 in white on hud\nrun game with update and draw\n');
    await evaluate(cdp, `(function(){ window.STORE.set('a11y:subpixel', true); a11yApply(); return 1; })()`);
    await sleep(300);
    const tapRect = await evaluate(cdp, `(function(){ var r = document.getElementById('screen').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: tapRect.x, y: tapRect.y, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tapRect.x, y: tapRect.y, button: 'left', clickCount: 1 });
    await sleep(300);
    const tapped = await evaluate(cdp, `(function(){
      var c = document.getElementById('screen'), g = c.getContext('2d');
      var d = g.getImageData(2, 2, 40, 8).data, lit = 0;
      for (var i = 0; i < d.length; i += 4) if (d[i] > 200) lit++;
      return { lit: lit, on: getComputedStyle(document.getElementById('display')).display !== 'none' };
    })()`);
    check('taps pass through the display canvas to the engine', tapped.on === true && tapped.lit > 0, JSON.stringify(tapped));
    console.log(`      · subpixel post-process: ${subOn.costMs.toFixed(2)} ms/frame (128x128 -> 384x384)`);
    await evaluate(cdp, `(function(){ window.STORE ? window.STORE.set('a11y:subpixel', false) : localStorage.removeItem('fc:save:a11y:subpixel'); return 1; })()`);
    await evaluate(cdp, `a11yApply()`);
    await evaluate(cdp, `(function(){ var c = document.getElementById('settings-close'); if (c) c.click(); return 1; })()`);
    // ---- 14. the real-code panel offers four languages, each truly different --
    // The panel is the "see it in a language professionals use" mirror; Lua and
    // GDScript (LÖVE2D/PICO-8 and Godot) are the ones kids meet next.
    await loadSource(src);
    const offered = await evaluate(cdp, `(function(){
      document.getElementById('tool-code').click();
      return Array.prototype.map.call(document.querySelectorAll('#code-overlay .code-lang'),
        function(b){ return b.getAttribute('data-lang'); });
    })()`);
    check('the code panel offers python, js, lua and gdscript',
      ['python','js','lua','gdscript'].every(l => offered.indexOf(l) !== -1), JSON.stringify(offered));

    const panes = {};
    for (const lang of ['python','js','lua','gdscript']) {
      const r = await evaluate(cdp, `(function(){
        var b = document.querySelector('#code-overlay .code-lang[data-lang="${lang}"]');
        b.click();
        var run = document.getElementById('code-run'), dl = document.getElementById('code-download');
        return { code: document.getElementById('code-out').textContent,
                 run: run ? run.style.display !== 'none' : false,
                 dl: dl ? dl.style.display !== 'none' : false };
      })()`);
      panes[lang] = r;
      check(`${lang}: the panel renders that language`, !!r.code && r.code.length > 40, r.code.slice(0, 60));
    }
    const SHAPE = {
      python:   [/^# /m, /\bdef \w+\([^)]*\):/, /\bfor \w+ in range\(/],
      js:       [/^(let|const) /m, /\bfunction \w+\([^)]*\) \{/, /\bMath\.random\(/],
      lua:      [/^-- /m, /\bfunction \w+\([^)]*\)/, /\bthen\b/, /\bend\b/, /\bmath\.random\(/],
      gdscript: [/^# /m, /\bfunc \w+\([^)]*\):/, /\brandi_range\(/],
    };
    for (const lang of Object.keys(SHAPE)) {
      const miss = SHAPE[lang].filter(re => !re.test(panes[lang].code));
      check(`${lang}: output has ${lang}'s shape`, miss.length === 0, miss.map(String).join(' '));
    }
    const codes = ['python','js','lua','gdscript'].map(l => panes[l].code);
    check('the four languages really differ', new Set(codes).size === 4, `distinct=${new Set(codes).size}`);
    check('run/download appear only for the runnable JS port',
      panes.js.run && panes.js.dl && !panes.python.run && !panes.lua.run && !panes.gdscript.run,
      JSON.stringify({ js: [panes.js.run, panes.js.dl], lua: [panes.lua.run, panes.lua.dl], gd: [panes.gdscript.run, panes.gdscript.dl] }));
    await evaluate(cdp, `(function(){ document.getElementById('code-close').click(); return 1; })()`);

    // R2 mirror: `draw title` with `to title` defined translates as a CALL, the same
    // rule the engine follows (design decisions, Q2)
    await loadSource('to title' + String.fromCharCode(10) + '  say "hi"' + String.fromCharCode(10) + 'to draw' + String.fromCharCode(10) + '  clear screen to black' + String.fromCharCode(10) + '  draw title' + String.fromCharCode(10) + 'run game with update and draw' + String.fromCharCode(10));
    const r2 = await evaluate(cdp, `(function(){
      document.getElementById('tool-code').click();
      document.querySelector('#code-overlay .code-lang[data-lang="js"]').click();
      var code = document.getElementById('code-out').textContent;
      document.getElementById('code-close').click();
      return { calls: /title\(\)/.test(code), sprite: /draw_sprite/.test(code) };
    })()`);
    check('the panel translates `draw title` as a call when that function exists',
      r2.calls === true && r2.sprite === false, JSON.stringify(r2));

    // ---- 15. runtime diagnostics: a bad line is explained, on the line --------
    // fc substitutes a value instead of dying (item past the end -> nothing, a
    // misspelled field -> nothing). The panel should say what it did and where, the
    // same way on both engines, and clicking the row should jump to that line.
    const diagSrc = 'hands is ["sword", "shield"]' + String.fromCharCode(10) + 'best is item 5 of hands' + String.fromCharCode(10) + 'player is {speed: 2}' + String.fromCharCode(10) + 'spd is player.speeed' + String.fromCharCode(10) + 'to draw' + String.fromCharCode(10) + '  clear screen to black' + String.fromCharCode(10) + '  draw sprite player at 20, 20' + String.fromCharCode(10) + 'run game with update and draw' + String.fromCharCode(10) + '';
    const diagRun = async (query) => {
      await loadSource(diagSrc, query);
      await evaluate(cdp, `(function(){ document.getElementById('tool-run').click(); })()`);
      await sleep(900);
      return evaluate(cdp, `(function(){
        var rows = document.querySelectorAll('#errors div');
        return { count: rows.length, all: Array.prototype.map.call(rows, function(r){ return r.textContent; }),
                 clickable: rows.length ? rows[0].style.cursor === 'pointer' : false };
      })()`);
    };
    const dWasm = await diagRun('');
    check('the panel explains a bad item (default wasm engine)',
      dWasm.count === 2 && /^Line 2: hands only has 2 items, but you asked for item 5$/.test(dWasm.all[0] || ''),
      JSON.stringify(dWasm));
    check('it guesses the misspelled field',
      /^Line 4: player has no speeed — did you mean speed[?]$/.test(dWasm.all[1] || ''), JSON.stringify(dWasm.all));
    check('each message is marked clickable (jump to the line)', dWasm.clickable === true, JSON.stringify(dWasm));

    const jumped = await evaluate(cdp, `(function(){
      var rows = document.querySelectorAll('#errors div');
      if (rows.length < 2) return null;
      var m = rows[1].textContent.match(/Line ([0-9]+)/);
      rows[1].tap ? rows[1].tap() : rows[1].click();
      var ed = document.querySelector('textarea');
      return { want: m ? +m[1] : -1, got: ed.value.slice(0, ed.selectionStart).split(String.fromCharCode(10)).length,
               selected: ed.value.slice(ed.selectionStart, ed.selectionEnd) };
    })()`);
    check('clicking the message selects that line in the editor',
      !!jumped && jumped.want === jumped.got && jumped.want === 4 && /speeed/.test(jumped.selected || ''),
      JSON.stringify(jumped));

    const dJs = await diagRun('&core=js');
    check('the JS core explains it identically',
      JSON.stringify(dJs.all) === JSON.stringify(dWasm.all), JSON.stringify({ js: dJs.all, wasm: dWasm.all }));

    await loadSource('to draw' + String.fromCharCode(10) + '  clear screen to black' + String.fromCharCode(10) + '  draw rect at 1, 1 size 8, 8 in red' + String.fromCharCode(10) + 'run game with update and draw' + String.fromCharCode(10) + '', '');
    await evaluate(cdp, `(function(){ document.getElementById('tool-run').click(); })()`);
    await sleep(700);
    const quiet = await evaluate(cdp, `document.querySelectorAll('#errors div').length`);
    check('a correct program stays silent', quiet === 0, String(quiet));

    // ---- 16. classroom mode (flag on, endpoints stubbed) ----------------------
    // apid serves /api/class/* only with ENABLE_CLASSROOM=true; the app must stay
    // invisible without it and, with it, let a student join by code and tap straight
    // into an assigned game. tools/class-e2e.mjs covers the real server; this covers
    // the page. The stub has to be installed BEFORE the page script runs (the app
    // probes on load), hence addScriptToEvaluateOnNewDocument.
    const classStub = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
      window.__classCalls = [];
      const orig = window.fetch;
      window.fetch = function (url, opts) {
        const u = String(url);
        if (u.indexOf('/api/class') === 0) {
          window.__classCalls.push(u);
          const view = { code: 'SKY482', name: 'Room 12', teacher: 'Ms Lee', students: 3, isOwner: false,
                         assigned: [{ id: 'a1', title: 'Bouncing Ball', code: 'to draw' + String.fromCharCode(10) + '  clear screen to black' + String.fromCharCode(10) }],
                         submissions: [] };
          let body = { enabled: true };
          if (u === '/api/class/join') body = Object.assign({}, view, { you: 'Ada' });
          else if (u.indexOf('/api/class/SKY482') === 0) body = view;
          return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(body); } });
        }
        return orig.apply(this, arguments);
      };
    })();` });

    await loadSource('to draw\n  clear screen to black\n  draw rect at 4, 4 size 20, 20 in red\nrun game with update and draw\n');
    const clsEntry = await evaluate(cdp, `(function(){
      var b = document.getElementById('lr-class'), t = document.getElementById('tool-class');
      return { launcher: getComputedStyle(b).display, editor: getComputedStyle(t).display };
    })()`);
    check('with the flag on, both classroom entries appear',
      clsEntry.launcher !== 'none' && clsEntry.editor !== 'none', JSON.stringify(clsEntry));

    await evaluate(cdp, `document.getElementById('lr-class').click()`);
    await sleep(200);
    const clsForm = await evaluate(cdp, `(function(){
      var o = document.getElementById('class-overlay');
      o.setAttribute('tabindex', '-1');
      return { open: getComputedStyle(o).display !== 'none', code: !!document.getElementById('cl-code'),
               name: !!document.getElementById('cl-name'), labelled: o.getAttribute('aria-label') };
    })()`);
    check('the classroom dialog opens with a join form', clsForm.open && clsForm.code && clsForm.name, JSON.stringify(clsForm));

    await evaluate(cdp, `(function(){
      document.getElementById('cl-code').value = 'sky482';
      document.getElementById('cl-name').value = 'Ada';
      var bs = document.querySelectorAll('#class-body button');
      for (var i = 0; i < bs.length; i++) if (/Join the class/.test(bs[i].textContent)) { bs[i].click(); return 1; }
      return 0;
    })()`);
    await sleep(400);
    const clsJoined = await evaluate(cdp, `(function(){
      return { code: (document.querySelector('.cl-code') || {}).textContent,
               tiles: document.querySelectorAll('#class-body .lr-tile').length,
               shelf: getComputedStyle(document.getElementById('lr-classroom')).display !== 'none',
               calls: window.__classCalls };
    })()`);
    check('joining shows the class view for that code', clsJoined.code === 'SKY482', JSON.stringify(clsJoined));
    check('the assigned game appears as a tile', clsJoined.tiles === 1, JSON.stringify(clsJoined));
    check('the class shelf appears on the launcher', clsJoined.shelf === true, JSON.stringify(clsJoined));
    check('it probed the feature and posted the join',
      clsJoined.calls[0] === '/api/class/enabled' && clsJoined.calls.indexOf('/api/class/join') !== -1,
      JSON.stringify(clsJoined.calls));

    // reopening (a returning student) re-reads the class from the server
    await evaluate(cdp, `document.getElementById('lr-class').click()`);
    await sleep(400);
    const clsReopen = await evaluate(cdp, `(function(){
      return { calls: window.__classCalls, code: (document.querySelector('.cl-code') || {}).textContent,
               tiles: document.querySelectorAll('#class-body .lr-tile').length };
    })()`);
    check('reopening re-reads the class (returning student)',
      clsReopen.calls.some(function (u) { return /^\/api\/class\/SKY482/.test(u); }) && clsReopen.code === 'SKY482' && clsReopen.tiles === 1,
      JSON.stringify(clsReopen));
    await evaluate(cdp, `document.getElementById('class-close').click()`);

    await evaluate(cdp, `(function(){ document.querySelector('#class-body .lr-tile').click(); })()`);
    await sleep(400);
    const clsTap = await evaluate(cdp, `(function(){
      var ed = document.querySelector('textarea');
      return { start: ed.value.slice(0, 12), open: getComputedStyle(document.getElementById('class-overlay')).display !== 'none' };
    })()`);
    check('tapping an assigned game loads it and closes the dialog',
      clsTap.start.startsWith('to draw') && clsTap.open === false, JSON.stringify(clsTap));

    // flag off: no entries, no probe-driven state
    await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: classStub.identifier });
    await loadSource('to draw\n  clear screen to black\nrun game with update and draw\n');
    const clsDark = await evaluate(cdp, `(function(){
      return { launcher: getComputedStyle(document.getElementById('lr-class')).display,
               editor: getComputedStyle(document.getElementById('tool-class')).display };
    })()`);
    check('without the flag the classroom stays invisible',
      clsDark.launcher === 'none' && clsDark.editor === 'none', JSON.stringify(clsDark));

    // ---- 17. sharing a published game: the server-rendered /s/<id> link -------
    // A published game has a real page with OG tags (tools/share-e2e.mjs covers the
    // server half); the Share button should emit that link instead of a ?code= blob.
    // publish only exists for a signed-in user, so sign in with a stubbed /api/auth/me
    const authStub = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
      const orig = window.fetch;
      window.fetch = function (url, opts) {
        const u = String(url);
        if (u === '/api/auth/me') return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ user: { id: 'u1', nickname: 'Tester' } }) });
        if (u === '/api/auth/config') return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ google: '', github: '' }) });
        return orig.apply(this, arguments);
      };
    })();` });
    await loadSource('to draw\n  clear screen to black\n  draw rect at 4, 4 size 12, 12 in red\nrun game with update and draw\n');
    await sleep(300);
    const signedIn = await evaluate(cdp, `(function(){ return getComputedStyle(document.getElementById('tool-publish')).display !== 'none'; })()`);
    check('a signed-in user sees the publish button', signedIn === true, 'publish stayed hidden');
    await evaluate(cdp, `(function(){
      window.__shared = null; window.__pubCalls = 0;
      const orig = window.fetch;
      window.fetch = function (url, opts) {
        if (String(url).indexOf('/api/games/publish') === 0) { window.__pubCalls++; return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ id: 'abc123def4', name: 'Mine' }); } }); }
        return orig.apply(this, arguments);
      };
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: function (t) { window.__shared = t; return Promise.resolve(); } } });
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
      window.__realPrompt = window.prompt; window.prompt = function () { return 'Mine'; };
      return 1;
    })()`);
    await evaluate(cdp, `(function(){ var b = document.getElementById('tool-publish'); if (b) b.click(); return 1; })()`);
    await sleep(500);
    const pubShare = await evaluate(cdp, `(function(){
      document.getElementById('tool-share').click();
      return { calls: window.__pubCalls, link: window.__shared, permalink: (document.getElementById('tool-permalink') || {}).href };
    })()`);
    check('publishing remembers the game id', pubShare.calls === 1, JSON.stringify(pubShare));
    check('Share emits the preview-rich /s/<id> link',
      !!pubShare.link && /\/s\/abc123def4\/$/.test(pubShare.link), JSON.stringify(pubShare.link));
    check('the permalink points at the same page',
      !!pubShare.permalink && /\/s\/abc123def4\/$/.test(pubShare.permalink), JSON.stringify(pubShare.permalink));
    await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: authStub.identifier });

    // ---- 18. the touch path — Q4's automatable slice --------------------------
    // Real hardware is still the only way to check audio-unlock/PWA/APK
    // (docs/TEST-MATRIX.md), but emulated touch proves the wiring: a touch device
    // gets the pad, its buttons reach the engine, multitouch works, no scrolling.
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await cdp.send('Emulation.setDeviceMetricsOverride', { mobile: true, width: 390, height: 720, deviceScaleFactor: 2 });
    const touchSrc = 'rights is 0\ntaps is 0\nplayer is {x: 40, y: 40}\nto update\n  tick is 1\nto draw\n  clear screen to black\n  if right is pressed\n    rights is rights + 1\n  if space is pressed\n    taps is taps + 1\n  draw sprite player at player.x, player.y\nrun game with update and draw\n';
    await loadSource(touchSrc);
    await evaluate(cdp, `(function(){ document.getElementById('tool-run').click(); })()`);
    await sleep(800);
    const tpPad = await evaluate(cdp, `(function(){
      const p = document.getElementById('gamepad');
      return { touch: document.body.classList.contains('touch'), shown: getComputedStyle(p).display !== 'none',
               buttons: p.querySelectorAll('.gp-btn').length };
    })()`);
    check('a touch device gets the on-screen pad', tpPad.touch === true && tpPad.shown === true && tpPad.buttons >= 6, JSON.stringify(tpPad));

    const tpPts = await evaluate(cdp, `(function(){
      const at = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
      return { right: at('#gamepad .gp-btn[data-gp-key="right"]'), space: at('#gamepad .gp-btn[data-gp-key="space"]') };
    })()`);
    const touchVars = () => evaluate(cdp, `(function(){ const v = (typeof WASMCORE !== 'undefined' && WASMCORE.active) ? (WASMCORE.vars() || {}) : (runtime.vars || {}); return { rights: v.rights, taps: v.taps }; })()`);
    const tpBefore = await touchVars();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tpPts.right.x, y: tpPts.right.y, id: 1 }, { x: tpPts.space.x, y: tpPts.space.y, id: 2 }] });
    await sleep(500);
    const tpDuring = await touchVars();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    check('multitouch: moving and firing at once both reach the engine',
      (tpDuring.rights || 0) > (tpBefore.rights || 0) && (tpDuring.taps || 0) > (tpBefore.taps || 0),
      JSON.stringify({ tpBefore, tpDuring }));

    const tpDrag = await evaluate(cdp, `(function(){ const r = document.getElementById('gamepad').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tpDrag.x, y: tpDrag.y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tpDrag.x, y: tpDrag.y - 140, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(150);
    const tpScrolled = await evaluate(cdp, `window.scrollY || 0`);
    check('dragging on the pad does not scroll the page', tpScrolled === 0, String(tpScrolled));
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });

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
