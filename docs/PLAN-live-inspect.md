# Plan — Live inspect / step ("see the state") ✅ SHIPPED 2026-09-29

**Status:** shipped. Engine seam: `dump_vars()` in `spec/port/spike/src/lib.rs`
(read-only over the live runtime, JSON into the shared RES buffer). UI in
`index.html`: a floating 🔍 panel with ⏸ Pause / ▶ Resume / ⏭ Step, a live
key→value tree, and changed values highlighted; the JS core path reads
`runtime.vars` with no engine change.

Verified: `node spec/port/spike/dump-vars-diff.mjs` — **22/22** examples, the wasm
`dump_vars()` is identical to the JS `runtime.vars` after 20 stepped frames; and
`node tools/ui-check.mjs` drives the real panel in a browser (step disabled until
paused, pause → "paused", ⏭ ×3 changes a variable, panel stays live). The seeded-RNG
"record a repro" idea below remains a possible future step, not a promise.

Goal: pause a running game, step it one frame at a time, and **see every variable's
current value** update live — the Bret Victor "see the state" idea. This is a
sizable UI + engine-seam feature, so it's specced here before building.

## Why it's not a one-liner
The default engine is the wasm core, whose runtime (`LIVE_RT`) lives inside wasm
memory and is never surfaced to the page mid-game. The page only gets the per-frame
DRAW command buffer. So "see the state" needs a new read-only seam.

## Engine seam (small, additive)
Add one export to `spec/port/spike/src/lib.rs`, mirroring `parse_exec_to_json`'s
`emit_val` but over the LIVE runtime:

```rust
#[no_mangle] pub extern "C" fn dump_vars() -> u32 {
    let rt = match unsafe { (*addr_of_mut!(LIVE_RT)).as_ref() } { Some(r) => r, None => return 0 };
    let mut s = String::from("{");
    for (i,(k,v)) in rt.vars.iter().enumerate() { if i>0 {s.push(',');} json_str(k,&mut s); s.push(':'); emit_val(v,&mut s); }
    s.push('}');
    // copy into RES like the others; return length
}
```
Then `cargo build` + `node spec/port/spike/inline-wasm.mjs` (standard rebuild).
The JS core already exposes `runtime.vars`, so its path needs no engine change.

## UI (index.html)
- A toolbar with **⏸ Pause / ▶ Resume / ⏭ Step**. Pause = `cancelAnimationFrame`
  (WASMCORE already has `stop()`); Step = run exactly one `loop()` tick; Resume =
  restart the rAF loop.
- A collapsible **state panel** (right of / below the canvas). Each frame while
  paused-or-running, read `dump_vars()` (wasm) or `runtime.vars` (JS), JSON-render
  it as a key→value tree (objects/lists expandable). Highlight values that CHANGED
  since the previous frame (the high-value cue).
- Mobile: the panel is a bottom sheet; Pause/Step on the existing button bar.

## Determinism / safety
- Reading vars is read-only — no effect on the sim. Reuse `dump_vars` only when the
  panel is open (avoid per-frame JSON cost otherwise).
- Step mode pairs naturally with the seeded-RNG hook already used by
  `tools/visual-golden.cjs` — a future "record a repro" could snapshot seed+inputs.

## Test plan
- `dump_vars` differential: a new harness diffs `dump_vars()` (wasm) vs
  `runtime.vars` (JS) after N stepped frames on each example — same shape as
  exec-diff, extending it from top-level scripts to live game state.
- Playwright UI test (like `tools/visual-golden.cjs`): pause, step 3×, assert the
  panel text shows the expected changed var (e.g. `player.x` advancing).

## Estimate
~1 focused session: engine export (small) + the panel UI (the bulk) + the two
tests. No new dependencies. Recommended as the next "experience" build after the
docs items, since the `dump_vars` seam also benefits debugging and future tooling.
