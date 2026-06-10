'use strict';
// codeonline.io API daemon — third-party auth (Google + GitHub), self-hosted.
// Sessions are server-side: an opaque httpOnly cookie maps to a user record.
// No framework; just node:http + jose (for verifying Google ID tokens).

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { jwtVerify, createRemoteJWKSet } = require('jose');
const nodemailer = require('nodemailer');
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

// ---- email (Gmail SMTP relay) ----
const SMTP = {
  user: ENV.EMAIL_HOST_USER || process.env.EMAIL_HOST_USER || '',
  pass: ENV.EMAIL_HOST_PASSWORD || process.env.EMAIL_HOST_PASSWORD || '',
  host: ENV.SMTP_HOST || 'smtp.gmail.com',
  port: Number(ENV.SMTP_PORT || 587),
};
const MAIL_FROM = ENV.MAIL_FROM || SMTP.user;
const mailer = SMTP.user ? nodemailer.createTransport({ host: SMTP.host, port: SMTP.port, secure: SMTP.port === 465, auth: { user: SMTP.user, pass: SMTP.pass } }) : null;
async function sendCode(to, code) {
  if (!mailer) throw new Error('mail not configured');
  await mailer.sendMail({
    from: MAIL_FROM,
    to,
    subject: `Your codeonline.io code: ${code}`,
    text: `Welcome to codeonline.io!\n\nYour verification code is: ${code}\n\nIt expires in 10 minutes. If this wasn't you, you can ignore this email.`,
  });
}
const EMAIL = { TTL: 10 * 60 * 1000, MAX_ATTEMPTS: 5, RESEND_COOLDOWN: 30 * 1000 };

// ---- tiny JSON store (atomic writes) ----
const DB_FILE = path.join(__dirname, 'data', 'db.json');
let db = { users: {}, nicks: {}, sessions: {}, states: {}, codes: {}, community: [] };
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
function findOrCreateUser(provider, providerId, email) {
  const id = provider + ':' + providerId;
  let u = db.users[id];
  if (!u) {
    const nickname = generateNickname();
    u = { id, provider, email: email || '', emailVerified: false, nickname, createdAt: Date.now() };
    db.users[id] = u;
    db.nicks[nickname.toLowerCase()] = id;
    save();
  } else if (email && !u.email) { u.email = email; save(); }
  return u;
}
function maskEmail(e) { if (!e || !e.includes('@')) return ''; const [u, d] = e.split('@'); return (u.length <= 2 ? (u[0] || '') : u.slice(0, 2)) + '***@' + d; }
function publicUser(u) { return u ? { nickname: u.nickname, provider: u.provider, since: u.createdAt, emailVerified: !!u.emailVerified, email: maskEmail(u.email) } : null; }
// generate + email a fresh code (mandatory verification gate)
async function startVerification(user) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  db.codes[user.id] = { code, expires: Date.now() + EMAIL.TTL, attempts: 0, sentAt: Date.now() };
  save();
  await sendCode(user.email, code);
}

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
  const csrfOk = method === 'GET' || method === 'HEAD' || req.headers['x-co'] === '1';

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
      const user = findOrCreateUser('google', payload.sub, payload.email);
      setCookie(res, COOKIE, newSession(user.id), SESSION_TTL);
      if (!user.emailVerified) {
        try { await startVerification(user); } catch (e) { return json(res, 200, { user: publicUser(user), needVerify: true, mailError: true }); }
        return json(res, 200, { user: publicUser(user), needVerify: true });
      }
      return json(res, 200, { user: publicUser(user) });
    }

    if (p === '/api/auth/github/start') {
      if (!(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET)) return json(res, 503, { error: 'GitHub login not configured' });
      const state = crypto.randomBytes(16).toString('hex');
      setCookie(res, STATE_COOKIE, state, 1000 * 60 * 10);
      const auth = new URL('https://github.com/login/oauth/authorize');
      auth.searchParams.set('client_id', GITHUB_CLIENT_ID);
      auth.searchParams.set('redirect_uri', ORIGIN + '/api/auth/github/callback');
      auth.searchParams.set('scope', 'read:user user:email gist');
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
      // GitHub may hide the public email; fetch the verified primary from /user/emails
      let email = ghUser.email || '';
      if (!email) {
        const emails = await fetch('https://api.github.com/user/emails', {
          headers: { Authorization: 'Bearer ' + tokRes.access_token, 'User-Agent': 'codeonline-apid', Accept: 'application/vnd.github+json' },
        }).then(r => r.json()).catch(() => []);
        if (Array.isArray(emails)) {
          const prim = emails.find(e => e.primary && e.verified) || emails.find(e => e.verified) || emails[0];
          if (prim) email = prim.email;
        }
      }
      const user = findOrCreateUser('github', String(ghUser.id), email);
      // store the token + login so the user can push games to a GitHub gist
      user.gh_token = tokRes.access_token; user.gh_login = ghUser.login || ''; save();
      setCookie(res, COOKIE, newSession(user.id), SESSION_TTL);
      if (!user.emailVerified) {
        if (user.email) { try { await startVerification(user); } catch (_) {} }
        return redirect(res, '/?verify=1');
      }
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

    if (p === '/api/auth/verify' && method === 'POST') {
      if (!csrfOk) return json(res, 403, { error: 'bad request' });
      const user = sessionUser(parseCookies(req)[COOKIE]);
      if (!user) return json(res, 401, { error: 'not signed in' });
      if (user.emailVerified) return json(res, 200, { user: publicUser(user) });
      const rec = db.codes[user.id];
      if (!rec) return json(res, 400, { error: 'No code pending — request a new one.' });
      if (Date.now() > rec.expires) { delete db.codes[user.id]; save(); return json(res, 400, { error: 'Code expired — request a new one.' }); }
      if (rec.attempts >= EMAIL.MAX_ATTEMPTS) { delete db.codes[user.id]; save(); return json(res, 429, { error: 'Too many tries — request a new code.' }); }
      const body = await readBody(req);
      if (String(body.code || '').trim() !== rec.code) { rec.attempts++; save(); return json(res, 400, { error: 'Incorrect code.' }); }
      user.emailVerified = true; delete db.codes[user.id]; save();
      return json(res, 200, { user: publicUser(user) });
    }

    if (p === '/api/auth/resend' && method === 'POST') {
      if (!csrfOk) return json(res, 403, { error: 'bad request' });
      const user = sessionUser(parseCookies(req)[COOKIE]);
      if (!user) return json(res, 401, { error: 'not signed in' });
      if (user.emailVerified) return json(res, 200, { ok: true });
      if (!user.email) return json(res, 400, { error: 'No email on file for this account.' });
      const rec = db.codes[user.id];
      if (rec && Date.now() - rec.sentAt < EMAIL.RESEND_COOLDOWN) return json(res, 429, { error: 'Please wait a moment before resending.' });
      try { await startVerification(user); } catch (e) { return json(res, 500, { error: 'Could not send email — try again shortly.' }); }
      return json(res, 200, { ok: true, email: maskEmail(user.email) });
    }

    // upload the current game to a GitHub gist (requires a github session + token)
    if (p === '/api/games/gist' && method === 'POST') {
      if (!csrfOk) return json(res, 403, { error: 'bad request' });
      const user = sessionUser(parseCookies(req)[COOKIE]);
      if (!user) return json(res, 401, { error: 'not signed in' });
      if (user.provider !== 'github' || !user.gh_token) return json(res, 403, { error: 'reconnect', detail: 'Sign out and sign in with GitHub again to enable upload.' });
      const body = await readBody(req);
      const code = String(body.code || '');
      if (!code.trim()) return json(res, 400, { error: 'nothing to upload' });
      const clean = String(body.name || 'game').replace(/[^a-z0-9 _-]/gi, '').trim() || 'game';
      const fname = clean.toLowerCase().replace(/\s+/g, '-') + '.fc';
      try {
        const gh = await fetch('https://api.github.com/gists', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + user.gh_token, 'User-Agent': 'codeonline-apid', Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: 'fc game: ' + clean + ' — made at https://codeonline.io', public: body.public !== false, files: { [fname]: { content: code } } }),
        });
        const g = await gh.json().catch(() => ({}));
        if (gh.status === 401) { user.gh_token = ''; save(); return json(res, 403, { error: 'reconnect', detail: 'GitHub token expired — sign out and sign in again.' }); }
        if (!gh.ok || !g.html_url) return json(res, 502, { error: (g && g.message) ? ('GitHub: ' + g.message) : 'GitHub upload failed.' });
        return json(res, 200, { url: g.html_url });
      } catch (e) { return json(res, 502, { error: 'Could not reach GitHub.' }); }
    }

    // ---- Community gallery: publish / browse / delete-your-own ----
    if (p === '/api/games/community' && method === 'GET') {
      const me = sessionUser(parseCookies(req)[COOKIE]);
      const list = (db.community || []).slice(-60).reverse().map(g => ({
        id: g.id, name: g.name, author: g.author, at: g.at, code: g.code,
        mine: !!(me && g.ownerId === me.id),
      }));
      return json(res, 200, { games: list });
    }
    if (p === '/api/games/publish' && method === 'POST') {
      if (!csrfOk) return json(res, 403, { error: 'bad request' });
      const user = sessionUser(parseCookies(req)[COOKIE]);
      if (!user) return json(res, 401, { error: 'sign in to publish' });
      const body = await readBody(req);
      const code = String(body.code || '');
      if (!code.trim()) return json(res, 400, { error: 'nothing to publish' });
      if (code.length > 16000) return json(res, 400, { error: 'game too big to publish (16 KB max)' });
      const name = (String(body.name || '').replace(/[^\w \-!?.()]/g, '').trim() || 'Untitled').slice(0, 40);
      if (!db.community) db.community = [];
      if (db.community.filter(g => g.ownerId === user.id).length >= 20) return json(res, 429, { error: 'Publish limit reached (20) — delete some first.' });
      const id = crypto.randomBytes(6).toString('hex');
      db.community.push({ id, name, code, ownerId: user.id, author: user.nickname, at: Date.now() });
      if (db.community.length > 500) db.community = db.community.slice(-500);
      save();
      return json(res, 200, { id, name });
    }
    if (p.startsWith('/api/games/community/') && method === 'DELETE') {
      if (!csrfOk) return json(res, 403, { error: 'bad request' });
      const user = sessionUser(parseCookies(req)[COOKIE]);
      if (!user) return json(res, 401, { error: 'not signed in' });
      const id = p.slice('/api/games/community/'.length);
      const i = (db.community || []).findIndex(g => g.id === id);
      if (i < 0) return json(res, 404, { error: 'not found' });
      if (db.community[i].ownerId !== user.id) return json(res, 403, { error: 'not yours to delete' });
      db.community.splice(i, 1); save();
      return json(res, 200, { ok: true });
    }

    // ---- tpos: trailer-portal sales inquiries (store + email notify) ----
    if (p === '/api/tpos/inquiry' && method === 'POST') {
      if (!csrfOk) return json(res, 403, { error: 'bad request' });
      const body = await readBody(req);
      const clean = (v, n) => String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, n);
      const name = clean(body.name, 80);
      const phone = clean(body.phone, 40);
      const email = clean(body.email, 120);
      const subject = clean(body.subject, 140) || 'Trailer inquiry';
      const message = String(body.message == null ? '' : body.message).trim().slice(0, 4000);
      if (!name || (!phone && !email)) return json(res, 400, { error: 'name and a phone or email are required' });
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(res, 400, { error: 'invalid email' });
      if (!db.tpos_inquiries) db.tpos_inquiries = [];
      const inq = { id: crypto.randomBytes(6).toString('hex'), name, phone, email, subject, message, at: Date.now(), ua: clean(req.headers['user-agent'], 200) };
      db.tpos_inquiries.push(inq);
      if (db.tpos_inquiries.length > 2000) db.tpos_inquiries = db.tpos_inquiries.slice(-2000);
      save();
      const to = ENV.TPOS_SALES_EMAIL || MAIL_FROM;
      if (mailer && to) {
        mailer.sendMail({
          from: MAIL_FROM, to, replyTo: email || undefined,
          subject: `[TPOS] ${subject} — ${name}`,
          text: `New trailer-portal inquiry\n\nSubject: ${subject}\nName:  ${name}\nPhone: ${phone || '—'}\nEmail: ${email || '—'}\n\n${message || '(no message)'}\n\n— sent ${new Date(inq.at).toISOString()}`,
        }).catch(e => console.error('tpos mail failed', e.message));
      }
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { error: 'not found' });
  } catch (e) {
    console.error('handler error', e);
    return json(res, 500, { error: 'server error' });
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`apid listening on 127.0.0.1:${PORT} (google=${!!GOOGLE_CLIENT_ID} github=${!!GITHUB_CLIENT_ID})`));
