#!/usr/bin/env node
// release-check — the deploy can rot in two quiet ways, so both are pinned here.
//
// 1. The service worker's strategy. It is the difference between "users get the new build" and
//    "the PWA pinned me to a stale version", and nothing tested it. Its own comment says the
//    precache tolerates misses (`.catch(() => {})`), which means a path that no longer exists —
//    a renamed example, a moved page — stops being cached *silently*. Every listed path is
//    checked against the repo.
// 2. The update nudge. Installed apps compare their baked versionCode against the live
//    `fc-version.js`, so that file must match the newest published release: bumping it before the
//    APK is published points every install at the wrong download (the mistake that was hand-warned
//    in DISTRIBUTION.md, and is now a check).
//
//   node tools/release-check.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  — ' + detail : ''}`); };

const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

// ---- 1. the service worker's strategy ---------------------------------------
check('HTML and navigations are network-first (a deploy can actually update a PWA)',
  /e\.respondWith\(isHtml \? networkFirst\(req\) : staleWhileRevalidate\(req\)\)/.test(sw)
  && /async function networkFirst/.test(sw),
  'the fetch handler no longer routes navigations through networkFirst');

check('sub-assets are stale-while-revalidate (fast, and refreshed in the background)',
  /async function staleWhileRevalidate/.test(sw) && /cache\.put\(req, res\.clone\(\)\)/.test(sw));

check('/fc.apk is never cached or intercepted (it is a 50MB binary)',
  /url\.pathname === '\/fc\.apk'\)\s*return/.test(sw));

check('/api/* and non-GET requests are never intercepted (auth and writes must be live)',
  /req\.method !== 'GET'\)\s*return/.test(sw) && /url\.pathname\.startsWith\('\/api\/'\)\)\s*return/.test(sw));

check('the caches are versioned, so a bump can evict old ones',
  /const VERSION = 'v[0-9.]+'/.test(sw)
  && /const CORE = 'fc-core-' \+ VERSION/.test(sw)
  && /keys\.filter\(\(k\) => k !== CORE && k !== RUNTIME\)/.test(sw));

// ---- 2. every precached path still exists -----------------------------------
// '/' and '/docs/' are directory URLs served as index.html.
const listMatch = sw.match(/const CORE_ASSETS = \[([\s\S]*?)\];/);
if (!listMatch) { check('CORE_ASSETS is present', false, 'could not find the precache list'); }
else {
  const paths = listMatch[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  const resolves = p => {
    const rel = p === '/' ? 'index.html' : (p.endsWith('/') ? p.slice(1) + 'index.html' : p.slice(1));
    return fs.existsSync(path.join(ROOT, rel));
  };
  const gone = paths.filter(p => !resolves(p));
  check(`every precached path exists (${paths.length} listed)`, gone.length === 0,
    `missing: ${gone.join(', ')}`);
}

// ---- 3. fc-version.js matches the newest published release ------------------
// Installed apps read this file to decide whether to nudge; the release tag carries the
// versionCode it should be advertising (v1.0.3-4 -> 4).
const verSrc = fs.readFileSync(path.join(ROOT, 'fc-version.js'), 'utf8');
const verMatch = verSrc.match(/"versionCode"\s*:\s*(\d+)/);
check('fc-version.js advertises a versionCode', !!verMatch, verSrc.trim().slice(0, 80));
if (verMatch) {
  let tag = null, why = '';
  try {
    const r = await fetch('https://api.github.com/repos/kevinelong/fc-releases/releases/latest', {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'fc-release-check' },
    });
    if (r.ok) tag = (await r.json()).tag_name || null;
    else why = `GitHub answered ${r.status}`;
  } catch (e) { why = e.message; }
  check('the newest published release could be read (no network is a failure, not a skip)',
    !!tag, why);
  if (tag) {
    const m = tag.match(/-(\d+)$/);
    const code = m ? Number(m[1]) : null;
    check(`fc-version.js matches the published release (tag ${tag} -> versionCode ${code})`,
      code !== null && Number(verMatch[1]) === code,
      `fc-version.js says ${verMatch[1]}, the release tag says ${code}`);
  }
}

const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} release checks pass`);
// Set the code rather than calling process.exit(): an open fetch handle plus a forced exit trips
// a libuv assertion on Windows ("!(handle->flags & UV_HANDLE_CLOSING)") and prints noise after the
// summary, which reads like a failure.
process.exitCode = failed ? 1 : 0;
