# Architecture

How `index.html` is organized, in the order code appears in the file.

The whole project is **one HTML file** by design. No build step. No bundler. Open in browser, it runs.

---

## File layout (~3000 lines)

```
<!DOCTYPE html>
<head>
  <style>...</style>          -- ~80 lines: layout, CRT effects
</head>
<body>
  <div id="app">
    <div id="canvas-wrap">
      <div id="screen-frame">
        <canvas id="screen">  -- 128x128 logical, scaled with CSS
        <div id="subpixels">  -- RGBG overlay
        <div id="scanlines">  -- horizontal+vertical mask
      </div>
    </div>
    <div id="editor-wrap">
      <textarea id="editor">  -- code input
      <div id="errors">       -- error display
    </div>
  </div>
  <script>
    [main script]
  </script>
</body>
```

## Script sections (in order)

1. **DOM refs + canvas resize** (~30 lines)
2. **`tv()` helper + `singularize()`** (~15 lines)
3. **Color palette `COLORS` + `resolveColor()`** (~25 lines)
4. **Bitmap font `FONT_DATA` + `drawText()`** (~80 lines)
5. **Built-in sprites `SPRITES` + `SPRITE_PAL` + `drawSprite()`** (~120 lines)
6. **Probability words `PROBABILITY`** (~10 lines)
7. **Lexer `tokenizeLine()`** (~70 lines)
8. **Parser `parse()`** (~700 lines, biggest section)
9. **Runtime `class Runtime`** (~900 lines)
10. **Main controller** (~150 lines: run(), key events, mouse events, initial demo)

## Lexer

Single function `tokenizeLine(line)` produces an array of tokens, with `tokens.indent` set to the indentation level (each 2 spaces or 1 tab = 1 level).

Token types:
- `word` — identifier or keyword
- `number` — integer or float (negatives recognized only at expression starts)
- `string` — `"..."` or `'...'`
- `operator` — `+ - * / > < >= <= != =`
- `dot`, `comma`
- `lbracket / rbracket`, `lbrace / rbrace`, `lparen / rparen`

Comments start with `--` and run to end of line. Colons (`:`) are NOT tokenized — object literals work without them by happy accident.

**Key gotcha:** token `value` can be a number (not always a string). Use the `tv(token)` helper to safely lowercase a value as a string. We had a major bug where calling `.toLowerCase()` on number values crashed everything.

## Parser

**Strategy:** line-by-line recursive descent with indentation-aware blocks.

```
parse(source) →
  parseBlock(start, minIndent) →
    parseLine(tokens, lineNum) → AST node
    if next line indent > minIndent: recurse to fill node.body
```

### Statement dispatch (in `parseLine`)

The first word of a line determines parsing:

| First word | Builds | Notes |
|---|---|---|
| `to` | funcdef | `to screen X` makes name `screen_X` |
| `go` | goto / goback | `go to X` or `go back` |
| `follow` | follow | `follow X with camera` |
| `run` | rungame | `run game with update and draw` |
| `when` | when_key / when_mouse / when_pickup / when_hit / when_button / when_generic | dispatched by parseWhen |
| `if` | if | parseIf |
| `else` | else / else_if | inline action or block |
| `repeat` | repeat_times / repeat_range / repeat_while / repeat_until / forever | parseRepeat |
| `each` | each | parseEach (supports inline action) |
| `forever` | forever | |
| `stop` | stop | sets `this.stopped` |
| `return` | return | sets `this._returning` (NOT stopped) |
| `clear` | clearscreen / clear | `clear screen to X` vs `clear var` |
| `draw` | draw | parseDraw — circle/rect/line/sprite |
| `write` | write | parseWrite |
| `say` | say | (currently buffers, no real output) |
| `show` | button | `show button "X" at x, y` |
| `add` / `remove` | add / remove | `add N to X`, `remove N from X` |
| `toggle` / `double` / `halve` | toggle / double / halve | |
| `pset` | pset | |
| `restore` / `block` | restore | |
| `knock` | knock | parseKnock |
| `damage` / `heal` | damage / heal | |
| (probability word) | probability | wraps the rest of the line |
| (`X are Y`) | tag | `trees are solid` etc |
| (`X is Y`) | assign | falls through to here |
| (anything else) | call | implicit function call |

### Critical parser logic

**`splitOnAnd(tokens)`**: splits a line at `and` when it separates statements (not inside `between X and Y`). Detects "this is a new command" by checking if the next token is a known command word.

**`stripHudSuffix(raw)`**: peels `on hud` / `on screen` from the end of draw/write statements before normal parsing.

**`parseIf` second-`is` heuristic**: `if X is Y foo is bar` is split at the second `is` (which implies a new assignment statement). Without this, conditions ate everything.

**Command word list** (`isCommandWord`): used by parseIf and parseEach to find where a condition/list ends and an inline action starts. Must include any verb you add as a top-level command.

### Expression parser (`parseExpression`)

Recursive descent with precedence:
1. Single-token forms (number, string, ref, yes/no)
2. List literals `[...]` and object literals `{...}` (depth-aware split)
3. `random N` form
4. `list of N sprites [...]` and `centered sprite [...]` and `sprite [...]`
5. Property access `a.b.c` (collapses dots into a dotted ref name)
6. `item N of LIST`
7. `the number of X` / `count of X`
8. Math: `+ -` (low precedence), then `* / mod`
9. Fallback: first token as a ref

### Condition parser (`parseCondition`)

Handles in this order (top-down):
1. `key "X"` — checks live key state
2. `not X` prefix
3. `no X` prefix
4. `or` at top level (lowest precedence)
5. `and` at top level
6. `between A and B`
7. `is in [...]`
8. `is not Y`
9. `is Y` (equality)
10. `> < >= <= !=` operators
11. `has` (substring/membership)
12. Bare expression → truthiness check

## Runtime

### `class Runtime`

State:
- `vars` — variable store (flat object)
- `funcs` — function definitions (flat object)
- `tags` — `{ solid: [...], pickups: [...], hostile: [...], deadly: [...] }` lists of variable names
- `pickupHandlers`, `hitHandlers`, `buttonHandlers` — by item name / button label
- `eventHandlers.key`, `.key_in`, `.mouse` — for `when key/mouse`
- `buttons` — current frame's button hitboxes (rebuilt each frame)
- `_screenStack` — back-stack for `go to / go back`
- `_prevPositions` — last-frame positions for solid rollback
- `camera`, `world`, `followTarget`
- `keyState` — currently held keys
- `mouseState` — `{x, y, down, clicked}`
- `stopped` — permanent halt (only `stop` sets)
- `_returning` — transient return flag (consumed by exec scope)

### `exec(stmts, maxOps)`

Runs a block of statements via `smartExecList`, which is the same as `execList` but handles `if/else_if/else` chaining (`else` only runs if the immediately-prior `if` was false).

`smartExecList` checks `this.stopped || this._returning` between statements so:
- `stop` halts the entire game
- `return` halts only the current `exec` call (and is consumed at exec exit so it doesn't leak to callers)

Each iteration increments `ops`; bails at `maxOps` (default 100k) to prevent infinite loops.

### `callFunc(name)`

Wraps `exec` with save/restore of `this.stopped`, so a function-local stop doesn't propagate. (We don't bother with `_returning` here because exec already handles it.)

### Statement dispatch (in `execOne`)

Massive `switch (stmt.type)` covering every node type the parser can produce. New parser node types always need a matching case here.

### `evalExpr(node)` and `evalCondition(node)`

`evalExpr` handles values: literals, refs, math, lists, objects, function-call-as-expression, `random`, `item_of`, `count`, `sprite_expr`, `list_of_sprites`.

`evalCondition` handles boolean nodes: `eq`, `neq`, `cmp`, `between`, `in`, `has`, `not`, `and`, `or`, `key_pressed`. Falls through to `isTruthy(evalExpr(node))` for bare expressions.

### Game loop (`startGameLoop`)

Uses `setInterval` at 1000/60 ms, NOT `requestAnimationFrame`. We tried rAF first — it stops firing in non-visible tabs and in some preview/headless environments, killing the game silently.

Per frame:
1. Process held-key handlers (when X is pressed for keys currently down)
2. Process button click hit-test (if mouse.clicked, check against `buttons` list)
3. Process mouse handlers (`when mouse is clicked` / `when mouse is down`)
4. Save player's previous position
5. Run `update` function (first in `funcNames`)
6. Clamp player to world bounds
7. `checkCollisions()` — solid/pickups/hostile/deadly
8. Update camera if `followTarget` is set
9. Clear `buttons` list
10. Run remaining `funcNames` (typically `draw`)
11. Auto-dispatch to `screen_<mode>` if defined

The loop is started once on `run game with X`. Reset/re-parse on next user keystroke clears the interval and reruns.

### `checkCollisions`

For each tag class:
- **solid:** if player overlaps any item → restore player to prev position. Also fires hit handler if defined.
- **pickups:** if player overlaps → splice item out of list, fire `picks up` handler with item bound by singular name.
- **hostile:** if player overlaps → fire hit handler. No auto consequence.
- **deadly:** if player overlaps → auto -1 hp, fire hit handler.

8×8 AABB overlap: `|a.x - b.x| < 8 && |a.y - b.y| < 8`. Singularization is naive English (`enemies` → `enemy`, `coins` → `coin`).

### `_collectAllSprites` and `_findEmptySpot`

Used by `list of N sprites` placement. Walks `this.vars` recursively to find every `{x, y}` object (including inside arrays). Tries 80 random positions for each new sprite, requiring 12px minimum center-to-center distance from every existing sprite. Falls back to pure-random if it can't find a clear spot (i.e., world is too crowded).

## Drawing

Logical canvas is 128×128. CSS scales it via `image-rendering: pixelated`. Scale (auto-computed in `resizeCanvas`) is pushed into a CSS variable `--scale` on the scanline + subpixel overlays so they stay aligned.

### Drawing primitives apply camera offset

In `execDraw` and `execWrite`:
```
const ox = stmt.hud ? 0 : this.camera.x;
const oy = stmt.hud ? 0 : this.camera.y;
const x = (a.x ? this.evalExpr(a.x) : 0) - ox;
```

The `hud` flag on the stmt comes from `stripHudSuffix` in the parser. `clear screen to X` is always full-screen (no offset). Buttons are always HUD.

## Bitmap font

`FONT_DATA` is a hand-coded `{char: [row0, row1, row2, row3, row4]}` map. Each row is a 3-bit value (3 columns × 5 rows = 15-bit char). `drawText(text, x, y, color)` walks the string, looks up each char, and draws bits as 1×1 pixels.

The font has uppercase letters, digits, and common punctuation. `drawText` uppercases input. There are 4 px between chars (3 wide + 1 spacing).

We replaced `ctx.fillText` with bitmap rendering because canvas font drawing is anti-aliased — terrible at 5px on a pixel canvas.

## Sprites

`SPRITES` is `{name: hexString}` where each hex string is 64 nibbles (one per pixel of an 8×8 sprite, color-indexed to `SPRITE_PAL`). `0` = transparent.

`drawSprite(name, x, y)` walks the 64 chars, plots each non-transparent pixel as a 1×1 fillRect at `(x + col, y + row)`.

Adding a sprite: pick or design an 8×8 image, encode each row as 8 hex digits (left-to-right, 0=transparent, 1-f from `SPRITE_PAL`), concatenate 8 rows.

Compact total: ~50 sprites in ~3 KB of source. See PICO-8/TIC-80 community for sprite-design tips at this resolution.

## CRT effect layers

In CSS, three stacked layers:

1. **Canvas** (bottom): the actual pixels, with `filter: blur(0.7px) brightness(1.18) contrast(1.12) saturate(1.25)` for phosphor bleed/glow.
2. **`#subpixels`** (middle): a `mix-blend-mode: screen` overlay with a 4-stripe RGBG gradient repeating every `--scale` pixels horizontally. Adds subtle color fringing.
3. **`#scanlines`** (top): a `mix-blend-mode: multiply` overlay with horizontal 2px-tall + vertical 1px-wide black stripes. Creates the dot-mask look.
4. **`#screen-frame` `box-shadow`**: outer glow, simulates tube halation.

Trade-offs:
- Stronger blur = more glow but pixels less crisp
- Stronger mask = darker overall but more retro
- Subpixel overlay is decorative; real subpixel rendering would require per-pixel canvas manipulation

## UI / event flow

1. User types in textarea
2. `input` event sets a 500ms debounce timer
3. On timer fire: `run(source)` is called
4. `run`: `runtime.reset()` → `parse(source)` → `runtime.exec(program)`
5. If program calls `run game with X`, `startGameLoop` schedules the setInterval
6. setInterval keeps firing until the next code change (which calls reset → clearInterval)

Key events go through `normalizeKey` (e.g., `ArrowUp` → `up`, `' '` → `space`). They:
- Set `runtime.keyState[key] = true`
- Call `runtime.processKeyPress(key)` to fire `when key is pressed` handlers
- If key is space/enter and there's a button, fire its handler
- Prevent default for arrow/space keys when canvas has focus

Mouse events translate display coordinates → 128×128 logical coordinates by scaling against the canvas's bounding rect.

## Common pitfalls when modifying

1. **Token values can be numbers**, not always strings. Use `tv(token)` helper or check the type.
2. **Adding a new statement keyword?** Add to `isCommandWord` if it should terminate `if` conditions / `each` lists.
3. **Adding a new draw operation?** Apply camera offset (`stmt.hud` flag).
4. **Adding a new function the runtime calls implicitly?** Make sure it doesn't conflict with user-defined names. The screen abstraction uses `screen_X` prefix to namespace.
5. **The `return` flag is `_returning`, not `stopped`.** `stopped` is permanent halt; `_returning` is transient and consumed by `exec`.
6. **rAF doesn't fire reliably.** Use setInterval for the game loop.
7. **Editor-typing keystrokes shouldn't trigger game key handlers.** The keydown listener checks `document.activeElement === editor` and bails.

## Testing

There's no test suite. We test manually via the preview MCP tool while developing, then push to GitHub Pages and refresh.

For unit-test-like verification, we use `eval` against the running runtime to check internal state after operations:

```js
// e.g., simulate a collision and check state
runtime.vars.player.x = enemy.x + 3;
runtime.checkCollisions();
// inspect runtime.vars.lives, runtime.vars.player.invuln, etc.
```

This is enough to catch most regressions during a session.
