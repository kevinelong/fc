
## Divergence log — 2026-06-12 side-by-side run (JS reference vs Rust spike)

Complete diff-suite run after the 2026-06-12 language additions:

| Layer | Result | Notes |
|---|---|---|
| Lexer (`tokenize-diff`) | **1274/1274 lines, 0 diff** | New verbs are ordinary words/strings — the Rust lexer already tokenizes all new corpus source identically. |
| Parser (`ast-diff`) | **40/40 recorded programs, 0 diff** | The golden set predates the new features; the 9 new corpus programs are NOT yet in `ast-golden.json`. Regenerate with `dump-ast.mjs` when porting. |
| Runtime (`exec-diff`) | **31/40** | All 31 pre-existing cases still green. The 9 diffs are exactly the new constructs the spike does not implement yet. |

Constructs the Rust core lacks (each shipped 2026-06-12 in JS, corpus-locked):
- `save X as "k"` / `load "k"` (+ STORE host seam) → `save_load_roundtrip`, `save_load_list`, `load_missing_default`
- `tile "#" is {…}` / `map is` rows / `solid at x, y` (+ world auto-size, mapSolidBox) → `map_dims_and_solid`, `map_without_tiles`, `solid_at_no_map`
- behaviors `chase`/`wander`/`patrol` (+ `through walls`; markers on sprites) → `behaviors_register`, `behavior_list_subject`
- `animate … with … every N frames` marker + `burst` statement → `animate_and_burst`

Porting order suggestion (cheapest first): solid_at/no-map default (returns `false`) →
save/load with an in-memory STORE → tile/map registry + dims → behavior/animate markers
(pure registration; frame motion is engine-side and stays out of exec goldens) → burst (no-op
headless, parse+exec only). The frame-loop motion itself belongs to phase 3b (command buffer).
