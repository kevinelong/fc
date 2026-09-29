# fc Runtime Semantics

> **The grammar tells you what parses. This document tells you what it *means*.**
> Most of fc's behavior is not in its syntax — it is in the tree-walking `Runtime`
> in `/home/kevin/codeonline/index.html` (one classic `<script>`, the interpreter
> spanning ~L441–4882). A faithful re-implementation (e.g. Rust→WASM) that matches
> the grammar but not this document will *parse the same and behave differently*.
> Every claim below is grounded in that source with `~Lnnn` citations.
>
> `[QUIRK]` marks behavior that is heuristic, surprising, or a likely fidelity trap
> for a port. `[DECISION]` marks a point where the port must consciously choose to
> **replicate** the current behavior or **fix** it — the conformance corpus must
> encode whichever is chosen.

---

## 1. Value model

A runtime value is one of: **number** (JS double), **string**, **boolean**,
**list** (JS array), **object** (JS plain object), or **undefined**.

- There is no distinct integer type; all numbers are IEEE-754 doubles
  (`0.1 + 0.2` leaks, see §7).
- `undefined` is a first-class result: reading an unknown variable yields it
  (`getVar` ~L2722 returns `this.vars[name]`, i.e. `undefined` if absent), and
  `evalExpr(null)` returns `0` (~L2741).
- Literals: list literals map-eval their items (~L2753); object literals
  shallow-copy via `Object.entries` (~L2748, ~L2756) — so an object literal is a
  fresh object each evaluation, but nested values are shared by reference.
- A bare word that is not a variable but *is* a color name evaluates to the word
  itself as a string (`ref` case, ~L2761–2766: `if (COLORS[name.toLowerCase()]) return node.name`).
  Otherwise an unknown ref is `undefined`.
- Dotted access (`a.b.c`) walks objects (~L2710–2720); a `null`/`undefined` link
  short-circuits to `undefined`. **Virtual `.count`/`.length`**: on a dotted read,
  if the segment is literally `count` or `length` and the current object is an
  array, it returns `obj.length` (~L2715–2716). [QUIRK] This is *only* on arrays
  via dotted access; strings do not get virtual `.length` through `getVar` (the
  separate `count of X` expression *does* handle strings — see §6).

---

## 2. Coercion: `parseFloat(x) || 0`

Arithmetic operands that are strings are coerced with `parseFloat(x) || 0`
(~L2772–2773). This is the single most important coercion rule and it bites hard:

- `"3"` → `3`, `"3.5"` → `3.5`, `"3px"` → `3` (parseFloat stops at non-numeric).
- `"hi"` → `parseFloat("hi")` is `NaN`, and `NaN || 0` → **`0`**. Any non-numeric
  string is `0` in arithmetic. [QUIRK]
- `"0"` → `parseFloat("0")` is `0`, and `0 || 0` → `0` (fine, but note the `|| 0`
  would also turn a *legitimate* `0`-valued parse into `0`, harmless here).
- Only **strings** are coerced. Booleans, lists, objects pass through to JS `+`
  unchanged inside `math` (a list operand would JS-stringify-then-add, but the
  language rarely produces this). A port should coerce **strings only** here.
- The `add`/`remove` statements have their *own* coercion (§5), distinct from
  `math`.

A Rust port must replicate `parseFloat` semantics precisely: leading whitespace
skipped, optional sign, decimal, exponent; stops at first invalid char; empty/
invalid → treat as `0`.

---

## 3. Equality is raw JS `==` / `!=`

`eq` returns `evalExpr(left) == evalExpr(right)` and `neq` returns `!=`
(~L2851–2852). **No coercion to a common type first** — this is JavaScript's loose
abstract equality, with all its hazards. The `cmp` `!=` operator (~L2861) is *also*
raw `!=`. A port must reproduce the JS Abstract Equality Comparison algorithm, not
its own notion of equality. Cases that will diverge if you use typed equality:

| Expression          | JS `==` result | Why (bites a port) |
|---------------------|----------------|--------------------|
| `'5' == 5`          | **true**       | string→number coercion |
| `'5.0' == 5`        | **true**       | parseFloat-like numeric coercion |
| `' 5 ' == 5`        | **true**       | whitespace trimmed in ToNumber |
| `'' == 0`           | **true**       | `''`→`0` |
| `'' == false`       | **true**       | both → `0` |
| `0 == false`        | **true**       | bool→number |
| `1 == true`         | **true**       | bool→number |
| `'yes' == true`     | **false**      | `'yes'`→`NaN`, not `1` [QUIRK] |
| `null == undefined` | **true**       | special-cased in spec |
| `null == 0`         | **false**      | null only loosely-equals undefined/null |
| `undefined == 0`    | **false**      | same |
| `NaN == NaN`        | **false**      | NaN never equals anything |
| `[] == 0`           | **true**       | `[]`→`''`→`0` |
| `[] == ''`          | **true**       | array→primitive `''` |
| `[1] == 1`          | **true**       | `[1]`→`'1'`→`1` |
| `[1,2] == '1,2'`    | **true**       | array→primitive `'1,2'` |
| `obj1 == obj2`      | identity       | objects compared by reference |
| `list1 == list2`    | identity       | arrays compared by reference |

[QUIRK] The `'yes'`/`'no'` strings are treated as booleans by `isTruthy` (§4) but
**not** by `==`. So `if flag is yes` works through truthiness only if written as a
bare truthiness test, but `flag is yes` as an equality compares the strings raw.
In practice `yes`/`no` round-trip via string equality (`'yes' == 'yes'` is true),
so equality between two yes/no values is fine; mixing a yes/no with a JS boolean is
the trap.

[DECISION] Replicate JS `==` exactly (recommended for fidelity) **or** define a
clean typed equality. The corpus must pin every row above.

---

## 4. Truthiness (`isTruthy`, ~L2698–2707)

Order matters; first match wins:

1. `null` / `undefined` → **false**
2. `false` or the string `'no'` → **false**
3. `true` or the string `'yes'` → **true**
4. number → `val !== 0` (so `0` false, `NaN` → `NaN !== 0` is **true** [QUIRK],
   negative numbers true)
5. string → `val !== ''` (non-empty string truthy, including `'0'` → **true** [QUIRK],
   `'false'` → **true**)
6. array → `length > 0` (empty list **false**)
7. object → `Object.keys(val).length > 0` (empty object **false**)
8. fallthrough → **true**

[QUIRK] Empty collections are falsey — opposite of JS, where `[]` and `{}` are
truthy. A port that delegates to a host-language truthiness will get lists/objects
wrong.

[QUIRK] `NaN` is truthy here (rule 4) even though `NaN == 0` is false and `NaN`
is falsey in JS. A port must special-case this if it shares a truthiness path with
its host.

`and`/`or`/`not` route operands through `isTruthy(evalCondition(...))`
(~L2882–2884), so they are boolean-coercing and short-circuiting, returning JS
booleans (not the operand value — unlike JS `&&`/`||`).

---

## 5. Arithmetic: `+` is numeric; `add … to` is overloaded

### Expression `+` (the `math` node, ~L2774–2781)
- `+ - * /  %` all operate on the `parseFloat||0`-coerced operands (§2).
- **`+` is NUMERIC, never string concatenation.** `'3' + '4'` → `7`,
  `'hi' + 'x'` → `0 + 0` = `0`. [QUIRK] This is the biggest surprise for anyone
  expecting JS `+`.
- `/0` → **0** (`r !== 0 ? l/r : 0`, ~L2778). `%0` → **0** (~L2779). No Infinity,
  no NaN from division by zero.
- Unary minus is folded by the parser, not a runtime op.

### Statement `add X to TARGET` (the `add` op, ~L2924–2935) — POLYMORPHIC
Dispatches on the *current type of the target variable*:
- target is an **array** → `current.push(val)` (append; val pushed as-is, no copy).
- target is a **number or `undefined`** → numeric add: `(current||0) + (string?parseFloat||0:val)`
  (~L2929–2931). Undefined target initializes to `0`.
- target is a **string** → **concatenation**: `current + String(val)` (~L2932–2933).
  This is the *only* place fc concatenates strings. [QUIRK]
- target is anything else (boolean/object) → no-op.

So `add "!" to greeting` concatenates when `greeting` is a string, but
`"a" + "!"` in an expression is `0`. The behavior of "add" depends entirely on the
runtime type of the destination, which the parser cannot know.

### `remove X from TARGET` (~L2938–2948)
- array → remove first matching element by value (`indexOf`/`splice`, identity for
  objects).
- number → numeric subtract (string val → `parseFloat||0`).
- else → no-op.

### `clear` / `toggle` / `double` / `halve` (~L2951–2980)
- `clear`: array→`[]`, number→`0`, string→`''`, boolean→`false`, else→`0`.
- `toggle`: boolean→negate; number→`0↔1` (nonzero→0, 0→1); `'yes'↔'no'`;
  else→`!isTruthy`. [QUIRK] number toggle is `current === 0 ? 1 : 0` so toggling
  `5` gives `0`.
- `double`: number×2 (no-op on non-number). `halve`: number/2 (no-op otherwise).

---

## 6. Indexing, counts, `item N of`

- `item N of list` → `list[N-1]`, **1-based** (~L2826–2830). Out of range →
  `undefined`. Non-array → `undefined`.
- `count of X` (the `count` node, ~L2834–2838): array→`length`, string→`length`,
  else→`0`.
- Virtual dotted `.count` / `.length`: arrays only, via `getVar` (§1, ~L2715).
- `between`: `v >= low && v <= high`, **inclusive** (~L2865–2867).
- `in`: `Array.includes` with **strict** `===` (~L2872) — note this is *strict*,
  unlike `==` used for `eq`. [QUIRK] `5 in [\"5\"]` is **false** even though
  `5 == \"5\"`.
- `has`: string→case-insensitive substring (`toLowerCase().includes`, ~L2878);
  array→`includes` (strict, ~L2879). [QUIRK] string `has` is case-insensitive and
  substring-based, not equality.

---

## 7. Number → string formatting; uppercase-only font

- Numbers render via JS `String(n)` / template interpolation (`interpolate`
  ~L2889–2895 uses `String(val)`). This is `Number.prototype.toString`:
  `0.1 + 0.2` → `"0.30000000000000004"`, `1e21` → `"1e+21"`, `-0` → `"0"`.
  A port MUST match JS double-to-string (shortest round-trip / ECMAScript
  ToString), not a naïve formatter, or visible text diverges.
- `interpolate` replaces `{name}` with `String(getVar(name))`; an **unknown**
  variable leaves the literal `{name}` in place (~L2893). [QUIRK]
- **The bitmap font is UPPERCASE-ONLY.** `drawText` does `String(text).toUpperCase()`
  (~L590) before glyph lookup. Lowercase letters render as their uppercase glyph;
  there is no lowercase glyph set. Any text drawn to the canvas is case-folded.
  (This affects `say`, `write`, button labels, meters — all route through
  `drawText`.)

---

## 8. Loops, ranges, op caps

- `repeat N times` (~L3009–3015): `for i<count`, count from `evalExpr`. Non-numeric
  count via JS comparison (count `undefined` → `i < undefined` false → 0 iters).
- `repeat from A to B as v` (`repeat_range`, ~L3018–3028): **inclusive** and
  **bidirectional**. `step = from <= to ? 1 : -1`; loop is `i <= to` (ascending) or
  `i >= to` (descending). So `from 5 to 1` counts `5,4,3,2,1`. [QUIRK]
- `repeat_while` / `repeat_until` (~L3031–3045): standard pre-test loops; `until`
  is `while(!cond)`.
- `each item in list [where cond]` (~L3068–3085): non-array → skipped entirely.
  `where` filters first (binding the loop var during the predicate, ~L3072–3074),
  then iterates the filtered list. Loop var is set in `this.vars` (global), it is
  **not** a local (see §12).
- `every N (frames|seconds)` (~L3056–3065): a per-source-line frame counter; body
  runs when `counter % period === 0`. `seconds` → `period = round(N*60)` assuming
  **60 fps** (~L3063). [QUIRK] timing is frame-count based, not wall-clock.
- **`forever`** (~L3047–3053): outside a game loop it runs **at most 1000
  iterations** (`for i<1000`). It is *not* infinite when run via `run()` directly;
  only the game loop (`run my game`) provides true per-frame repetition. [QUIRK]
- **Op cap**: every `exec()` enforces `maxOps || 100000` (~L2899). Each statement
  and each loop iteration increments `ops`; when `ops > limit` execution silently
  stops mid-run (no error). [QUIRK] A long program can be silently truncated at
  100k ops. The cap is per-`exec` call, and `exec` is re-entered per frame and per
  function call, so it is effectively a per-invocation budget, not a global one.

---

## 9. Randomness

- `random N` → `Math.floor(Math.random() * (N+1))`, i.e. an **inclusive** integer
  in `0..N` (~L2783–2785). [QUIRK] inclusive of `N`. `random 6` yields `0..6`
  (7 outcomes).
- **Unseeded.** Uses the host `Math.random()` directly. There is no seed, no
  determinism hook. [DECISION] A WASM port that wants reproducible conformance
  tests for anything touching `random` (or sprite placement, §11) MUST introduce a
  seedable RNG and a way to pin it; the golden corpus cannot otherwise assert on
  random output. Decide whether to keep `Math.random` parity (non-deterministic) or
  define a canonical PRNG.
- `probability` statement (~L3408–3412): `if Math.random() < prob` run the inner
  statement — also unseeded.
- **Placement RNG** (`_findEmptySpot`, ~L3793–3807): up to **80** random attempts
  to find a spot ≥ `SIZE=12` (center-to-center) from all existing sprites; on
  failure (80 misses) falls back to an unguarded random position. Range is
  `4 + floor(rand * maxW/H)` where `maxW = max(16, world.width-16)`. This is the
  RNG behind `list of N sprites` (~L2809–2823) and is order-dependent and
  attempt-count-dependent — a port must match the exact loop and the exact RNG draw
  order to reproduce placement.

---

## 10. ⭐ THE BIG ONE: if / else / else-if NESTING DIVERGENCE ⭐

> **Identical `if/else/else-if` syntax behaves differently depending on whether it
> sits at the top of a statement list or inside a loop body.** This is the single
> highest-fidelity-risk behavior in the runtime.

There are two list executors inside `exec` (~L2897):

- **`smartExecList`** (~L3435–3469) — used **only once**, for the top-level
  statement list of each `exec()` call (`smartExecList(stmts)` at ~L3471).
- **`execList`** (~L2904–2910) — used for **every nested body**: `if`/`else_if`/
  `else` bodies (~L2986, ~L2998, ~L3005), and crucially all loop bodies
  (`repeat_times` ~L3013, `repeat_range` ~L3026, `repeat_while` ~L3034,
  `repeat_until` ~L3042, `forever` ~L3051, `each` ~L3082).

### `smartExecList` — the CORRECT chain (top level only)
It tracks `lastIfResult` (~L3436):
- `if` → eval condition, store result; run body only if true (~L3442–3447).
- `else_if` → run **only if** `lastIfResult === false`; then re-evaluate and update
  `lastIfResult` (~L3448–3457).
- `else` → run **only if** `lastIfResult === false`; then reset `lastIfResult = null`
  (~L3458–3463).
- any other statement resets `lastIfResult = null` (~L3465).

So at the top level, `if/else if/else` is a proper mutually-exclusive ladder.

### `execList` — the BROKEN chain (every loop/nested body)
`execList` just calls `execOne` on each statement in order (~L2905–2908). `execOne`
handles the statement types in isolation (~L2983–3007):
- `if` → eval condition, run body if true; **does nothing on false** (~L2983–2991).
  The comment even says "handled by the else_if/else processing below" — but inside
  `execList` there is no such linkage.
- `else_if` → **evaluates its OWN condition unconditionally** and runs if true,
  with no knowledge of the preceding `if` (~L2994–3001).
- `else` → **runs its body UNCONDITIONALLY** (~L3003–3007). There is no
  `lastIfResult` to gate it.

### Net effect / worked example
```
repeat 3 times
    if score > 10
        say "high"
    else
        say "low"
```
Inside the loop body (`repeat` uses `execList`), the `if` runs its body iff
`score > 10`, **and then the `else` body runs regardless**. If `score = 50` you get
both `"high"` and `"low"`. The same code at the top level (no loop) behaves as a
proper if/else and prints only one.

Likewise an in-loop `else if` runs whenever *its own* condition is true, even if the
preceding `if` was also true — you can execute multiple arms of one "ladder".

[QUIRK][DECISION] This is a latent bug **and** a fidelity trap. The port must
consciously choose:
- **Replicate**: implement both list-walkers identically to the JS, including the
  divergence. Existing programs that (perhaps unknowingly) depend on in-loop `else`
  always firing will keep working. The corpus must include a nested-vs-top-level
  if/else pair asserting the *different* outputs.
- **Fix**: make all bodies use the smart chain (one correct `if`-ladder
  everywhere). Cleaner, but changes the observable behavior of any program with an
  `if/else` inside a loop. This is a breaking change and must be flagged as such.

Note also `return`/`stop` short-circuit both executors (`this._returning`/
`this.stopped` checks ~L2906, ~L3438), and `return` is scoped per-`exec` via
save/restore of `_returning` (~L2902–2903, ~L3473) — i.e. `return` exits the
current function body, not the whole program.

---

## 11. Magic globals, screen dispatch, navigation stack

The game loop (`startGameLoop`/`frame`, ~L3631–3741) is a **name-keyed convention**
over `this.vars`. There is no declared binding; the engine reads and writes specific
variable names by string.

### Produced BY the engine each frame (the program reads these)
- `peers` ← `NET.peers` (~L3637) — the stable peer array (§13).
- `connected` ← `NET.connected()` (~L3638) — boolean socket-open.
- `mouse` ← `{x,y}` when a mouse handler fires (~L3665, ~L3671).
- (`tick` is maintained on the runtime, ~L3678, not exposed as a var by default.)

### Consumed BY the engine (the program writes these; the engine reacts)
- **`player`** — the controlled sprite. Engine reads `player.x/.y/.dx/.dy/.walking/
  .speed`. Auto-walk moves it (~L3774–3777); gravity accelerates `player.dy` then
  `player.y` when `gravity>0` (~L3697–3703); edge clamp pins to `[0, world.W-8] ×
  [0, world.H-8]` and zeroes `dy`/`walking` on contact (~L3705–3714). The `-8`
  hardcodes an 8px sprite. [QUIRK]
- **`mode`** — current screen name. After each frame's update/draw funcs, if
  `funcs['screen_' + mode]` exists it is called (~L3736–3740). `to screen X`
  defines `screen_X` (parser ~L1516).
- **`gravity`** — number; `>0` enables per-frame downward acceleration on `player`
  (~L3698–3702). Default/absent or `<=0` → no gravity (non-platformers unaffected).
- **`world`** — `{width,height}`. Synced into `this.world` at game start, on
  `follow`, and before sprite placement (~L3094, ~L3104, ~L2789). Drives edge
  clamp and camera. Default `this.world` until user sets it.
- **`speed`** — global fallback movement speed (default `1`), overridden per-sprite
  by `player.speed` (~L3772, ~L3775).

### Screen / navigation stack
- `go to X` (`goto`, ~L3110–3116): push current `mode` onto `_screenStack`, set
  `mode = X`, clear `buttons` (so stale buttons don't catch clicks).
- `go back` (`goback`, ~L3119–3124): pop `_screenStack` into `mode` if non-empty,
  clear `buttons`. Empty stack → no-op.
- Dispatch is *only* via the `screen_<mode>` function name match each frame
  (~L3738). There is no scene object; "screens" are just functions plus a string
  var.

### Frame order (load-bearing — affects observable state)
Per frame (~L3634–3740): write `peers`/`connected` → run `when key` handlers →
button-click dispatch → mouse handlers → `tick++` → save `player` prev pos → call
`funcs[0]` (update) → `_autoWalk` → gravity → edge-clamp → `checkCollisions` →
camera follow → reset `buttons` → call `funcs[1..]` (draw/hud) → `screen_<mode>`.
A port must preserve this ordering; collisions fire *after* movement and *before*
draw, and handler bodies run mid-frame (so they can move/draw/play sound).

---

## 12. Function model: no params, no locals, no hoisting

- `funcdef` parses parameter names (parser ~L1521) but the runtime **ignores
  them**; `execCall` collects no arguments into any local scope. All functions
  share the single global `this.vars` (~L3607–3618, `callFunc` ~L3620–3629).
  There are no locals; a loop variable in `each`/`repeat` writes a global var.
- **Not hoisted.** Functions are registered when their `funcdef` statement
  *executes* (`this.funcs[stmt.name] = stmt`, ~L3087–3089), top-to-bottom. A call to
  a function defined *later in the file* finds nothing in `this.funcs` and is a
  **silent no-op** (`execCall`: `if (func)` only, no else, ~L3608–3617). [QUIRK]
  Define-before-use is mandatory; forward references vanish silently.
- **Missing-function calls are silent no-ops** — no diagnostic. (See §15 on the
  built-but-unwired error facility.)
- `return value` sets `_returnValue` and `_returning`; `execCall` returns it to an
  expression context (~L3613). `_returnValue` is cleared after read.
- `callFunc`/`execCall` save and restore `this.stopped` around the body so a
  `stop` inside a called function does not necessarily halt the caller — but a
  top-level `stop` sets `this.stopped = true` and is checked everywhere (~L3415).

---

## 13. Tags & the collision model

### Tags are by-NAME string references
`X are <tag>` records the *variable name string* `X` in `this.tags[tag]`
(~L3175–3177; tags: `solid/pickups/hostile/deadly/passable/projectiles`, init
~L2643). Collision then iterates `this.vars[listName]` at runtime (~L3823, ~L3867,
etc.). [QUIRK] The tag binds a **name**, not the list value — reassigning the
variable to a new array is automatically picked up; the list must live in
`this.vars` under that exact name.

### `singularize` (~L1146–1153) and handler binding
- `…ies` → strip 3 + `y` (`enemies`→`enemy`).
- `…ses` → strip 2 (`glasses`→`glas`... [QUIRK] naïve).
- `…xes/…shes/…ches` → strip 2 (`boxes`→`box`).
- trailing `s` (len>1) → strip 1 (`coins`→`coin`).
- else unchanged.

When a collision fires, the engine looks up the handler by the **singular** of the
list name (~L3856, ~L3873): so `coins are pickups` + `when player picks up any coin`
bind because `singularize("coins") === "coin"`, the key under which the pickup
handler was stored (`pickupHandlers[stmt.itemVar]`, ~L3159). The collided item is
exposed to the handler under that singular name (`this.vars[singular] = item`,
~L3859, ~L3876) for the body's duration.

### Collision geometry — TWO different size rules [QUIRK]
- **Player vs pickup/hostile/deadly overlap**: fixed `SIZE = 8`,
  `overlaps(a,b) = |a.x-b.x|<8 && |a.y-b.y|<8` (~L3813–3814). **Ignores per-sprite
  `.w`/`.h` entirely** — every such sprite is treated as 8×8 for collision.
- **Solid-tile collision** *also* uses the same `overlaps` 8×8 (~L3814, ~L3820–3832)
  for the player-vs-solid test — but solid **drawing** and tile sizing honor
  per-sprite `.w`/`.h` defaulting to 8 (draw ~L3497–3498; per-sprite sizes elsewhere
  ~L3264). So a wide solid sprite *draws* wide but *collides* as 8×8 at its origin.
  A port must keep collision at 8 even where draw uses w/h.
- **Placement spacing**: `SIZE = 12` center-to-center minimum in `_findEmptySpot`
  (~L3794) — different from the 8 used for collision.
- **Diagonal movement normalization**: when both axes are pressed, `mx,my *= 0.7071`
  (~L3236) so diagonal speed ≈ cardinal speed (not 1.414×).

### Solid resolution detail (~L3816–3852)
Per-axis restore: on a solid hit, try restoring `y` only (keep new `x`), else `x`
only, else both — giving wall-sliding. Uses the saved `_prevPositions.player`
(~L3683). After resolution, `player.walking` is forced `false` (~L3851). The solid
hit handler fires regardless of which axis was restored (~L3854–3863).

---

## 14. `say` gating (`!gameLoop`)

`say` pushes onto `sayBuffer` (~L3402–3406). The buffer is rendered to the canvas
**only when `!runtime.gameLoop`** (~L4030): the top-level `run()` paints a black
screen and draws each buffered line via `drawText` (~L4031–4037). **Inside a game
loop, `say` output is never drawn** — `sayBuffer` accumulates and is ignored.
[QUIRK] `say` is for non-game/script programs; in a game you must `write`/`draw`.

---

## 15. Diagnostics: built but unwired

- A located `error(msg, lineNum)` method exists (~L2693–2696) and pushes to
  `this.errors`, surfaced into an `#errors` div (~L350, ~L4042–4044).
- It is **only ever called once**, **unlocated**, in the top-level `catch` as
  `"I got confused: " + e.message` (~L4039). Statement-level problems (missing
  function, type mismatch, out-of-range) produce **no diagnostic** — they are
  silent no-ops / `undefined` (§12). A port that adds real located diagnostics is
  *adding* behavior, not matching it. [DECISION] Decide whether the spec freezes
  "silent" semantics or upgrades diagnostics (the latter is a behavior change).

---

## 16. NET identity contract

`NET` is a module-level IIFE singleton (~L1295–1364). Contract a port must honor:

- **`peers` is a STABLE array reference** rebuilt **in place** (`peers.length = 0;
  push…`, ~L1303). This is deliberate so `each peer in peers` keeps iterating the
  live set across frames without re-binding. A port must expose a stable handle,
  not a fresh array per frame.
- Incoming peer state is **merged via `Object.assign`** onto the existing per-id
  object (~L1328) — partial updates accumulate; fields are never cleared by a state
  message, only overwritten.
- **`STALE_MS = 4000`** (~L1302): a peer not heard from in 4s is pruned by a 1Hz
  sweep (`pruneStale`, ~L1305–1309, `setInterval(...,1000)` ~L1362). `leave`
  messages drop immediately (~L1329).
- **Broadcast silently drops** if the socket is not open: `broadcast` is a no-op
  unless `isOpen()` (`readyState === 1`, ~L1310, ~L1351). `broadcast` statement also
  only sends objects (~L3382).
- **Off-host hardwires `wss://codeonline.io`**: when on `localhost`/`127.0.0.1`/
  `file:`, host = `codeonline.io` and proto = `wss` (~L1316–1318). On-host uses
  `location.host` and ws/wss per page protocol.
- Reconnect backoff `0.8s → 8s` cap (~L1336); reconnect on `visibilitychange`/
  `online` (~L1358–1360). `myId` from the `welcome` message (~L1325).

---

## 17. Platform coupling & the loop

- The `Runtime` constructor takes **no host object**; it reaches three
  module-level singletons **directly** by name:
  - **`ctx`** — the canvas 2D context (~L447) — used in `clearscreen`/`draw`/
    `drawText`/`pset`/`write` (e.g. ~L3484, ~L587, ~L3397).
  - **`AUDIO`** — procedural SFX/music singleton (~L1162) — used by `play`.
  - **`NET`** — the multiplayer singleton (~L1295) — used in the frame loop and
    `broadcast`.
  These are *implicit globals* from the runtime's perspective. **The host seam a
  port introduces must intercept exactly these three** (canvas draw ops, audio,
  net) to keep the core pure. `parse()` is already platform-free (no host refs).
- **`window.run`/`window.parse`/`window.singularize`/`window.tokenizeLine`** are
  exposed (classic-script function declarations). **`window.runtime` is NOT set** —
  `run()` builds a *local* `runtime` (~L4024-ish region). Headless state capture
  (for golden tests) therefore needs a small test hook or the `lang/` extraction;
  you cannot read final `vars` from the page as-is.
- **`checkCollisions` is not pure**: it fires user handler bodies via `this.exec`,
  which can draw / play sound / mutate state mid-collision (~L3860, ~L3877).
- **Loop drivers**: primary is `requestAnimationFrame` (`rafTick`, ~L3753–3758).
  A **watchdog** `setInterval(…, 1000/60)` (~L3763–3766) drives a frame only if
  `performance.now() - lastFrame > 32ms` (2 missed vsyncs) — for headless/background
  tabs where rAF doesn't fire. Both call `runFrame` → `frame`. A frame is drawn
  immediately at start so the canvas isn't blank (~L3750). **60 fps is assumed**
  throughout (`every N seconds` → `round(N*60)` ~L3063; watchdog interval). A port's
  timing model must reproduce: rAF-paced when available, ~60Hz fallback, single
  initial synchronous frame, and the 60fps assumption baked into `every`/gravity.

---

## 18. Additions after the line-cited pass (2026-09)

Runtime meaning of the forms added in GRAMMAR §11. Same rule as everywhere in this
file: the corpus program is the contract; the harnesses are the proof.

- **Match timer** (`time limit is N seconds|frames`) — the limit is converted to a
  FRAME count (seconds × 60) and decremented once per frame in the game loop, so it
  is wall-clock independent and deterministic. The builtin `timer` is
  `ceil(remaining_frames / 60)`, never negative, and reads 0 once the limit is spent.
  `when time runs out` fires **exactly once**, on the frame the countdown crosses to
  zero (measured: a 5-frame limit counts 1 1 1 1 0 and fires on frame 5; a 1-second
  limit fires on frame 60). It does NOT stop the game — the handler decides (`go to
  results`, `mode is "over"`, `stop`, …). With no `time limit` statement there is no
  `timer` and the handler never runs, which is why every pre-existing golden is
  unchanged. Frozen by `spec/corpus/time_limit_static.fc` and
  `spec/port/spike/frame-tests/f_timer.fc` (which draws its own fired-counter).
- **Behavior verbs** (`chases`, `flees from`, `wanders`, `patrols between A and B`,
  `patrols along [{x,y}, …]`, optional `speed N`, `when within N` for flee,
  `through walls`) are set-once declarations: they store a marker on the
  subject sprite (editable data, e.g. `ghost.behavior.speed`) and the engine moves
  the sprite every frame from then on. Motion is Euler per frame with libm `sqrt`
  (IEEE-identical across engines) and map-solid collision restores the blocked axis
  unless `through walls` is set. `flee` is the mirror of chase (unit vector away
  from the target) and `when within N` makes it hold still until the target is
  closer than N pixels; the waypoint form advances to the next point when it gets
  within `speed` of the current one (and skips malformed points). Frozen by
  `behaviors_register.fc`, `behavior_list_subject.fc`, `flee_patrol.fc`,
  `frame-tests/f_flee.fc`, and the idle draw-parity of every example that uses them.
- **Frame animation** (`animate NAME with "a" "b" every N frames`) advances on the
  GLOBAL tick, not per entity, so every animated sprite stays in step and the result
  is deterministic; the frame index lives on the sprite.
- **Particles** (`burst N … at X, Y [in COLOR]`) write into one shared pool (cap 400,
  oldest dropped), updated once per frame and drawn OVER the game layer,
  camera-aware. The noun between the count and `at` is decorative (`burst 8 stars at
  …` is legal and means the same as `burst 8 sparks at …`).
- **Tilemaps** (`tile`, `map is …`, `map at x, y is …`, `draw map`, `is solid at`) —
  the world size is derived from the map; solid cells block movement through the
  axis-restore path described in §13, and `draw map` is camera-aware. An empty or
  absent map keeps the old free-floating world (`map_without_tiles.fc`).
- **`increase` / `decrease`** desugar at parse time to `add X to TARGET` /
  `remove X from TARGET` with the default amount 1, so they inherit the polymorphic
  `add`/`remove` semantics in §5 exactly.
- **Comparison words** are rewritten to operators BEFORE the parse tree exists
  (`collapse_cmp`: `is more/greater than` → `>`, `is less/fewer than`,
  `is under/below` → `<`, `is over/above` → `>`, `is at least` → `>=`,
  `is at most` → `<=`). They are syntax sugar, not new semantics.
- **List membership** (`X is in [a, b]`) uses `Array.includes` semantics: STRICT
  equality, so `"1" is in [1]` is false, and a non-list operand is false. `is not
  in` parses as `not (in)` — negation of membership, not an inequality.
- **`say`** appends `interpolate(display(value))` to the say buffer; the HOST paints
  those lines (stacked from 2,2 in `#fff1e8`) only when the program has no game
  loop, mirroring what a terminal would do. Both engines expose the buffer
  (JS `runtime.sayBuffer`; wasm `dump_say()`, with `has_game()` deciding the paint)
  — the wasm had no `say` at all before 2026-09-29 (`spec/corpus/say_lines.fc`).
- **`stop music` / `stop sound`** is a host effect: the wasm emits a
  `sound/kind:stopmusic` command and the page calls the audio engine's stop, which
  clears the looping track's interval. **[QUIRK]** the JS parser checks this BEFORE
  the sprite form `stop X`, which otherwise swallows `music`/`sound` as a target
  name (that was the shipped behavior until 2026-09-29, when the verb was dead in
  every engine).
- **Inventories** are ordinary fc lists hanging off a subject (`player.inventory`),
  so they appear in the live inspector and can be counted (`count of
  player.inventory`). `SUBJECT has inventory` creates the list if missing; `add ITEM
  to SUBJECT inventory` appends unless that exact value is already there (STRICT
  equality, like `is in`); `remove …` drops the first match; `SUBJECT has ITEM in
  inventory` tests membership. The subject object is created if it doesn't exist yet.
  Frozen by `inventory_forms.fc` (declare, double-add, membership, a numeric item,
  removal, a second subject) through exec-diff.
- **`shoots at TARGET [every N [seconds|frames]] [speed S]`** is a set-once
  behavior whose marker carries `target`, `every` (frames; default 60 = 1 second),
  `speed` (px/frame; default 2) and a `cool` counter, and it guarantees the subject
  has a `shots` LIST. Each frame it flies every existing shot (`x += dx`, `y += dy`),
  culls the ones that leave the world by more than 8px (so the list cannot grow
  without bound), and when the cooldown expires spawns one shot
  `{x, y, dx, dy}` aimed at the target's centre *at spawn time* — a plain fc object,
  so no RNG is involved and the stream is deterministic. The engine does not do
  collisions: the game iterates `SUBJECT.shots` (`each s in turret.shots`) and
  decides what a hit means. Frozen by `frame-tests/f_shoot.fc` (spawn on the first
  frame, aim, flight, culling) and `shoot_forms.fc` (the marker/list shape).
- **Declarative animation** — a sprite that declares its own `frames` list cycles
  automatically: `image = frames[floor(tick / every) % n]` where
  `every = max(1, round(60 / fps))` and `fps` defaults to 8. It runs on the GLOBAL
  tick in the update phase, so it pauses and steps with the game; a sprite driven by
  the `animate … every N frames` verb keeps the verb's cadence (that marker is
  checked first). Frozen by `frame-tests/f_frames.fc` — the drawn pixels change frame
  by frame, identically in both engines.
- **`tween X.y from A to B over N [seconds|frames] [ease …]`** sets the dotted
  property to `A` immediately and then writes the eased value every frame until it
  reaches exactly `B` at frame N (the tween then retires; a second tween on the same
  target replaces the first, and at most 16 are kept). It runs in the UPDATE phase
  (right after `animate`), so the same frame's draws already see the tweened value.
  Curves: linear (default), `in` (t²), `out` (t(2−t)), `in out` (piecewise), `bounce`
  (classic 7.5625/2.75 bounce-out) — pure math, no RNG, no wall clock, identical in
  both engines (`frame-tests/f_tween.fc` compares every eased frame of all five).
  The transpiled "real code" view prints it as a labeled comment.
- **`emit` (sustained particles)** spawns `rate` particles per frame (default 2, cap
  16) at its point — or at the referenced sprite's centre, re-resolved EVERY frame,
  which is what makes `emit sparks from player` a trail that follows. Each spawn uses
  the same random draw order as `burst` (`angle`, then `speed`, then `life`), shares
  the same 400-particle pool, and honours an optional `rising`/`falling` marker that
  biases the vertical velocity up/down by 0.3 plus the vertical component. The
  duration is frame-counted (seconds ×60, default 30 frames), so the whole stream is
  bit-identical across engines — frozen by `frame-tests/f_emit.fc`. The transpiled
  "real code" view prints it as a labeled comment (the standalone port does not
  implement particles).
- **Presentation effects** (`flash screen [COLOR] [for N [seconds|frames]]`,
  `shake camera [for N [seconds|frames]] [by N [pixels]]`) are HOST-rendered, not
  simulated: the runtime only counts frames (`flashFrames`/`shakeFrames`, seconds
  ×60 like the match timer) and emits a `flash`/`shake` command at the END of each
  active frame, so both engines agree on the timing and the overlay lands on top of
  the frame's draws. The page paints the flash over the canvas and jitters
  `#screen-frame`; under the OS/browser reduced-motion preference (or the ⚙ toggle)
  it skips both entirely — a photosensitivity guard, which is also why the effects
  live in the host while their timing lives in the sim. Defaults: white for 6
  frames, 12 frames of 2px shake. Frozen by `frame-tests/f_effects.fc` (per-frame
  command parity) and `spec/corpus/flash_shake.fc` (parse).
- **Dynamic colors** (implemented 2026-09-29) resolve at paint time through
  `Runtime.colorOf` (JS) / `color_of` (rust): if a variable with the color word's
  name exists and holds a string, that string is resolved as the color; otherwise
  the literal word is. Everything that takes a color goes through it
  (`clear screen to`, `draw … in`, `pset`, `write`, `show meter`, `burst`), and the
  lookup is read-only — a game can compute a shade per frame
  (`shade is light gray`) with no cost to determinism. Frozen by
  `draw-tests/d_dyncolor.fc` plus the idle parity of starfield/matrix/sand.
- **`show meter CURRENT of MAX [at X, Y] [size W, H] [in COLOR]`** — defaults:
  max 1, x/y 2, w/h 40×5, color `green`. [QUIRK] `size` only takes effect when it
  carries a comma (a lone value is ignored) and the x,y segment stops at `size` or
  `in`, whichever comes first — the JS parser is an index scan and the Rust port
  mirrors it byte-for-byte (`spec/corpus/meter_forms.fc`).

## Summary for porters

The grammar is the small part. The MEANING of an fc program lives in:
numeric-only `+` with `parseFloat||0`, raw JS `==`, collection-aware truthiness,
1-based inclusive indexing, the inclusive/bidirectional `repeat` range, the op
caps, unseeded inclusive `random`, the **if/else nesting divergence** (§10), the
name-keyed magic globals + `screen_<mode>` dispatch, the no-params/no-locals/
no-hoisting function model with silent forward-call no-ops, the dual 8-vs-w/h
collision geometry, `singularize`-based handler binding, `say` gating, the stable
`peers` array + `Object.assign` merge net contract, and the rAF+watchdog 60fps loop
reading/writing `player/mode/gravity/world/speed`. Pin every one of these in the
conformance corpus; for each `[DECISION]`, record replicate-vs-fix before freezing.
