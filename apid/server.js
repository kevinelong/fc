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
// Classroom mode — OFF by default (ships dark; /api/class/* returns 404 until enabled).
// Privacy-first: a teacher account creates a class code; students join with the code and
// a display name only — no email, no student accounts, no PII. See docs/PLAN-classroom.md.
const ENABLE_CLASSROOM = (ENV.ENABLE_CLASSROOM || process.env.ENABLE_CLASSROOM || 'false').toLowerCase() === 'true';
const CLASS = { MAX_STUDENTS: 60, MAX_PER_TEACHER: 20, MAX_ASSIGNED: 40, MAX_SUBMISSIONS: 200, IDLE_PURGE_MS: 90 * 24 * 60 * 60 * 1000, CODE_BODY_MAX: 32 * 1024 };

// AI "generate/heal" tier (safety net Phase 2). Ships DARK: /api/generate returns
// 503 unless BOTH a key is present (apid/.env, server-side only) AND explicitly
// enabled. Login-gated + per-user and global daily caps so it can't run up a bill.
const ANTHROPIC_KEY = ENV.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || '';
const ENABLE_GENERATE = (ENV.ENABLE_GENERATE || process.env.ENABLE_GENERATE || 'false').toLowerCase() === 'true';
const GEN_DAILY_PER_USER = Number(ENV.GEN_DAILY_PER_USER || process.env.GEN_DAILY_PER_USER || 30);
const GEN_DAILY_GLOBAL = Number(ENV.GEN_DAILY_GLOBAL || process.env.GEN_DAILY_GLOBAL || 500);
const GEN_PROMPT_MAX = 1000;
const genUsage = { day: '', global: 0, perUser: {} };   // in-memory daily counters (reset at UTC midnight)
function genQuota(userId) {
  const today = new Date().toISOString().slice(0, 10);
  if (genUsage.day !== today) { genUsage.day = today; genUsage.global = 0; genUsage.perUser = {}; }
  if (genUsage.global >= GEN_DAILY_GLOBAL) return { ok: false, why: 'daily capacity reached — try again tomorrow' };
  if ((genUsage.perUser[userId] || 0) >= GEN_DAILY_PER_USER) return { ok: false, why: 'you have hit your daily generate limit' };
  return { ok: true };
}
function genTick(userId) { genUsage.global++; genUsage.perUser[userId] = (genUsage.perUser[userId] || 0) + 1; }

// Pool Room ballot receiver (github.com/kevinelong/pool-room-blender). A public,
// cross-origin (github.io) write endpoint — bounded by simple in-memory limits so
// it can't flood the file. Appends to data/poolroom-ballots.jsonl (gitignored).
const BALLOTS_FILE = path.join(__dirname, 'data', 'poolroom-ballots.jsonl');
const ballotLimit = { hour: -1, global: 0, day: '', perIp: {} };
function ballotQuota(ip) {
  const now = new Date(), h = now.getUTCHours(), today = now.toISOString().slice(0, 10);
  if (ballotLimit.day !== today) { ballotLimit.day = today; ballotLimit.global = 0; }
  if (ballotLimit.hour !== h) { ballotLimit.hour = h; ballotLimit.perIp = {}; }
  if (ballotLimit.global >= 2000) return false;               // global daily cap
  if ((ballotLimit.perIp[ip] || 0) >= 30) return false;       // per-IP hourly cap
  ballotLimit.perIp[ip] = (ballotLimit.perIp[ip] || 0) + 1; ballotLimit.global++;
  return true;
}

// Pool Room per-client layouts: anonymous key/value store. The client mints a
// random `cid` in localStorage (no login); we namespace one JSON file per cid.
// cid is validated to hex BEFORE it touches the filesystem (it's used as a
// filename — path-traversal guard). No IP or PII stored with layouts.
const LAYOUTS_DIR = path.join(__dirname, 'data', 'poolroom-layouts');
try { fs.mkdirSync(LAYOUTS_DIR, { recursive: true }); } catch (_) {}
const CID_RE = /^[a-f0-9]{16,64}$/;
const LAYOUT_MAX = 65536;   // 64 KB per client
const layoutLimit = { hour: -1, global: 0, day: '', perIp: {} };
function layoutWriteQuota(ip) {
  const now = new Date(), h = now.getUTCHours(), today = now.toISOString().slice(0, 10);
  if (layoutLimit.day !== today) { layoutLimit.day = today; layoutLimit.global = 0; }
  if (layoutLimit.hour !== h) { layoutLimit.hour = h; layoutLimit.perIp = {}; }
  if (layoutLimit.global >= 5000) return false;               // global daily write cap
  if ((layoutLimit.perIp[ip] || 0) >= 120) return false;      // per-IP hourly write cap
  layoutLimit.perIp[ip] = (layoutLimit.perIp[ip] || 0) + 1; layoutLimit.global++;
  return true;
}
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
let db = { users: {}, nicks: {}, sessions: {}, states: {}, codes: {}, community: [], classes: {} };
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

// ---- classroom helpers ----
// short, human-readable, unambiguous code (no I/O/0/1/L), e.g. "SKY-482"
function genClassCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 50; attempt++) {
    let c = '';
    for (let i = 0; i < 6; i++) c += A[crypto.randomInt(A.length)];
    const code = c.slice(0, 3) + '-' + c.slice(3);
    if (!db.classes[code]) return code;
  }
  return 'C-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}
// a safe student display name: take a clean provided name, else generate one
function studentName(raw) {
  const n = String(raw || '').trim().slice(0, 20);
  if (/^[A-Za-z0-9 ]{2,20}$/.test(n) && !isProfane(n)) return n;
  return pick(adjectives) + pick(nouns);   // profanity-free by construction
}
// delete classes with no activity for IDLE_PURGE_MS (called opportunistically)
function purgeIdleClasses() {
  const now = Date.now(); let changed = false;
  for (const [code, c] of Object.entries(db.classes || {})) {
    if (now - (c.lastActive || c.createdAt || 0) > CLASS.IDLE_PURGE_MS) { delete db.classes[code]; changed = true; }
  }
  if (changed) save();
}
// what a client sees for a class. Everyone in the class can play the assigned games
// and classmates' submissions (that's the point); only the teacher sees the roster.
function classView(c, isOwner, myName) {
  const v = {
    code: c.code, name: c.name, teacher: c.ownerNick,
    assigned: c.assigned.map(a => ({ id: a.id, title: a.title, code: a.code })),
    submissions: c.submissions.map(s => ({ id: s.id, name: s.name, title: s.title, code: s.code, at: s.at })),
    students: c.students.length, isOwner: !!isOwner,
  };
  if (myName) v.you = myName;
  if (isOwner) v.roster = c.students.map(s => ({ name: s.name, joinedAt: s.joinedAt }));
  return v;
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
function readBody(req, max = 1e4) {
  return new Promise((resolve) => {
    let data = ''; let tooBig = false;
    req.on('data', c => { data += c; if (data.length > max) { tooBig = true; req.destroy(); } });
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
      const body = await readBody(req, 32 * 1024);   // games can be up to 16KB; allow headroom for JSON envelope
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

    // ---- /s/<id>: a shared community game, with OG tags for scrapers --------------
    // Client ?code= links cannot carry meta for crawlers, so a published game gets a
    // server-rendered page: tags for the preview, then a redirect into the game.
    {
      const sm = p.match(/^\/s\/([a-f0-9]{6,32})\/?$/);
      if (sm && method === 'GET') {
        const g = (db.community || []).find(x => x.id === sm[1]);
        if (!g) return json(res, 404, { error: 'not found' });
        const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const title = esc(String(g.name || 'A game').slice(0, 60));
        const desc = 'A game made with plain English in fc — play it free, no install, right in your browser.';
        const url = ORIGIN + '/s/' + g.id;
        const img = ORIGIN + '/og-image.png';
        // the base64 must be percent-encoded or a `+` in it turns into a space
        const code = encodeURIComponent(Buffer.from(String(g.code || ''), 'utf8').toString('base64'));
        const html = '<!doctype html>\n<html lang="en"><head>\n<meta charset="utf-8">\n'
          + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
          + '<title>' + title + ' — a game made in fc · codeonline.io</title>\n'
          + '<meta name="description" content="' + esc(desc) + '">\n'
          + '<link rel="canonical" href="' + url + '">\n'
          + '<meta property="og:type" content="website">\n<meta property="og:site_name" content="codeonline.io">\n'
          + '<meta property="og:title" content="' + title + ' — made in fc">\n'
          + '<meta property="og:description" content="' + esc(desc) + '">\n'
          + '<meta property="og:url" content="' + url + '">\n'
          + '<meta property="og:image" content="' + img + '">\n'
          + '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n'
          + '<meta name="twitter:card" content="summary_large_image">\n'
          + '<meta name="twitter:title" content="' + title + ' — made in fc">\n'
          + '<meta name="twitter:description" content="' + esc(desc) + '">\n'
          + '<meta name="twitter:image" content="' + img + '">\n'
          + '<script>location.replace("/?code=' + code + '");</script>\n'
          + '</head><body style="background:#0b0b0b;color:#8a7340;font-family:monospace;padding:24px">'
          + 'Loading ' + title + '… <a style="color:#c8a96e" href="/?code=' + code + '">play it</a></body></html>';
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
      }
    }

    // ---- Classroom mode (opt-in via ENABLE_CLASSROOM; PII-free: class code + display name) ----
    if (p.startsWith('/api/class')) {
      if (!ENABLE_CLASSROOM) return json(res, 404, { error: 'not found' });
      // feature probe: the app shows the classroom UI only when this answers 200
      if (p === '/api/class/enabled') return json(res, 200, { enabled: true });
      purgeIdleClasses();

      if (p === '/api/class/new' && method === 'POST') {          // teacher creates a class
        if (!csrfOk) return json(res, 403, { error: 'bad request' });
        const user = sessionUser(parseCookies(req)[COOKIE]);
        if (!user) return json(res, 401, { error: 'sign in to create a class' });
        if (Object.values(db.classes).filter(c => c.ownerId === user.id).length >= CLASS.MAX_PER_TEACHER)
          return json(res, 429, { error: `Class limit reached (${CLASS.MAX_PER_TEACHER}).` });
        const body = await readBody(req);
        const name = (String(body.name || '').replace(/[^\w \-!?.()]/g, '').trim() || 'My Class').slice(0, 40);
        const code = genClassCode();
        db.classes[code] = { code, ownerId: user.id, ownerNick: user.nickname, name, createdAt: Date.now(), lastActive: Date.now(), students: [], assigned: [], submissions: [] };
        save();
        return json(res, 200, { code, name });
      }

      if (p === '/api/class/join' && method === 'POST') {         // student joins with a code + display name
        if (!csrfOk) return json(res, 403, { error: 'bad request' });
        const body = await readBody(req);
        const c = db.classes[String(body.code || '').toUpperCase().trim()];
        if (!c) return json(res, 404, { error: 'No class with that code.' });
        if (c.students.length >= CLASS.MAX_STUDENTS) return json(res, 429, { error: 'This class is full.' });
        const name = studentName(body.name);
        c.students.push({ name, joinedAt: Date.now() }); c.lastActive = Date.now(); save();
        return json(res, 200, classView(c, false, name));
      }

      const m = p.match(/^\/api\/class\/([A-Z0-9-]{3,12})(?:\/(assign|submit|submission\/([a-f0-9]+)))?$/i);
      if (m) {
        const c = db.classes[m[1].toUpperCase()];
        if (!c) return json(res, 404, { error: 'not found' });
        const user = sessionUser(parseCookies(req)[COOKIE]);
        const isOwner = !!(user && user.id === c.ownerId);
        const sub = m[2];

        if (!sub && method === 'GET') return json(res, 200, classView(c, isOwner));

        if (sub === 'assign' && method === 'POST') {              // teacher assigns a game
          if (!csrfOk) return json(res, 403, { error: 'bad request' });
          if (!isOwner) return json(res, 403, { error: 'not your class' });
          const body = await readBody(req, CLASS.CODE_BODY_MAX);
          const gcode = String(body.code || '');
          if (!gcode.trim()) return json(res, 400, { error: 'nothing to assign' });
          if (gcode.length > 16000) return json(res, 400, { error: 'game too big' });
          if (c.assigned.length >= CLASS.MAX_ASSIGNED) return json(res, 429, { error: 'too many assigned games' });
          const title = (String(body.title || '').replace(/[^\w \-!?.()]/g, '').trim() || 'Untitled').slice(0, 40);
          const id = crypto.randomBytes(5).toString('hex');
          c.assigned.push({ id, title, code: gcode, at: Date.now() }); c.lastActive = Date.now(); save();
          return json(res, 200, { id, title });
        }

        if (sub === 'submit' && method === 'POST') {              // student submits a game
          if (!csrfOk) return json(res, 403, { error: 'bad request' });
          const body = await readBody(req, CLASS.CODE_BODY_MAX);
          const gcode = String(body.code || '');
          if (!gcode.trim()) return json(res, 400, { error: 'nothing to submit' });
          if (gcode.length > 16000) return json(res, 400, { error: 'game too big' });
          const id = crypto.randomBytes(5).toString('hex');
          const title = (String(body.title || '').replace(/[^\w \-!?.()]/g, '').trim() || 'Untitled').slice(0, 40);
          c.submissions.push({ id, name: studentName(body.name), title, code: gcode, at: Date.now() });
          if (c.submissions.length > CLASS.MAX_SUBMISSIONS) c.submissions = c.submissions.slice(-CLASS.MAX_SUBMISSIONS);
          c.lastActive = Date.now(); save();
          return json(res, 200, { id, title });
        }

        if (m[3] && method === 'DELETE') {                        // teacher removes a submission
          if (!csrfOk) return json(res, 403, { error: 'bad request' });
          if (!isOwner) return json(res, 403, { error: 'not your class' });
          c.submissions = c.submissions.filter(s => s.id !== m[3]); c.lastActive = Date.now(); save();
          return json(res, 200, { ok: true });
        }

        const unassign = p.match(/^\/api\/class\/([A-Z0-9-]{3,12})\/assign\/([a-f0-9]+)$/i);
        if (unassign && method === 'DELETE') {                    // teacher un-assigns a game
          if (!csrfOk) return json(res, 403, { error: 'bad request' });
          if (!isOwner) return json(res, 403, { error: 'not your class' });
          c.assigned = c.assigned.filter(a => a.id !== unassign[2]); c.lastActive = Date.now(); save();
          return json(res, 200, { ok: true });
        }

        if (!sub && method === 'DELETE') {                        // teacher deletes the class
          if (!csrfOk) return json(res, 403, { error: 'bad request' });
          if (!isOwner) return json(res, 403, { error: 'not your class' });
          delete db.classes[c.code]; save();
          return json(res, 200, { ok: true });
        }
      }
      return json(res, 404, { error: 'not found' });
    }

    // ---- tpos: trailer-portal sales inquiries (store + email notify) ----
    // ---- Cloud saves: per-user key/value backing for the fc `save`/`load` verbs ----
    if (p === '/api/state' && method === 'GET') {
      const user = sessionUser(parseCookies(req)[COOKIE]);
      if (!user) return json(res, 401, { error: 'not signed in' });
      return json(res, 200, { states: (db.states && db.states[user.id]) || {} });
    }
    if (p === '/api/state' && method === 'POST') {
      if (!csrfOk) return json(res, 403, { error: 'bad request' });
      const user = sessionUser(parseCookies(req)[COOKIE]);
      if (!user) return json(res, 401, { error: 'not signed in' });
      const body = await readBody(req);
      const updates = (body && typeof body.states === 'object' && body.states) ? body.states : {};
      if (!db.states) db.states = {};
      const mine = Object.assign({}, db.states[user.id] || {});
      for (const [k, v] of Object.entries(updates)) {
        const key = String(k).slice(0, 80);
        let sv;
        try { sv = JSON.stringify(v === undefined ? null : v); } catch (_) { continue; }
        if (sv.length > 4096) continue;                       // one value: 4KB cap
        mine[key] = JSON.parse(sv);
      }
      if (JSON.stringify(mine).length > 65536) {              // whole user: 64KB cap
        return json(res, 413, { error: 'save space full' });
      }
      db.states[user.id] = mine;
      save();
      return json(res, 200, { ok: true });
    }

    if (p === '/api/poolroom/vote') {
      // open CORS: the ballot form is hosted cross-origin on kevinelong.github.io
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      if (method !== 'POST') return json(res, 405, { ok: false });
      const ip = req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || '';
      if (!ballotQuota(ip)) return json(res, 429, { ok: false, error: 'rate limited' });
      const b = await readBody(req, 8192);
      if (!b || !Array.isArray(b.fourTwo) || !Array.isArray(b.threeThree)) return json(res, 400, { ok: false });
      const rec = {
        name: String(b.name || '').slice(0, 80),
        stakeholder: String(b.stakeholder || ''),
        fourTwo: b.fourTwo.slice(0, 2).map(x => String(x).slice(0, 60)),
        threeThree: b.threeThree.slice(0, 2).map(x => String(x).slice(0, 60)),
        comment: String(b.comment || '').slice(0, 500),
        client_ts: String(b.ts || ''), server_ts: new Date().toISOString(), ip,
      };
      try { fs.appendFileSync(BALLOTS_FILE, JSON.stringify(rec) + '\n'); }
      catch (e) { console.error('ballot write', e && e.message); return json(res, 500, { ok: false }); }
      return json(res, 200, { ok: true });
    }

    if (p === '/api/poolroom/results' && (method === 'GET' || method === 'OPTIONS')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.writeHead(204); return res.end(); }
      let ballots = [];
      try {
        ballots = fs.readFileSync(BALLOTS_FILE, 'utf8').split('\n').filter(Boolean)
          .map(l => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean)
          .map(({ ip, ...rest }) => rest);   // strip IP (PII) — results are public
      } catch (_) {}
      return json(res, 200, { ballots });
    }

    if (p === '/api/poolroom/layouts') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      if (method === 'GET') {
        const cid = String(u.searchParams.get('cid') || '');
        if (!CID_RE.test(cid)) return json(res, 400, { error: 'bad cid' });
        try {
          const obj = JSON.parse(fs.readFileSync(path.join(LAYOUTS_DIR, cid + '.json'), 'utf8'));
          return json(res, 200, { layouts: obj.layouts, updated: obj.updated || null });
        } catch (_) { return json(res, 200, { layouts: null, updated: null }); }
      }
      if (method === 'POST') {
        const ip = req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || '';
        if (!layoutWriteQuota(ip)) return json(res, 429, { ok: false, error: 'rate limited' });
        const body = await readBody(req, LAYOUT_MAX);
        const cid = String((body && body.cid) || '');
        if (!CID_RE.test(cid)) return json(res, 400, { ok: false, error: 'bad cid' });
        if (!body || !('layouts' in body)) return json(res, 400, { ok: false, error: 'no layouts' });
        const rec = JSON.stringify({ updated: new Date().toISOString(), layouts: body.layouts });
        if (rec.length > LAYOUT_MAX) return json(res, 413, { ok: false, error: 'too big' });
        try { fs.writeFileSync(path.join(LAYOUTS_DIR, cid + '.json'), rec); }
        catch (e) { console.error('layout write', e && e.message); return json(res, 500, { ok: false }); }
        return json(res, 200, { ok: true });
      }
      return json(res, 405, { ok: false });
    }

    if (p === '/api/generate' && method === 'POST') {
      if (!csrfOk) return json(res, 403, { error: 'bad request' });
      if (!ENABLE_GENERATE || !ANTHROPIC_KEY) return json(res, 503, { error: 'generate is not enabled' });
      const user = sessionUser(parseCookies(req)[COOKIE]);
      if (!user) return json(res, 401, { error: 'sign in to use generate' });
      const q = genQuota(user.id);
      if (!q.ok) return json(res, 429, { error: q.why });
      const body = await readBody(req, 4096);
      const input = String((body && body.prompt) || '').trim();
      if (!input) return json(res, 400, { error: 'empty prompt' });
      if (input.length > GEN_PROMPT_MAX) return json(res, 413, { error: 'prompt too long' });
      genTick(user.id);   // count the attempt before the (billable) call
      try {
        // llmHeal generates -> validates on the fc oracle -> self-repairs; it only
        // returns code that provably parses and runs. ESM module, loaded on demand.
        const { llmHeal } = await import('../spec/heal/llm-tier.mjs');
        const r = await llmHeal(input, { apiKey: ANTHROPIC_KEY });
        return json(res, 200, { ok: r.ok, code: r.code, attempts: r.attempts });
      } catch (e) {
        console.error('generate error', e && e.message || e);
        return json(res, 502, { error: 'generate failed' });
      }
    }

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
