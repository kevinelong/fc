#!/usr/bin/env node
// Guard for /s/<id> — the server-rendered share page for a published community game.
//
// Scrapers cannot run the app, so a client `?code=` link previews as nothing. apid
// serves /s/<id> with OG/Twitter tags and then redirects a human into the game. This
// checks the tags, the round-trip of the embedded code (base64 must be percent-encoded
// or a `+` becomes a space and the wrong game loads), and that an unknown id 404s.
//
// Needs apid's deps (`cd apid && npm install`). Seeds one community game in
// apid/data/db.json and restores the previous file afterwards.
//
//   node tools/share-e2e.mjs
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = path.join(ROOT, 'apid', 'data', 'db.json');
const PORT = 8097;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// a game whose base64 contains '+', the case the growth plan warns about
const GAME = 'to draw\n  clear screen to black\n  write ">>> + + + <<<" at 2, 2 in yellow\n  draw rect at 8, 8 size 16, 16 in red\nrun game with update and draw\n';
const ID = 'abc123def4';

const backup = fs.existsSync(DB) ? fs.readFileSync(DB, 'utf8') : null;
fs.mkdirSync(path.dirname(DB), { recursive: true });
fs.writeFileSync(DB, JSON.stringify({
  users: {}, nicks: {}, sessions: {}, states: {}, codes: {}, classes: {},
  community: [{ id: ID, name: 'A Shared Game', code: GAME, ownerId: 'u1', author: 'someone', at: Date.now() }],
}));

const api = spawn(process.execPath, [path.join(ROOT, 'apid', 'server.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await sleep(900);

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok ? '' : '  — ' + detail)); };

try {
  const page = await fetch(`http://127.0.0.1:${PORT}/s/${ID}`);
  const html = await page.text();
  check('/s/<id> answers 200 with HTML', page.status === 200 && /text\/html/.test(page.headers.get('content-type') || ''), `${page.status} ${page.headers.get('content-type')}`);
  check('it carries OG + Twitter tags for the game',
    /<meta property="og:title" content="A Shared Game — made in fc">/.test(html)
    && /<meta property="og:url" content="[^"]*\/s\/abc123def4">/.test(html)
    && /<meta property="og:image" content="[^"]*\/og-image\.png">/.test(html)
    && /<meta name="twitter:card" content="summary_large_image">/.test(html), html.slice(0, 200));
  check('it names the game in the title and canonical link',
    /<title>A Shared Game — a game made in fc · codeonline\.io<\/title>/.test(html) && /<link rel="canonical" href="[^"]*\/s\/abc123def4">/.test(html), html.slice(0, 200));

  const m = html.match(/location\.replace\("\/\?code=([^"]+)"\)/);
  const decoded = m ? Buffer.from(decodeURIComponent(m[1]), 'base64').toString('utf8') : '';
  check('the redirect carries the game back out, byte for byte', decoded === GAME, JSON.stringify({ got: decoded.slice(0, 40) }));
  check('the embedded code is percent-encoded (a "+" would otherwise become a space)',
    !!m && !/\+/.test(m[1]) && /%2B/i.test(m[1]), m ? m[1].slice(0, 60) : 'no code found');

  const missing = await fetch(`http://127.0.0.1:${PORT}/s/deadbeef00`);
  check('an unknown id is a 404, not an empty page', missing.status === 404, String(missing.status));
} catch (e) {
  check('share-e2e ran without an exception', false, e && e.message);
} finally {
  api.kill();
  await sleep(150);
  if (backup === null) { try { fs.rmSync(DB, { force: true }); } catch (_) {} } else fs.writeFileSync(DB, backup);
}
const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} share-page checks pass`);
process.exit(failed ? 1 : 0);
