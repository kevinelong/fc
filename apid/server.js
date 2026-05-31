'use strict';
// codeonline.io API daemon — third-party auth (Google + GitHub), self-hosted.
// Sessions are server-side: an opaque httpOnly cookie maps to a user record.
// No framework; just node:http + jose (for verifying Google ID tokens).

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { jwtVerify, createRemoteJWKSet } = require('jose');
const { adjectives, nouns, profanity } = require('./words');

// ---- config (.env, simple KEY=VALUE) ----
const ENV = (() => {
  const out = {};
  try {
    for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].trim();
    }
  } catch (_) {}
  return out;
})();
const GOOGLE_CLIENT_ID = ENV.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
const GITHUB_CLIENT_ID = ENV.GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = ENV.GITHUB_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET || '';
const ORIGIN = (ENV.ORIGIN || process.env.ORIGIN || 'https://codeonline.io').replace(/\/$/, '');
const PORT = Number(ENV.PORT || process.env.PORT || 8092);
const COOKIE = 'co_sess';
const STATE_COOKIE = 'co_ghstate';
const SESSION_TTL = 1000 * 60 * 60 * 24 * 60; // 60 days

// ---- tiny JSON store (atomic writes) ----
const DB_FILE = path.join(__dirname, 'data', 'db.json');
let db = { users: {}, nicks: {}, sessions: {}, states: {} };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))); } catch (_) {}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DB_FILE + '.tmp';
    try { fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, DB_FILE); } catch (e) { console.error('save failed', e.message); }
  }, 50);
}

// ---- nicknames ----
const pick = (a) => a[crypto.randomInt(a.length)];
function isProfane(s) { const l = s.toLowerCase(); return profanity.some(w => l.includes(w)); }
function nickTaken(nick) { return !!db.nicks[nick.toLowerCase()]; }
function generateNickname() {
  for (let i = 0; i < 40; i++) {
    const n = pick(adjectives) + pick(nouns) + crypto.randomInt(1, 1000);
    if (!nickTaken(n)) return n;
  }
  return 'player' + crypto.randomInt(100000, 1000000); // last resort
}
// returns {ok} or {error}
function validateNickname(raw) {
  const nick = String(raw || '').trim().toLowerCase();
  if (!/^[a-z0-9]{3,20}$/.test(nick)) return { error: 'Use 3–20 letters and numbers only.' };
  if (isProfane(nick)) return { error: 'That nickname isn’t allowed.' };
  if (nickTaken(nick)) return { error: 'That nickname is taken.' };
  return { ok: true, nick };
}

// ---- sessions / users ----
function newSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = { userId, createdAt: Date.now() };
  save();
  return token;
}
function sessionUser(token) {
  const s = token && db.sessions[token];
  if (!s) return null;
  if (Date.now() - s.createdAt > SESSION_TTL) { delete db.sessions[token]; save(); return null; }
  return db.users[s.userId] || null;
}
function findOrCreateUser(provider, providerId) {
  const id = provider + ':' + providerId;
  let u = db.users[id];
  if (!u) {
    const nickname = generateNickname();
    u = { id, provider, nickname, createdAt: Date.now() };
    db.users[id] = u;
    db.nicks[nickname.toLowerCase()] = id;
    save();
  }
  return u;
}
function publicUser(u) { return u ? { nickname: u.nickname, provider: u.provider, since: u.createdAt } : null; }

// ---- http helpers ----
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
function setCookie(res, name, value, maxAgeMs) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax'];
  if (maxAgeMs != null) parts.push(`Max-Age=${Math.floor(maxAgeMs / 1000)}`);
  const prev = res.getHeader('Set-Cookie') || [];
  res.setHeader('Set-Cookie', [].concat(prev, parts.join('; ')));
}
function clearCookie(res, name) { setCookie(res, name, '', 0); }
function json(res, code, obj) { const b = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(b); }
function redirect(res, to) { res.writeHead(302, { Location: to }); res.end(); }
function readBody(req) {
  return new Promise((resolve) => {
    let data = ''; let tooBig = false;
    req.on('data', c => { data += c; if (data.length > 1e4) { tooBig = true; req.destroy(); } });
    req.on('end', () => { if (tooBig) return resolve({}); try { resolve(JSON.parse(data || '{}')); } catch (_) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

const googleJWKS = GOOGLE_CLIENT_ID ? createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs')) : null;

// ---- routes ----
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, ORIGIN);
  const p = u.pathname;
  const method = req.method;
  // CSRF: state-changing POSTs must carry our custom header (browsers can't add it cross-site without CORS).
  const csrfOk = method !== 'POST' || req.headers['x-co'] === '1';

  try {
    if (p === '/api/auth/health') return json(res, 200, { ok: true, providers: { google: !!GOOGLE_CLIENT_ID, github: !!GITHUB_CLIENT_ID } });

    if (p === '/api/auth/config') {
      return json(res, 200, {
        providers: {
          google: GOOGLE_CLIENT_ID ? { clientId: GOOGLE_CLIENT_ID } : null,
          github: !!(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET),
        },
      });
    }

    if (p === '/api/auth/me') {
      const user = sessionUser(parseCookies(req)[COOKIE]);
      return json(res, 200, { user: publicUser(user) });
    }

    if (p === '/api/auth/google' && method === 'POST') {
      if (!csrfOk) return json(res, 403, { error: 'bad request' });
      if (!googleJWKS) return json(res, 503, { error: 'Google login not configured' });
      const body = await readBody(req);
      if (!body.credential) return json(res, 400, { error: 'missing credential' });
      let payload;
      try {
        ({ payload } = await jwtVerify(body.credential, googleJWKS, {
          issuer: ['https://accounts.google.com', 'accounts.google.com'],
          audience: GOOGLE_CLIENT_ID,
        }));
      } catch (e) { return json(res, 401, { error: 'invalid Google token' }); }
      const user = findOrCreateUser('google', payload.sub);
      setCookie(res, COOKIE, newSession(user.id), SESSION_TTL);
      return json(res, 200, { user: publicUser(user) });
    }

    if (p === '/api/auth/github/start') {
      if (!(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET)) return json(res, 503, { error: 'GitHub login not configured' });
      const state = crypto.randomBytes(16).toString('hex');
      setCookie(res, STATE_COOKIE, state, 1000 * 60 * 10);
      const auth = new URL('https://github.com/login/oauth/authorize');
      auth.searchParams.set('client_id', GITHUB_CLIENT_ID);
      auth.searchParams.set('redirect_uri', ORIGIN + '/api/auth/github/callback');
      auth.searchParams.set('scope', 'read:user');
      auth.searchParams.set('state', state);
      return redirect(res, auth.toString());
    }

    if (p === '/api/auth/github/callback') {
      const code = u.searchParams.get('code');
      const state = u.searchParams.get('state');
      const cookieState = parseCookies(req)[STATE_COOKIE];
      clearCookie(res, STATE_COOKIE);
      if (!code || !state || state !== cookieState) return redirect(res, '/?login=error');
      // exchange code -> access token
      const tokRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET, code, redirect_uri: ORIGIN + '/api/auth/github/callback' }),
      }).then(r => r.json()).catch(() => ({}));
      if (!tokRes.access_token) return redirect(res, '/?login=error');
      const ghUser = await fetch('https://api.github.com/user', {
        headers: { Authorization: 'Bearer ' + tokRes.access_token, 'User-Agent': 'codeonline-apid', Accept: 'application/vnd.github+json' },
      }).then(r => r.json()).catch(() => ({}));
      if (!ghUser.id) return redirect(res, '/?login=error');
      const user = findOrCreateUser('github', String(ghUser.id));
      setCookie(res, COOKIE, newSession(user.id), SESSION_TTL);
      return redirect(res, '/?login=ok');
    }

    if (p === '/api/auth/nickname' && method === 'POST') {
      if (!csrfOk) return json(res, 403, { error: 'bad request' });
      const user = sessionUser(parseCookies(req)[COOKIE]);
      if (!user) return json(res, 401, { error: 'not signed in' });
      const body = await readBody(req);
      const v = validateNickname(body.nickname);
      if (v.error) return json(res, 400, { error: v.error });
      delete db.nicks[user.nickname.toLowerCase()];
      user.nickname = v.nick;
      db.nicks[v.nick] = user.id;
      save();
      return json(res, 200, { user: publicUser(user) });
    }

    if (p === '/api/auth/logout' && method === 'POST') {
      if (!csrfOk) return json(res, 403, { error: 'bad request' });
      const token = parseCookies(req)[COOKIE];
      if (token) { delete db.sessions[token]; save(); }
      clearCookie(res, COOKIE);
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { error: 'not found' });
  } catch (e) {
    console.error('handler error', e);
    return json(res, 500, { error: 'server error' });
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`apid listening on 127.0.0.1:${PORT} (google=${!!GOOGLE_CLIENT_ID} github=${!!GITHUB_CLIENT_ID})`));
