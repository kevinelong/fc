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
| `tools/ui-check.mjs` | browser behaviour: dialogs/a11y, panel, classroom, share, touch | — |

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

- **`save` does not persist on the default (wasm) engine.** `save <v> as "k"` writes into the
  wasm's own in-memory store, and the host's command dispatch (`sound`, `flash`, `shake`,
  `defsfx`, `net`, draw ops) has no `store` case — so nothing reaches `STORE`: not
  `localStorage`, not `/api/state`. On the JS core (`?core=js`) the same program persists and
  mirrors to the cloud correctly, which is exactly why no parity harness caught it: they compare
  the two engines with *each other*, and both "work" internally. Found 2026-10-12 while building
  `tools/app-api-e2e.mjs`, whose first version drove the verb and watched `/api/state` stay
  empty. Reproduce in the browser console: run a program containing `save 1 as "x"`, then
  `Object.keys(localStorage)` — empty on the wasm engine, populated on `?core=js`. User-visible:
  the reference page promises saved values "survive closing the page" and ROADMAP lists the cloud
  mirror. The fix is an ABI change, not a one-liner — emit a host command on `save`, and seed the
  wasm's store from `STORE` at boot (its store has no exported setter today) so `load` can see a
  value saved before the reload. `app-api-e2e` currently guards the transport with
  `STORE.set`/`STORE.get` and says so in a comment, so when this is fixed the verb leg should be
  restored there as well.
- `shape-diff`'s 11 pinned "unexercised fields" are heuristic noise (a local name caught
  near the literal) — labelled in the output; nothing real is outstanding there.
- **User songs** (`song "x" is 120 "notes"`) register in the JS host's audio engine; the
  wasm can only name a sound across the ABI, so they play by name only.
- The panel emits `draw_<shape>(…)` for the runtime-only rules (image inference, mode
  dispatch, the missing-screen placeholder) — recorded in `transpile-mirror.mjs`.
- The app↔server contract is pinned only by `ui-check`'s stubs; a real contract test is the
  next guard idea.
- `apid` needs `npm install` locally for the three end-to-end guards.

## Next actions, in order

1. **Resolve classroom Q1:** owner choices plus qualified privacy/legal review. Keep
   `ENABLE_CLASSROOM=false`; a complete implementation is not launch approval.
2. **Device pass:** run and record the must-do four in
   [TEST-MATRIX.md](./TEST-MATRIX.md). Touch wiring is automated; iOS audio/PWA,
   APK loading, and two-device multiplayer need real hardware.
3. **Controlled classroom pilot:** only after steps 1–2, verify retention/deletion,
   review the final privacy/teacher copy, then decide whether to enable the flag for
   a small pilot.
4. **Q5 feedback decision:** the owner chooses whether and where to post. No external
   account action is implied by the prepared copy.
5. **App↔server contract guard** (drive the real app against a local apid).
6. Business gates, both decisions rather than code: a Stripe account for Pro, licensing for
   schools.
7. Small follow-ups: showcase the ten newly-working verbs in a starter/lesson (they were
   broken for users until this session); user-song playback in the wasm.
8. **Publish the versionCode 4 build** (built and verified 2026-10-11, not deployed):
   replace `codeonline.io/fc.apk` — the file is public at
   `https://github.com/kevinelong/fc-releases/releases/download/v1.0.3-4/app-release.apk`, so
   the box can fetch it with no token — then update `fc-version.js`; in that order, because the
   in-app nudge reads the live file. v4 is signed with a new key, so existing v3 installs
   must uninstall once (see DISTRIBUTION.md).
