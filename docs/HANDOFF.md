# Handoff — where things are and how to pick them up

Written 2026-09-30 at the end of a long session. The dated history lives in
[STATUS.md](./STATUS.md) (entries `2026-09-29 (j)` → `2026-09-30 (c)`); this file is the
*pick-up* view: what the guards are, how to run them, what is known-broken, and what to do
next. Keep it short — detail belongs in STATUS.

## One command runs everything

```
node tools/checks.mjs              # 22 checks, ~90 s; fails on a silent or 0/0 harness
node tools/checks.mjs --full       # fuzz 2000 instead of 500
node tools/checks.mjs --only ast   # one check (substring)
node tools/checks.mjs --list       # names + prerequisites
```

Local verification on a clean Windows checkout (2026-10-11): `node tools/checks.mjs --full`
→ **22 passed, 0 failed, 0 skipped** with every prerequisite present, and **21 passed, 0
failed, 1 skipped** with `playwright-core` absent (the skip is `visual-golden`). The
2026-09-30 "22 passed" reading was taken in a working tree that already had the generated
Rust AST and `playwright-core`; on a fresh clone three checks failed for harness reasons —
fixed 2026-10-11 (see the working notes).

Prerequisites, and what happens without them:
- a built wasm (`cd spec/port/spike && cargo build --release --target wasm32-unknown-unknown`)
  for the differentials. `ast` declares a `pre` step that generates its own candidate
  (`rust-ast.json`, gitignored), so a clean checkout no longer needs a manual dump;
- `cd apid && npm install` for the class/share/api end-to-end checks;
- Chrome (preinstalled on CI, auto-detected locally, `CHROME=` overrides) for the browser
  checks — `tools/chrome-path.cjs` is the single path list every harness shares;
- `npm i playwright-core` in the repo root for the pixel goldens (`.gitignore` keeps the repo
  dependency-free); without it `visual-golden` **SKIP**s. CI installs it, so the goldens run
  there too — and Linux software-Skia pixels match the pinned ones (2026-10-11, 22/22).
- `npm i axe-core` in the repo root for the accessibility audit's engine half; without it that check
  still runs its structural half and says so in its output. CI installs both.

A missing prerequisite is reported as **SKIP**, never as a pass, and a failing harness now
prints its own last lines under the table instead of only `exit N`. CI runs the same command
(`.github/workflows/checks.yml`).

## The guards, and the bug class each one exists for

| guard | holds | found, the day it was written |
|---|---|---|
| `spec/port/spike/shape-diff.mjs` | every parser node type **and field** is exercised by some test program (pinned); 16 semantic cross-engine cases | ten documented forms the wasm never parsed; an inline `else` that did nothing; `between` never firing |
| `spec/lang/*` + `tools/core-copy-check.mjs` | index.html's JS core, `fc-core.mjs` and `fc-core-record.mjs` are one program (3 documented presentation differences) | the oracles were missing the browser's debugger hooks |
| `tools/checks.mjs` | every harness prints its summary, with a minimum case count | `frames-run` had been dead (unbound `mouse`) and silent |
| `tools/api-e2e.mjs`, `tools/class-e2e.mjs`, `tools/share-e2e.mjs` | apid: CSRF, auth, saves, gallery, classroom, `/s/<id>` | (new guards — auth/saves/gallery had none) |
| `spec/port/spike/transpile-mirror.mjs` | the panel mirrors the runtime's decided rules | (the panel had drifted on `draw title` once) |
| `spec/heal/eval.mjs` drift checks | healer vocab == `LINT_VERBS` in index.html | the healer was rewriting `sprite "x" is "<hex>"` into `write …` |
| `tools/ui-check.mjs` | browser behaviour: dialogs/a11y, panel, classroom, share, touch, the a11y settings | — |
| `tools/app-api-e2e.mjs` | the app↔server contract: every `/api` literal in **every shipped page** accounted for (11 across 11 pages, not just `index.html`), CSRF, caps, auth shapes, and the app's own save transport against a real apid | the `save`-on-wasm gap below; then (2026-10-14) the literal scan read `index.html` alone, so a call added to any other page was unaccounted for |
| `tools/learn-recipes-check.mjs` | every HOW-TO recipe on the learn page parses, runs, and stays quiet | — |
| `tools/reference-check.mjs` | every implemented verb appears in an example on the command-reference page, and all of them run | 22 verbs had no example at all, including `walk`, `face`, `tween`, `join`/`broadcast` and `flees`/`shoots` |
| `tools/release-check.mjs` | the service worker's strategy (network-first HTML, versioned caches, `/fc.apk` and `/api/*` untouched), its precache paths, and `fc-version.js` against the newest published release | — (its tamper test is in the commit: bumping the version file ahead of the release fails it) |
| `tools/huntd-limits.mjs` | the relay's caps: room, total connections, per-address connections, message size, per-socket rate, and that a closed socket leaves nothing behind | the connection caps did not exist at all |
| `tools/a11y-check.mjs` | every shipped page that is not the app — reference, tutorial, teachers, cheat sheet, projects, privacy, **and the three editor pages** (map/sound/sprite forge): axe-core serious/critical when installed, plus lang, one h1, heading order, alt text, labelled controls, discernible links | 79 unlabelled example textareas on the reference page, 22 on the tutorial, an unlabelled search box, and four pages of sub-AA contrast; then (2026-10-14) the editors' missing `h1`, two unlabelled `<select>`s and an unlabelled tempo range, a title-only label, and a sub-AA hint |
| `spec/port/spike/visual-golden.mjs` | the spike's ops→canvas renderer, pixel-pinned (it had been failing silently: 16/22, six games unpinned) | six generative toys never pinned |
| `tools/wasm-doc-check.mjs` | `spec/WASM.md` describes the core that ships: the emitted `op` set equals the §3.2 table, and every export the host calls is named | §3.2 specified a binary command buffer the core never emitted; `store`/`song`/`seed_store` appeared nowhere (2026-10-12) |

## Working notes (so the next session does not rediscover them)

- **Commit and push after each change** (owner, 2026-10-12). One change, one commit, pushed
  to `main` as it lands — don't batch a session's work into a single push at the end. The
  same applies in `fc-app`. Docs that describe a change belong in that change's commit, and
  CI (`.github/workflows/checks.yml`) is the check that it landed green.

- **The pixel goldens are network-free by construction.** `tools/visual-golden.cjs` aborts
  every non-file request and stubs `WebSocket` shut (`CONNECTING` forever) in its init script,
  so a capture depends only on files in this repo. A multiplayer example therefore pins its
  *offline* pixels; what a real connection changes is `mp-smoke`'s business, not a golden's.
  (hunt's golden used to depend on whether the live relay handshake beat the capture window,
  and failed intermittently because of it.)

- **Per-frame cost has a baseline; measure before touching the frame loop.** `node
  tools/perf-check.mjs` times every frame of the ten heaviest examples on both engines. Baseline
  2026-10-12 (240 frames, wasm ms/frame): sand 1.67 · chaos 0.88 · langton 0.85 · matrix 0.21 ·
  space-invaders 0.17 · frogger 0.11 · starfield 0.08 · cycles 0.04 · hunt 0.02 · coin-quest 0.006 —
  i.e. the worst example uses a tenth of a 60 fps frame, and the wasm is 0.8–1.3× the JS core. It is
  deliberately **not** in `checks.mjs`: an absolute millisecond budget on a shared CI runner measures
  the runner, and a flaky perf gate gets ignored. `FC_PERF_BUDGET_MS` / `FC_PERF_RATIO_MAX` tighten
  it, and an impossible budget exits 1 (so the detector is known to bite).

- **Cases first, then the port.** Adding a corpus/frame/draw/err case *requires* re-pinning:
  `node spec/lang/run-node.mjs --update` (corpus goldens), `node spec/port/spike/dump-ast.mjs`
  (**JS** AST golden) **and** `parse-ast.mjs` (**Rust** AST golden), `dump-transpile.mjs`,
  `dump-err.mjs`. Both AST dumps are needed — one stale dump looks like a parser bug.
  (`checks.mjs` regenerates the Rust *candidate* itself; only the committed goldens are
  manual re-pins: `ast-golden.json` via `dump-ast.mjs`, the rest via their `dump-*`/`--update`.)
- **Language changes go to four runtimes**: index.html's core, `spec/lang/fc-core.mjs`,
  `spec/port/spike/fc-core-record.mjs`, and `src/lib.rs` — then `core-copy-check` and the
  differentials prove it.
- **Two engine bugs are always two bugs** (JS *and* wasm), and both may be wrong together:
  parity-only checks blessed `between` for months. Prefer value assertions.
- **Shell quirk:** heredocs mangle backticks, `${…}` and `/c/...` paths. Write helper
  scripts with the file tool and run them with `C:/...` paths; commit with
  `git commit -F <file>`.
- **Line endings:** files are CRLF in the working tree; tools that inject or compare copies
  must normalise (`transpile-embed-check` and `core-copy-check` already do).

## Known gaps right now

- `shape-diff`'s 11 pinned "unexercised fields" are heuristic noise (a local name caught
  near the literal) — labelled in the output; nothing real is outstanding there.
- **Eight words in the healer's vocabulary are not verbs** — `start`, `spawn`, `hide`, `push`,
  `pull`, `set`, `put`, `get` each fall through to a bare call that does nothing. They stay in
  `LINT_VERBS` on purpose: dropping one lets `heal()` rewrite it (`set` → `pset`, decided
  2026-10-14). The reason list is `NON_VERBS` in `spec/heal/healer.mjs`, printed by
  `tools/reference-check.mjs` and `spec/heal/eval.mjs`. Do not add a reference entry for one unless
  it is implemented for real in all four runtimes.
- The panel emits `draw_<shape>(…)` for the runtime-only rules (image inference, mode
  dispatch, the missing-screen placeholder) — recorded in `transpile-mirror.mjs`.
- `apid` needs `npm install` locally for the three end-to-end guards.

## Local work queue (no decisions and no hardware needed)

Identified at the end of 2026-10-12, in the order I would do them. Every one is verifiable locally;
the owner-gated list below is separate.

1. ~~**`/api/tpos/inquiry` has no rate limit.**~~ **Done (2026-10-14).** The route now carries a
   per-IP/day and a global/day cap in the same shape as the pool-room limiters (`inquiryQuota`), and
   `docs/SECURITY.md` has the row the security pass missed. Proven by `tools/api-e2e.mjs`, which pins
   3 accepted then a 429 (the case fails against the pre-change route).
2. ~~**`spec/WASM.md` is stale and now incomplete.**~~ **Done (2026-10-14).** §3.2 now describes the
   JSON record stream the core actually emits, with the record table and a file:line for each claim;
   §4 gained an "as built" export list and the `seed_store` contract; §2's byte table is marked as the
   design sketch; §8/§9 point at the shipped names. `store`/`song` are documented in the §3.2 table.
3. **`fc-app`'s bundle is stale again.** The reference page, the tutorial, all five static pages and
   the docs changed today; `bash scripts/copy-web-assets.sh` has not run since, so the next APK build
   would ship the old pages. (The build is local too — publishing waits on the device pass.)
4. ~~**The Play feature graphic was never rendered.**~~ **Done — it exists.** `store/feature-graphic.png`
   is a tracked 1024×500 PNG and has been since `35dcff7` (2026-07-03); `tools/feature-graphic.html`
   is its generator. The queue was wrong here, and `DISTRIBUTION.md:97` ("Assets still to make:
   feature graphic 1024×500") was stale too — both corrected 2026-10-14. What genuinely remains on
   that line is the `store/` screenshots: they are drafts and want framing before upload.
5. ~~**Eight vocabulary words are not verbs.**~~ **Decided 2026-10-14 — keep them listed, with the
   reason in the guards.** `start`, `spawn`, `hide`, `push`, `pull`, `set`, `put`, `get` each parse to
   a bare call and do nothing, but dropping them is **not** safe: `heal()` rewrites a leading word
   once `lint()` finds a near candidate (pass B), so a dropped `set` turns `set x to 99` into
   `pset` — a tolerated dead word becomes a silent mis-edit. They stay in `LINT_VERBS`; the single
   reason list is `NON_VERBS` in `spec/heal/healer.mjs`, printed by both `tools/reference-check.mjs`
   and `spec/heal/eval.mjs`, and `eval.mjs` fails if one is ever dropped. (Implementing them for
   real is the other option — but that is a language change across four runtimes, not a cleanup.)
6. **Q2 is a decision, not a prepared build.** The pre-moderation variant (`status:'pending'` + admin
   approve) behind an env flag, with a moderation queue and a minimal admin view — the "prepared both
   ways" this item used to claim — **does not exist**: there is no `ENABLE_MODERATION`, no
   `status:'pending'` gallery gate and no admin-approve route anywhere in `apid/`, and
   `apid/.env.example` declares no such flag (only `ENABLE_CLASSROOM` and `ENABLE_GENERATE` do). So
   the decision is **not** a flip; it is a build. Corrected 2026-10-14. The stance stays the owner's
   (`docs/OPEN-QUESTIONS.md` Q2): keep the shipped post-moderation behaviour unchanged while it is open.
7. ~~**Cheap drift check**~~ **Done — and it was a no-op.** Verified 2026-10-14: all 22 `/g/` pages
   decode (`location.replace('/?code=' + …)`) byte-identical to the 22 `examples/*.fc`, and
   `sitemap.xml` carries 24 `<loc>` (root + `/docs/` + 22 `/g/…`). Nothing had moved since
   `015c9c9` (2026-09-29), so `tools/gen-share-pages.cjs` did not need a re-run.

Also worth knowing: the packaged-mode **relay** URL is **already implemented** — `index.html:1695-1701`
points `wss://codeonline.io/relay` whenever the page is served from `localhost`/`127.0.0.1`/`file:`
(commit `f93a19c`, 2026-06-07). The remaining half is the sign-in cookie-domain design, which needs a
hosted-origin decision and is not local-only.

## Next actions, in order

1. **Resolve classroom Q1:** owner choices plus qualified privacy/legal review. Keep
   `ENABLE_CLASSROOM=false`; a complete implementation is not launch approval. The automated
   side of the gate is done: `class-e2e` now proves the idle purge and the teacher delete
   against `db.json` (2026-10-12), so step 3's "verify retention/deletion" is satisfied. The review
   material is `docs/CLASSROOM-PILOT-PACK.md`: the four decisions against what the code does, drafted
   privacy/teacher copy, the enable-and-rollback steps, and what the pilot would measure.
2. **Device pass:** run and record the must-do four in [TEST-MATRIX.md](./TEST-MATRIX.md).
   Touch wiring is automated; iOS audio/PWA, APK loading, and two-device multiplayer need real
   hardware. Do it against the **`targetSdk 36`** build (`fc-app` branch `target-sdk-36`,
   commit `4500417`) — that is the one Play will accept, and its only behavioural delta is
   Android 15+ edge-to-edge, which can push the on-screen D-pad under the navigation bar.
3. **Controlled classroom pilot:** only after steps 1–2, review the final privacy/teacher copy,
   then decide whether to enable the flag for a small pilot.
4. **Q5 feedback decision:** the owner chooses whether and where to post. No external
   account action is implied by the prepared copy.
5. **Publish the versionCode 4 build** (built and verified, not deployed): `bash
   tools/deploy-fc-apk.sh <site-dir> --pull` does the whole publish in the right order — APK
   first (fetched from the public release, sha256-checked), then the tree, which publishes
   `fc-version.js`. The site is a 2026-07-08 snapshot of this repository, so the pull is also
   what puts the September/October work live. The APK is signed with a key from after the July
   build, so existing installs must uninstall once (the in-app nudge will say so).
6. **Play:** the $25 account, then upload the `.aab` from the device-passed `target-sdk-36`
   build (bump versionCode and `fc-version.js` with it if the direct-download build moves too).
7. ~~The wasm↔host store bridge~~ **done 2026-10-12** (see STATUS (i)): `save` persists on the
   default engine and `song` notes reach the audio engine. The remaining code items are not
   owner-gated — they are in the local work queue above.
8. Business gates, both decisions rather than code: a Stripe account for Pro, licensing for
   schools.
