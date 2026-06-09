# PARSER-PORT-PLAN.md — Stage 2: porting `parse()` to Rust

Ordered, dependency-aware sequence for porting the fc parser (`index.html`
L1437–2632) to Rust on `wasm32-unknown-unknown`. Each step ends with a concrete
**DIFF CHECKPOINT** against the golden ASTs. Execute top to bottom; do not skip a
checkpoint.

Ground truth: `/home/kevin/codeonline/index.html`. Runnable oracle:
`spec/lang/fc-core.mjs` `parse()`. Golden: `spec/port/spike/ast-golden.json`
(40 programs: 31 corpus + 9 examples, lineNum-stripped, keys sorted). Diff harness:
`spec/port/spike/ast-diff.mjs` (consumes `spec/port/spike/rust-ast.json`).

Reference docs (read alongside each step):
- `parser/AST.md` — full node catalog + gotchas.
- `parser/dispatch.md` — `parseLine` if-ladder, 48 rungs, order dependencies.
- `parser/expressions.md` — `parseExpression` / `parseCondition` clause order.
- `parser/heuristics.md` — `parseIf` split + `splitOnAnd`/`isCommandWord` (highest risk).
- `parser/subparsers.md` — the structured sub-parsers + shared helpers.

---

## 0. ALLOCATOR STRATEGY (decide first — the AST needs the heap)

### The constraint
The Stage-1 lexer (`spike/src/lib.rs`) is `#![no_std]` with **no allocator**: it
emits fixed-size `[type:u8, start:u16, len:u16]` records into a `static mut` buffer
and never heap-allocates. The parser cannot do this. The AST is a recursively-nested
tree of variable-arity nodes (`Vec<Stmt>` bodies, `Box<Expr>` operands, `String`
names, `IndexMap` object props). That is inherently `alloc`-dependent. On
`wasm32-unknown-unknown` there is **no default allocator**, so we must supply a
`#[global_allocator]`.

### Decision: `talc` as the global allocator, on an `#![no_std] + extern crate alloc`** crate.

Keep `#![no_std]`, add `extern crate alloc;`, and register **`talc`**
(`talc = { version = "4", default-features = false, features = ["lock_api"] }`)
backed by a single large `static mut` arena (e.g. 1–4 MiB, sized from the largest
corpus program — see sizing note). Rationale, weighed against the alternatives:

| Option | Verdict | Why |
|---|---|---|
| **Bump/arena, hand-rolled** | Rejected as the *global* allocator | A pure bump allocator never frees. The parser does transient allocation that the JS GC reclaims: `splitOnAnd` builds throwaway `current`/`parts` `Vec`s, `parseExpression` recurses building sub-`Vec`s of token slices, synthetic-token rewrites (dotted-ref, §4) allocate a fresh token vector per call. Over a 1000-line program this is a lot of short-lived garbage. A non-freeing bump arena would balloon peak memory and risk exhausting a fixed WASM linear-memory budget on the example games (`breakout`, `space-invaders`, `pitfall` are the big ones). |
| **`lol_alloc`** | Viable fallback | Tiny (~hundreds of bytes added to the wasm), simple `FreeListAllocator`/`LockedAllocator`. Good if `talc` ever proves too big. But its free-list is less robust under the parser's mixed-size churn. |
| **`talc`** | **Chosen** | Purpose-built for `wasm32-unknown-unknown` (`ClaimOnOom`/static-arena pattern is documented), real free support (reclaims the transient parse garbage), good size/perf tradeoff (single-digit KiB), `no_std`-friendly, `panic = "abort"` compatible. Matches the spike's `opt-level="z" + lto + strip` profile. |
| **`wee_alloc`** | Rejected | Unmaintained, known leaks/soundness issues. Do not use. |
| **`dlmalloc`** | Overkill | Larger; fine but more bytes than we need for a parser. |

**Arena sizing:** the AST plus all transient parse garbage must fit one fixed
`static mut [u8; N]`. Before coding, measure: the largest golden program is one of
`breakout/space-invaders/pitfall/coin-quest/hunt/snake/pong/flappy`. Multiply its
source bytes by a generous factor (token vectors + node tree + transient slices ≈
20–40× source). Start at **2 MiB**; if `talc` OOMs (it calls the panic handler →
`loop{}`), bump to 4 MiB. This is a tunable constant, not a design risk.

**Note on the eventual unified crate:** Stage 3 (runtime) keeps the same allocator;
the `Value` model (`Rc<RefCell<Vec<Value>>>` etc. in `fc_core.rs`) also needs heap.
So `talc` is a one-time cost amortized across stages 2 and 3. The spike's current
`#![no_std]` + `cdylib` + size profile is preserved; we only add `extern crate
alloc` + the global allocator.

> **DIFF CHECKPOINT 0:** No AST diff yet. Gate = the spike crate still builds
> `cargo build --release --target wasm32-unknown-unknown` with `talc` wired in, and a
> trivial `Box::new(1u8)` / `Vec` round-trip in a `#[no_mangle]` test export does not
> trap. Record the new wasm byte size (expect single-digit-KiB growth over the
> 1422 B lexer). Lexer diff (`node tokenize-diff.mjs`) must still be **1036/1036**.

---

## 1. FINALIZE THE AST ENUMS (reconcile `fc_core.rs` with `AST.md`)

`fc_core.rs` is a *skeleton* — its `Expr`/`Condition`/`Stmt` enums are incomplete
(it elides "count of, etc.", omits most statement variants, and its `Stmt::Each` has
no `where`/`then_stmt`). The golden requires the **full** set. Bring the enums to
parity with `AST.md` so every golden node has a home.

### Required additions / fixes (from `AST.md` + the golden node-type scan)

Golden node types actually present (must all be representable):
`add and assign broadcast button call clearscreen cmp count damage def_sfx double
draw each else else_if eq every follow funcdef goback goto heal if item_of jump
key_pressed knock list_of_sprites listliteral literal math meter move_by
move_with_arrows neq net_join not object_expr or play_sound random ref remove
repeat_range repeat_times return rungame sprite_expr tag toggle when_button
when_defeat when_hit when_key when_mouse when_pickup write` — plus
`number`/`word` which are **raw tokens** inside `call.args` / `when_generic.tokens`,
NOT AST nodes.

Concrete enum work:
- **Expr**: add `Count(Box<Expr>)`, `ListOfSprites { count, props: Option<Box<Expr>> }`,
  `SpriteExpr { position: SpritePos, props: Option<Box<Expr>> }`, `ObjectExpr` must be
  insertion-ordered → use `Vec<(String, Expr)>` (already in skeleton) or `IndexMap`.
  Keep `Math`, `ItemOf`, `Random`, `Ref`, `Literal`, `ListLiteral`.
- **Condition**: add `Not(Box<CondOrExpr>)`, `In { value, list }`, `Has { left, right }`,
  `Between { value, low, high }` (define for parity — **dead code**, see AST.md gotcha 5).
  Conditions and expressions **share a node space** (a `Cond` slot may hold a bare
  `Expr` for truthiness). Model the bare-expr fallback explicitly (e.g.
  `Condition::Expr(Box<Expr>)`).
- **Stmt**: add every missing variant: `Chain`, `FuncDef`, `DefSprite`, `DefSong`,
  `DefSfx`, `Tag`, `Goto`, `GoBack`, `Follow`, `RunGame`, `Stop`, `StopMusic`,
  `Return`, `ElseIf`, `Else` (**two shapes** — inline `then_stmt` XOR `body`; see
  gotcha 4), `RepeatWhile`, `RepeatUntil`, `Forever`, `Every`, `Each { var_name,
  list, where_: Option<Condition>, then_stmt: Option<Box<Stmt>>, body }`,
  `Probability { prob, stmt }`, all `When*` variants (incl. `WhenKeyIn`,
  `WhenGeneric { tokens: Vec<Token> }`), `Clear`, `Remove`, `Walk`, `WalkToward`,
  `StopWalking`, `Face`, `FaceToward`, `Damage`, `Heal`, `Knock`, `Restore`,
  `PlaySound`, `NetJoin`, `Broadcast`, `Write`, `Button`, `Meter`, `Say`, `Pset`,
  `ClearScreen`, `MoveWithArrows`, `MoveBy`, `Jump`.
- **`def_sfx.recipe`** and **`def_song.rows`** and **`draw.args`** are NOT
  `type`-tagged nodes — model as dedicated structs / sparse maps (AST.md gotcha 16).
  `draw.args` is **sparse** (only present keywords); `meter`/`write`/`button`/`pset`
  always emit every field with baked defaults (subparsers.md cross-cutting gotcha 1).
- **Targets are `String`s, not Expr** for `assign`/`add`/`remove`/`clear`/`toggle`/
  `double`/`halve` (AST.md gotcha 11). Keep the two different join rules: `tokensToRef`
  (dot-join, no spaces) vs `.map(value).join('.')`.

### Serialization layer (the contract — build it NOW, it is what the diff reads)
You must emit `rust-ast.json` matching `ast-diff.mjs`'s contract exactly:
- Top level: `{ "<file.fc>": [<top-level stmt nodes>] }`, files = corpus sorted then
  examples sorted (same enumeration as `dump-ast.mjs`).
- Object keys **recursively sorted ascending**; arrays keep order.
- **NO `lineNum` key** anywhere (stripped in golden).
- `null` emitted as JSON `null` (e.g. `thenStmt: null`), never omitted.
- Integral numbers print without decimal (`1`, not `1.0`) — match `JSON.stringify`.
- Each node serializes with a `"type"` string tag matching the JS tag verbatim
  (`"repeat_times"`, `"when_key"`, `"else_if"`, …). Use serde with `#[serde(tag =
  "type", rename_all = "snake_case")]` + explicit `rename` where the snake-case
  default diverges (e.g. `else_if`, `move_with_arrows`, `move_by`, `play_sound`,
  `net_join`, `key_pressed`, `item_of`, `list_of_sprites`, `sprite_expr`,
  `def_sfx`/`def_song`/`def_sprite`, `when_*`, `repeat_*`, `stop_music`).
  Do not hand-roll JSON; use `serde_json` (it pulls `alloc`, already available) and a
  recursive **key-sort + lineNum-strip** post-pass mirroring `dump-ast.mjs`
  `canonicalize()`, OR a `BTreeMap`-based value tree. Easiest: build a
  `serde_json::Value`, then sort keys recursively before `to_string_pretty`.
- **Number serialization trap:** `serde_json` prints `1.0` for an f64 `1.0`. The golden
  prints `1`. So model integral literal values as JSON integers — either store
  `LiteralValue::Num` and emit via a custom serializer that downcasts whole floats to
  `i64`, or keep literal numbers as `serde_json::Number` mirroring JS. **This will be
  the first thing the diff catches if you get it wrong.**

> **DIFF CHECKPOINT 1:** No parsing yet, but lock the serialization. Hand-construct
> one tiny AST in Rust (e.g. the `assign(x, literal 1)` for `x is 1`), serialize, and
> confirm byte-equality against the same hand-built JS node run through
> `canonicalize`. This proves the contract (key sort, lineNum strip, integer
> formatting, `type` tags) before any real parsing rides on it.

---

## 2. TOKEN STREAM over the Stage-1 lexer

The parser consumes `tv(t)` (lowercased value), `t.type`, and `t.value` (raw,
case-preserving), plus the `indent` of each line. The Stage-1 lexer emits only
`[type, start, len]` offsets into the source — it **does not carry values**. Two
hard requirements the offset-only model cannot meet:

1. **`call.args` and `when_generic.tokens` serialize raw tokens as `{type, value}`**
   where `value` is the *parsed* value — confirmed empirically:
   `frobnicate a 5 "x"` → `args:[{type:"word",value:"a"},{type:"number",value:5},
   {type:"string",value:"x"}]`. Note `5` is a **JSON number**, not `"5"`. So a token
   must carry a typed value (number→f64, string/word→String).
2. `tokensToRef`, multiword-ref fallback, dotted-ref join, color word-joins, etc. all
   read `t.value`.

### Build a `Token` struct with an owned, typed value:
```
enum TokVal { Num(f64), Str(String) }   // Num for number tokens; Str for everything else's text
struct Token { kind: TokKind, value: TokVal }   // kind = String|Number|Word|Operator|Dot|Comma|L/Rparen|...
```
- Reuse the Stage-1 lexer's classification logic (it is proven, 1036/1036), but
  **materialize values**: for `Word`/`Operator` lowercasing is NOT done at tokenize
  time — `tv()` lowercases on read, and `t.value` stays raw. So store the raw slice as
  `String`; provide a `tv(&Token) -> String` helper that lowercases word/string values
  and `String`-ifies numbers (mirror `tv` at index.html L1131 exactly, incl. the
  null→`""` and number→`String(value)` behavior).
- **Number value**: parse the numeric slice with **JS `parseFloat`/`Number` semantics**
  (the lexer README says `number value = parseFloat(slice)`). Whole numbers must
  serialize as integers (see §1 number trap).
- **`dot`/`comma`/brackets/parens have no meaningful `value`** in JS (token `value` is
  undefined → `tv` yields `''`, and `splitOnAnd`'s `v = tokens[i].value ? tv : ''`
  treats them as `''`). Reproduce: give these tokens an empty/sentinel value so
  `tv`/the `value?` guard behave identically (heuristics.md §2 note on falsy `value`).
- **Line model + indent:** `parse()` works line-by-line; each line has `tokens` and an
  `indent` (lexer already computes `INDENT = indent/2`). Produce `Vec<Line { indent:
  u32, tokens: Vec<Token> }>`, dropping blank lines and stripping `--` comments
  pre-parse (AST.md gotcha 15; the lexer already breaks on `--`).

> **DIFF CHECKPOINT 2:** Add a debug export that serializes the **token stream** (per
> line: indent + `[{type,value}]`) and diff it against a JS dump of the same
> (`tokenizeLine` per line). This is a *token* diff, not AST — reuse the spirit of
> `tokenize-diff.mjs`. Must be 0 over corpus+examples. This isolates value/typing bugs
> (the `5` vs `"5"` trap, lowercasing, empty-value punctuation) before they
> contaminate AST diffs.

---

## 3. `parseExpression` + sub-helpers (DIFF) — `expressions.md`

Port `parseExpression` (L2186), `parseListFromTokens` (L2159), `parseObjectLiteral`
(L2312). These are leaf-level and used by almost every statement, so port first.

Replicate the **exact clause order** (first match wins, expressions.md §1–15):
empty→`literal 0`; single-token (number/string/`yes`→true/`no`→false/else `ref`);
`[`→list; `{`→object; `random`; `list of N`; `centered sprite`; `sprite`; dotted-ref;
`item … of`; `the number of`/`count of`; low-prec `+ -` (scan **right→left**, index
≥1); high-prec `* / mod`(→`%`) right→left; leading unary `-`→`0 - X`; leading string→
literal; multiword-ref fallback (join ALL values with spaces).

Risky details to nail (expressions.md gotchas):
- **Right-to-left math scan** yields left-associative trees; index 0 excluded so
  leading `-` stays unary. `mod`→`'%'`.
- **Dotted-ref-with-trailing-tokens rewrite (§8):** build a *synthetic* `word` token
  whose `value` contains dots (e.g. `"player.x"`) and recurse on
  `[synthetic, ...rest]`. Confirmed: `x is player.x + 1` →
  `math(+, ref "player.x", literal 1)`. Your `Token` model must allow constructing a
  synthetic word token with an arbitrary dotted `String` value.
- **`parseListFromTokens` bracket asymmetry:** openers NOT pushed, closers ARE pushed
  into the current item buffer; break on depth-0 `]` (ignore trailing tokens).
- **`object_expr.props` insertion-ordered**; colon rarely a separate token.
- **`yes`/`no`→bool only in the single-token base case.**

> **DIFF CHECKPOINT 3:** You can't diff `parseExpression` directly via the program
> golden yet. Build a **micro-corpus** of expression probes (use the
> `expressions.md` examples + the `heuristics.md` stress rows that are pure
> expressions) and a tiny harness: feed `x is <expr>` through both JS `parse()` and the
> Rust port, diff the `assign.value` subtree. Cover: `-4 + 10`, `a + b * c`,
> `player.x + 1`, `[1,[2,3],4]`, `{pos:{x:1}}`, `random a + b`, `item a+1 of list`,
> `the number of peers`, `count of x`, `hello world foo` (multiword ref), `()`→`"( )"`,
> bare `sprite`, `centered sprite {...}`, `list of 3 enemy {hp:1}`. Diff to 0.

---

## 4. `parseCondition` (DIFF) — `expressions.md` §parseCondition

Port `parseCondition` (L2075). Exact clause order (load-bearing): empty→`literal
false`; `key "X"`; `not` (→`parseCondition`); `no X` (→`parseExpression`!); `or`
split (left→right first match); `and` split; `between` (**dead code** — keep
positioned after `and`); `is`/`is not`/`is in`/`is not in` (first `is` left→right);
cmp ops `> < >= <= !=`; `has`; bare-expr truthiness fallback.

Risky details:
- **`not` recurses into `parseCondition`; `no` recurses into `parseExpression`** —
  different targets (gotcha 12).
- **`or` before `and`**, both first-match left→right → `or` binds looser.
- **`between` must stay unreachable** for the infix form: `score is between 1 and 10`
  → `and(eq(ref "score", ref "between 1"), literal 10)` (gotcha 1). Do NOT fix.
- `is in` / `is not in` use `parseListFromTokens` (bare ref after `in` allowed).
- `!=` is a `cmp`; `is not` is a separate `neq`.

> **DIFF CHECKPOINT 4:** Extend the micro-harness with `if <cond>` probes (block body,
> no inline) and diff the `if.condition` subtree. Cover every clause + the `between`
> quirk row. Diff to 0. (Conditions reuse §3 expressions, so a §3 regression surfaces
> here too.)

---

## 5. `parseLine` dispatch for SIMPLE statements (DIFF) — `dispatch.md`

Port the `parseLine` if-ladder (L1486) **minus** the two heuristic-heavy rungs
(`if`→`parseIf` and AND-chaining), which come last (§7). Implement the ladder in
**exact source order** — first match wins, and the order dependencies in
dispatch.md's "Dispatch-order dependency summary" are mandatory:
- `move … with arrows` (20) before `move … by` (21).
- `clear screen` (22) before `clear VAR` (23).
- `show button` (27) before `show meter` (28).
- bare `stop` (18, len==1) vs `stop <word>` (41) before dead `stop music/sound` (47).
- `stop walking`/`stop X` (41) makes `stop_music` (47) **dead code** — keep order.
- `X are TAG` (37) before `X is Y` assign (45).
- `damage`/`heal` (43/44) before `X is Y` (45) (`damage is 5` → damage stmt).
- **PROBABILITY (36)** iterates its table in **insertion order**; shorter prefixes
  (`probably`) win over longer (`probably not`). Encode the table as an **ordered
  list** (Vec, not HashMap) with the exact 22 entries from dispatch.md.
- Fallback (48): `{type:'call', name:first, args:raw.slice(1)}` with **raw tokens**.

Use the §6 sub-parsers as you reach each rung that dispatches to one (`parseDraw`,
`parseWrite`, etc.) — implement them in the same pass or stub-then-fill, but the
checkpoint below needs the simple inline rungs first.

> **DIFF CHECKPOINT 5:** Now you can run the **full program diff** on the *simplest*
> corpus files first — pick programs with no `if`/chains/structured sub-parsers:
> `set_make_noop.fc`, `forward_ref_noop.fc`, `truthy_*` (if simple), `eq_*`,
> `add_to_*`, `assign_dotted_autovivify.fc`, `repeat_*`, `singularize_*`. Generate
> `rust-ast.json` for the WHOLE set (others will DIFF — that's fine) and confirm these
> targeted files report **0 diff** in `node ast-diff.mjs`. Track the match count
> climbing toward 40.

---

## 6. STRUCTURED SUB-PARSERS (DIFF) — `subparsers.md`

Port the sub-parsers dispatched from §5's ladder + `parseWhen`:
`parseDraw` (L2361), `parseWrite` (L2431), `parseButton` (L2469), `parseMeter`
(L2487), `parseSay` (L2530), `parseRepeat` (L2555), `parseKnock` (L1876),
`parsePset` (L2608), `parseWhen` (L1928), and the inline `funcdef`/`def_sprite`/
`def_song`/`def_sfx` handlers. Port shared helpers first: `tokensToRef` (L2341),
`stripHudSuffix` (L2350).

Risky details (subparsers.md cross-cutting gotchas):
- **`draw.args` sparse** (only present keywords → use `Option`s / sparse map); the
  others (`meter`/`write`/`button`/`pset`) emit **all** fields with baked defaults.
- **Word-join vs parseExpression vs parseCondition** never unify: colors and
  `write`/`each` varName use raw `t.value` joins; coords/counts use `parseExpression`;
  conditions use `parseCondition`.
- `write` non-string text is degraded to a **literal string** via word-join (never an
  expr) — but still wrapped `{literal, value}`.
- `parseRepeat`: `times` searched anywhere; `while`/`until` only at `raw[1]`.
- `parseWhen` fallthrough → `when_generic` carries **raw tokens**, no `thenStmt`.
- `when_key_in` inline `thenStmt` from `findInlineAction` is parsed with
  **`lineNum: 0`** — irrelevant to the diff (lineNum stripped), but note it.
- `def_sfx.recipe`/`def_song.rows`/`draw.args` are plain structs/maps, not nodes.
- Defaults: knock target `'player'`/source `'enemy'`/dist 4; funcdef name `'unknown'`;
  each/when itemVar `'item'`; repeat_range varName `'i'`; meter/write/button/pset
  coord & color defaults exactly as listed.

> **DIFF CHECKPOINT 6:** Add `draw/write/meter/button/say/pset/repeat/knock/when/def_*`
> programs to the passing set. The example games (`breakout`, `pong`, `snake`,
> `flappy`, `space-invaders`, `pitfall`, `hunt`, `coin-quest`) lean heavily on these —
> but they ALSO use `if`/chains, so they will still DIFF until §7. Use the
> corpus probes that exercise sub-parsers in isolation, plus `every_two_blocks_line_keyed.fc`.
> Match count should climb again. Any DIFF here points at one sub-parser's field
> shape — the harness prints the first mismatching path (e.g. `[3].args.h: missing`).

---

## 7. `splitOnAnd` CHAINING + `parseIf` HEURISTIC — **LAST, highest risk** (`heuristics.md`)

These are the two algorithms a naive port silently diverges on. Port them last so
everything they depend on (§3–§6) is already diff-clean.

### 7a. `userFuncs` pre-pass (REQUIRED FIRST — two-pass parse)
Scan ALL lines before parsing any body (L1452): for each line with `tv(t[0])=='to'`,
add `screen_<lower(t[2].value)>` if `tv(t[1])=='screen'`, else `lower(t[1].value)`.
This `Set<String>` feeds `isCommandWord`, which drives both algorithms below and
`parseEach`'s list/inline boundary (§6). The pre-pass is **order-independent** — a
func used before its `to` line still counts.

### 7b. `isCommandWord` (L1918) + `splitOnAnd` (L1889)
- `isCommandWord`: `userFuncs.contains` OR the **verbatim verb set** in heuristics.md
  §2 (incl. `set`/`get`/`put` which are command words here even though `set` is not a
  statement keyword). Port the set literally.
- `splitOnAnd`: first-word guard `{run, when, to}` → never split. Then iterate:
  `between`→`inBetween=true`; `and`+`inBetween`→consume, keep, clear flag; `and`+
  `!inBetween`+`current.len>0`+next-is-command-word→**split, drop the `and`**; else
  push. The separating `and` is **discarded**; the connector `and` is **kept**. Falsy
  `value` (punctuation, `0`, `""`)→`''`.
- `parseLine` rung 0: `splitOnAnd` first; >1 part → `chain{parts: map(parseLine)}`.

### 7c. `parseIf` inline-statement split (L2017)
Port the `seenCompare` loop exactly (heuristics.md §1):
- State `condEnd=len`, `seenCompare=false`; `isCmpOp` reads **raw** `t.value`.
- Loop `i=1..len`, in order: (1) `and`/`or`→reset `seenCompare`, continue; (2) cmp op
  →`seenCompare=true`, continue; (3) `is`: if `seenCompare` → walk back dotted ref
  (`j-=2` per dot, guard `j-1>=2`), `condEnd=j`, break; else compute target-start `ts`,
  `pre=raw[ts-1]`, `continuesLeft` test, and split only if `ts>1 && raw[ts] is word &&
  pre && !continuesLeft`, else `seenCompare=true` continue; (4) command word: if `prev`
  is word in `{is,not,and,or,in,between}` → continue (operand tail), else `condEnd=i`
  break.
- After loop: `condition=parseCondition(raw[1..condEnd])`,
  `thenStmt=parseLine(raw[condEnd..])` if any, `body:[]`.
- **Preserve the `between` quirk** (heuristics.md §1 last gotcha + the stress row
  `if x is between 1 and 10` → `and(eq(x, ref "between 1"), literal 10)`). Do NOT fix.

> **DIFF CHECKPOINT 7a (chaining):** Run the `splitOnAnd` stress table
> (heuristics.md §2) as probes through both parsers; diff each. Cover: command-word
> split, no-split on non-command-word, `between` protection, `run/when/to` guards,
> `add 1 and 2 to score`→`ref "1 and 2"`, user-func split (both orderings). Diff to 0.
>
> **DIFF CHECKPOINT 7b (parseIf):** Run the full `parseIf` stress table
> (heuristics.md §1, 17 rows) as probes; diff `if.condition` AND `if.thenStmt`. These
> rows are the exact failure surface. Diff to 0. The corpus also has dedicated files:
> `parseif_and_resets.fc`, `parseif_compare_then_is.fc`, `parseif_dotted_inline.fc`,
> `parseif_is_compare_cond.fc` — they must now pass.

---

## 8. FULL `parse()` + `parseBlock` indentation nesting — DIFF TO ZERO

Port `parseBlock` (L1464): indentation-nested blocks via `minIndent`; a node gets its
`body` filled only when followed by a deeper-indented block (else stays `[]`); deeper-
than-expected lines at the current level are grabbed by the parent. `else` has two
shapes (inline `thenStmt` XOR `body`). Wire the two-pass `parse()`: userFuncs pre-pass
(§7a) → `parseBlock` over all lines.

Now generate `rust-ast.json` for **all 40 programs** and run the harness.

> **DIFF CHECKPOINT 8 (FINAL):** `node spec/port/spike/ast-diff.mjs` reports
> **40/40 programs match**, exit 0. This is the Stage-2 done bar — mirrors the
> lexer's 1036/1036. Update `spike/README.md` Stage-2 row to ✅ with the match count
> and the new wasm byte size.

---

## RISKIEST STEPS (and how the diff harness catches each)

1. **`parseIf` `seenCompare` split (§7c) — #1 risk.** Off-by-one in the dotted
   walk-back, wrong `continuesLeft` set, or wrong branch order silently moves
   `condEnd`, mis-splitting condition vs inline statement. *Caught by:* CHECKPOINT 7b
   (17-row stress table) + the 4 `parseif_*.fc` corpus files. The harness prints the
   first diverging path (e.g. `[0].thenStmt.type: ... vs ...`), pinpointing whether the
   condition or the inline statement boundary moved.
2. **`splitOnAnd` / `isCommandWord` + `userFuncs` (§7a/b).** A missing verb in the set,
   forgetting the `current.len>0` guard, keeping vs dropping the wrong `and`, or
   skipping the pre-pass → wrong `chain` boundaries or refs like `"1 and 2"` collapse.
   *Caught by:* CHECKPOINT 7a stress table + any example game that chains. First-diff
   path shows `chain.parts.length` or a `ref.name` mismatch.
3. **Serialization contract (§1/§2): number formatting + key sort + lineNum strip +
   raw-token `{type,value}`.** `1.0` vs `1`, `"5"` vs `5`, or emitting `lineNum`
   makes *every* file DIFF at once — a loud, early failure. *Caught by:* CHECKPOINTs
   1 and 2 before any real parsing; the token-diff isolates the `5`-vs-`"5"` trap.
4. **`parseExpression` right-to-left math + dotted-ref synthetic-token rewrite (§3).**
   Wrong scan direction flips associativity (`a-b-c`); a botched synthetic token breaks
   `player.x + 1`. *Caught by:* CHECKPOINT 3 micro-corpus (explicit associativity and
   dotted-math rows).
5. **Dispatch order + PROBABILITY insertion order (§5).** A reordered rung (e.g.
   `clear VAR` before `clear screen`, or HashMap-based probability table) changes node
   types. *Caught by:* CHECKPOINT 5 per-file diffs; a wrong rung yields a different
   top-level `type` on the first diverging statement.
6. **Sparse `draw.args` vs always-present meter/write fields (§6).** Emitting a default
   key the golden omits (or vice-versa) → `missing on left/right` diff. *Caught by:*
   CHECKPOINT 6; harness prints `.args.<key>: present/missing`.
7. **Allocator OOM / fragmentation under transient parse garbage (§0).** Too-small
   arena → panic-handler `loop{}` (hang) on a big example game. *Caught by:* the
   example games in CHECKPOINT 6/8 (largest inputs); if the wasm hangs/traps, bump the
   arena size — it's a constant, not a redesign.

## Why the diff harness is sufficient
`ast-diff.mjs` does an **order-independent, key-sorted, lineNum-stripped structural
compare** and prints the **first** diverging path per file with a `match/total` tally
and non-zero exit. Combined with the staged micro-corpora (expressions, conditions,
heuristic stress tables) it localizes a regression to a single node path before the
full 40-program gate. Each checkpoint is monotonic: the passing-file count only goes
up, so a regression in a later step that breaks an earlier file is immediately visible
as a count drop. Final gate (40/40, exit 0) is byte-meaningful because both sides obey
the same serialization contract.
