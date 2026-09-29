# Status — working through the plans

Running log, newest first. Each entry: what changed, the evidence that it works,
and the commit. Plans are marked in place (`✅ SHIPPED` / `⬜ remaining`) as they
complete; this file tracks the cross-plan view. Blocking decisions live in
[OPEN-QUESTIONS.md](./OPEN-QUESTIONS.md).

## 2026-09-29 (d) — safety net Phase 2 client + Phase 3 shipped

**Phase 3 (the floor of "it always runs") — shipped.** `spec/heal/scaffold.mjs`
holds four small starters (collect / bounce / shoot / stars) with keyword scoring.
When an explicit run leaves the canvas entirely black and the source has no
`run game`, the app offers an amber banner with two directions; picking one loads
that starter into the editor with the user's own lines kept as `--` comments.
Never auto-applied. Telemetry is **local only** (localStorage counters exposed as
`window.FC_NET_STATS()`, summary + copy button in Settings) so the common rewrites
can be absorbed into the language — server-side aggregation is Q8.

**Phase 2 client — built (the endpoint still ships dark).** A `✎ describe` toolbar
button opens a prompt row, POSTs to `/api/generate` with the `X-CO` CSRF header and
same-origin credentials, and OFFERS the gate-validated result ("here is … as a game
(2 tries) — it already runs") with `✎ use it & run` / dismiss. Failure modes each
get a plain-English line (sign in / too long / daily limit / not enabled on this
server yet / offline). Going live still needs the owner's key + `ENABLE_GENERATE`
(Q3); the larger eval set with a semantic rubric remains open.

Verification: `spec/heal/eval.mjs` asserts every starter and every `scaffold()`
output passes the gate for 8 inputs (gibberish included) and that index.html's
inlined starter data equals the module's. `tools/ui-check.mjs` drives the real app:
the floor appears for a dead end, offers two directions, loads and draws the picked
starter; the telemetry records the run and the offered heal and shows in Settings;
the describe path POSTs with the prompt + CSRF header, offers (not applies) the
code, applies it on tap, and explains a dark endpoint. **32/32 UI checks.**

## 2026-09-29 (c) — `say` works on the default engine

**Bug (user-visible):** `say` was implemented only in the JS core. The wasm core —
the app's default engine — had no `say` statement at all, so it parsed as an
unknown call and did nothing: a beginner's first program (`say "hello"`) drew
**nothing** on the default engine, while `?core=js` showed the text. Nothing caught
it because no corpus/example file used `say`, and `parse_exec_to_json` hardcoded
`"say":[]`.

**Fix:** `Stmt::Say(Expr)` (parse/exec/interpolate), a real say buffer in the live
runtime, `dump_say()` + `has_game()` exports, the exec JSON now reports the buffer,
and `WASMCORE.run` paints the lines exactly like `runJSCore` does — script mode
only, so a game never gets them overlaid. Verified: `say "hello there"` + `score is
42` paints **91 non-black pixels, identical on both engines** (was 0 on wasm);
a game with a `say` line still paints only its own 1600 pixels. New corpus guard
`spec/corpus/say_lines.fc` pins the buffer through exec-diff (54/54) and the AST
through ast-diff (76/76); the three browser assertions are in `tools/ui-check.mjs`
(19/19).

Suite after the change: tokenize 2112/2112 · ast 76/76 · exec 54/54 · draw 10/10 ·
examples 22/22 · dump-vars 22/22 · transpile 76/76 · smoke 16/16 · frames 5/5 ·
mp-smoke 5/5 · fuzz 3000/3000 · ui-check 19/19.

## 2026-09-29 (b) — plans closed out: accessibility, duration, live inspect

Three plans had shipped code with unverified or stale claims; each is now verified
and marked in its own doc, and two new tests close real coverage gaps.

- **PLAN-duration.md → ✅ SHIPPED.** Semantics measured frame-by-frame in both
  engines: `time limit is 5 frames` counts `1 1 1 1 0` and fires the handler
  **exactly once** at the crossing frame; `1 seconds` fires at frame 60; with no
  limit no `timer` exists and no handler runs (all 22 example goldens unchanged).
  `frame-tests/f_timer.fc` now draws a fired-counter (`f {fires}`) so a
  fires-twice regression changes the pixels; still 5/5 JS↔wasm.
- **PLAN-accessibility.md → complete.** The #5 ARIA/keyboard pass was already
  implemented (6 dialogs: role/aria-modal/label, MutationObserver focus in/out,
  Escape-to-close, Tab trap); it had never been exercised. Now verified in a real
  browser — see the new tool below.
- **PLAN-live-inspect.md → ✅ SHIPPED.** `dump_vars()` differential (22/22) plus
  the panel behaviour asserted in the browser.
- **New: `tools/ui-check.mjs`** — zero-dependency browser UI checks (Chrome over
  the DevTools protocol using node's built-in WebSocket/fetch, since the repo has
  no bundled playwright). Covers all six dialogs' ARIA, open→focus-in,
  Escape→close, focus restore, Tab wrap, and the live-inspect panel (step gated on
  pause, pause → "paused", ⏭ ×3 changes a value, panel stays live). **16/16 pass.**
  This closes the UI half of PLAN-live-inspect's test plan and is the repo's first
  browser-side test that needs no external npm install.

Remaining plan work: PLAN-classroom (blocked, Q1), SAFETY-NET Phase 2 go-live
(needs the API key, Q3) and Phase 3, TEST-MATRIX (hardware, Q4), FEEDBACK-PLAN
(human posting, Q5).

## 2026-09-29 (a) — engine parity batch (JS↔wasm) + harness portability

Started from a red baseline: three differential harnesses disagreed with each
other. All causes turned out to be **real bugs**, not harness noise.

### Fixed (all in `spec/port/spike/src/lib.rs` unless noted)

| # | Bug | Effect | Fix |
|---|---|---|---|
| 1 | `parse_cond` treated `not X and Y` as `not X…` via `parse_expr`, so the `and`/`or` structure was lost and the test fell through to "not undef" = **always true** | wrong branch taken in sand.fc (`if not moved and x > 0`) | `not X` now recurses into `parse_cond` (mirrors JS `parseCondition`); `no X` still negates an expression; `not` node emits the JS key `expr` |
| 2 | `Expr::Ref` eval had no color-name fallback, and `parse_expr`'s all-word branch concatenated (`dark gray` → `darkgray`) | `shade is dark gray` stored nothing (null) — bare color words never assigned | `Ref` eval falls back to a palette name string (var wins if declared); dotted refs now require a real `.` token, mirroring JS |
| 3 | `parse_write` evaluated unquoted text as an **expression** (`write random 10` → a random digit) | wasm-only semantics: the JS/browser core writes the literal words, and the expression consumed RNG in `draw`, shifting the whole seeded stream | text is a literal (quoted string, or raw words up to `at`) like the JS `parseWrite`; `examples/matrix.fc` rewritten to the documented form (`digit is random 10` + `write "{digit}"`) so the demo still shows digits |
| 4 | token→text joins used `sval()` (empty for numbers) and multi-token bare refs | `set x to 99` produced the ref `"x to "` | shared `tok_text_join` (JS `tokens.map(t => t.value).join(' ')`) |
| 5 | wasm AST omitted `argExprs` on call nodes; args were re-split at exec time | ast-diff drift on 7 programs once the JS oracle was fixed | `Stmt::Call(name, args, argExprs)`; AST emits `argExprs`; exec binds from the parsed exprs |

**Follow-up in this batch:** `X is in [list]` (documented in LANGUAGE.md §list
membership) silently evaluated as equality in the wasm, so every such test was
false — the app's default engine disagreed with the JS core and the docs. Added
`Cond::In` with strict-equality membership (JS `Array.includes`) + corpus guard
`list_membership.fc`.

### Fixed (JS reference core — `spec/lang/fc-core.mjs`)

The file is the corpus oracle ("byte-verified equal to the browser") but had
silently drifted from `index.html` / `fc-core-record.mjs`: it was missing the
**parentheses fix** (`a is (3 + 4)` → NaN for every game on the `?core=js`
fallback), the **user-function parameter** binding, and the `in` param filter.
Ported all five language hunks.

### New corpus guards (the repo's convention for a language change)

`not_and_condition.fc` · `color_word_assign.fc` · `dotted_then_math.fc` ·
`list_membership.fc`.

### Harness portability (they were Unix-only; results were silently wrong here)

- `spec/lang/run-node.mjs`: `new URL(...).pathname` → `fileURLToPath` (was `C:\C:\…`)
- `spec/port/spike/dump-transpile.mjs`: main-module guard never matched on Windows →
  the golden was **never written** (silent exit 0); fixed with `fileURLToPath`
- `smoke/frames-run/mp-smoke/soak`: `/tmp/...` hardcoded → `os.tmpdir()` (+ soak takes an argv path)
- `run-node.mjs` now compares goldens **canonically** (key-order-insensitive), so a
  serialization order change can't masquerade as a behavior diff

### Verification (whole suite green)

| Harness | Result |
|---|---|
| `tokenize-diff.mjs` | 2105/2105 lines |
| `ast-diff.mjs` | **75/75** programs |
| `exec-diff.mjs` | **53/53** corpus |
| `draw-diff.mjs` | 10/10 cmds |
| `examples-diff.mjs` | **22/22** games, 30 frames |
| `dump-vars-diff.mjs` | **22/22** live-var snapshots |
| `transpile-diff.mjs` | 75/75 programs |
| `transpile-embed-check.mjs` | index.html inlined copy matches transpile.mjs |
| `smoke.mjs` | 16/16 games |
| `frames-run.mjs` | 5/5 programs |
| `mp-smoke.mjs` | 5/5 multiplayer games |
| `fuzz.mjs` | 3000/3000 random programs |
| `run-node.mjs` (corpus conformance) | **53/53** |
| `spec/heal/eval.mjs` | 34/34 cases · 74/74 corpus untouched · gate 75 accepted |
| `tools/ui-check.mjs` | 16/16 browser UI checks |

Rebuilt wasm re-inlined into `index.html` (`inline-wasm.mjs`) after each core
change; the app was checked in headless Chrome (matrix still renders digits; the
inspect panel now reports `shade: "light gray"`, i.e. the color-word fix is live).

### Known gaps found (not yet fixed)

1. **Dynamic colors (`draw … in shade`) never resolve** in *either* engine —
   `resolveColor()` only maps literal names. Every "fading tail" / "brighter stars" /
   3-tone sand effect renders flat white. Product decision: Q7.
2. The visual-golden tool's pinned set (`spec/golden-shots/`) covers the 16 classic
   games but not the 6 generative toys (matrix, sand, starfield, life, langton,
   chaos) — running `tools/visual-golden.cjs` would add them (needs playwright-core).

## Plan state at audit

| Plan | State |
|---|---|
| PLAN-visual-golden.md | ✅ shipped (toys not in its golden set — see gap 2) |
| PLAN-runnable-export.md | ✅ shipped |
| PLAN-community-gallery.md | ✅ shipped (Q2 = the one open product call) |
| PLAN-accessibility.md | ✅ complete (verified 2026-09-29) |
| PLAN-duration.md | ✅ shipped (verified 2026-09-29) |
| PLAN-live-inspect.md | ✅ shipped (verified 2026-09-29) |
| SAFETY-NET-PLAN.md | Phase 0/1 ✅ · Phase 2 gate+proxy ✅ (dark, needs key, Q3) · Phase 3 ⬜ |
| PLAN-classroom.md | ⬜ blocked on Q1 |
| TEST-MATRIX.md | ⬜ hardware-only (Q4) |
| FEEDBACK-PLAN.md | ⬜ human posting (Q5) |
