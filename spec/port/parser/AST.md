# FC Parser AST Node Catalog

Blueprint for the Rust `Stmt` / `Expr` / `Cond` enums. Derived two ways and reconciled:
(a) every `return { type: ... }` in `parse()` (`index.html` L1437–2628);
(b) empirically running `parse()` over all `spec/corpus/*.fc` + `examples/*.fc`, plus
targeted probes for branches the corpus does not exercise. Source of truth:
`/home/kevin/codeonline/index.html`. Runnable parser: `spec/lang/fc-core.mjs`.

Field "kind" legend:
- **literal** — a `{type:'literal',...}` Expr node
- **Expr** — any expression node (see Expr section)
- **Cond** — any condition node (see Condition section); note conditions and expressions
  share a node space — a "Cond" slot may hold a bare Expr (truthiness)
- **Block** — `body: Stmt[]` (array of statements; the nested indented block)
- **Stmt** — a single nested statement node (inline action), or `null`
- **string / number / bool** — raw JS primitive baked into the field
- **token[]** — array of raw lexer tokens (only `call.args`, `when_generic.tokens`)

Universal note on `lineNum`: **every top-level/statement node carries `lineNum`** (1-based
source line). Expression and condition nodes do **NOT** carry `lineNum` (they are produced
by `parseExpression`/`parseCondition`, which omit it). Inline `thenStmt` produced inside a
`when_*` clause via `findInlineAction` gets `lineNum: 0` (the `0` is hardcoded at L1994);
inline `thenStmt` produced via the normal path inherits the parent line number.

Universal note on `body`: produced by `parseBlock` (L1464). A node only gets a `body`
key set to parsed children if it is followed by a deeper-indented block (L1477-1479).
**Every block-bearing node is emitted with `body: []` by its sub-parser**, and `parseBlock`
later REPLACES it via `stmt.body = parseBlock(...)` only when children exist. So `body`
is always present (defaults to `[]`) on block-capable nodes. The Rust port should treat
`body` as `Vec<Stmt>` defaulting empty.

---

## STATEMENT NODES

### Structural / chaining
| type | fields | producer (line) |
|---|---|---|
| `chain` | `parts: Stmt[]`, `lineNum` | parseLine L1511 (when `splitOnAnd` yields >1 part) |
| `call` | `name: string`, `args: token[]`, `lineNum` | parseLine fallback L1873; also parseAdd L2543 / parseRemove L2552 / parseEach L2605 when their keyword is missing |

`call` is the **universal fallback** for any unrecognized first word (silent no-op at
runtime). `args` is the RAW remaining tokens (`raw.slice(1)`), NOT parsed expressions.

### Definitions
| type | fields | producer (line) |
|---|---|---|
| `funcdef` | `name: string`, `params: string[]`, `body: Block`, `lineNum` | parseLine L1518 (`to screen X` → `name="screen_"+X`, params `[]`) and L1527 (`to NAME p1 p2 …`; params exclude words `at`/`with`) |
| `def_sprite` | `name: string`, `hex: string` (lowercased, `''` if absent), `lineNum` | parseLine L1534 (`sprite "name" is "<hex>"`) |
| `def_song` | `name: string`, `tempo: number` (default 120), `rows: string[]`, `lineNum` | parseLine L1542 (`song "name" at N bpm "row"…`) |
| `def_sfx` | `name: string`, `recipe: object`, `lineNum` | parseLine L1567 (`define sound "name" as …`) |
| `tag` | `subject: string` (joined w/ no sep), `tag: string` (lowercased, trimmed), `lineNum` | parseLine L1785 (`X are Y`) |

`def_sfx.recipe` is one of two shapes:
- tone: `{kind:'tone', wave: string, f0: number, f1: number|null, dur: number}` (wave default `square`, f0 default 440, dur default 0.15)
- notes: `{kind:'notes', notes: number[], dur: number}`

### Navigation / lifecycle
| type | fields | producer (line) |
|---|---|---|
| `goto` | `target: string`, `lineNum` | L1574 (`go to X`) |
| `goback` | `lineNum` | L1572 (`go back`) |
| `follow` | `target: string`, `lineNum` | L1580 (`follow X with camera`) |
| `rungame` | `funcs: string[]`, `lineNum` | L1591 (`run game with update and draw`) |
| `stop` | `lineNum` | L1661 (`stop` exactly one token) |
| `stop_music` | `lineNum` | L1869 (`stop music` / `stop sound`) |
| `return` | `value: Expr | null`, `lineNum` | L1666 (`return [expr]`; `null` if no expr) |

### Control flow (all carry `body: Block`)
| type | fields | producer (line) |
|---|---|---|
| `if` | `condition: Cond`, `thenStmt: Stmt|null`, `body: Block`, `lineNum` | parseIf L2072 |
| `else_if` | `condition: Cond`, `thenStmt: Stmt|null`, `body: Block`, `lineNum` | parseLine L1608 (`else if …`) |
| `else` | `thenStmt: Stmt` (only when inline) OR `body: Block`, `lineNum` | parseLine L1612/L1614. **Inline form has `thenStmt` and NO `body`; bare form has `body:[]` and NO `thenStmt`.** Keys differ between the two forms. |
| `repeat_times` | `count: Expr`, `body: Block`, `lineNum` | parseRepeat L2559 |
| `repeat_range` | `varName: string`, `from: Expr`, `to: Expr`, `body: Block`, `lineNum` | parseRepeat L2568 (`repeat with X from A to B`) |
| `repeat_while` | `condition: Cond`, `body: Block`, `lineNum` | parseRepeat L2573 |
| `repeat_until` | `condition: Cond`, `body: Block`, `lineNum` | parseRepeat L2576 |
| `forever` | `body: Block`, `lineNum` | parseLine L1629 (`forever`) and parseRepeat L2579 (bare `repeat`) |
| `every` | `n: number`, `unit: 'frames'|'seconds'`, `body: Block`, `lineNum` | parseLine L1635 (`every N frames/seconds`) |
| `each` | `varName: string`, `list: Expr`, `where: Cond|null`, `thenStmt: Stmt|null`, `body: Block`, `lineNum` | parseEach L2603 |
| `probability` | `prob: number`, `stmt: Stmt`, `lineNum` | parseLine L1774 (probability phrases; `stmt` is the inline parsed remainder) |

### Event handlers (`when …`; all carry `thenStmt: Stmt|null` + `body: Block`)
| type | fields | producer (line) |
|---|---|---|
| `when_key` | `key: string`, `thenStmt`, `body`, `lineNum` | parseWhen L1934/L1939 |
| `when_key_in` | `keys: string[]`, `thenStmt`, `body`, `lineNum` | parseWhen L1944 (`keys` = bare string/word values, NOT Expr) |
| `when_mouse` | `event: string`, `thenStmt`, `body`, `lineNum` | parseWhen L1949 |
| `when_button` | `label: string`, `thenStmt`, `body`, `lineNum` | parseWhen L1956 |
| `when_pickup` | `itemVar: string`, `thenStmt`, `body`, `lineNum` | parseWhen L1967 |
| `when_hit` | `itemVar: string`, `thenStmt`, `body`, `lineNum` | parseWhen L1977 |
| `when_defeat` | `itemVar: string`, `thenStmt`, `body`, `lineNum` | parseWhen L1984 |
| `when_generic` | `tokens: token[]`, `body`, `lineNum` | parseWhen L1987 (fallback; carries RAW tokens, no `thenStmt`) |

### Assignment / list / variable mutation
| type | fields | producer (line) |
|---|---|---|
| `assign` | `target: string` (dotted ref string via `tokensToRef`), `value: Expr`, `lineNum` | parseLine L1853 (`X is Y`); also `reverse` L1755 desugars to `assign` with `value = {type:'math',op:'-',left:literal 0,right:Expr}` |
| `add` | `value: Expr`, `target: string`, `lineNum` | parseAdd L2541 (`add X to Y`) |
| `remove` | `value: Expr`, `target: string`, `lineNum` | parseRemove L2550 (`remove X from Y`) |
| `clear` | `target: string` (dotted, `.`-joined), `lineNum` | parseLine L1701 (`clear VAR`) |
| `toggle` | `target: string` (dotted) , `lineNum` | parseLine L1741 |
| `double` | `target: string` (dotted), `lineNum` | parseLine L1746 |
| `halve` | `target: string` (dotted), `lineNum` | parseLine L1749 |

`assign.target` uses `tokensToRef` (dots joined with NO surrounding spaces → `player.x`).
`clear`/`toggle`/`double`/`halve` use `.map(t=>t.value).join('.')` for their target.

### Rendering / HUD
| type | fields | producer (line) |
|---|---|---|
| `draw` | `shape: string`, `args: object`, `hud: bool`, `lineNum` | parseDraw L2389/L2428 |
| `write` | `text: Expr(literal)`, `x: Expr`, `y: Expr`, `color: string`, `hud: bool`, `lineNum` | parseWrite L2466 |
| `button` | `label: string`, `x: Expr`, `y: Expr`, `lineNum` | parseButton L2484 |
| `meter` | `current: Expr`, `max: Expr`, `x,y,w,h: Expr`, `color: string`, `lineNum` | parseMeter L2527 |
| `say` | `text: Expr` (literal if `raw[1]` is a string, else parsed), `lineNum` | parseSay L2532/L2534 |
| `pset` | `x: Expr`, `y: Expr`, `color: string`, `lineNum` | parsePset L2623 |
| `clearscreen` | `color: string` (space-joined token values), `lineNum` | parseLine L1696 |

`draw.args` is a heterogeneous object — keys present depend on `shape` and keywords used:
- common: `x,y` (from `at`), `w,h` (from `size`; `h` defaults to `w`), `x1,y1` (from `from`),
  `x2,y2` (from `to`), `color: string` (from `in`, space-joined).
- `shape:'sprite'`: `spriteName: string` (lowercased, spaces→`_`) OR `spriteNameExpr: Expr`,
  plus `x`/`y`. (L2375/L2377)
All numeric `args.*` values except `color`/`spriteName` are Expr nodes. `color`/`spriteName`
are raw strings.

### Physics / entity verbs
| type | fields | producer (line) |
|---|---|---|
| `move_with_arrows` | `target: string`, `speed: Expr|null`, `lineNum` | L1676 |
| `move_by` | `target: string`, `dx: Expr`, `dy: Expr` (default literal 0), `blockedBy: string|null`, `lineNum` | L1690 |
| `jump` | `target: string` (default `'player'`), `force: number` (default 4.5), `lineNum` | L1643 |
| `walk` | `target: string`, `direction: 'up'|'down'|'left'|'right'`, `lineNum` | L1807 |
| `walk_toward` | `target: string`, `towardName: string`, `lineNum` | L1803 |
| `stop_walking` | `target: string`, `lineNum` | L1816 (`stop walking X` / `stop X`) |
| `face` | `target: string`, `direction: string`, `lineNum` | L1830 |
| `face_toward` | `target: string`, `towardName: string`, `lineNum` | L1825 |
| `damage` | `target: string` (default `'player'`), `amount: Expr` (default literal 1), `lineNum` | L1838 |
| `heal` | `target: string` (default `'player'`), `amount: Expr` (default literal 1), `lineNum` | L1845 |
| `knock` | `target: string` (default `'player'`), `source: string` (default `'enemy'`), `distance: Expr` (default literal 4), `lineNum` | parseKnock L1886 |
| `restore` | `target: string` (default `'player'`), `lineNum` | L1791 (`restore`/`block` — **both** emit `restore`) |

### Audio / networking
| type | fields | producer (line) |
|---|---|---|
| `play_sound` | `kind: 'sound'|'music'`, `name: string|null`, `lineNum` | L1864 |
| `net_join` | `game: string` (default `'fc'`), `room: string` (default `'lobby'`), `lineNum` | L1651 |
| `broadcast` | `value: Expr`, `lineNum` | L1656 |

---

## EXPRESSION NODES (from `parseExpression`, L2186; no `lineNum`)

| type | fields | producer (line) |
|---|---|---|
| `literal` | `value: number|string|bool|[]` | L2190-2193, L2305; also `{value:[]}` empty list at L2160 |
| `ref` | `name: string` (single var, dotted ref, or space-joined fallback) | L2194, L2256, L2309 |
| `math` | `op: '+'|'-'|'*'|'/'|'%'`, `left: Expr`, `right: Expr` | L2284 (low prec + -), L2291 (high prec * / mod→`%`), L2299 (leading unary `-` → `0 - X`) |
| `listliteral` | `items: Expr[]` | parseListFromTokens L2181 |
| `object_expr` | `props: { [key:string]: Expr }` | parseObjectLiteral L2338 |
| `random` | `max: Expr` | L2209 (`random N`) |
| `item_of` | `index: Expr`, `list: Expr` | L2266 (`item N of list`) |
| `count` | `expr: Expr` | L2273 (`the number of X`) / L2277 (`count of X`) |
| `list_of_sprites` | `count: Expr`, `props: object_expr|null` | L2225 (`list of N noun [{props}]`) |
| `sprite_expr` | `position: 'centered'|'zero'`, `props: object_expr|null` | L2235 (`centered sprite`), L2245 (`sprite`) |

Precedence / split order in `parseExpression` (CRITICAL to replicate, right-to-left):
1. length 0 → `literal 0`; length 1 → literal/ref (`yes`→true, `no`→false). 
2. `[` → listliteral; `{` → object_expr.
3. `random`, `list of`, `centered sprite`, `sprite`, dotted ref (`a.b.c`), `item … of`,
   `the number of` / `count of` — all checked BEFORE math.
4. Low precedence `+ -`: scan from RIGHT, split at first (rightmost) `+`/`-` (index ≥1).
5. High precedence `* / mod`: scan from RIGHT.
6. Leading unary `-` (token[0]) → `math 0 - rest`.
7. token[0] string → literal; else fallback `ref` = space-joined all token values.

`object_expr.props` is a plain map (insertion order matters); values are Expr nodes.
`list_of_sprites.props` / `sprite_expr.props` hold an `object_expr` node (or `null`).

---

## CONDITION NODES (from `parseCondition`, L2075; no `lineNum`)

| type | fields | producer (line) |
|---|---|---|
| `key_pressed` | `key: string` (lowercased) | L2083 (`key "X" [is held/pressed/down]`) |
| `not` | `expr: Cond|Expr` | L2089 (`not …`), L2094 (`no X`), L2128 (`X is not in […]`) |
| `or` | `left: Cond`, `right: Cond` | L2100 |
| `and` | `left: Cond`, `right: Cond` | L2105 |
| `between` | `value: Expr`, `low: Expr`, `high: Expr` | L2118 — **DEAD CODE in practice** (see gotcha) |
| `in` | `value: Expr`, `list: Expr(listliteral)` | L2134 (`X is in […]`) |
| `neq` | `left: Expr`, `right: Expr` | L2131 (`X is not Y`) |
| `eq` | `left: Expr`, `right: Expr` | L2137 (`X is Y`) |
| `cmp` | `op: '>'|'<'|'>='|'<='|'!='`, `left: Expr`, `right: Expr` | L2144 |
| `has` | `left: Expr`, `right: Expr` | L2151 (`X has Y`) |
| (bare Expr) | any Expr node | L2156 (truthiness fallback) |
| `literal false` | `{type:'literal', value:false}` | L2076 (empty token list) |

Condition split order (CRITICAL): `key` → `not` → `no` → `or` → `and` → `between` →
`is`-family (`is not in` / `is not` / `is in` / `is`) → cmp ops → `has` → bare expression.

---

## Where `body` / `thenStmt` / `lineNum` appear (summary)

- `lineNum`: ALL statement nodes. Never on Expr/Cond nodes.
- `body` (Block): `funcdef`, `if`, `else_if`, `else` (bare form only), all `repeat_*`,
  `forever`, `every`, `each`, all `when_*`. Always defaults `[]`, filled by `parseBlock`.
- `thenStmt` (inline Stmt or null): `if`, `else_if`, `else` (inline form only), `each`,
  all `when_*` (incl. `when_key_in`). Holds a single nested statement parsed from the
  remainder of the same line, or `null`.

---

## EMPIRICALLY OBSERVED TYPE SET

Corpus + examples scan produced these statement/expr/cond `type` values (union of keys
matches tables above): add, and, assign, broadcast, button, call, clearscreen, cmp, count,
damage, def_sfx, double, draw, each, else, else_if, eq, every, follow, funcdef, goback,
goto, heal, if, item_of, jump, key_pressed, knock, list_of_sprites, listliteral, literal,
math, meter, move_by, move_with_arrows, neq, net_join, not, number(token), object_expr,
or, play_sound, random, ref, remove, repeat_range, repeat_times, return, rungame,
sprite_expr, tag, toggle, when_button, when_defeat, when_hit, when_key, when_mouse,
when_pickup, word(token), write.

Additional types confirmed via targeted probes (not in corpus): chain, clear, def_song,
def_sprite, face, face_toward, forever, halve, has, in, probability, repeat_until,
repeat_while, restore, stop, stop_music, stop_walking, walk, walk_toward, when_generic,
when_key_in. (`between` could not be produced — see gotcha.)

NOTE: `word` and `number` `type` values appear in the scan only because `call.args` and
`when_generic.tokens` carry RAW lexer tokens (which have their own `{type,value}`); they
are NOT parser-emitted AST nodes. The Rust port should keep raw tokens for those two fields.

---

## GOTCHAS (must replicate exactly in Rust)

1. **`set` is NOT a statement.** `set x to 5` falls through to the `call` fallback
   (`name:'set'`), a runtime no-op. Same for `make`. Do not add an assign for `set`.
2. **`call` fallback** is `{type:'call', name:first, args:raw.slice(1), lineNum}` where
   `args` are RAW tokens (unparsed). `parseAdd`/`parseRemove`/`parseEach` also fall back
   to `call` (named `add`/`remove`/`each`) when their delimiter keyword is missing.
3. **`restore` and `block` both emit `type:'restore'`** (L1789). There is no `block` node.
4. **`else` has two mutually-exclusive shapes**: inline → `{type,thenStmt,lineNum}` (no
   `body`); bare → `{type,body:[],lineNum}` (no `thenStmt`). Match on key presence.
5. **`between` condition node is effectively dead code.** `parseCondition` splits on
   `and`/`or` (L2098-2107) BEFORE reaching the `between` branch (L2110). Since `between A
   and B` always contains `and`, it splits there first and `between` never fires for the
   canonical syntax. Replicate the ordering faithfully (the Rust port should still define
   the branch for parity, but it will not be reached by `X is between A and B`).
6. **`parseIf` `seenCompare` heuristic** (L2024-2069) decides where the condition ends and
   an inline `thenStmt` begins. Once a comparison op or a condition-`is` is seen, the NEXT
   `is` starts an inline assignment; it walks back over dotted refs (`j -= 2` per dot) to
   find the assignment target. Also handles the bare-boolean case (`if ready done is yes`)
   using the `continuesLeft` check (operator/dot/`of`/`mod`/`and`/`or` before the target
   means it is part of the left operand, not a new statement). Reset `seenCompare` after
   `and`/`or`. Command-word boundary (L2063) also ends the condition unless the previous
   word is `is/not/and/or/in/between`.
7. **`splitOnAnd` only splits at a command-word boundary** (`isCommandWord`, L1918): `and`
   splits statements only when the next token is a word in the verb set OR a user-defined
   function name. `and` inside `between X and Y` is protected by the `inBetween` flag
   (L1898-1902). Lines starting with `run`/`when`/`to` never split (L1893).
8. **`userFuncs` pre-scan** (L1452-1462): collects user function names (`to NAME …`,
   `to screen X` → `screen_<x>`) so they count as command words in `splitOnAnd`/`parseIf`/
   `parseEach` boundaries. `screen_` names are lowercased; others use the raw word value.
   This requires a TWO-PASS parse (scan all lines first, then parse).
9. **Expression math splits RIGHT-to-LEFT** at index ≥1 (so `-4 + 10` splits at `+` → 6,
   but bare `-4` hits the unary-minus branch). `mod` becomes op `'%'`.
10. **`yes`/`no` literals**: only recognized for a SINGLE-token expression (L2192-2193).
    `yes`/`no` inside multi-token expressions become `ref`s.
11. **Dotted-ref string joining differs by node**: `assign`/`add`/`remove`/`reverse`
    targets use `tokensToRef` (dots, no spaces). `clear`/`toggle`/`double`/`halve` use
    `.map(t=>t.value).join('.')`. `restore` filters out the word `position` then joins on
    `.`. `ref.name` fallback (L2309) joins ALL token values with SPACES.
12. **`when_generic`** is the `when` fallback and carries RAW `tokens` (no `thenStmt`).
    `when_key_in.keys` are bare string/word VALUES (via `parseListLiteral`), not Expr.
13. **`color` fields are plain space-joined strings**, not Exprs (`draw`/`write`/`meter`/
    `pset`/`clearscreen`). `draw.args.spriteName` is lowercased with spaces→`_`.
14. **`hud` flag** (`draw`/`write`): set by stripping a trailing `on hud` / `on screen`
    suffix (`stripHudSuffix`, L2351) before the rest of parsing.
15. **Blank/comment lines are dropped pre-parse** (L1441: strip `--…` comment, skip empty).
    Indentation comes from `tokens.indent` set by the lexer; blocks nest by `minIndent`,
    and deeper-than-expected lines are skipped at the current level (grabbed by parent,
    L1468).
16. **`def_sfx.recipe` is a nested object (NOT a `type`-tagged node)** — `{kind:'tone'|
    'notes', …}`. Likewise `def_song.rows` is `string[]`, `draw.args` is a bare map.
    These are not part of the Expr/Cond enums; model them as dedicated structs.
17. Inline `thenStmt` from `findInlineAction` (used by `when_key_in`) is parsed with
    `lineNum: 0` hardcoded (L1994).
