# Plan — runnable transpiler export ("take your game to real code") ✅ SHIPPED 2026-07-05

**Status:** shipped. On the JS tab of the "real code" panel, **▶ run this** opens
the game in a new tab and **⬇ download** saves a standalone `.html`. The shim is
in a `text/plain` block in index.html (inlined into each export). Verified in
headless chromium: 11/11 tested examples render with **zero JS errors** (all four
trophy demos — pong, snake, breakout, flappy — plus space-invaders, bubble-pop,
frogger, maze, pitfall, time-attack, joust). Two transpiler/shim fixes fell out of
this: bare `sprite` now → `new_sprite()` (was an undefined ref — also fixed the
read-only view), and the shim provides the global `frame` counter + a per-function
try/catch so one bad line can't blank the screen. Multiplayer runs solo (empty
`peers`); tag-collision/behaviors are safe no-ops.

---


Today the "real code" view is read-only (Python + JS mirrors). This makes the
**JavaScript** output actually *run* outside fc, so a learner can download a
standalone `.html` of their game and tinker with it in plain JS. (Python stays
read-only — a runnable Python port needs pygame and can't run in a browser.)

## Why JS is (mostly) already runnable
The JS transpile output is close: variables/math/if/loops/functions map directly,
`run game with update and draw` → `run_game(update, draw)`, `when key …` emits a
real `if (key_pressed(…)) {…}`, draws → `draw_rect(...)`, etc. What's missing is
just the **helper functions** those calls reference. So the work is a small
runtime shim + a wrapper, NOT a second engine.

## Deliverables
1. **`fc-runtime.js`** — a small, documented shim implementing the helper API the
   JS transpiler emits, against a real 2D canvas:
   - loop: `run_game(update, draw)` (rAF, ~30fps, fc's 128×128 world scaled up)
   - draw: `clear_screen`, `draw_rect/circle/line/sprite`, `write_text` (reuse a
     tiny font), `show_button`, `draw_meter`
   - input: `key_pressed`, `any_key_pressed`, `mouse_*`
   - sound: `play_sound`/`play_music` (WebAudio beeps; safe no-op fallback)
   - values: `random_int`, `new_sprite` (plain object), `is_solid_at`
   - color NAMES → hex (copy fc's `COLORS`), so `"green"` etc. resolve
   - unsupported-but-safe no-ops: `set_tag`, `set_behavior`, net/`broadcast`
     (documented; collision-tag/behavior/multiplayer games won't fully play)
2. **Wrapper**: a self-contained `.html` = canvas + `fc-runtime.js` (inlined) +
   the transpiled JS. The program's own `run_game(...)` line starts it.
3. **UI**: on the JS tab of the "real code" panel, a **▶ Run this** (open in a new
   tab / iframe) and **⬇ Download .html** button. Hidden on the Python tab.

## Scope / honesty
v1 targets the non-multiplayer, non-tag-collision subset — which covers the
trophy demos (pong, snake, breakout, flappy). A short banner in the export notes
what isn't ported. Not bit-identical to fc; an approachable, editable port.

## Verify
Export pong + snake, run the generated HTML headless in chromium, assert the
canvas changes across frames and throws no error.
