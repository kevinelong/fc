# Plan — optional duration / match timer ✅ SHIPPED 2026-09-29

**Status:** shipped in all three cores (`index.html`, `spec/lang/fc-core.mjs`,
`spec/port/spike/fc-core-record.mjs`, `src/lib.rs`). `time limit is N
seconds` / `N frames`, the `timer` HUD value, and `when time runs out` are live.
Verified: 5-frame limit counts 1,1,1,1 → 0 and fires the handler exactly once at
the crossing frame (60-frame limit fires at frame 60); no limit ⇒ no `timer` and
no handler, so all pre-existing goldens are unchanged. Tests:
`spec/corpus/time_limit_static.fc` (set + read), `spec/port/spike/frame-tests/f_timer.fc`
(countdown + fire-once, drawn counter, JS↔wasm frame parity). Demo:
`examples/time-attack.fc` + launcher tile + thumbnail + share page + visual golden.

---

Research (MakeCode Arcade `startCountdown`, Scratch timer var, arcade time-limit
history): the useful shape is **set a duration in seconds → a countdown ticks →
remaining time is readable for the HUD → an event fires at zero**, and it must be
**optional** (no limit set ⇒ nothing changes). fc's twist: stay plain-English and
*composable* — don't force a game-over; let the game decide what happens.

## The feature (3 small surfaces)
1. **Set it** — `time limit is 30 seconds`
   Optional statement. Starts a countdown of 30s when the program runs. `seconds`
   is the unit (reuse the `every N seconds` unit parse); a bare number = seconds.
2. **Read it** — builtin var `timer` = whole **seconds remaining** (ceil, never
   < 0), updated every frame. For the HUD: `write "time {timer}" at 50, 2 …`.
   (Absent/0 if no limit set.)
3. **React** — `when time runs out` … (handler block, like `when "space" is
   pressed`). Fires **once**, the frame the countdown crosses to 0. The body
   decides: `go to results`, `mode is "over"`, `stop`, etc.

## Semantics (deterministic + optional)
- Countdown is **frame-based** (limit_seconds × 60 = limit_frames), decremented
  once per frame in the game loop. So it's deterministic (testable, golden-able)
  AND pauses naturally with the live-inspect pause (no wall-clock).
- `timer = ceil(remaining_frames / 60)`. Hits 0 on the last frame; the
  `when time runs out` handler fires that frame, then doesn't re-fire.
- No limit set ⇒ no `timer` var, handler never fires, zero behavior change. The
  "optional" guarantee — existing games and the whole corpus stay byte-identical.
- It does NOT auto-stop the game (unlike MakeCode). Composable with fc's screens.

## Where it lands (4 impls + tests — a real language change)
- `index.html` — the live reference: parse (`time limit …`, `when time runs out`),
  register the timeout handler, and in `frame()` decrement + set `timer` + dispatch.
- `spec/lang/fc-core.mjs` and `spec/port/spike/fc-core-record.mjs` — the JS oracles
  the harnesses run; identical edits (keep in sync with index.html).
- `spec/port/spike/src/lib.rs` — the wasm core: `Stmt::TimeLimit`, `WhenTimeout`
  handler, frame_step countdown/`timer`/dispatch; then `cargo build` + inline.
- **Corpus** `time_limit_countdown.fc` (set + count + fire), goldens by execution.
- **Demo** `examples/time-attack.fc` (grab coins before time runs out) + launcher
  tile + thumbnail. Showcases timer HUD + `when time runs out` → results screen.
- **Tests**: exec-diff (corpus), examples-diff + smoke (demo), all stay green;
  visual-golden for the demo; the "optional" guarantee = existing 13 goldens
  unchanged.

## Naming rationale
`time limit is N seconds` reads like prose and reuses `is` + the `seconds` unit.
`timer` (one word) interpolates cleanly. `when time runs out` matches the existing
`when …` handler family. Rejected: `set countdown to N` (`set` isn't an fc verb);
`play for N seconds` (`play` is taken by sound/music).
