# Parser port: `parseExpression` & `parseCondition`

Source: `/home/kevin/codeonline/index.html`. All node shapes below were confirmed
empirically by running `parse()` from `spec/lang/fc-core.mjs` (not guessed).

`tv(t)` reads a token's value. Token types: `string`, `number`, `word`, `operator`,
`dot`, `comma`, `lparen`, `rparen`, `lbracket`, `rbracket`, `lbrace`, `rbrace`.

---

## `parseExpression(tokens)` — L2186–2310

Recursive-descent by **token-slicing** (no cursor). Each clause matches a prefix or
finds a split index, then recurses on sub-slices. Order of clauses is load-bearing;
the first that matches wins. Reproduce the order exactly.

### 1. Empty / single-token base cases (L2187–2195)
- `tokens.length === 0` → `{ type: 'literal', value: 0 }`
- `tokens.length === 1`:
  - `number` → `{ type: 'literal', value: t.value }` (value is the JS number)
  - `string` → `{ type: 'literal', value: t.value }`
  - `t.value === 'yes'` → `{ type: 'literal', value: true }`
  - `t.value === 'no'`  → `{ type: 'literal', value: false }`
  - else → `{ type: 'ref', name: t.value }`

  Note: `yes`/`no` are matched on `t.value` regardless of token type (they are `word`
  tokens in practice). This single-token `yes/no` check does NOT exist in the
  multi-token path, so `yes`/`no` only become booleans when alone.

### 2. List literal — leading `[` (L2197–2200)
If `tokens[0].type === 'lbracket'` → `parseListFromTokens(tokens)` (see below).

### 3. Object literal — leading `{` (L2202–2205)
If `tokens[0].type === 'lbrace'` → `parseObjectLiteral(tokens)`.

### 4. `random N` (L2207–2210)
First word `random` → `{ type: 'random', max: parseExpression(tokens.slice(1)) }`.
`max` is the parse of ALL remaining tokens (so `random a + b` → max is a math node).

### 5. `list of N <noun> [{props}]` (L2212–2226)
First word `list`, `length >= 3`, `tv(tokens[1]) === 'of'`:
- Find first `lbrace` index → `propsStart` (default `tokens.length`).
- `count = parseExpression([tokens[2]])` — **only the single token at index 2** is the
  count. Multi-token counts are NOT supported (the `<noun>` tokens between index 2 and
  `propsStart` are ignored entirely).
- `props = propsStart < length ? parseObjectLiteral(tokens.slice(propsStart)) : null`.
- → `{ type: 'list_of_sprites', count, props }`  (props is `null` when absent).

### 6. `centered sprite [{...}]` (L2228–2236)
First word `centered`, `length >= 2`, `tv(tokens[1]) === 'sprite'`:
- props = object literal from `tokens.slice(2)` if `tokens[2]` is `lbrace`, else `null`.
- → `{ type: 'sprite_expr', position: 'centered', props }`.

### 7. `sprite [{...}]` (L2238–2246)
First word `sprite` AND (`length === 1` OR `tokens[1].type === 'lbrace'`):
- props = object literal from `tokens.slice(1)` if `tokens[1]` is `lbrace`, else `null`.
- → `{ type: 'sprite_expr', position: 'zero', props }`.
- GUARD: bare single-token `sprite` reaches here only via the multi-token path... but
  `sprite` alone is length 1 → caught by base case #1 as `{ type:'ref', name:'sprite' }`
  (confirmed: `x is sprite` → ref). The length-1 branch of clause #7 is therefore
  unreachable. Multi-token `sprite foo` (no lbrace) does NOT match (tokens[1] not lbrace)
  and falls through to the multiword ref fallback.

### 8. Dotted property access (L2248–2260)
If `length >= 3` AND `tokens[1].type === 'dot'`:
- Build `ref = tokens[0].value`, then while `tokens[i].type === 'dot'`:
  `ref += '.' + tokens[i+1].value; i += 2`.
- If consumed all tokens (`i >= length`) → `{ type: 'ref', name: ref }`
  (e.g. `player.x.y` → ref `"player.x.y"`).
- Else REWRITE: prepend a synthetic `{type:'word', value: ref}` token and recurse on
  `[synthetic, ...tokens.slice(i)]`. This lets `player.x + 1` re-enter and split on `+`,
  with the dotted ref as the left atom (confirmed).

  PORT NOTE: requires constructing a synthetic `word` token whose `value` contains dots.

### 9. `item N of X` (L2262–2268)
First word `item`: find first `of` at index `> 0`. If found (`ofIdx > 0`):
- → `{ type: 'item_of', index: parseExpression(slice(1, ofIdx)), list: parseExpression(slice(ofIdx+1)) }`.
- `index` and `list` are full sub-expressions (e.g. `item a + 1 of list` → index is math).
- If no `of`, falls through (no early return).

### 10. `the number of X` / `count of X` (L2270–2278)
- First word `the`, `length >= 4`, `tv(1)==='number'`, `tv(2)==='of'`
  → `{ type: 'count', expr: parseExpression(slice(3)) }`.
- First word `count`, `length >= 3`, `tv(1)==='of'`
  → `{ type: 'count', expr: parseExpression(slice(2)) }`.

### 11. Math, LOW precedence `+ -` (L2280–2286)
Scan **right→left** from `i = length-1` down to `1` (index 0 excluded so leading `-`
is not treated as binary). First `operator` with value `+` or `-` at index `i`:
- → `{ type: 'math', op: tokens[i].value, left: parseExpression(slice(0,i)), right: parseExpression(slice(i+1)) }`.
Right-to-left scan + recursive left sub-parse yields **left-associative** evaluation
(`a + b - c` → `((a+b)-c)`, confirmed).

### 12. Math, HIGH precedence `* / mod` (L2288–2293)
Same right→left scan. Matches `operator` `*` or `/`, OR `word` `mod`.
- op is normalized: `mod` → `'%'`, else the operator value.
- → `{ type: 'math', op, left: parseExpression(slice(0,i)), right: parseExpression(slice(i+1)) }`.
Because `+/-` is split first, `a + b * c` correctly nests `*` under the `+` right side.

### 13. Leading unary minus (L2295–2300)
If `tokens[0].type === 'operator'` && value `'-'`:
- → `{ type: 'math', op: '-', left: { type: 'literal', value: 0 }, right: parseExpression(slice(1)) }`.
Placed AFTER the binary scans (which skip index 0). So `-4 + 10` splits at `+` first
(`(0-4)+10`), but bare `-x` negates (`0 - x`). Confirmed.

### 14. Leading string (L2302–2306)
If `tokens[0].type === 'string'` → `{ type: 'literal', value: tokens[0].value }`
(uses ONLY the first string token; trailing tokens discarded — no interpolation here).

### 15. Multiword ref fallback (L2308–2309)
`{ type: 'ref', name: tokens.map(t => t.value).join(' ') }`.
Joins ALL token values with single spaces (e.g. `hello world foo` → ref
`"hello world foo"`; `()` → ref `"( )"`). Note operators/punctuation contribute their
`value` too.

---

## `parseListFromTokens(tokens)` — L2159–2184

- Empty → `{ type: 'literal', value: [] }`.
- Leading `lbracket`: depth-aware comma split.
  - Start `i = 1` (skip `[`). Track `depth` for nested `[`/`{`.
  - On `rbracket` at depth 0: push `parseExpression(current)` if non-empty, then **break**
    (tokens after the closing `]` are ignored).
  - `lbracket`/`lbrace` → `depth++`. `rbracket`/`rbrace` → `depth--` AND the closing
    bracket token is pushed into `current` (note the asymmetry: openers are NOT pushed
    but closers ARE — they feed the nested sub-expression's own parse).
  - `comma` at depth 0 → flush `current` (if non-empty) as an item, reset.
  - else push token.
  - → `{ type: 'listliteral', items: [...] }`.
- No leading `[` → `parseExpression(tokens)` (lets `is in <ref>` work without brackets).

Nested lists produce nested `listliteral` (confirmed `[1, [2,3], 4]`).

---

## `parseObjectLiteral(tokens)` — L2312–2339

Builds `{ type: 'object_expr', props: { key: <expr>, ... } }`.
- `i = 1` (skip `{`). Loop while `i < length` and `tokens[i].type !== 'rbrace'`:
  - `comma` → skip.
  - `key = tokens[i].value`; `i++`.
  - If next token value is `':'` → `i++` (colon "rarely tokenized" — usually absorbed by
    the lexer into the key, so this guard mostly no-ops).
  - Collect value tokens until depth-0 `comma` or `rbrace`. Depth tracks
    `lbrace/lbracket/lparen` (++) and `rbrace/rbracket/rparen` (--).
  - If value tokens non-empty → `props[key] = parseExpression(valueTokens)`.
- props is a plain object (insertion order preserved). Values are exprs, evaluated at
  construction time by the runtime, so `{x: player.x}` → `props.x = ref "player.x"`.
- Nested objects produce nested `object_expr` (confirmed `{pos:{x:1}}`).

PORT NOTE: in Rust, `props` should be an **insertion-ordered map** (e.g. `IndexMap`),
since object iteration order can matter at runtime.

---

## `parseCondition(tokens)` — L2075–2156

Returns boolean-ish expression nodes. Clause order is load-bearing.

### 0. Empty (L2076)
→ `{ type: 'literal', value: false }`.

### 1. `key "X" [is held|pressed|down|being]` (L2078–2085)
`tv(0)==='key'`, `length >= 2`, `tokens[1].type==='string'`, and EVERY remaining word
(`tokens.slice(2)` mapped through `tv`) is in `{is, held, pressed, down, being}`:
- → `{ type: 'key_pressed', key: tokens[1].value.toLowerCase() }`.
(Empty remainder also satisfies `.every`, so `key "space"` alone matches.)

### 2. `not` prefix (L2087–2090)
`tv(0)==='not'` → `{ type: 'not', expr: parseCondition(tokens.slice(1)) }`
(recurses into `parseCondition` — preserves nested logical ops).

### 3. `no X` prefix (L2092–2095)
`tv(0)==='no'` → `{ type: 'not', expr: parseExpression(tokens.slice(1)) }`
(recurses into `parseExpression`, NOT parseCondition — `no` is "no such thing /
falsy/empty"; e.g. `no enemies` → `not(ref enemies)`).

### 4. `or` split (L2097–2102)
Scan `i = 1 .. length-1` (left→right); first `word` `or`:
- → `{ type: 'or', left: parseCondition(slice(0,i)), right: parseCondition(slice(i+1)) }`.

### 5. `and` split (L2103–2107)
Same, first `word` `and`:
- → `{ type: 'and', left: parseCondition(slice(0,i)), right: parseCondition(slice(i+1)) }`.

`or` is checked before `and`, and both scan left→right taking the FIRST match. Net
effect for `x and y or z`: `or` splits first at its (only) position → `or(and(x,y), z)`
(confirmed). General precedence: `or` binds looser than `and`.

### 6. `X is between A and B` (L2109–2121) — ⚠ EFFECTIVELY DEAD CODE
Intended: `{ type: 'between', value, low, high }`. BUT clause #5 (`and`) runs first and
the `and` in "between A and B" always splits the condition before this clause is reached.
EMPIRICALLY: `score is between 1 and 10` produces
`and(eq(ref "score", ref "between 1"), literal 10)` — a garbage AST, NOT a `between`
node. A faithful port MUST reproduce this (do not "fix" it): keep the `between` clause
positioned after the `and` scan so it stays unreachable for the normal infix form.
(The only way to reach it would be a `between` with no `and` after it, which the inner
`andIdx` search then fails, so it still falls through.)

### 7. `is` / `is not` / `is in` / `is not in` (L2123–2139)
Scan `i = 0 .. length-1`; first `word` `is`:
- If `tokens[i+1]` is word `not`:
  - If `tokens[i+2]` is word `in` →
    `{ type: 'not', expr: { type: 'in', value: parseExpression(slice(0,i)), list: parseListFromTokens(slice(i+3)) } }`.
  - else → `{ type: 'neq', left: parseExpression(slice(0,i)), right: parseExpression(slice(i+2)) }`.
- If `tokens[i+1]` is word `in` →
  `{ type: 'in', value: parseExpression(slice(0,i)), list: parseListFromTokens(slice(i+2)) }`.
- else (plain equality) → `{ type: 'eq', left: parseExpression(slice(0,i)), right: parseExpression(slice(i+1)) }`.

Note `is` is found left→right (first occurrence). `in` lists use `parseListFromTokens`
so a bare ref after `in` is allowed.

### 8. Comparison operators (L2141–2146)
Scan `i = 0 .. length-1`; first `operator` in `{ '>', '<', '>=', '<=', '!=' }`:
- → `{ type: 'cmp', op: tokens[i].value, left: parseExpression(slice(0,i)), right: parseExpression(slice(i+1)) }`.
(`!=` is a `cmp` here; `is not` is a separate `neq` node from clause #7. `==`/`=` are NOT
in this list.)

### 9. `X has Y` (L2148–2153)
First `word` `has` → `{ type: 'has', left: parseExpression(slice(0,i)), right: parseExpression(slice(i+1)) }`.

### 10. Bare truthiness fallback (L2155–2156)
→ `parseExpression(tokens)` (the expression node itself is evaluated for truthiness).

---

## Node shapes summary (confirmed via `parse()`)

Expression nodes:
- `{ type:'literal', value: <num|string|bool|[]> }`
- `{ type:'ref', name: <string> }`  (dotted & multiword names are space/dot-joined strings)
- `{ type:'listliteral', items: [<expr>] }`
- `{ type:'object_expr', props: { <key>: <expr> } }`  (ordered map in Rust)
- `{ type:'random', max: <expr> }`
- `{ type:'list_of_sprites', count: <expr>, props: <object_expr|null> }`
- `{ type:'sprite_expr', position: 'centered'|'zero', props: <object_expr|null> }`
- `{ type:'item_of', index: <expr>, list: <expr> }`
- `{ type:'count', expr: <expr> }`
- `{ type:'math', op: '+'|'-'|'*'|'/'|'%', left: <expr>, right: <expr> }`

Condition nodes:
- `{ type:'key_pressed', key: <lowercased string> }`
- `{ type:'not', expr: <cond|expr> }`
- `{ type:'or'|'and', left: <cond>, right: <cond> }`
- `{ type:'between', value, low, high }`  (unreachable — see clause #6)
- `{ type:'in', value: <expr>, list: <expr|listliteral> }`
- `{ type:'eq'|'neq', left: <expr>, right: <expr> }`
- `{ type:'cmp', op: '>'|'<'|'>='|'<='|'!=', left: <expr>, right: <expr> }`
- `{ type:'has', left: <expr>, right: <expr> }`
- plus any `parseExpression` node (bare truthiness).

---

## Gotchas for the Rust port (must replicate exactly)

1. **`between` is dead code.** The `and` split (clause #5) always fires first for the
   `X is between A and B` form, producing a malformed `and(eq(...,"between A"), B)` tree.
   Do NOT implement working `between`; keep the clause unreachable.
2. **Clause order is the spec.** First-match wins in every function. Reproduce the exact
   ordering of prefix checks and split scans.
3. **Math splits scan RIGHT→LOW first, then HIGH**, both right-to-left starting at index 0
   excluded (so leading `-` is unary). This yields left-associative trees and correct
   precedence. `mod` is normalized to op `'%'`.
4. **`yes`/`no` → bool only in the single-token base case.** In any longer expression they
   become refs/words.
5. **Multiword ref fallback joins ALL token `value`s with spaces**, including operators and
   parens (`()` → ref `"( )"`). Token `value` must be available for every token type.
6. **Dotted access with trailing tokens rewrites** to a synthetic `word` token containing
   the dotted name, then recurses — the dotted ref becomes a math atom.
7. **`list of N`: only `tokens[2]` is the count.** The `<noun>` and any other count tokens
   before the `{` are ignored.
8. **`parseListFromTokens` pushes closing brackets but not openers** into the current item
   buffer (depth bookkeeping asymmetry) — needed so nested literals re-parse correctly.
9. **Object literal colon is usually NOT a separate token** (lexer folds it); the `':'`
   skip guard rarely runs. Keys come from `tokens[i].value` directly.
10. **`is` matches the FIRST `is` left→right**; comparison ops also first-match left→right;
    `or` before `and`. These ordering choices change parse trees for ambiguous inputs.
11. **String-leading multi-token expr returns only the first string literal** (clause #14),
    discarding the rest — there is no interpolation in `parseExpression`.
12. **`no X` recurses into `parseExpression`, but `not X` recurses into `parseCondition`.**
    Different recursion targets.
