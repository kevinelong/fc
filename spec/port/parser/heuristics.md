# Parser heuristics — the two highest-divergence algorithms

Stage-2 prep for porting `parse()` (index.html L1437–2632) to Rust. These two
heuristics are where a naive port silently diverges. Both were captured by
**running** `spec/lang/fc-core.mjs` `parse()`; the node trees below are the real,
ground-truth output, not guesses.

Shared primitives used by both:

- `tv(token)` (index.html **L1131**): returns `''` for a null token; otherwise
  lowercases the value if it is a string, else `String(value)`. **Every** word/keyword
  comparison goes through `tv`, so matching is case-insensitive on string values but
  exact on numbers. A Rust port must replicate this lowercasing — `tv` is *not* the raw
  token value.
- Token `type` is one of: `string number word operator dot comma lparen rparen
  lbracket rbracket lbrace rbrace`.
- `userFuncs: Set<string>` (**L1452–1462**) is built in a **pre-pass over all lines
  before any line is parsed**. For each line whose `tv(t[0]) === 'to'`: if
  `tv(t[1]) === 'screen'` it adds `'screen_' + lowercase(t[2].value)`, else it adds
  `lowercase(t[1].value)`. Consequence: a user function used on an *earlier* line than
  its `to` definition still counts as a command word. The Rust port MUST do this
  pre-pass first, or chain-splitting and condition-termination will differ.

---

## 1. `parseIf` inline-statement split (L2017–2074)

### Purpose
An `if` line may carry an inline statement on the same line:
`if score > 10 add 1 to lives`. `parseIf` must find `condEnd` — the index where the
boolean condition ends and the inline statement begins. `raw[0]` is the `if` keyword;
scanning starts at `i = 1`. Default `condEnd = raw.length` (no inline statement; the
body comes from the indented block instead).

The hard part is the word `is`: in FC `is` is **both** the equality comparator
(`if mode is "play"`) **and** the assignment operator (`hit is yes`). The same line can
contain one of each: `if e.x + adir > 118 hit is yes` → condition `e.x+adir>118`, then
`hit is yes`.

### State
- `condEnd = raw.length`
- `seenCompare = false`
- `isCmpOp(t)` := `t.type === 'operator' && t.value ∈ {">","<",">=","<=","!="}`.
  NOTE: this compares against the **raw** `t.value`, not `tv(t)`. Operators are not words.

### Loop `for i in 1..raw.length`, in this exact order:

1. **and/or resets the clause.** If `raw[i].type === 'word'` and
   `tv(raw[i]) ∈ {"and","or"}`: set `seenCompare = false`, `continue`.
   (Each logical clause gets a fresh comparison budget.)

2. **Comparison operator.** If `isCmpOp(raw[i])`: set `seenCompare = true`, `continue`.

3. **The word `is`** (`raw[i].type === 'word' && tv(raw[i]) === 'is'`):
   - **3a. If `seenCompare` is already true** → this `is` starts an inline
     **assignment**. Compute the split point by walking back over a dotted reference
     from the token *before* `is`:
     ```
     j = i - 1
     while (j - 1 >= 2 && raw[j-1].type === 'dot') j -= 2
     condEnd = j
     break
     ```
     The walk-back steps in pairs (`name . name . name`), so `player.pos.x is 5`
     yields a single target `player.pos.x`. The guard `j - 1 >= 2` keeps the walk from
     crossing into the `if` keyword region.
   - **3b. If `seenCompare` is false** → decide: is this `is` the condition's *own*
     equality (`if mode is "play"`), or an assignment whose left operand is a
     self-contained boolean (`if ready done is yes` → cond `ready`, then `done is yes`)?
     1. Find the assignment **target start** `ts` by walking back the dotted ref from
        `is`: `ts = i - 1; while (ts - 1 >= 2 && raw[ts-1] && raw[ts-1].type === 'dot') ts -= 2`.
     2. `pre = raw[ts - 1]` (token just before the target).
     3. `continuesLeft = pre && ( pre.type === 'operator' || pre.type === 'dot' ||
        (pre.type === 'word' && tv(pre) ∈ {"of","mod","and","or"}) )`.
        This detects a multi-token LEFT operand (`a + b is 5`, `the number of peers is 5`)
        — there the target belongs to the left side, so do NOT split.
     4. **If** `ts > 1 && raw[ts] && raw[ts].type === 'word' && pre && !continuesLeft`:
        set `condEnd = ts`, `break` (inline assignment; condition = `raw[1..ts]`).
     5. **Else** (this `is` is the condition's comparator): set `seenCompare = true`,
        `continue`. The `is`-equality is later handled inside `parseCondition`, not here.

4. **Command word terminates the condition.** If `raw[i].type === 'word'` and
   `isCommandWord(tv(raw[i]))` (see §2 for the exact set, which includes `userFuncs`):
   - Look at `prev = raw[i-1]`. **If** `prev && prev.type === 'word' && tv(prev) ∈
     {"is","not","and","or","in","between"}` → this "command word" is actually an
     operand/keyword tail of the condition (e.g. `is pressed`, `between A and B`) →
     `continue` (do NOT terminate).
   - Else: `condEnd = i`, `break`.

### After the loop
```
condition = parseCondition(raw.slice(1, condEnd))
thenStmt  = condEnd < raw.length ? parseLine(raw.slice(condEnd), lineNum) : null
return { type:'if', condition, thenStmt, body:[], lineNum }
```
`body` is always `[]` here; the indented block is attached later by `parseBlock`.

### Gotchas a Rust port MUST replicate
- The four branches are checked **in order**; `is` (step 3) is checked before the
  command-word terminator (step 4). So `if mode is shoot` treats `is` first.
- The `j-1 >= 2` / `ts-1 >= 2` bounds are literal — index 2 is the lowest a dotted
  walk-back will reach (token 0 is `if`, token 1 is the first condition token).
- `isCmpOp` reads `t.value` (raw, case-sensitive operator string), everything else reads
  `tv(t)` (lowercased).
- **Known quirk, must be preserved:** `between` inside a condition is *not* protected by
  the `seenCompare` machinery, and `parseIf` never special-cases it. For
  `if x is between 1 and 10` the first `is` (no prior compare, `continuesLeft` false but
  `raw[ts]` here is `x` at index 1 so `ts > 1` is **false**) → falls through to
  `seenCompare = true`, then `and` resets, scan ends with `condEnd = raw.length`. The
  whole thing goes to `parseCondition`, which mis-parses it into
  `and( eq(x, ref "between 1"), literal 10 )` (see table). Do **not** "fix" this in the
  port — match it.

### Stress table (real `parse()` output; `body:[]` and `lineNum` elided unless relevant)

| input | condition node | thenStmt node |
|---|---|---|
| `if e.x + adir > 118` (then indented `hit is yes`) | `cmp(> , math(+, ref e.x, ref adir), lit 118)` | `null` (assign `hit=true` lands in `body`) |
| `if e.x + adir > 118 hit is yes` | same `cmp(...)` | `assign(target hit, value lit true)` |
| `if mode is "play"` | `eq(ref mode, lit "play")` | `null` |
| `if ready done is yes` | `ref ready` | `assign(target done, value lit true)` |
| `if the number of peers is 5` | `eq(count(ref peers), lit 5)` | `null` |
| `if a + b is 5` | `eq(math(+, ref a, ref b), lit 5)` | `null` |
| `if not x done is yes` | `not(ref x)` | `assign(target done, value lit true)` |
| `if no x done is yes` | `not(ref x)` | `assign(target done, value lit true)` |
| `if score > 10 player.x is 5` | `cmp(>, ref score, lit 10)` | `assign(target player.x, value lit 5)` |
| `if a > 1 player.pos.x is 5` | `cmp(>, ref a, lit 1)` | `assign(target player.pos.x, value lit 5)` |
| `if alive say "hi"` | `ref alive` | `say(text lit "hi")` |
| `if mode is "play" say "hi"` | `eq(ref mode, lit "play")` | `say(text lit "hi")` |
| `if score > 10 add 1 to lives` | `cmp(>, ref score, lit 10)` | `add(value lit 1, target lives)` |
| `if a > 1 and b is 2` | `and( cmp(>,ref a,lit 1), eq(ref b,lit 2) )` | `null` |
| `if a > 1 or b is 2` | `or( cmp(>,ref a,lit 1), eq(ref b,lit 2) )` | `null` |
| `if a is 1 b is 2` | `eq(ref a, lit 1)` | `assign(target b, value lit 2)` |
| `if key is in ["a","b"]` | `in(value ref key, list listliteral["a","b"])` | `null` |
| `if x is between 1 and 10` | `and( eq(ref x, ref "between 1"), lit 10 )` **(quirk)** | `null` |

(`assign value lit true` = the token `yes`; the tokenizer maps `yes`→`true`.)

---

## 2. `splitOnAnd` (L1889–1916) + `isCommandWord` (L1918–1926)

### Purpose
Decide whether a top-level `and` separates two statements (→ a `chain` node) or is part
of one expression (`between X and Y`, list joins, `run game with W and H`).
`parseLine` (**L1509–1512**) calls `splitOnAnd(raw)` first thing; if it returns >1 part,
the line becomes `{ type:'chain', parts: parts.map(p => parseLine(p, lineNum)), lineNum }`.

### `isCommandWord(w)` (L1918)
`w` is always a value already passed through `tv` (lowercased) by the callers.
```
if (userFuncs.has(w)) return true;     // pre-pass set, see Shared primitives
return w ∈ {
  draw, write, say, add, remove, clear, toggle, play, move,
  flash, shake, stop, start, show, hide, emit, double, halve,
  damage, heal, push, pull, set, put, get, load, save, pset, reverse, spawn, jump,
  join, broadcast,
  if, repeat, each, every, return, restore, block, knock, follow,
  when, else, to, go, face, walk
};
```
This exact set (plus `userFuncs`) is the only thing that makes `and` a separator. Port
it verbatim. Note `set`/`get`/`put` are command words **here** even though `set` is not a
top-level statement keyword in `parseLine`.

### `splitOnAnd(tokens)` algorithm
1. `firstWord = tokens[0] ? tv(tokens[0]) : ''`.
   **Guard:** if `firstWord ∈ {"run","when","to"}` → `return [tokens]` (never split).
   These constructs use `and` as a connector (`run game with W and H`, `when … and …`,
   `to foo a and b`).
2. `parts = []`, `current = []`, `inBetween = false`.
3. For `i in 0..tokens.length`, let `v = tokens[i].value ? tv(tokens[i]) : ''`
   (**note:** falsy `value` — e.g. `0` or `""` — yields `''`; brackets/commas have no
   `value` so `v=''`):
   - If `v === 'between'` → `inBetween = true`. (No `continue`; falls through to push.)
   - If `v === 'and' && inBetween` → `inBetween = false; current.push(tok); continue;`
     (consumes the `and` that closes a `between`, keeps it in the current part).
   - If `v === 'and' && !inBetween && current.length > 0`:
     - `next = tokens[i+1]`.
     - **If** `next && next.type === 'word' && isCommandWord(tv(next))` →
       `parts.push(current); current = []; continue;` (this `and` is a separator; the
       `and` token is dropped).
     - Else: fall through (the `and` becomes part of the current statement's tokens).
   - `current.push(tokens[i])`.
4. If `current.length > 0` → `parts.push(current)`. Return `parts`.

### Gotchas a Rust port MUST replicate
- **`and` is only a separator when `current` already has content** (`current.length > 0`)
  AND the **immediately next** token is a `word` that `isCommandWord`. A leading `and`,
  or `and` followed by a number/string/non-command word, stays inside the statement.
- The separating `and` token is **discarded**; the connector `and` (between, or
  non-command tail) is **kept** in the part's token list. So downstream parsers see
  `add 1 and 2 to score` as one statement whose value expression literally contains the
  `and` tokens — and `parseAdd` turns that into `ref "1 and 2"` (a ref whose name is the
  joined words; see table). This "ref with spaces in the name" behavior is intentional
  ground truth.
- `between` latches `inBetween=true` and the **next** `and` clears it. Nested/second
  `between` would re-latch. Only one `and` is consumed per `between`.
- The `run/when/to` guard is on the **first word only**; an `and` after those still never
  splits at this level. `when "a" is pressed and say "x"` is NOT a chain — it returns one
  token list, and `parseWhen` then parses `and say "x"` as the inline action, producing a
  `call` node named `and` (see table). Match this.
- `isCommandWord` is evaluated **at parse time** with the fully-populated `userFuncs`, so
  user functions split correctly even when used before their `to` line.

### Stress table (real `parse()` output)

| input | result |
|---|---|
| `say "hi" and add 1 to score` | `chain[ say(lit "hi"), add(value lit 1, target score) ]` |
| `say "a" and say "b" and say "c"` | `chain[ say "a", say "b", say "c" ]` (two splits) |
| `move player and flash` | `chain[ call(move, args[word player]), call(flash, args[]) ]` |
| `damage enemy and heal player` | `chain[ damage(target enemy, amount lit 1), heal(target player, amount lit 1) ]` |
| `clear and draw player at 1 1` | `chain[ clear(target ""), draw(shape player, args{x: ref "1 1"}, hud false) ]` |
| `add 1 and 2 to score` | single `add(value ref "1 and 2", target score)` — `2` not a command word, no split |
| `add gold and silver to bag` | single `add(value ref "gold and silver", target bag)` |
| `say "a" and 5` | single `say(lit "a")` — `and 5` dropped (`5` not a command word; trailing tokens unused by parseSay) |
| `run game with width and height` | `rungame(funcs ["width","height"])` — `run` guard, no split |
| `when "a" is pressed and say "x"` | `when_key(key "a", thenStmt call(name "and", args[word say, string "x"]))` — `when` guard, no split |
| `to foo a and b` | `funcdef(name foo, params ["a","and","b"])` — `to` guard, no split; `and` becomes a param |
| `greet "bob" and greet "al"` (with `to greet name` anywhere in source) | `chain[ call(greet, ["bob"]), call(greet, ["al"]) ]` — userFunc pre-pass makes `greet` a command word |
| `greet "bob" and greet "al"` (used **before** its `to greet` line) | same `chain[...]` — pre-pass is order-independent |

---

## Reproduce / regression harness
```
node -e 'import("/home/kevin/codeonline/spec/lang/fc-core.mjs").then(m=>console.log(JSON.stringify(m.parse(process.argv[1]),null,1)))' -- 'if a is 1 b is 2'
```
Every row above is a candidate golden test for the Rust port: parse the input, compare
the JSON node tree byte-for-byte (after key-order normalization).
