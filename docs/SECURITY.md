# Security and privacy posture

Scope: the server side — `apid` (accounts, cloud saves, gallery, classroom) and `huntd` (the
multiplayer relay) — plus how the browser app handles strings users type. Reviewed 2026-10-12 by
trust boundary, against the OWASP-style checklist; this file is the record of what is enforced, how
it is verified, and what is deliberately left open. Keep it current when a control changes.

## Trust boundaries

| boundary | untrusted input | who can reach it |
|---|---|---|
| app ← apid | game code, names, class codes, layout JSON | anyone (anonymous or signed in) |
| apid ← the network | OAuth identity from Google/GitHub; the session cookie is ours | anyone |
| huntd ← the network | room/game names, payload size and rate | anyone with the URL — no auth by design |
| the site ← this repository | the whole tree is served by nginx, so **anything committed is published** | anyone |
| apid → outward | GitHub gists (with the *user's* token), SMTP (app password), Anthropic (dark) | us |

## Controls in place

| control | detail | where / evidence |
|---|---|---|
| Sessions | 32 random bytes, cookie `co_sess` with `HttpOnly; Secure; SameSite=Lax`, bounded `Max-Age` | `apid/server.js` `newSession`/`setCookie` |
| CSRF | every write requires the `X-CO` header, which a cross-site form cannot set | `api-e2e`, `app-api-e2e` (403 without it) |
| Output encoding | the server-rendered `/s/<id>` page escapes title *and* description; publish strips everything outside `[\w \-!?.()]` from names; the share-page generator escapes | `apid` `/s/` handler, `tools/gen-share-pages.cjs` |
| No secrets in the tree | the whole history (274 commits) scanned — the only credential-shaped file ever added is `apid/.env.example`, all placeholders | `docs/STATUS.md` 2026-10-12 |
| Auth limits | verification codes: TTL, `MAX_ATTEMPTS`, resend cooldown; generate: per-user and global daily caps | `apid` `EMAIL`/`GEN` caps |
| Path safety | poolroom layouts are keyed by a validated hex `cid` (path-traversal guard), 64 KB cap, per-IP + global write quotas, and no IP or PII stored with them | `apid` layout route |
| Relay limits | per-room 8, per-message 4 KB, per-socket 60/s, **total 400 and per-address 40** (new), heartbeat reaps half-open sockets, a room is freed when its last peer leaves | `huntd/server.js`; `tools/huntd-limits.mjs` (7/7) |
| Error hygiene | users get generic bodies (`server error`); details go to the server log only | `apid` top-level catch |
| SSRF | the only outbound calls are fixed hosts; the gist upload uses the user's own token and a sanitized filename, so no user-controlled URL is fetched | `apid` gist route |
| Dependencies | `npm audit --omit=dev` clean for `apid` and `huntd`; the one high finding (nodemailer ≤ 10.0.5: raw-option file read/SSRF, addressparser DoS) was upgraded to `^10.1.0` — none of the affected paths were reachable here (fixed recipient, no raw options, no attachments) | `apid/package.json` + lockfile |
| Privacy | classroom data minimized (no emails; display names generated or filtered), 90-day idle purge, teacher delete, caps; layouts carry no IP | `tools/class-e2e.mjs` retention checks |

## Open items, on purpose

- **In-memory rate limiters** (ballot, layouts, relay) assume one process. Run `apid` or `huntd`
  twice and each limit becomes `max × instances`; move them to a shared store before scaling out.
  The relay's per-address cap counts a whole classroom NAT as one address — tune with
  `HUNTD_MAX_PER_IP` if a class ever hits it.
- **Security headers / CSP** are nginx's job on the box. The app inlines its script, style and wasm
  by design, so a strict CSP needs a nonce or hashes — not done, and not apid's to set.
- **Serving the repository tree** means every committed document is public, including the working
  notes. That is a deliberate consequence of the deploy (see `DISTRIBUTION.md`), and the reason
  nothing sensitive is written there.
- **Classroom launch** stays gated on the owner's privacy/legal review (`docs/OPEN-QUESTIONS.md`,
  Q1); the implementation ships dark behind `ENABLE_CLASSROOM`.
