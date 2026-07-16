# Pool Room API

Backend for **github.com/kevinelong/pool-room-blender** (votes + anonymous
per-client layouts). Live on the codeonline.io VPS.

> This file is self-contained — copy it into pool-room-blender and hand it to the
> client-side agent. **Do not share the whole codeonline/`fc` repo** (private
> monorepo with unrelated code). No secrets are in here.

- **Base URL:** `https://codeonline.io`
- **Stack:** the box is nginx + Node (no PHP). These routes live in the Node
  `apid` service and are served through the existing `location /api/ ->
  127.0.0.1:8092` nginx proxy (zero nginx changes to add/adjust them).
- **CORS:** all routes send `Access-Control-Allow-Origin: *` and handle the
  `OPTIONS` preflight (204), so a cross-origin `fetch` from `kevinelong.github.io`
  works directly.
- **No secrets:** the only secret is the server's env (`apid/.env`, chmod 600,
  gitignored) which these routes don't use.

---

## 1. Votes

### `POST /api/poolroom/vote` — submit a ballot
Body (JSON):
```json
{ "name": "...", "stakeholder": "...",
  "fourTwo": ["...", "..."], "threeThree": ["...", "..."],
  "comment": "...", "ts": "<client ISO timestamp>" }
```
- `fourTwo` and `threeThree` **must be arrays** or you get `400 {"ok":false}`.
- Server caps: `name`≤80, `comment`≤500, each choice list sliced to 2; records
  `server_ts` + IP server-side.
- Success: `200 {"ok":true}`. Rate-limited: `429 {"ok":false}`.

### `GET /api/poolroom/results` — read all ballots
`200 {"ballots": [ {name, stakeholder, fourTwo, threeThree, comment, client_ts, server_ts}, ... ]}`
- **No `ip` field** — stripped server-side (results are public). Empty → `{"ballots":[]}`.
- Order is append order (oldest→newest); sort client-side for newest-first.

```
curl -X OPTIONS https://codeonline.io/api/poolroom/vote          # 204
curl -X POST -H 'Content-Type: application/json' \
  -d '{"name":"t","stakeholder":"Pool Player","fourTwo":["social"],"threeThree":["centerline"],"ts":"x"}' \
  https://codeonline.io/api/poolroom/vote                        # {"ok":true}
curl https://codeonline.io/api/poolroom/results                  # {"ballots":[...]}
```

---

## 2. Layouts (anonymous per-client key/value store, no login)

The client mints a random **`cid`** and namespaces its data by it — no accounts.

### `GET /api/poolroom/layouts?cid=<hex>` — load
`200 {"layouts": <whatever you saved, or null>, "updated": "<ISO ts, or null>"}`
- New/unknown cid → `{"layouts":null,"updated":null}` (treat `null` as "nothing yet").
- Bad/missing cid → `400 {"error":"bad cid"}`.

### `POST /api/poolroom/layouts` — save
Body: `{ "cid": "<hex>", "layouts": <any JSON> }` → `200 {"ok":true}`
- **Replaces** the whole stored blob — send full current state, not a diff.
- `cid` must match `^[a-f0-9]{16,64}$` (else `400`).
- Whole body cap **64 KB** (over → 400/413). Rate-limited: `429`.

```
CID=$(python3 -c "import uuid;print(uuid.uuid4().hex)")   # 32 hex chars
curl "https://codeonline.io/api/poolroom/layouts?cid=$CID"                    # {"layouts":null,...}
curl -X POST -H 'Content-Type: application/json' \
  -d "{\"cid\":\"$CID\",\"layouts\":{\"tables\":[]}}" \
  https://codeonline.io/api/poolroom/layouts                                 # {"ok":true}
```

---

## Client snippets (browser JS)

```js
const API = 'https://codeonline.io';

// one-time anonymous id (per browser)
let cid = localStorage.getItem('cid');
if (!cid) { cid = crypto.randomUUID().replace(/-/g, ''); localStorage.setItem('cid', cid); }

// submit a ballot (fall back to mailto: on any non-ok; do NOT auto-retry)
async function submitBallot(b) {
  try {
    const r = await fetch(API + '/api/poolroom/vote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    return r.ok && (await r.json()).ok === true;
  } catch (_) { return false; }
}

// load / save layouts (debounce saves — see limits)
async function loadLayouts() {
  const r = await fetch(`${API}/api/poolroom/layouts?cid=${cid}`);
  return (await r.json()).layouts;         // null if nothing saved
}
let saveTimer;
function saveLayouts(layouts) {             // call freely; it debounces
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fetch(API + '/api/poolroom/layouts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cid, layouts }) });
  }, 1500);
}
```

---

## Limits & caps

| | cap |
|---|---|
| Ballot: fields | name≤80, comment≤500, choices sliced to 2 |
| Ballot: rate | 30/hr per IP, 2000/day global |
| Layouts: size | 64 KB per client (whole body) |
| Layouts: write rate | 120/hr per IP, 5000/day global (reads unlimited) |

**Client duty:** debounce layout saves (~1–2s after edits settle) — don't POST on
every keystroke, or you'll hit the write cap.

---

## Security model & caveats (read this)

- **`cid` is a bearer capability, not an account.** Whoever holds the string can
  read/write that client's layouts. So: keep it in `localStorage`, use HTTPS
  (✓), and **never put `cid` in a shareable URL** — that would hand your data to
  anyone you send the link to.
- **`localStorage` is per-browser.** Clear storage or switch device → new `cid` →
  fresh/empty (old data is orphaned, not deleted). Cross-device sync would need
  the user to *carry* the `cid` (e.g. a "sync code" they paste on the other
  device) — not built yet.
- **No PII stored with layouts** (no IP, no name). Ballots store an IP
  server-side but it is never returned by `/results`.
- **Open write endpoints** (no auth by design). The rate/size caps above are the
  only guard; that's acceptable for a small tool. If you later want a shared
  secret, add an `X-Poolroom-Key: <token>` header check — say the word.

---

## Where it lives (server-side reference — you don't run this)

Everything is in the Node `apid` on the VPS (`apid/server.js` in the private
codeonline/`fc` repo). Data is written under `apid/data/` (gitignored):

- Ballots: `apid/data/poolroom-ballots.jsonl` (one JSON object per line).
- Layouts: `apid/data/poolroom-layouts/<cid>.json` (one file per client;
  `cid` is regex-validated **before** use as a filename — path-traversal guard).

Reference handlers (condensed; secrets/none):

```js
// POST /api/poolroom/vote  — validate fourTwo/threeThree arrays, sanitize, append
// GET  /api/poolroom/results — read jsonl, JSON.parse per line, strip `ip`
// GET/POST /api/poolroom/layouts — cid must match /^[a-f0-9]{16,64}$/, 64KB cap;
//   GET reads data/poolroom-layouts/<cid>.json -> {layouts,updated};
//   POST writes {updated, layouts} to that file (replace).
// All set Access-Control-Allow-Origin:* and answer OPTIONS with 204.
```

To change limits/behavior, edit those routes in `apid/server.js` and
`doas rc-service apid restart`. To wipe data: truncate the files above.

---

## Status

All routes are **live and verified** on `https://codeonline.io`
(OPTIONS→204, happy-path→`{"ok":true}`/data, validation→400, traversal→400).
Data files start empty and ready for real use.
