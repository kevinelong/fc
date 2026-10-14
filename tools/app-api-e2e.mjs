#!/usr/bin/env node
// app-api-e2e — the app↔server contract guard.
//
// Why this exists: ui-check drives the app against a *stubbed* /api, and class-e2e covers the
// classroom routes only. Nothing checked that the endpoints the app actually calls exist on the
// real apid, with the methods and headers it uses, or that a value a running game saves really
// lands in the database and comes back on the next load. That is the drift this pins: the app's
// API surface is an accounted-for list, and one save/load round trip runs through the real app.
//
// Needs apid's deps (`cd apid && npm install`) and Chrome (CHROME=... to override). Seeds a user
// + session in apid/data/db.json and restores the previous file afterwards.
//
//   node tools/app-api-e2e.mjs
import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = path.join(ROOT, 'apid', 'data', 'db.json');
const API_PORT = 8096, WEB_PORT = 8095, CDP_PORT = 9336;
const CHROME = process.env.CHROME || createRequire(import.meta.url)('./chrome-path.cjs').findChrome();
if (!CHROME) { console.error('No Chrome found — set CHROME=/path/to/chrome'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SESSION = 'contractsession123456';

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  — ' + detail : ''}`); };

// ---- 1. db backup + seed -----------------------------------------------------
const backup = fs.existsSync(DB) ? fs.readFileSync(DB, 'utf8') : null;
fs.mkdirSync(path.dirname(DB), { recursive: true });
const now = Date.now();
fs.writeFileSync(DB, JSON.stringify({
  users: { u1: { id: 'u1', nickname: 'Contract', createdAt: now } },
  nicks: {},
  sessions: { [SESSION]: { userId: 'u1', createdAt: now } },
  states: {}, codes: {}, community: [],
  classes: {},
}));

// ---- 2. apid + a static+proxy server so the app's relative /api calls reach it ----
const api = spawn(process.execPath, [path.join(ROOT, 'apid', 'server.js')],
  { env: { ...process.env, ENABLE_CLASSROOM: 'true', PORT: String(API_PORT) }, stdio: 'ignore' });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.fc': 'text/plain' };
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

const BASE = `http://127.0.0.1:${WEB_PORT}`;
const cookie = `co_sess=${SESSION}`;
// Node's fetch implements the browser spec, which forbids a script from setting `Cookie` — the
// header is silently dropped, and every authenticated probe then answers 401. Plain http.request
// has no such rule, so the contract probes use it.
const raw = (method, p, { headers = {}, body } = {}) => new Promise(resolve => {
  const data = body === undefined || body === null ? null : Buffer.from(body);
  const r = http.request({ host: '127.0.0.1', port: WEB_PORT, path: p, method,
    headers: { ...(data ? { 'content-length': data.length } : {}), ...headers } }, res => {
    const chunks = []; res.on('data', c => chunks.push(c));
    res.on('end', () => {
      let parsed = null; try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (_) {}
      resolve({ status: res.statusCode, body: parsed });
    });
  });
  r.on('error', () => resolve({ status: 0, body: null }));
  if (data) r.write(data);
  r.end();
});
const get = (p, opts = {}) => raw(opts.method || 'GET', p, { headers: { cookie, ...(opts.headers || {}) }, body: opts.body });

let chrome = null, ws = null, cdpClosed = false;
let sendId = 0; const waiting = new Map();
const send = (method, params) => new Promise((resolve, reject) => { const i = ++sendId; waiting.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __error: ((r.exceptionDetails.exception || {}).description || 'threw') };
  return r.result.value;
};
const loadApp = async (source) => {
  const url = `${BASE}/index.html?code=${encodeURIComponent(Buffer.from(source, 'utf8').toString('base64'))}`;
  await send('Page.navigate', { url });
  await sleep(1800);
};

try {
  // ---- 3. the app's API surface is an accounted-for list ----------------------
  // Every /api/... literal in every *shipped page* has to appear here, so a new call cannot be
  // added without this guard being updated — which is exactly how app/server drift starts. This
  // used to read index.html alone, so a call added to any other page (the editors, the sub-pages,
  // the trailer portal) was silently unaccounted for; the list is the pages the site serves.
  const PAGES = [
    'index.html', 'map-editor.html', 'sound-studio.html', 'sprite-editor.html',
    'docs/index.html', 'learn/index.html', 'teachers/index.html', 'teachers/cheatsheet.html',
    'projects/index.html', 'privacy/index.html', 'tpos/index.html',
  ];
  const KNOWN = [
    '/api/state', '/api/games/community', '/api/games/community/', '/api/games/publish',
    '/api/games/gist', '/api/auth/', '/api/class', '/api/class/enabled', '/api/generate',
    '/api/tpos/inquiry',
  ];
  const literals = [...new Set(PAGES.flatMap(rel =>
    [...fs.readFileSync(path.join(ROOT, rel), 'utf8').matchAll(/['"](\/api\/[^'"]*)['"]/g)].map(m => m[1])))].sort();
  const unaccounted = literals.filter(l => !KNOWN.includes(l) && !KNOWN.some(k => k.endsWith('/') && l.startsWith(k)));
  check(`every /api literal in every shipped page is accounted for (${literals.length} found across ${PAGES.length} pages)`,
    unaccounted.length === 0, `unaccounted: ${unaccounted.join(', ') || 'none'}`);

  // ---- 4. route contract: the endpoints the app calls exist on the real apid --
  // apid answers an unknown route with 404 {error:'not found'}; the negative control below proves
  // that signal means what we think it means.
  const unknown = await get('/api/definitely-not-a-route');
  check('an unknown route answers 404 (so "not 404" means implemented)',
    unknown.status === 404, JSON.stringify(unknown));

  const me = await get('/api/auth/me');
  check('GET /api/auth/me identifies the seeded session',
    me.status === 200 && !!(me.body && me.body.user) && me.body.user.nickname === 'Contract', JSON.stringify(me));
  const meAnon = await raw('GET', '/api/auth/me', {});
  check('GET /api/auth/me without a session is 200 with user:null (not 401/500)',
    meAnon.status === 200 && !!(meAnon.body && meAnon.body.user === null), JSON.stringify(meAnon));

  const list = await get('/api/games/community');
  check('GET /api/games/community returns an array (the launcher renders it)',
    list.status === 200 && Array.isArray(list.body && list.body.games), JSON.stringify(list.body).slice(0, 120));

  const probe = await get('/api/class/enabled');
  check('GET /api/class/enabled answers when the flag is on', probe.status === 200 && probe.body.enabled === true, JSON.stringify(probe));

  const gen = await get('/api/generate', { method: 'POST', headers: { 'content-type': 'application/json', 'X-CO': '1' }, body: JSON.stringify({ prompt: 'x' }) });
  check('POST /api/generate is routed (dark tier, so any non-404 answer counts)', gen.status !== 404, JSON.stringify(gen));

  // ---- 5. the write contract: CSRF header, body shape, caps -------------------
  const noCsrf = await get('/api/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ states: { probe: 1 } }) });
  check('POST /api/state without X-CO is refused (403) — the app always sends it',
    noCsrf.status === 403, JSON.stringify(noCsrf));

  const wrote = await get('/api/state', { method: 'POST', headers: { 'content-type': 'application/json', 'X-CO': '1' }, body: JSON.stringify({ states: { probe: 7 } }) });
  check('POST /api/state with X-CO stores the value', wrote.status === 200 && wrote.body.ok === true, JSON.stringify(wrote));
  const readBack = await get('/api/state');
  check('GET /api/state returns what was written, per user',
    readBack.status === 200 && readBack.body.states && readBack.body.states.probe === 7 && typeof readBack.body.states === 'object',
    JSON.stringify(readBack.body).slice(0, 120));

  const huge = await get('/api/state', { method: 'POST', headers: { 'content-type': 'application/json', 'X-CO': '1' }, body: JSON.stringify({ states: { huge: 'x'.repeat(5000) } }) });
  const afterHuge = await get('/api/state');
  check('a value over the 4KB per-key cap is dropped, not stored',
    huge.status === 200 && !(afterHuge.body.states || {}).huge, JSON.stringify({ status: huge.status, keys: Object.keys(afterHuge.body.states || {}) }));

  // ---- 6. Chrome: the app's own cloud-save transport, end to end --------------
  const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-api-'));
  chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=900,700',
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });
  const wsUrl = async () => {
    for (let i = 0; i < 80; i++) {
      try {
        const l = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
        const page = l.find(t => t.type === 'page'); if (page) return page.webSocketDebuggerUrl;
      } catch (_) { /* not up yet */ }
      await sleep(250);
    }
    throw new Error('no devtools');
  };
  ws = new WebSocket(await wsUrl());
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && waiting.has(m.id)) { const w = waiting.get(m.id); waiting.delete(m.id); m.error ? w.reject(new Error(JSON.stringify(m.error))) : w.resolve(m.result); } });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.clearBrowserCookies');
  await send('Network.setCookie', { name: 'co_sess', value: SESSION, domain: '127.0.0.1', path: '/' });

  // ---- 6a. the store and song bridges, end to end on the wasm engine --------
  // These are the tests that let shape-diff filter host-effect commands: delivery differs per
  // engine by design, but the *effect* is observable right here, in the browser, on the default
  // (wasm) engine. Both legs failed before the store/song bridge existed.
  const runApp = async (source) => {
    await loadApp(source);
    await evaluate(`(function(){ var b = document.getElementById('tool-run'); if (b) b.click(); return 1; })()`);
    await sleep(900);
  };

  await runApp('save 42 as "verbcontract"\nto draw\n  clear screen to black\n  write "saving" at 8, 8 in white\nrun game with update and draw\n');
  let verbSaved = null;
  for (let i = 0; i < 12; i++) {
    const r = await get('/api/state');
    verbSaved = (r.body && r.body.states) || null;
    if (verbSaved && verbSaved.verbcontract === 42) break;
    await sleep(500);
  }
  check('the `save` verb on the wasm engine reaches /api/state (the store bridge)',
    !!(verbSaved && verbSaved.verbcontract === 42), JSON.stringify(verbSaved));

  await runApp('best is load "verbcontract"\nto update\n  seen is best\nto draw\n  clear screen to black\n  write "{best}" at 8, 8 in white\nrun game with update and draw\n');
  let seen = null;
  for (let i = 0; i < 8; i++) {
    seen = await evaluate(`(function(){ var v = (typeof WASMCORE !== 'undefined' && WASMCORE.active) ? (WASMCORE.vars() || {}) : ((typeof runtime !== 'undefined' && runtime.vars) || {}); return v.best; })()`);
    if (seen === 42) break;
    await sleep(400);
  }
  check('a fresh page load seeds the wasm store, so `load` sees the earlier value (the seed bridge)',
    seen === 42, String(seen));

  await runApp('song "tune" is 120 "###"\nto draw\n  clear screen to black\nrun game with update and draw\n');
  const songs = await evaluate(`(function(){ try { return Object.keys((typeof AUDIO !== 'undefined' && AUDIO.songs) || {}); } catch (e) { return ['ERR']; } })()`);
  check('a `song` defined in the program reaches the host audio engine (the same buffer)',
    Array.isArray(songs) && songs.indexOf('tune') !== -1, JSON.stringify(songs));

  // The app's STORE.set queues, then flushes ~800 ms later; poll the server for the value.
  await loadApp('to draw\n  clear screen to black\n  draw rect at 8, 8 size 16, 16 in blue\nrun game with update and draw\n');
  await evaluate(`(function(){ window.STORE.set('contract', 42); return 1; })()`);
  let saved = null;
  for (let i = 0; i < 12; i++) {
    const r = await get('/api/state');
    saved = (r.body && r.body.states) || null;
    if (saved && saved.contract === 42) break;
    await sleep(500);
  }
  check('STORE.set in the app reaches /api/state with the right value',
    !!(saved && saved.contract === 42), JSON.stringify(saved));

  // A fresh load pulls the server state into the app's store.
  await loadApp('to draw\n  clear screen to black\nrun game with update and draw\n');
  let pulled = null;
  for (let i = 0; i < 8; i++) {
    pulled = await evaluate(`(function(){ try { return { v: window.STORE.get('contract'), ls: JSON.parse(localStorage.getItem('fc:save:contract') || 'null') }; } catch (e) { return { err: String(e) }; } })()`);
    if (pulled && pulled.v === 42) break;
    await sleep(500);
  }
  check('a fresh load pulls it back (STORE.get sees the server value)',
    !!(pulled && pulled.v === 42), JSON.stringify(pulled));
} catch (e) {
  check('app-api-e2e ran without an exception', false, e && e.message);
} finally {
  try { if (ws && !cdpClosed) { ws.close(); cdpClosed = true; } } catch (_) {}
  if (chrome) { try { chrome.kill(); } catch (_) {} }
  try { api.kill(); } catch (_) {}
  try { web.close(); } catch (_) {}
  if (backup === null) { try { fs.unlinkSync(DB); } catch (_) {} }
  else fs.writeFileSync(DB, backup);
}

const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} app-server contract checks pass`);
process.exit(failed ? 1 : 0);
