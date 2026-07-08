#!/usr/bin/env node
// Per-game share pages: for each examples/*.fc, generate
//   g/<name>/index.html  — a thin, scraper-friendly landing with that game's own
//                          Open Graph/Twitter card, that then redirects a human
//                          straight into the playable game (?code=<source>).
//   share/<name>.png     — a 1200x630 OG card (the game's thumbnail enlarged +
//                          its title + tagline), so a shared /g/<name> link
//                          previews richly on Twitter/Discord/Slack/iMessage.
//
// Why a redirect page: ?code= links are static-served and social scrapers don't
// run JS, so per-game meta must live in real HTML. Humans (JS) bounce instantly
// into the game; scrapers (no JS) read the card.
//
// Title + tagline come from each .fc's first comment line ("-- TITLE · desc"),
// the single source of truth. Run: NODE_PATH=/tmp/pw2/node_modules node tools/gen-share-pages.cjs
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CHROME = process.env.CHROME || '/usr/bin/chromium';
const EX = path.join(ROOT, 'examples');
const OUT_G = path.join(ROOT, 'g');
const OUT_CARD = path.join(ROOT, 'share');
const BASE = 'https://codeonline.io';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const titleCase = s => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

// parse "-- TITLE · description" (also "-- TITLE: description") from the first line
function meta(src, name) {
  const first = (src.split('\n')[0] || '').replace(/^--\s*/, '').trim();
  let title = name, desc = '';
  const m = first.match(/^(.+?)\s*[·:]\s*(.+)$/);
  if (m) { title = m[1].trim(); desc = m[2].trim(); }
  else if (first) { title = first; }
  return { title: titleCase(title), desc };
}

const cardHtml = (title, desc, thumbAbs) => `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}html,body{width:1200px;height:630px;overflow:hidden}
body{background:radial-gradient(120% 120% at 28% 0%,#241c2e,#14110a 60%,#0b0906);color:#d8c9a8;
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;align-items:center;gap:56px;padding:60px 70px}
.shot{width:420px;height:420px;image-rendering:pixelated;border:3px solid #5a4a28;border-radius:16px;background:#000;flex:0 0 auto}
.t{flex:1}.brand{font-size:30px;color:#ffec27;font-weight:800;letter-spacing:1px}
.title{font-size:74px;font-weight:800;color:#f0e6cf;line-height:1.04;margin:8px 0 14px}
.desc{font-size:30px;color:#c8a96e;line-height:1.35;max-width:580px}
.url{margin-top:26px;font-size:26px;color:#8a7340}.url b{color:#c8a96e}
</style></head><body>
<img class="shot" src="${thumbAbs}">
<div class="t"><div class="brand">&#9656; made in fc</div>
<div class="title">${esc(title)}</div><div class="desc">${esc(desc)}</div>
<div class="url">play free at <b>codeonline.io</b> &mdash; no install</div></div>
</body></html>`;

const pageHtml = (name, title, desc, b64) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — play it, made in fc · codeonline.io</title>
<meta name="description" content="${esc(desc)} A little game made in fc — play it free, no install, right in your browser.">
<link rel="canonical" href="${BASE}/g/${name}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="codeonline.io">
<meta property="og:title" content="${esc(title)} — made in fc">
<meta property="og:description" content="${esc(desc)} Play it free, no install.">
<meta property="og:url" content="${BASE}/g/${name}/">
<meta property="og:image" content="${BASE}/share/${name}.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)} — made in fc">
<meta name="twitter:description" content="${esc(desc)} Play it free, no install.">
<meta name="twitter:image" content="${BASE}/share/${name}.png">
<script>location.replace('/?code=' + ${JSON.stringify(encodeURIComponent(b64))});</script>
</head><body style="background:#14110a;color:#c8a96e;font-family:sans-serif;text-align:center;padding-top:40px">
<p>Loading <b>${esc(title)}</b>… <a href="/?code=${encodeURIComponent(b64)}" style="color:#ffec27">tap here if it doesn't open</a>.</p>
</body></html>`;

async function run() {
  if (!fs.existsSync(OUT_CARD)) fs.mkdirSync(OUT_CARD, { recursive: true });
  const files = fs.readdirSync(EX).filter(f => f.endsWith('.fc')).sort();
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  try {
    for (const f of files) {
      const name = f.replace(/\.fc$/, '');
      const src = fs.readFileSync(path.join(EX, f), 'utf8');
      const { title, desc } = meta(src, name);
      const b64 = Buffer.from(src, 'utf8').toString('base64');
      // 1) OG card png — inline the thumbnail as a data URI (setContent runs at
      // about:blank, which blocks file:// images)
      const thumbPath = path.join(ROOT, 'examples', 'thumbs', name + '.png');
      const thumbAbs = fs.existsSync(thumbPath)
        ? 'data:image/png;base64,' + fs.readFileSync(thumbPath).toString('base64')
        : '';
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1200, height: 630 });
      await page.setContent(cardHtml(title, desc, thumbAbs), { waitUntil: 'networkidle' });
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(OUT_CARD, name + '.png'), clip: { x: 0, y: 0, width: 1200, height: 630 } });
      await page.close();
      // 2) redirect page
      const dir = path.join(OUT_G, name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'index.html'), pageHtml(name, title, desc, b64));
      console.log('  + g/' + name + '/  + share/' + name + '.png   (' + title + ')');
    }
  } finally { await browser.close(); }
  // 3) sitemap.xml — the homepage, the docs, and every per-game landing page, so
  // search engines can crawl the toy shelf (nothing else links into /g/<name>/).
  const urls = [BASE + '/', BASE + '/docs/']
    .concat(files.map(f => BASE + '/g/' + f.replace(/\.fc$/, '') + '/'));
  const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(u => '  <url><loc>' + u + '</loc></url>').join('\n') + '\n</urlset>\n';
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap);
  console.log('  + sitemap.xml   (' + urls.length + ' urls)');
  console.log('done: ' + files.length + ' games');
}
run().catch(e => { console.error(e); process.exit(1); });
