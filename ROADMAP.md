# Roadmap

What's done, what's planned, what we've discussed but not committed to. Read PHILOSOPHY.md before considering any of these — the philosophy is the lens.

---

## Done

### Language (parser + runtime)
- [x] Variables, math, comparison, logic, truthiness
- [x] Strings with `{var}` interpolation
- [x] Lists and object literals (depth-aware nested parsing)
- [x] `is` for both assignment and equality
- [x] `yes`/`no` for booleans
- [x] Action verbs: `add to`, `remove from`, `clear`, `toggle`, `double`, `halve`, `damage`, `heal`
- [x] Conditionals: `if`/`else if`/`else`, single-line and block forms
- [x] Loops: `repeat N times`, `repeat with X from A to B`, `repeat while/until`, `forever`, `each X in Y where C`
- [x] Functions: `to NAME params`, `return`
- [x] Probability words mapped to percentages
- [x] `between A and B`, `is in [list]`, `has`
- [x] `and` chaining of statements on one line
- [x] Comments with `--`

### Engine / fantasy console
- [x] 128×128 logical canvas, scaled with `image-rendering: pixelated`
- [x] PICO-8 inspired 16-color palette
- [x] Pixel-perfect 3×5 bitmap font
- [x] ~50 built-in 8×8 sprites
- [x] Drawing primitives: circle, rect, line, sprite, write, pset, clear screen
- [x] Game loop via `run game with update and draw`
- [x] setInterval at 60fps (rAF unreliable in some envs)
- [x] Debounced live re-interpret on idle (~500ms)
- [x] Responsive layout (portrait/landscape)

### Input
- [x] Keyboard with normalized key names (`up`, `down`, `space`, etc.)
- [x] Mouse click + position
- [x] Touch events (basic)
- [x] `if key "X"` condition for held keys in update
- [x] `when "X" is pressed` handlers
- [x] Space/Enter activates first visible button

### Game features
- [x] Sprite primitive with auto-placement: `centered sprite`, `list of N sprites`
- [x] Collision detection via tags: `solid`, `pickups`, `hostile`, `deadly`
- [x] `when player picks up any X`, `when player hits any X`
- [x] `knock X away from Y distance N`
- [x] `restore` / `block` for manual position rollback
- [x] Invulnerability frames (via `player.invuln` decrement pattern)
- [x] Edge-of-world clamping
- [x] World/camera with `world is {width, height}`, `follow X with camera`
- [x] `on hud` modifier for screen-space drawing
- [x] Buttons: `show button "X" at x, y` + `when button "X" is clicked`
- [x] Screen functions: `to screen X` auto-dispatched on `mode`
- [x] `go to X` / `go back` navigation with stack

### CRT polish
- [x] Scanline mask (horizontal 2px + vertical 1px lines)
- [x] RGBG subpixel overlay (CSS)
- [x] Phosphor bleed via blur + brightness/saturation/contrast filter
- [x] Outer bloom via box-shadow

### Demo
- [x] Coin Quest: title → options (difficulty + music) → credits → play → win/lose with restart
- [x] 24 sprites placed without overlap
- [x] Difficulty actually affects gameplay (speed, enemy count)

---

## Planned (in priority order)

*Audited 2026-09-29 against the code and the harnesses: most of this list shipped,
and every claim below is checked. The genuinely-open items are collected at the end.*

### Shipped since this list was written

- **Sound** ✅ — procedural Web Audio chiptune, no audio files: built-in named SFX,
  `define sound "X" as tone/square/noise from A to B over N`, `play sound "X"`,
  looping `play music "X"`, `stop music` (the stop verb was dead until 2026-09-29),
  and the `music` toggle. `AUDIO` in index.html; the wasm emits `defsfx`/`play_sound`
  commands; 14 examples define their own sounds.
- **Animation** ✅ — `animate X with "a" "b" every N frames` (set-once frame cycling
  on the global tick, marker kept on the sprite). Corpus: `animate_and_burst.fc`.
  Tween/easing keywords are NOT implemented (below).
- **Enemy AI / behavior verbs** ✅ — `X chases player [speed N] [through walls]`,
  `X wanders`, `X patrols between A and B`, `blocked by` for solid tiles. The
  markers are editable fc data on the sprite. Behaviour words are part of the
  healer's vocabulary, so a typo'd behaviour still reads as English.
- **Map / tilemap as a primitive** ✅ — `tile "#" is {…}`, `map is grid W by H of
  tiles "X"`, indented ASCII rows, `map at x, y is "tile"`, `is solid at x, y`,
  `draw map`; solids block movement. Corpus: `map_dims_and_solid.fc`,
  `map_without_tiles.fc`; the ▦ map editor; maze + pitfall demos.
- **Save / load** ✅ — `save <value> as "key"` / `load "key"` for numbers, strings,
  lists and objects; per-game namespace; missing key → safe default, no crash
  (corpus: `save_load_roundtrip.fc`, `load_missing_default.fc`). Cloud mirror via
  apid `/api/state`. Checkpoint auto-save is NOT implemented.
- **Better error messages** ⚠️ partial — the deterministic safety net reports
  near-miss verbs and colors before running ("Did you mean …"), and the runtime
  keeps going instead of dying. The runtime's own messages are still generic
  ("I got confused: …") with no bounds detail or line highlight.
- **Friendlier debugger** ✅ — 🐞 step gives a per-statement trace with a scrubber
  (step back, not just forward), and the 🔍 live-inspect panel pauses, steps one
  frame, and shows every variable with changed values highlighted.
- **Multi-target compilation** ⚠️ partial — the **real code** panel transpiles every
  program to Python and JavaScript, the JS output runs standalone (`▶ run this` /
  `⬇ download .html`, PLAN-runnable-export), and the gated LLM tier writes fc from
  English. Lua/LÖVE, Godot and Unity targets are NOT implemented.
- **Particle / effect verbs** ✅ — `burst N sparks at X, Y [in color]`,
  `emit [N] sparks [rising|falling] at X, Y | from SPRITE [in color] [for N
  [seconds|frames]]` (both 2026-09-29 for emit), and `flash screen` /
  `shake camera` (frame-counted, host-rendered, skipped under reduced motion).
- **Mobile touch controls** ✅ — a touch device gets an on-screen D-pad plus A/B
  wired into the same key state, plus `show button "X" at x, y` with
  `when button "X" is clicked`. A `show joystick` verb is NOT implemented (the pad
  is automatic).
- **Local multiplayer** ✅ — `join game "room"`, `broadcast`, `peers` / `connected`
  over the relay (apid `huntd` + Pool Room); 5 co-op/vs examples (online pong,
  mp-dots, hunt, cycles, …).

### Still planned (verified absent on 2026-09-29)

- **Dialogue / NPC system** — `when player talks to`, `show dialog`, `show choice`.
- **Inventory verbs** — `add "key" to player inventory` (today: lists + `has`).
- **The `{frames: [...], fps: N}` sprite-property form of animation** — `animate X
  with "a" "b" every N frames` is the implemented form; a sprite that declares its
  own frame list is still planned. (`tween … ease in/out/bounce` shipped 2026-09-29.)
- **Enemy AI extras** — `flee from player`, `shoot at player every N seconds`,
  waypoint patrols.
- **True subpixel rendering** — today's CRT subpixels are a CSS overlay tinting
  columns, not per-pixel RGB stripes derived from the color values.
- **Stale demo media** — `examples/thumbs/{matrix,starfield,sand}.png` and their
  `share/*.png` OG cards were rendered before dynamic colors worked, so they still
  show flat shapes; regenerate with `tools/gen-thumb.cjs` + `tools/gen-share-pages.cjs`
  (needs playwright-core). The in-app launcher reads those thumbnails.
- **Compiler targets beyond Python/JavaScript** (Lua, Godot, Unity).

## Discussed but not implemented

These came up in conversation but we haven't acted on them:

### Phosphor bleed crossing scanline gaps
We have CSS blur + reduced mask opacity. To **really** see colors bleed across the gaps:
- Render to an offscreen canvas at display resolution
- Run a separable Gaussian blur kernel
- Composite back, with the scanline mask applied AFTER blur
This is ~30 lines of canvas pixel manipulation. Listed under "True subpixel rendering" since they share infrastructure.

### Barrel distortion (CRT curvature)
CSS `transform: perspective(...)` or SVG filter could fake the curved-tube look. Subtle.

### Animated noise / aging
Subtle white noise overlay, occasional flicker, grain. Easy with a small noise canvas + low-opacity overlay.

### Pre-built scene backgrounds
User mentioned: scenes like "forest at night", "space", "dungeon" as one-line setters. Currently you draw your own.

```
set scene to "forest at night"
set scene to "space"
```

The runtime would have a few hand-drawn or procedural backgrounds.

### "list of 12 trees" auto-naming
We support `list of N sprites {image: "tree"}`. We discussed but didn't implement: `list of 12 trees` where the noun after `of N` is auto-singularized to set `image: "tree"`. Saves typing but adds magic. TBD.

### Sprite as a true class with inheritance
Right now sprites are just objects. We could make `sprite` a class users extend:

```
class enemy extends sprite {hp: 3, behavior: chase}
class boss extends enemy {hp: 30, size: 16}
```

But this adds a class system, which might be too much complexity. Not yet.

### Real subpixel rendering
Mentioned above; CSS tint columns are a placeholder.

---

## Open design questions

These are unresolved tensions where we haven't picked a direction yet:

### Q1. Function names with spaces

The user wrote `to draw title` expecting a function named "draw title". The parser only takes the first word as the name. Multi-word function names are common in HyperTalk and Inform 7 (`to draw title screen`). Should we support them?

Trade-off: makes calls `restart game` (without underscore) more natural, but parsing every "verb followed by anything" gets ambiguous.

Current workaround: use single-word names or screen functions (`to screen title`).

### Q2. Default behavior of generic `draw <noun>`

The user has a function `to title` and types `draw title` — should that:
- Call the `title` function? (yes, intuitive)
- Try to draw a sprite named "title"? (current behavior)

We default to draw-as-sprite; functions need to be called by name without `draw`. This is a real source of confusion for the user.

### Q3. Automatic image inference from list name

`coins is list of 8 sprites` — currently you must add `{image: "coin"}`. Should the runtime singularize the variable name and use it as the default image?

Pro: shorter; matches user intuition.
Con: magic; breaks if the user uses non-standard plurals or just wants generic placeholder.

### Q4. How much should sound be built-in?

Should every sprite type imply a default sound (sword = clang, coin = ding)? Or always require explicit `play sound "ding"`?

### Q5. Screen system — implicit vs explicit

`to screen X` auto-dispatches when `mode is "X"`. Should we also auto-call an `update_X` function? Right now `update` runs every frame regardless of mode (the user has to gate with `if mode is not "play" return`).

A cleaner pattern would be: `to update X` only runs when `mode is "X"`. But that changes the implicit conventions.

### Q6. What happens after `go to win` when there's no `screen_win` defined?

Currently nothing; the screen just doesn't render. Should we error? Fall back to a generic "NO SCREEN: win" message?

### Q7. Should `clear screen` be implicit at the start of each frame?

Right now the user must call `clear screen to X` themselves. If they forget, old frames stick. Pro of implicit: friendlier. Con: prevents intentional motion-blur effects, partial redraws.

---

## Bug-class watch list

Things that have bitten us before and might bite again:

1. **`return` setting global stopped flag** — fixed via `_returning`, but be careful when adding new exec paths.
2. **Token values being numbers, not strings** — use `tv(token)` always.
3. **Function names colliding with command words** — `to draw X` doesn't work; `to title` does.
4. **Camera offset on draw operations** — every new draw type needs `if (stmt.hud) ox=oy=0; else ox=camera.x...`.
5. **Auto-placed sprites in the same world as player** — `_collectAllSprites` walks `vars` recursively; placement order matters (define `player` before `trees` so trees avoid player).
6. **Editor focus stealing keys** — keydown handler bails if `document.activeElement === editor`. New global keyboard features must keep this guard.
7. **Reload not picking up code changes** — the live reload is debounced 500ms after the last keystroke, NOT on Save/external file write. To force, click in the editor and add a space.

---

## How to pick up where we left off

If you're another Claude session:

1. Read **PHILOSOPHY.md first**. Its decision precedents will save you arguing with the user about choices we already made.
2. Read **LANGUAGE.md** to understand what the user can write.
3. Read **ARCHITECTURE.md** to understand how to modify it without breaking parsing.
4. Skim this **ROADMAP.md** for context on the conversation history.

When the user says "let's add X", default to:
1. Could this be expressed in existing language constructs? If yes, show how.
2. If not, what's the smallest parser/runtime addition that fits the philosophy?
3. What existing pattern does it most resemble? (`when X`, `to X`, declarative tag, action verb, etc.)
4. Will it break any existing user code? (Shouldn't.)

Ship in small commits. The user prefers seeing progress.
