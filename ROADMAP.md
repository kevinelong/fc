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

### Sound (high priority)
**Why:** Right now `play sound "X"` is a parsed no-op stub. Sound is half the feel of a game.

**Approach:** Web Audio API generated tones — like PICO-8's 8-bit synth.
- Built-in named sounds: `"beep"`, `"boop"`, `"jump"`, `"hit"`, `"pickup"`, `"win"`, `"lose"`, `"shoot"`
- User-definable: `define sound "fanfare" as ...`
- Music tracks: `play music "X"` (looping)
- Volume control: respect `music` toggle in user code (`when music is no stop music`)

### Animation
**Why:** Static sprites. Real games breathe.

**Approach:**
- Sprites can have a `frames` property: `{frames: ["hero1", "hero2"], fps: 8}`
- `animate sprite X` cycles frames
- Or: built-in animation lookups (e.g., `hero.walk` is a frame sequence)
- Tween verbs: `tween X.y from 0 to 100 over 1 second` for UI
- Easing keywords: `ease in`, `ease out`, `bounce`

### Enemy AI / behavior verbs
Currently enemies are stationary blobs. We'd add:
- `chase player` (move toward each frame)
- `wander` (random direction, change every N seconds)
- `flee from player when within N`
- `patrol along [{x,y}, {x,y}, ...]`
- `shoot at player every N seconds`
- Per-enemy AI: `each enemy in enemies chase player at speed 0.5`

### Map / tilemap as a primitive
Currently the world is just `{width, height}` with sprites scattered. Real games have grids of tiles.

```
map is grid 16 by 12 of tiles "grass"
map at 5, 3 is "stone"
map at 8, 4 is "water"
```

Or visual:
```
map is """
ggggggggggggwwww
ggggssssggggwwww
ggggssggggggssss
"""
```

Where each character is a tile. Auto-collision based on tile type (water = blocked or slow, etc.).

### True subpixel rendering
Current subpixel is a CSS overlay tinting columns. Real subpixels would split each pixel's color into R/G/B stripes based on its actual color values.

**Approach:** post-process pass in canvas. After `draw` completes, read 128×128 pixel data, render to a larger display canvas where each logical pixel becomes 3 (RGB) or 4 (RGBG) vertical stripes with the appropriate channel intensity.

Cost: ~1ms/frame at 60fps. Acceptable.

### Save/load games
- `save game as "save1"` → localStorage
- `load game from "save1"`
- Auto-save at checkpoints

### Better error messages
Currently errors are mostly "I got confused: …". We'd want:
- "I don't know how to add text to a number. Did you mean: add 5 to score?"
- "There is no item 8 in enemies (it only has 3 items)."
- "I don't know how to do 'fly'. Did you mean 'move'?"
- Highlight the offending line

### Friendlier debugger
- `inspect X` to print a value to a corner
- `pause game` / `step` for frame-by-frame
- A built-in `console` that overlays text without touching the user's HUD

### Multi-target compilation (the LLM-as-compiler thesis)
The verbs are platform-agnostic. We could write a compiler from FC source to:
- Standalone JS (canvas-based, no FC runtime)
- Python + Pygame
- Lua + LÖVE
- Godot scenes
- Unity C# + MonoBehaviour

The verb-vocabulary tier system (`say` → terminal, `draw` → canvas, `place 3D` → engine) would auto-pick the appropriate target.

### Dialogue / NPC system
```
when player talks to npc "wizard"
  show dialog "Hello, traveler!"
  show choice "ask about quest" "leave"
  if choice is "ask about quest" go to quest
```

A built-in dialog UI that pauses the game, shows text, accepts input.

### Inventory
```
player has inventory
add "key" to player inventory
if player has "key" in inventory open door
```

### Particle / effect verbs
```
emit sparks from player.position color orange for 0.5
emit smoke rising from chimney
emit trail behind player
flash screen red
shake camera for 0.3
```

Some of these are already parsed (no-op stubs). Need to actually render them.

### Mobile touch controls
- Built-in virtual joystick: `show joystick at hud bottom left`
- Action buttons: `show action button at hud bottom right` → fires `when button "action" is clicked`
- Auto-detect mobile and show

### Local multiplayer
- `player2 is sprite {...}` and key bindings to a second control set
- Co-op or vs.

---

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
