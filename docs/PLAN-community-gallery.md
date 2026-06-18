# Plan — Community gallery (publish & browse user games)

Goal: let players publish a game from the editor and browse others' published
games in the launcher. **Decision-gated** — it needs a backend + moderation
stance, which is why it's a plan, not yet built.

## What already exists (reuse)
- Cloud saves (signed-in state sync) — there is already an authenticated backend
  the editor talks to (`/api/...`). Publishing is a sibling endpoint, not new infra.
- Share links already encode a whole game in the URL (`?code=<base64>`), and the
  "Publish"/"Upload to GitHub" buttons exist. So a game is already a portable blob.
- The launcher already renders a grid of `{file, name, sprite, desc}` tiles and a
  thumbnail pipeline (`tools/gen-thumb.cjs`). A gallery is "the same grid, fed from
  the API instead of the hardcoded GAMES list."

## Decisions needed (the actual blockers)
1. **Moderation** — user-submitted code + names are abuse surface. Options, pick one:
   (a) **curated** — submissions queue; you approve before they appear (lowest risk,
   manual); (b) **post-moderation** — auto-publish + a report button + takedown;
   (c) none (not advisable for a kids-facing tool). Recommend (a) to start.
2. **Identity** — publish requires sign-in (already have auth) so entries are
   attributable and rate-limited. Anonymous publish = spam magnet; avoid.
3. **Storage/cost** — games are tiny text; thumbnails are ~1KB PNGs. Trivial. Where:
   the existing saves store, plus a `published` flag + public read endpoint.
4. **Safety of running others' code** — fc is a sandbox (no eval of JS, no network
   from fc programs except the multiplayer relay; the interpreter is the only
   executor). Confirm the relay can't be abused (room flooding) before opening it up.

## Minimal architecture (once decisions are made)
- `POST /api/publish` `{title, source, thumb}` (auth'd, rate-limited) → status
  `pending`. Server renders/accepts the thumb (or runs gen-thumb server-side).
- `GET /api/gallery?cursor=` → approved entries `[{id,title,author,thumb,plays}]`.
- Editor: a "Publish to gallery" action (next to existing Share/Upload).
- Launcher: a "Community" tab that fetches `/api/gallery` and renders tiles with the
  existing tile component; clicking loads the source via `?code=` / `/api/game/:id`.
- Admin: a tiny approve/reject view (curated path).

## Test plan
- Publish→pending→approve→appears in `/api/gallery`→loads & runs (Playwright e2e).
- Rate-limit + auth-required enforced (reject anon/over-limit).
- Reported entry is hidden pending review.

## Recommendation
Smallest shippable: **curated** gallery, sign-in required, reuse the saves backend.
Hold until the moderation stance is chosen — that's a product/ops decision, not a
code one.
