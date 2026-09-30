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

Prerequisites, and what happens without them: a built wasm
(`cd spec/port/spike && cargo build --release --target wasm32-unknown-unknown`) for the
differentials; `cd apid && npm install` for the class/share/api end-to-end checks; Chrome
(preinstalled on CI, auto-detected locally) for the browser checks. Missing prerequisites
are reported as **SKIP**, never as a pass. CI runs the same command
(`.github/workflows/checks.yml` — GitHub Actions must be enabled on the repo).

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

- **Cases first, then the port.** Adding a corpus/frame/draw/err case *requires* re-pinning:
  `node spec/lang/run-node.mjs --update` (corpus goldens), `node spec/port/spike/dump-ast.mjs`
  (**JS** AST golden) **and** `parse-ast.mjs` (**Rust** AST golden), `dump-transpile.mjs`,
  `dump-err.mjs`. Both AST dumps are needed — one stale dump looks like a parser bug.
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
- **User songs** (`song "x" is 120 "notes"`) register in the JS host's audio engine; the
  wasm can only name a sound across the ABI, so they play by name only.
- The panel emits `draw_<shape>(…)` for the runtime-only rules (image inference, mode
  dispatch, the missing-screen placeholder) — recorded in `transpile-mirror.mjs`.
- The app↔server contract is pinned only by `ui-check`'s stubs; a real contract test is the
  next guard idea.
- `apid` needs `npm install` locally for the three end-to-end guards.

## Next actions, in order

1. **Flip classroom on:** `ENABLE_CLASSROOM=true` in apid's environment + restart. Backend,
   frontend, the flow (10/10 on the real server) and the `/privacy/` paragraph are done.
2. **Q5 launch** (feedback/Show HN) — now worthwhile because `/s/<id>` makes a *user* game
   link preview for scrapers. Follow the venue order in FEEDBACK-PLAN.
3. **Device pass**: the must-do four in [TEST-MATRIX.md](./TEST-MATRIX.md) (the touch wiring
   is automated; audio unlock, PWA, APK and iPad need hardware).
4. **App↔server contract guard** (drive the real app against a local apid).
5. Business gates, both decisions rather than code: a Stripe account for Pro, licensing for
   schools.
6. Small follow-ups: showcase the ten newly-working verbs in a starter/lesson (they were
   broken for users until this session); user-song playback in the wasm.
