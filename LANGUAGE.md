# Language Reference

Every construct in the language as currently implemented in `index.html`. Read PHILOSOPHY.md first for the design rationale behind these choices.

---

## Values

```
score is 0                              -- number
name is "player one"                    -- text
alive is yes                            -- state (yes / no)
visible is no                           -- ditto
enemies is []                           -- empty list
player is {x: 64, y: 64, hp: 3}         -- object literal
```

Object literals use `{key: value, key: value}`. Colons are optional (the lexer doesn't tokenize them).

## Truthiness

| Type | Falsy | Truthy |
|---|---|---|
| number | `0` | anything else |
| text | `""` | anything else |
| state | `no` | `yes` |
| list | `[]` | non-empty |
| object | `{}` (empty) | has properties |
| nothing/undefined | always falsy | — |

```
if score        -- "if score is nonzero"
if name         -- "if name has any text"
if enemies      -- "if there are any enemies"
if alive        -- "if alive is yes"
```

## Assignment

```
score is 0                  -- declare and assign
score is score + 10         -- update via expression
player.hp is 3              -- property access (deep paths supported)
player.x is player.x - 1    -- self-reference
```

`is` is BOTH assignment and equality. Context disambiguates:
- At statement position with a target on the left → assignment
- Inside an `if` condition → equality

## Action verbs (preferred over expressions)

| Verb | Meaning |
|---|---|
| `add N to X` | increment number, or push onto list |
| `remove N from X` | decrement, or remove item from list |
| `clear X` | reset to 0 / "" / [] / {} based on type |
| `toggle X` | flip booleans, or 0↔1 for numbers |
| `double X` | × 2 |
| `halve X` | ÷ 2 |
| `damage X [N]` | subtract N (default 1) from `X.hp` |
| `heal X [N]` | add N to X.hp, capped at `X.max_hp` if defined |

```
add 10 to score
add enemy to enemies          -- append to list
remove 1 from lives
remove dead from enemies      -- remove from list
clear bullets                 -- empty list
toggle visible
double speed
damage player 1
heal player 2
```

## Math

`+`, `-`, `*`, `/`, `mod` (modulo). Standard precedence.

```
x is a + b * c
x is a + (b * c)              -- parens supported
y is x mod 8                  -- modulo
```

## Comparison

```
if score is 100              -- equality
if score is not 0            -- inequality
if score is between 0 and 50 -- range (inclusive)
if color is in [red, blue]   -- list membership
if x > 10                    -- standard operators: > < >= <=
if name has "joe"            -- substring/membership for text/list
```

## Logic

```
if x and y                   -- both truthy
if x or y                    -- either truthy
if not x                     -- negation
if no enemies                -- "there are zero" (stronger than `not any`)
```

## Conditionals

```
-- one-liner (preferred when short)
if score is 100 mode is "win"

-- chained
if score is 100 mode is "win" and play sound "fanfare"

-- multi-line block
if score is 100
  mode is "win"
  play sound "fanfare"

-- else / else if (single-line or block)
if hp is 0
  mode is "lose"
else if hp < 2
  flash player red
else
  draw player normal
```

## Loops

```
-- counted, no variable needed
repeat 10 times
  pset random 128, random 128 in white

-- counted with variable
repeat with i from 1 to lives
  draw sprite "heart" at i * 10, 4

-- conditional
repeat while ammo
  shoot
  remove 1 from ammo

repeat until score is 100
  spawn next coin

-- forever (only useful in update functions or game loops)
forever
  ...
```

### Iterating collections

```
-- block form
each enemy in enemies
  draw sprite enemy.image at enemy.x, enemy.y

-- with filter (SQL-like)
each enemy in enemies where hp > 0
  draw enemy

-- inline action
each tree in trees draw sprite tree.image at tree.x, tree.y
```

`all X` is the one-liner form (shorthand when you don't need to name the binding):
```
damage all enemies where distance < 30
```

`any` and `no` are quantifiers in conditions:
```
if any enemy is alive
  keep playing

if no coins
  go to win
```

## Functions

```
to restart game
  lives is 3
  score is 0

to explode at x, y
  repeat 20 times
    draw circle at x, y size random 15 in random color

-- call them
restart game
explode at 64, 64

-- early return
to update
  if mode is not "play" return
  -- rest only runs when playing
```

`to NAME params` defines a function. Parameters are listed bare (no parens). `return` exits the current function.

## Drawing

```
clear screen to dark blue                                  -- full-screen fill
draw circle at 64, 64 size 30 in red
draw rect at 10, 10 size 20, 30 in yellow
draw line from 0, 0 to 128, 128 in white
draw sprite "hero" at 30, 40                               -- string literal
draw sprite player.image at player.x, player.y             -- expression
write "score: {score}" at 2, 2 in white
pset 50, 50 in green                                       -- single pixel
```

`{var}` inside strings interpolates the variable's value.

### `on hud` modifier

By default, draw operations are in **world coordinates** (camera-offset is applied). Add `on hud` to draw in **screen coordinates** (camera offset ignored — useful for HUD overlays):

```
write "score {score}" at 2, 2 in white on hud      -- top-left of viewport, always
draw sprite "heart" at 4, 4 on hud                  -- HUD heart icon
```

## Screen effects

Two one-line juice verbs, both presentation-only and both skipped under reduced
motion:

```
flash screen red for 8 frames
shake camera for 0.3 seconds by 3 pixels
```

## Motion: tweens

`tween` slides a property from one value to another over a fixed time — a door
opening, a menu sliding in, a bar filling:

```
tween panel.x from 0 to 100 over 1 second
tween ball.y from 0 to 90 over 0.5 seconds ease bounce
```

Easing (optional): `ease in`, `ease out`, `ease in out`, `ease bounce` — plain
`linear` is the default. The duration is counted in frames (60 per second), so it
pauses and steps with the game.

## Particles

`burst` is a one-off pop; `emit` keeps spraying for a while — a trail, smoke, a
fountain. It follows a sprite when you say `from`:

```
burst 12 sparks at player
emit 2 sparks from player in yellow for 0.5 seconds
emit smoke rising at 64, 100 in gray for 90 frames
```

(Amount is particles per frame; `rising` / `falling` lean the spray up or down.)

## Enemies that move on their own

Set a behavior once and the sprite keeps doing it:

```
ghosts chase player speed 0.5
bats wander
guard patrols between 20 and 100
zombie flees from player when within 30
ship patrols along [{x: 10, y: 10}, {x: 90, y: 10}, {x: 90, y: 90}]
```

`chase`, `flee from`, `wander` and the two `patrol` forms are all you need for
most arcade enemies; add `through walls` to ignore solid tiles.

## Colors

PICO-8 inspired 16-color palette, plus CSS color names as fallback:

A color can also come from a variable — handy for fade-outs and shading:

```
shade is light gray
if lives is less than 2 shade is red
draw rect at 2, 2 size 8, 8 in shade
```

The variable wins over the palette name (so avoid naming variables after colors
unless that is what you want), a two-word name like `dark gray` can only be a
literal, and a value that is not a color name draws white.

`black, dark blue, dark purple, dark green, brown, dark gray, light gray, white, red, orange, yellow, green, blue, indigo, pink, peach`

Plus aliases: `gray`, `gold`, `cyan`, `magenta`, `purple`, `lime`, `sky`, `coral`. Hex (`#ff00ff`) and `rgb(...)` also accepted.

## Sprites (built-in)

40+ pre-drawn 8×8 sprites. Reference by name:

**Characters:** `hero`, `wizard`, `knight`, `rogue`, `princess`, `ship`
**Enemies:** `slime`, `bat`, `ghost`, `goblin`, `skeleton`, `spider`, `alien`
**Items:** `coin`, `gem`, `heart`, `key`, `chest`, `potion`, `sword`, `bomb`, `star`
**Tiles:** `grass`, `dirt`, `stone`, `water`, `brick`, `tree`, `door`
**Effects:** `explosion1`, `explosion2`, `spark`, `smoke`, `bullet`, `fireball`
**UI:** `heart_full`, `heart_empty`, `skull`, `arrow_up`

## Sprite expressions

A **sprite** is a first-class placeable thing with default `x` and `y`:

```
-- single sprite at origin
thing is sprite

-- sprite with custom props
thing is sprite {hp: 3, image: "hero"}

-- centered in the world
player is centered sprite {hp: 3, image: "hero"}

-- list of N, auto-placed without overlap
trees is list of 12 sprites {image: "tree"}
coins is list of 8 sprites {image: "coin"}
enemies is list of 3 sprites {image: "slime"}
```

`list of N sprites` places each item at a random `(x, y)` in world bounds with at least 12px spacing from every other sprite already in scope. Falls back to pure-random after 80 attempts.

## World and camera

```
world is {width: 256, height: 192}
follow player with camera
```

When set:
- Player is automatically clamped to world edges (can't walk off)
- Camera centers on the followed target, clamped so it never shows outside the world
- All draw operations subtract `camera.x, camera.y` (use `on hud` to override)

## Events

```
when "space" is pressed shoot
when key "r" is pressed restart game
when key is in ["w", "a", "s", "d"] move player

when mouse is clicked
  spawn explosion at mouse.x, mouse.y

when button "start" is clicked go to play
```

`mouse.x, mouse.y` are populated when a click handler fires.

### Live key state inside loops

Inside an `update` function or game loop, check held keys with `if key "X"`:

```
to update
  if key "up" remove 1 from player.y
  if key "down" add 1 to player.y
  if key "left" remove 1 from player.x
  if key "right" add 1 to player.x
```

Normalized keys: `up`, `down`, `left`, `right`, `space`, `enter`, `esc`, plus letters/digits as their lowercase character.

**Space and Enter** automatically trigger the first visible button (focused-default).

## Collision detection

Tag your collections with their behavior:

```
trees are solid              -- player can't pass through
walls are solid
coins are pickups            -- auto-removed on contact
hearts are pickups
enemies are hostile          -- contact fires the hit handler
spikes are deadly            -- auto-damages 1 hp on contact
```

Then react to collisions:

```
when player picks up any coin
  add 1 to score
  if no coins go to win

when player hits any enemy
  damage player 1
  knock player away from enemy distance 16
  player.invuln is 30
```

The runtime:
- Tracks player's previous position each frame (for `solid` rollback)
- Iterates each tagged list against the player using 8×8 AABB checks
- Singularizes the list name (`enemies` → `enemy`) and binds the colliding item to that name during handler execution

## Knockback

```
knock X away from Y distance N
knock player away from enemy distance 16
```

Computes the unit vector from Y to X, multiplies by N, applies to X. If they're at the same position, no movement (you may want a fallback direction in your handler).

## Restore / block (manual collision recovery)

```
restore player        -- snap player back to last frame's position
block player          -- alias for restore
```

Useful inside custom hit handlers when you want to manually reverse a movement.

## Screens (game modes / menus)

Define one function per screen. The runtime auto-dispatches to `screen_<mode>` after running update each frame:

```
mode is "title"

to screen title
  clear screen to dark blue
  write "MY GAME" at 30, 20 in yellow on hud
  show button "play" at 40, 50
  show button "settings" at 40, 70

to screen settings
  clear screen to dark gray
  write "SETTINGS" at 35, 15 in white on hud
  show button "back" at 40, 80

to screen play
  clear screen to dark green
  draw sprite "hero" at player.x, player.y
```

Mode is just a variable, but `to screen X` registers a function named `screen_X` that auto-runs when `mode is "X"`.

## Navigation

```
go to settings        -- pushes current mode onto back-stack, sets mode to "settings"
go back               -- pops back-stack
```

Buttons get cleared on navigation so stale clicks don't leak between screens.

## Buttons

```
show button "label" at x, y          -- always screen-space (HUD)

when button "label" is clicked do thing
when button "label" is clicked
  multi-line action
```

Buttons render as styled text with chrome. Hit-test runs each frame against the button's bounding box.

## Probability words

Map natural-language probability to percentages:

```
always do thing            -- 100%
almost certainly drop loot -- 95%
very likely drop heart     -- 85%
highly likely keep weather -- 90%
likely / probably          -- 70%
better than even           -- 60%
maybe / even chance        -- 50%
probably not               -- 25%
unlikely                   -- 20%
little chance              -- 10%
highly unlikely / rarely   -- 5%
almost never               -- 2%
never                      -- 0%
```

```
to drop loot from enemy
  likely drop heart at enemy
  unlikely drop rupee at enemy
  rarely drop fairy at enemy
```

Equivalent to `if random < N% do X` but reads like a designer wrote it.

## Random

```
x is random 128                       -- integer 0..128 inclusive
draw circle at random 128, random 128 size 5 in red
```

## List utilities

```
item 3 of enemies                     -- 1-based access
the number of enemies                 -- count
count of enemies                      -- alias

each enemy in enemies where hp > 0    -- filter
all enemies where distance < 20       -- filter (one-liner form)
```

## String interpolation

```
write "score: {score}" at 2, 2 in white
write "hp {player.hp} / {player.max_hp}" at 2, 12 in red
```

`{name}` is replaced by the variable's value at draw time.

## Game loop

```
to update
  -- runs first each frame
  -- handle input, advance state

run game with update and draw [and screen_X ...]
```

The runtime calls these in order each frame, then runs collision detection, then auto-dispatches `screen_<mode>` if such a function exists.

If you only define screen functions (no explicit `draw`), use:
```
run game with update
```

## Comments

```
-- single line comment
```

Two dashes; rest of line ignored.

## Strings inside strings

Use `"` for outer; `{}` for interpolation. Apostrophes inside double-quoted strings are fine. We don't currently support escapes — just keep the quotes one type.

## What's NOT supported (yet)

- Animation primitives (`animate sprite "walk"`)
- Sound (`play sound "ding"` is parsed but currently a no-op stub)
- File I/O / save games
- Network / multiplayer
- Real classes / inheritance (sprites are objects, but no formal class system)
- Lambdas / function values
- Tilemaps
- Multiple worlds / level loading

See ROADMAP.md for plans.

## Errors

Errors render below the canvas in red. They try to be conversational:
- "I got confused: …" for parse errors
- Future plan: "I don't know how to add text to a number. Did you mean: add 5 to score?"

The runtime is designed to keep running on partial errors — bad lines are skipped where possible.
