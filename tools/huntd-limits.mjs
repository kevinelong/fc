#!/usr/bin/env node
// huntd-limits — the relay's caps, which nothing tested.
//
// huntd is public (wss://codeonline.io/relay) and is what every multiplayer example talks to, but
// its own limits had no guard: a room is capped, a message is capped, a socket is rate-limited —
// all three are one env var away from being wrong, and the *connection* caps were missing entirely
// (nothing stopped a client opening sockets until the box ran out of memory). This spawns the real
// relay with tiny caps and drives it with real WebSocket clients, so the numbers are observable.
//
// Needs huntd's deps (`cd huntd && npm install --omit=dev`).
//
//   node tools/huntd-limits.mjs
import { spawn } from 'child_process';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = path.join(ROOT, 'huntd', 'server.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  — ' + detail : ''}`); };

let port = 8411;
const start = async (env) => {
  const p = port++;
  const proc = spawn(process.execPath, [SERVER], { env: { ...process.env, HUNTD_PORT: String(p), HUNTD_HOST: '127.0.0.1', ...env }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    const ok = await new Promise(res => {
      const req = http.get({ host: '127.0.0.1', port: p, path: '/healthz' }, r => { r.resume(); res(r.statusCode === 200); });
      req.on('error', () => res(false));
    });
    if (ok) return proc;
    await sleep(100);
  }
  throw new Error('huntd never came up on ' + p);
};
const health = (p) => new Promise(res => {
  http.get({ host: '127.0.0.1', port: p, path: '/healthz' }, r => { const c = []; r.on('data', d => c.push(d)); r.on('end', () => res(JSON.parse(Buffer.concat(c).toString()))); }).on('error', () => res(null));
});

// a client that records what it receives, and how it was closed
const open = (p, game, room) => new Promise((resolve) => {
  const ws = new WebSocket(`ws://127.0.0.1:${p}/relay?game=${game}&room=${room}`);
  const state = { msgs: [], code: null, reason: null, open: false, ws };
  ws.addEventListener('open', () => { state.open = true; resolve(state); });
  ws.addEventListener('message', (ev) => { try { state.msgs.push(JSON.parse(ev.data)); } catch (_) {} });
  ws.addEventListener('close', (ev) => { state.open = false; state.code = ev.code; state.reason = ev.reason; });
  ws.addEventListener('error', () => {});
  setTimeout(() => resolve(state), 1500);          // a refused socket may close before 'open'
});

const waitFor = async (fn, ms = 1500) => { const t0 = Date.now(); for (;;) { if (fn()) return true; if (Date.now() - t0 > ms) return false; await sleep(50); } };

let procs = [];
try {
  // ---- 1. the room cap: a second client in the same room is refused -------------
  {
    const p = port;
    procs.push(await start({ HUNTD_ROOM_CAP: '1' }));
    const a = await open(p, 'guard', 'one');
    const b = await open(p, 'guard', 'one');
    await waitFor(() => b.code !== null);
    check('a full room refuses the next client (4001)', a.open === true && b.code === 4001, JSON.stringify({ a: a.open, bCode: b.code }));
    a.ws.close(); b.ws.close();
    await sleep(200);
    procs.pop().kill();
  }

  // ---- 2. the global connection cap --------------------------------------------
  {
    const p = port;
    procs.push(await start({ HUNTD_MAX_CLIENTS: '2', HUNTD_MAX_PER_IP: '50' }));
    const a = await open(p, 'guard', 'a');
    const b = await open(p, 'guard', 'b');
    const c = await open(p, 'guard', 'c');
    await waitFor(() => c.code !== null);
    check('the relay refuses connections past its total cap (4002)',
      a.open && b.open && c.code === 4002, JSON.stringify({ a: a.open, b: b.open, cCode: c.code }));
    a.ws.close(); b.ws.close(); c.ws.close();
    await sleep(200);
    procs.pop().kill();
  }

  // ---- 3. the per-address cap (a classroom is one address) ---------------------
  {
    const p = port;
    procs.push(await start({ HUNTD_MAX_CLIENTS: '50', HUNTD_MAX_PER_IP: '2' }));
    const a = await open(p, 'guard', 'a');
    const b = await open(p, 'guard', 'b');
    const c = await open(p, 'guard', 'c');
    await waitFor(() => c.code !== null);
    check('the relay refuses a third socket from one address (4002)',
      a.open && b.open && c.code === 4002, JSON.stringify({ a: a.open, b: b.open, cCode: c.code }));
    a.ws.close(); b.ws.close(); c.ws.close();
    await sleep(200);
    procs.pop().kill();
  }

  // ---- 4. message size and per-socket rate -------------------------------------
  {
    const p = port;
    procs.push(await start({ HUNTD_MSG_CAP: '64', HUNTD_RATE: '2' }));
    const a = await open(p, 'guard', 'm');
    const b = await open(p, 'guard', 'm');
    await waitFor(() => a.msgs.some(m => m.t === 'join'));   // let B's join land: only `state` is relayed payload
    const states = c => c.msgs.filter(m => m.t === 'state').length;
    const before = states(a);
    b.ws.send(JSON.stringify({ big: 'x'.repeat(200) }));
    await sleep(250);
    const afterBig = states(a);
    b.ws.send(JSON.stringify({ ok: 1 }));
    await waitFor(() => states(a) > afterBig);
    const afterSmall = states(a);
    for (let i = 0; i < 6; i++) b.ws.send(JSON.stringify({ burst: i }));
    await sleep(400);
    const afterBurst = states(a);
    check('a message over the cap is dropped, a normal one relays',
      afterBig === before && afterSmall === before + 1, JSON.stringify({ before, afterBig, afterSmall }));
    check('a socket is rate-limited (a burst is partly dropped)',
      afterBurst - afterSmall <= 2, JSON.stringify({ relayedFromBurst: afterBurst - afterSmall }));
    a.ws.close(); b.ws.close();
    await sleep(300);

    // ---- 5. cleanup: no rooms and no clients left behind ------------------------
    const h = await health(p);
    check('closed sockets leave no room or client behind',
      !!h && h.rooms === 0 && h.clients === 0, JSON.stringify(h));
    check('healthz reports the caps in force',
      !!h && h.capacity && h.capacity.roomCap === 8 && h.capacity.maxClients > 0, JSON.stringify(h && h.capacity));
    procs.pop().kill();
  }
} catch (e) {
  check('huntd-limits ran without an exception', false, e && e.message);
} finally {
  for (const pr of procs) { try { pr.kill(); } catch (_) {} }
}

const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} relay limit checks pass`);
process.exit(failed ? 1 : 0);
