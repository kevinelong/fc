#!/usr/bin/env node
// api-e2e.mjs — guards for the parts of apid that were live in production with no test:
// sessions, cloud saves and the community gallery. (Classroom and the /s/<id> share
// pages have their own harnesses; the same shape is used here.)
//
// Seeds one user + session in apid/data/db.json, starts the real server, and exercises:
//   * CSRF: a write without the X-CO header is refused
//   * auth:   the same write without a session is refused, and /api/auth/me says so
//   * saves:  a state round-trip through /api/state
//   * gallery: publish -> listed as mine with the code intact -> delete -> gone
// Then restores the previous db file.
//
// Needs apid's deps (`cd apid && npm install`).
//
//   node tools/api-e2e.mjs
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = path.join(ROOT, 'apid', 'data', 'db.json');
const PORT = 8096;
const SESSION = 'apisession1234567890';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const backup = fs.existsSync(DB) ? fs.readFileSync(DB, 'utf8') : null;
fs.mkdirSync(path.dirname(DB), { recursive: true });
fs.writeFileSync(DB, JSON.stringify({
  users: { u1: { id: 'u1', nickname: 'Tester', provider: 'github', createdAt: Date.now() } },
  nicks: {}, sessions: { [SESSION]: { userId: 'u1', createdAt: Date.now() } },
  states: {}, codes: {}, community: [], classes: {},
}));

// A tiny per-IP cap so the unthrottled-form check needs four requests, not eleven.
const api = spawn(process.execPath, [path.join(ROOT, 'apid', 'server.js')], { env: { ...process.env, PORT: String(PORT), TPOS_INQUIRY_PER_IP_PER_DAY: '3' }, stdio: 'ignore' });
await sleep(900);

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok ? '' : '  — ' + JSON.stringify(detail))); };
const url = p => `http://127.0.0.1:${PORT}` + p;
const cookie = { Cookie: 'co_sess=' + SESSION };
const jsonHeaders = Object.assign({ 'Content-Type': 'application/json' }, cookie);
const GAME = 'to draw\n  clear screen to black\n  draw rect at 1, 1 size 9, 9 in red\nrun game with update and draw\n';

let publishedId = null;
try {
  // ---- auth ---------------------------------------------------------------
  const anon = await (await fetch(url('/api/auth/me'))).json();
  const me = await (await fetch(url('/api/auth/me'), { headers: cookie })).json();
  check('/api/auth/me: anonymous is null, the session is the user', anon.user === null && me.user && me.user.nickname === 'Tester', { anon, me });

  // ---- CSRF and auth on a write -------------------------------------------
  const noCsrf = await fetch(url('/api/state'), { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ states: { a: 1 } }) });
  check('a write without X-CO is refused (403)', noCsrf.status === 403, noCsrf.status);
  const noSession = await fetch(url('/api/state'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CO': '1' }, body: JSON.stringify({ states: { a: 1 } }) });
  check('a write without a session is refused (401)', noSession.status === 401, noSession.status);

  // ---- cloud saves --------------------------------------------------------
  const post = await fetch(url('/api/state'), { method: 'POST', headers: Object.assign({ 'X-CO': '1' }, jsonHeaders), body: JSON.stringify({ states: { highScore: 42, name: 'Ada' } }) });
  check('a signed-in save is accepted', post.status === 200, post.status);
  const got = await (await fetch(url('/api/state'), { headers: cookie })).json();
  check('the save round-trips', got.states && got.states.highScore === 42 && got.states.name === 'Ada', got);

  // ---- gallery ------------------------------------------------------------
  const pub = await fetch(url('/api/games/publish'), { method: 'POST', headers: Object.assign({ 'X-CO': '1' }, jsonHeaders), body: JSON.stringify({ name: 'My Game', code: GAME }) });
  const pubBody = await pub.json();
  publishedId = pubBody.id;
  check('publishing returns an id', pub.status === 200 && !!publishedId, pubBody);

  const list = await (await fetch(url('/api/games/community'), { headers: cookie })).json();
  const mine = (list.games || []).find(g => g.id === publishedId);
  check('the gallery lists it, marked mine, with the code intact', !!mine && mine.mine === true && mine.code === GAME && mine.author === 'Tester', mine);

  const tiny = await fetch(url('/api/games/publish'), { method: 'POST', headers: Object.assign({ 'X-CO': '1' }, jsonHeaders), body: JSON.stringify({ name: 'Empty', code: '   ' }) });
  check('publishing nothing is a 400', tiny.status === 400, tiny.status);

  const del = await fetch(url('/api/games/community/' + publishedId), { method: 'DELETE', headers: Object.assign({ 'X-CO': '1' }, jsonHeaders) });
  const after = await (await fetch(url('/api/games/community'), { headers: cookie })).json();
  check('deleting removes it from the gallery', del.status === 200 && !(after.games || []).some(g => g.id === publishedId), { status: del.status, left: (after.games || []).length });

  // ---- the trailer-inquiry form is bounded (it stores + emails a real inbox) --
  // A public, no-login write route: CSRF and field cleaning are not enough, it needs
  // its own cap or a script with the header can flood the sales inbox. Cap is 3 here.
  const inquiry = i => fetch(url('/api/tpos/inquiry'), {
    method: 'POST', headers: Object.assign({ 'X-CO': '1' }, jsonHeaders),
    body: JSON.stringify({ name: 'Buyer ' + i, email: 'buyer' + i + '@example.com', subject: 'Trailer', message: 'hello' }),
  });
  const inquiries = [];
  for (let i = 0; i < 4; i++) inquiries.push(await inquiry(i));
  check('the trailer-inquiry form accepts up to its per-IP/day cap', inquiries.slice(0, 3).every(r => r.status === 200), inquiries.map(r => r.status));
  check('the trailer-inquiry form is refused past the cap (429)', inquiries[3].status === 429, inquiries[3].status);

  // ---- the classroom flag stays off by default ----------------------------
  const dark = await fetch(url('/api/class/enabled'));
  check('classroom stays dark without the flag (404)', dark.status === 404, dark.status);
} catch (e) {
  check('api-e2e ran without an exception', false, e && e.message);
} finally {
  api.kill();
  await sleep(150);
  if (backup === null) { try { fs.rmSync(DB, { force: true }); } catch (_) {} } else fs.writeFileSync(DB, backup);
}
const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} api checks pass`);
process.exit(failed ? 1 : 0);
