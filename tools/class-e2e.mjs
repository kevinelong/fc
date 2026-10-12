#!/usr/bin/env node
// Classroom end-to-end: the real apid (ENABLE_CLASSROOM=true), a static+proxy server
// so the app's relative /api/... calls reach it, and a real Chrome driving the UI as
// both a student (no cookie) and the teacher (seeded session cookie).
//
// apid is the only part of the project with server-side logic and no other harness, so
// this is its guard: join → shelf → tap-to-play → hand in, then the teacher's roster,
// assign and delete controls, then that the whole feature stays dark with the flag off.
//
// Needs: apid's deps (`cd apid && npm install`) and Chrome (CHROME=... to override).
// Seeds one teacher + one class in apid/data/db.json, then restores the previous file.
//
//   node tools/class-e2e.mjs
import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';

import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = path.join(ROOT, 'apid', 'data', 'db.json');
const API_PORT = 8099, WEB_PORT = 8098, CDP_PORT = 9334;
const { findChrome } = createRequire(import.meta.url)('./chrome-path.cjs');
const CHROME = findChrome();
if (!CHROME) { console.error('No Chrome found — set CHROME=/path/to/chrome'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SESSION = 'testsession1234567890';

const GAME = 'to draw\n  clear screen to black\n  draw rect at 20, 20 size 40, 40 in red\nrun game with update and draw\n';
const SUB_GAME = 'to draw\n  clear screen to dark blue\n  draw rect at 8, 8 size 16, 16 in yellow\nrun game with update and draw\n';

// ---- 1. db backup + seed -----------------------------------------------------
const backup = fs.existsSync(DB) ? fs.readFileSync(DB, 'utf8') : null;
fs.mkdirSync(path.dirname(DB), { recursive: true });
const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;
fs.writeFileSync(DB, JSON.stringify({
  users: { u1: { id: 'u1', nickname: 'Teach', createdAt: now } },
  nicks: {},
  sessions: { [SESSION]: { userId: 'u1', createdAt: now } },
  states: {}, codes: {}, community: [],
  classes: {
    TEST01: { code: 'TEST01', ownerId: 'u1', ownerNick: 'Teach', name: 'Test Class', createdAt: now, lastActive: now,
      students: [], assigned: [{ id: 'a1', title: 'Assigned Game', code: GAME, at: now }], submissions: [] },
    // fixtures for the retention/deletion checks: one class on each side of the 90-day purge line
    KEEP89: { code: 'KEEP89', ownerId: 'u1', ownerNick: 'Teach', name: 'Recent Class', createdAt: now - 120 * DAY, lastActive: now - 89 * DAY,
      students: [], assigned: [], submissions: [] },
    OLD01: { code: 'OLD01', ownerId: 'u1', ownerNick: 'Teach', name: 'Idle Class', createdAt: now - 200 * DAY, lastActive: now - 91 * DAY,
      students: [], assigned: [],
      submissions: [{ id: 'deadbeef', name: 'kid', title: 'Old Thing', code: GAME, at: now - 91 * DAY }] },
  },
}));
// The seeded snapshot, taken before any request exists: the browser leg's classroom calls trigger
// the idle purge, so reading the file later would already show OLD01 gone.
const seededDb = JSON.parse(fs.readFileSync(DB, 'utf8'));

// ---- 2. apid + static/proxy --------------------------------------------------
const api = spawn(process.execPath, [path.join(ROOT, 'apid', 'server.js')],
  { env: { ...process.env, ENABLE_CLASSROOM: process.env.FLAG || 'true', PORT: String(API_PORT) }, stdio: 'ignore' });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const web = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    const up = http.request({ host: '127.0.0.1', port: API_PORT, path: req.url, method: req.method, headers: req.headers }, r => {
      res.writeHead(r.statusCode, r.headers); r.pipe(res);
    });
    req.pipe(up); up.on('error', () => { res.writeHead(502); res.end('{}'); });
    return;
  }
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  fs.readFile(p, (e, buf) => {
    if (e) { res.writeHead(404); return res.end('nope'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});
await new Promise(r => web.listen(WEB_PORT, r));
await sleep(700);

// ---- 3. chrome + cdp ---------------------------------------------------------
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-cls-'));
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=900,760',
  `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });

async function wsUrl() {
  for (let i = 0; i < 80; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      const page = l.find(t => t.type === 'page'); if (page) return page.webSocketDebuggerUrl; } catch (_) {}
    await sleep(250);
  }
  throw new Error('no devtools');
}
const ws = new WebSocket(await wsUrl());
let id = 0; const waiting = new Map();
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && waiting.has(m.id)) { const w = waiting.get(m.id); waiting.delete(m.id); m.error ? w.reject(new Error(JSON.stringify(m.error))) : w.resolve(m.result); } });
await new Promise(r => ws.addEventListener('open', r));
const send = (method, params) => new Promise((resolve, reject) => { const i = ++id; waiting.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __error: (r.exceptionDetails.exception || {}).description || 'threw' };
  return r.result.value;
};
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
await send('Network.clearBrowserCookies');
await send('Page.navigate', { url: `http://127.0.0.1:${WEB_PORT}/index.html` });
await sleep(1600);

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok ? '' : '  — ' + JSON.stringify(detail))); };

// ---- 4. UI walk --------------------------------------------------------------
check('entry hidden before the probe answers', await evaluate(`(function(){
  return new Promise(function(res){ setTimeout(function(){ res(getComputedStyle(document.getElementById('lr-class')).display); }, 500); });
})()`) !== 'none', 'the launcher entry should appear when the flag is on');

await evaluate(`document.getElementById('lr-class').click()`);
await sleep(300);
check('the class dialog opens as a labelled modal', await evaluate(`(function(){
  var o = document.getElementById('class-overlay');
  return getComputedStyle(o).display !== 'none' && o.getAttribute('role') === 'dialog' && o.getAttribute('aria-modal') === 'true' && !!o.getAttribute('aria-label');
})()`), 'overlay a11y');

// join with the seeded class
await evaluate(`(function(){
  var c = document.getElementById('cl-code'), n = document.getElementById('cl-name');
  c.value = 'TEST01'; n.value = 'Ada';
  c.dispatchEvent(new Event('input', { bubbles: true })); n.dispatchEvent(new Event('input', { bubbles: true }));
  return 1;
})()`);
await evaluate(`(function(){ var bs = document.querySelectorAll('#class-body button'); for (var i=0;i<bs.length;i++) if (/Join the class/.test(bs[i].textContent)) { bs[i].click(); return 'clicked'; } return 'none'; })()`);
await sleep(700);
const joined = await evaluate(`(function(){
  return { code: (document.querySelector('.cl-code')||{}).textContent,
           note: (document.querySelector('#class-body .cl-note')||{}).textContent,
           assigned: document.querySelectorAll('#class-body .lr-tile').length,
           h: Array.prototype.map.call(document.querySelectorAll('#class-body .cl-h'), function(e){ return e.textContent; }),
           shelf: getComputedStyle(document.getElementById('lr-classroom')).display !== 'none' };
})()`);
check('student joins with code + display name', joined.code === 'TEST01' && /Ada/.test(joined.note || ''), joined);
check('the class view lists the assigned game', joined.assigned >= 1, joined);
check('the launcher shelf appears after joining', joined.shelf === true, joined);

// tap the assigned tile: it should load that program into the editor
await evaluate(`(function(){ document.querySelector('#class-body .lr-tile').click(); return 1; })()`);
await sleep(600);
const loaded = await evaluate(`(function(){ var ed = document.querySelector('textarea'); return { start: ed.value.slice(0, 24), overlayOpen: getComputedStyle(document.getElementById('class-overlay')).display !== 'none' }; })()`);
check('tapping an assigned game loads it into the editor', loaded.start.startsWith('to draw'), loaded);

// student hands in the editor's program (prompt auto-answered through CDP)
await send('Page.addScriptToEvaluateOnNewDocument', { source: '' }).catch(() => {});
await evaluate(`(function(){ /* stub prompt so the submit path can be driven */ window.__realPrompt = window.prompt; window.prompt = function(){ return 'My Game'; }; return 1; })()`);
await evaluate(`window.FC_CLASSROOM.open()`);
await sleep(300);
await evaluate(`(function(){ var bs = document.querySelectorAll('#class-body button'); for (var i=0;i<bs.length;i++) if (/submit the game/.test(bs[i].textContent)) { bs[i].click(); return 1; } return 0; })()`);
await sleep(800);
const submitted = await evaluate(`(function(){
  return { subs: document.querySelectorAll('#class-body .lr-tile').length,
           h: Array.prototype.map.call(document.querySelectorAll('#class-body .cl-h'), function(e){ return e.textContent; }),
           err: (document.getElementById('cl-err')||{}).textContent };
})()`);
check('a student can hand in the editor program', submitted.h.indexOf('SUBMITTED') !== -1 && submitted.subs >= 2, submitted);

// teacher view (the seeded session cookie): roster + assign + delete
// now act as the teacher: install the session cookie and reload
await send('Network.setCookie', { name: 'co_sess', value: SESSION, domain: '127.0.0.1', path: '/' });
await send('Page.reload');
await sleep(1500);
await evaluate(`window.FC_CLASSROOM.open()`);
await sleep(300);
await evaluate(`window.FC_CLASSROOM.reload()`);
await sleep(500);
const teacher = await evaluate(`(function(){
  return { note: (document.querySelector('#class-body .cl-note')||{}).textContent,
           assign: Array.prototype.some.call(document.querySelectorAll('#class-body button'), function(b){ return /assign the game/.test(b.textContent); }),
           deletes: document.querySelectorAll('#class-body .lr-tile .del').length };
})()`);
check('the teacher (signed in) gets assign + delete controls', teacher.assign === true && teacher.deletes >= 2, teacher);
check('the teacher view names the class as theirs', /Yours/.test(teacher.note || ''), teacher);

// ---- 4b. retention and deletion, at the data level --------------------------
// HANDOFF's next-action 3 gates the classroom pilot on verified retention/deletion, and the
// product promises are "teacher-deletable" and "auto-purged after an idle period". A delete
// button that leaves rows behind would pass the UI checks above, so these read the database.
// apid's save() is debounced by 50ms (tmp file + rename), so every read here polls.
const apiReq = (p, method = 'GET', headers = {}) => new Promise((resolve) => {
  const r = http.request({ host: '127.0.0.1', port: API_PORT, path: p, method,
    headers: { cookie: `co_sess=${SESSION}`, ...headers } }, res => {
    const c = []; res.on('data', d => c.push(d));
    res.on('end', () => { let b = null; try { b = JSON.parse(Buffer.concat(c).toString()); } catch (_) {} resolve({ status: res.statusCode, body: b }); });
  });
  r.on('error', () => resolve({ status: 0 })); r.end();
});
const dbNow = () => JSON.parse(fs.readFileSync(DB, 'utf8'));
const waitForDb = async (pred, ms = 2500) => {
  const t0 = Date.now();
  for (;;) {
    if (pred(dbNow())) return true;
    if (Date.now() - t0 > ms) return false;
    await sleep(100);
  }
};
const seeded = seededDb;   // taken before apid started; the browser leg purges OLD01 already

await apiReq('/api/class/KEEP89');            // any /api/class* request runs purgeIdleClasses()
const purged = await waitForDb(d => d.classes.OLD01 === undefined);
const afterPurge = dbNow();
check('a class idle for 91 days is purged, and its student work goes with it',
  seeded.classes.OLD01 !== undefined && purged && !JSON.stringify(afterPurge).includes('deadbeef'),
  JSON.stringify({ seeded: Object.keys(seeded.classes), now: Object.keys(afterPurge.classes), orphan: JSON.stringify(afterPurge).includes('deadbeef') }));
check('a class idle for 89 days survives the same purge (the boundary is not off by a mile)',
  afterPurge.classes.KEEP89 !== undefined && afterPurge.classes.TEST01 !== undefined,
  Object.keys(afterPurge.classes).join(','));

const refused = await apiReq('/api/class/KEEP89', 'DELETE');   // session, but no X-CO
await sleep(300);
check('deleting a class without the CSRF header is refused and changes nothing',
  refused.status === 403 && dbNow().classes.KEEP89 !== undefined, JSON.stringify(refused));

const deleted = await apiReq('/api/class/KEEP89', 'DELETE', { 'X-CO': '1' });
const gone = await waitForDb(d => d.classes.KEEP89 === undefined);
check('a teacher delete removes the class row itself',
  deleted.status === 200 && gone, JSON.stringify({ status: deleted.status, classes: Object.keys(dbNow().classes) }));

// ---- 5. flag off: nothing appears -------------------------------------------
console.log('\n--- flag off ---');
await send('Page.navigate', { url: `http://127.0.0.1:${WEB_PORT}/index.html?flagoff=1` });
await sleep(400);
api.kill();
await sleep(200);
const api2 = spawn(process.execPath, [path.join(ROOT, 'apid', 'server.js')], { env: { ...process.env, ENABLE_CLASSROOM: 'false', PORT: String(API_PORT) }, stdio: 'ignore' });
await sleep(900);
await send('Page.reload');
await sleep(1500);
const dark = await evaluate(`(function(){
  return { lr: getComputedStyle(document.getElementById('lr-class')).display,
           tool: getComputedStyle(document.getElementById('tool-class')).display,
           api: typeof window.FC_CLASSROOM };
})()`);
check('classroom ships dark when the flag is off', dark.lr === 'none' && dark.tool === 'none' && dark.api === 'undefined', dark);
api2.kill();

// ---- 6. cleanup --------------------------------------------------------------
ws.close(); chrome.kill(); web.close();
await sleep(200);
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (_) {}
if (backup === null) { try { fs.rmSync(DB, { force: true }); } catch (_) {} }
else fs.writeFileSync(DB, backup);
const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} classroom end-to-end checks pass`);
process.exit(failed ? 1 : 0);
