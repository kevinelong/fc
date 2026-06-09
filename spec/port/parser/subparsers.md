# fc parser — structured sub-parsers (STAGE 2 port reference)

Ground truth: `/home/kevin/codeonline/index.html`. Every node shape below was
verified empirically via `parse()` from `spec/lang/fc-core.mjs`, not guessed.
Line numbers cite `index.html`.

All sub-parsers receive `(raw, lineNum)` where `raw` is the token array for one
logical line (the leading keyword still at `raw[0]`), and they return a single
AST node. `tv(t)` reads a token's value; word/keyword matching is on the
lowercased token value (the lexer already lowercases `word` tokens). Every node
carries `lineNum` as its last field.

## Shared helpers (must port first)

### tokensToRef(tokens) — L2341
Joins tokens into a dotted reference *string* (NOT an expression node).
- `dot` token → `"."`; any other token → `t.value`; then `parts.join('')`.
- So `player . x` → `"player.x"`; `score` → `"score"`. Used by assign/add/remove targets.

### stripHudSuffix(raw) — L2350
Scans from the end for an `on hud` or `on screen` word pair.
- Returns `{ tokens: raw.slice(0, i), hud: true }` when found (drops `on X`).
- Else `{ tokens: raw, hud: false }`.
- Loop is `for i = raw.length-2 down to 0` → finds the **last** such pair.
- Used by `parseDraw` and `parseWrite` only. `hud` flag lands in the node.

### userFuncs set — L1452
Pre-pass over all lines: any line starting `to ...` registers a name into
`userFuncs` (lowercased). `to screen X` → `screen_<x>`, else the token-1 value.
`userFuncs` feeds `isCommandWord` (L1918), which controls `splitOnAnd` and
`parseEach`'s list/inline boundary. Must be built before parsing bodies.

---

## parseDraw — L2361  (node type: `draw`)

Order of operations:
1. `stripHudSuffix(raw)` → `raw`, `hudFlag`.
2. `shape = tv(raw[1])` (or `''` if absent).
3. **Sprite branch** (`shape === 'sprite' && raw.length >= 3`), L2369:
   - Find `at` at index `>= 3` (word). `nameTokens = raw.slice(2, atIdx|len)`.
   - If `nameTokens` is exactly one `string` token → `args.spriteName = value.toLowerCase().replace(/\s+/g,'_')`.
   - Else if non-empty → `args.spriteNameExpr = parseExpression(nameTokens)`.
   - If `at` found: tokens after `at`, split on first `comma` → `args.x`/`args.y`
     via `parseExpression`; no comma → only `args.x`.
   - Returns `{ type:'draw', shape:'sprite', args, hud, lineNum }`.
4. **Shape branch** (everything else), L2392:
   - Keyword delimiters `KEYWORDS = ['at','size','from','to','in']`, scanned from
     index `2`. Build ordered `positions` list + sentinel `{kw:'END', idx:len}`.
   - For each consecutive keyword segment `raw.slice(idx+1, nextIdx)`:
     - `in` → `args.color = segment.map(t=>t.value).join(' ')` (raw join, NOT expr; `continue`).
     - else split on first `comma` → `first`/`second` via `parseExpression`.
       - `at` → `args.x=first, args.y=second`
       - `size` → `args.w=first, args.h=second || first`  (single value → square)
       - `from` → `args.x1=first, args.y1=second`
       - `to` → `args.x2=first, args.y2=second`
   - Returns `{ type:'draw', shape, args, hud, lineNum }`.

Verified shapes:
- `draw sprite "hero" at 10, 20` → `args:{spriteName:"hero", x:lit, y:lit}`
- `draw sprite kind at x, y` → `args:{spriteNameExpr:{type:ref,name:kind}, x:ref, y:ref}`
- `draw box at 1,2 size 8,4 in red` → `args:{x,y,w,h,color:"red"}`
- `draw line from 0,0 to 9,9 in blue` → `args:{x1,y1,x2,y2,color:"blue"}`
- `draw box at 1,2 on hud` → `hud:true`, `args:{x,y}` (no color/w/h keys present)

GOTCHA: `args` is a sparse object — only keys for keywords actually present
exist. The Rust port must use optionals, not zero-filled defaults, for draw.

---

## parseWrite — L2431  (node type: `write`)

1. `stripHudSuffix` → `raw`, `hudFlag`.
2. Text: if `raw[1]` is a `string` → `text = raw[1].value`, `i=1+1`.
   Else find `at` (idx>0); `text = raw.slice(1, atIdx).map(t=>t.value).join(' ')`
   (raw word-join, NOT an expression), `i=atIdx`.
3. Find `at`/`in` words at idx `>= i`. If `at` found: segment until `in`
   (if `in`>`at`) else end; split on first comma → `x`,`y` via `parseExpression`.
4. If `in` found: `color = raw.slice(inIdx+1).map(t=>t.value).join(' ')`.
5. Defaults baked into the return: `text→{literal,''}`, `x→{literal,0}`,
   `y→{literal,0}`, `color→'white'`. Note `text` is ALWAYS wrapped as
   `{type:'literal', value:text}` even for the word-join expression path.

Verified:
- `write "score" at 1,2 in red` → `text:lit"score"`, `x,y` lits, `color:"red"`, `hud:false`
- `write score at 1,2` → `text:lit"score"` (joined word, still a literal), `color:"white"`

GOTCHA: unlike `say`/`meter`, `write`'s non-string text is degraded to a literal
string via word-join, never an expression node.

---

## parseButton — L2469  (node type: `button`)

Form: `show button "label" at x, y`.
- `label = raw[2].value` if `raw[2]` is a string, else `''`.
- Find `at` (any idx). After `at`: split first comma → `x`,`y` via `parseExpression`.
- Defaults `x={literal,10}`, `y={literal,10}`.
- Returns `{ type:'button', label, x, y, lineNum }`.

Verified: `show button "Play" at 5,6` → `label:"Play", x:lit5, y:lit6`.

---

## parseMeter — L2487  (node type: `meter`)

Form: `show meter CURRENT of MAX at x, y [size w, h] [in color]`.
Keyword index helper `idxOf(w)` matches words at idx `> 1` only.
- `ofIdx`, `atIdx`, `sizeIdx`, `inIdx`.
- `current = parseExpression(raw[2 .. (of|at|end)])`.
- `max = of? parseExpression(raw[of+1 .. (at|end)]) : {literal,1}`.
- `x,y` after `at` until `size|in|end`, comma-split. Defaults `x={lit,2}, y={lit,2}`.
- `size` → `w,h` comma-split (only set if a comma present). Defaults `w={lit,40}, h={lit,5}`.
- `color` = word-join after `in`. Default `'green'`.
- Returns `{ type:'meter', current, max, x, y, w, h, color, lineNum }` — all keys always present.

Verified: `show meter hp of maxhp at 1,2 size 40,5 in green` →
`current:ref hp, max:ref maxhp, x,y lits, w:lit40, h:lit5, color:"green"`.

GOTCHA: meter `size` w/h are only assigned when the size segment has a comma;
a lone `size 40` is ignored (stays at defaults).

---

## parseSay — L2530  (node type: `say`)

- If `raw.length>=2 && raw[1]` is a `string` → `text = {literal, raw[1].value}`.
- Else → `text = parseExpression(raw.slice(1))` (a real expression).
- Returns `{ type:'say', text, lineNum }`.

Verified: `say "hi"` → `text:lit"hi"`; `say score` → `text:{ref,score}`.

---

## parseRepeat — L2555  (node types: `repeat_times` | `repeat_range` | `repeat_while` | `repeat_until` | `forever`)

Dispatch in this order; body always starts `[]` (filled by parseBlock):
1. `times` word present → `{ type:'repeat_times', count:parseExpression(raw[1..timesIdx]), body:[] }`.
2. `with` word present → varName `= raw[withIdx+1].value` (default `'i'`); requires
   both `from` and `to` (`to` searched after `from`) →
   `{ type:'repeat_range', varName, from:expr, to:expr, body:[] }`.
   (If `with` present but `from`/`to` missing, falls through to forever.)
3. `tv(raw[1])==='while'` → `{ type:'repeat_while', condition:parseCondition(raw.slice(2)), body:[] }`.
4. `tv(raw[1])==='until'` → `{ type:'repeat_until', condition:parseCondition(raw.slice(2)), body:[] }`.
5. bare → `{ type:'forever', body:[] }`.

Verified all five. `repeat` (bare) and `forever` both yield `forever`.

GOTCHA: `times` is searched anywhere in the line; `while`/`until` are matched
ONLY at `raw[1]`. condition uses `parseCondition`, count/from/to use `parseExpression`.

---

## parseEach — L2582  (node type: `each`, fallback `call`)

Form: `each VAR in LIST [where COND] [INLINE-STMT]`.
1. Find `in` (idx>0). If none → fallback `{ type:'call', name:'each', args:raw.slice(1) }`.
2. `varName = raw.slice(1,inIdx).map(t=>t.value).join(' ')` (space-join string).
3. **listEnd**: scan from `inIdx+2` for the first `word` that `isCommandWord` →
   that index is `listEnd` (where the inline action begins); else `raw.length`.
4. `where` word searched in `(inIdx, listEnd)`. `list` = `parseExpression(raw[inIdx+1 .. (where|listEnd)])`.
5. If `where` → `where = parseCondition(raw[whereIdx+1 .. listEnd])`, else `null`.
6. `thenStmt = listEnd<len ? parseLine(raw.slice(listEnd), lineNum) : null`.
7. `{ type:'each', varName, list, where, thenStmt, body:[], lineNum }`.

Verified:
- `each e in enemies` (block body) → `where:null, thenStmt:null, body:[...]`.
- `each e in enemies where e.hp > 0 say e` → `where:cmp`, `thenStmt:say{ref e}`,
  `list:ref enemies`, `body:[]`.

GOTCHA: the inline-action boundary depends on `isCommandWord`, which depends on
`userFuncs`. Scan deliberately starts at `inIdx+2` (skips first list token so a
1-token list whose name happens to be a command word isn't truncated).

---

## parseKnock — L1876  (node type: `knock`)

Form: `knock TARGET away from SOURCE [distance N]`.
- `target = raw[1].value` (default `'player'`).
- `source`: `raw[fromIdx+1].value` if `from` present, else `'enemy'`.
- `distance`: `parseExpression(raw.slice(distIdx+1))` if `distance` present, else `{literal,4}`.
- `away` index is computed but unused. Returns `{ type:'knock', target, source, distance, lineNum }`.

Verified: `knock player away from enemy distance 8` → distance lit8;
`knock player` → source `"enemy"`, distance lit4.

---

## parsePset — L2608  (node type: `pset`)

Form: `pset x, y [in color]`.
- `inIdx` (word, idx>0) bounds the coord segment `raw.slice(1, in|end)`.
- Comma-split → `x`,`y` via `parseExpression`; no comma → only `x`.
- `color`: word-join after `in`, default `'white'`.
- Defaults at return: `x→{literal,0}`, `y→{literal,0}`.
- `{ type:'pset', x, y, color, lineNum }`.

Verified: `pset 3,4 in cyan` → `x:lit3, y:lit4, color:"cyan"`.

---

## parseWhen — L1928  (event handlers)

`rest = raw.slice(1)`. First matching form wins. Every node has `body:[]`
(filled by parseBlock) and `lineNum`. Inline `thenStmt` is parsed via `parseLine`.

| Form | match condition | node |
|------|-----------------|------|
| `when "KEY" is pressed [INLINE]` | `rest[0]`=string, `tv(rest[1])='is'`, `tv(rest[2])='pressed'` | `{type:'when_key', key:rest[0].value, thenStmt:parseLine(rest.slice(3)) if len>3 else null}` |
| `when key "KEY" is pressed [INLINE]` | `tv(rest[0])='key'`, `rest[1]`=string | `{type:'when_key', key:rest[1].value, thenStmt:parseLine(rest.slice(4)) if len>4}` |
| `when key is in [LIST] [INLINE]` | `tv(rest[0])='key'`, `tv(rest[1])='is'` | `{type:'when_key_in', keys:parseListLiteral(rest,3), thenStmt:findInlineAction(rest,3).stmt}` |
| `when mouse ... [INLINE]` | `tv(rest[0])='mouse'`, len>=3 | `{type:'when_mouse', event:tv(rest[2]), thenStmt:parseLine(rest.slice(3)) if len>3}` |
| `when button "L" is clicked [INLINE]` | `tv(rest[0])='button'`, `rest[1]`=string, `is`,`clicked` | `{type:'when_button', label:rest[1].value, thenStmt:parseLine(rest.slice(4)) if len>4}` |
| `when X picks up [any] ITEM [INLINE]` | found `picks`+`up` at idx>0 | `{type:'when_pickup', itemVar, thenStmt}` |
| `when X hits [any] ITEM [INLINE]` | found `hits` at idx>0 | `{type:'when_hit', itemVar, thenStmt}` |
| `when X is defeated [INLINE]` | `tv(rest[1])='is'`, `tv(rest[2])='defeated'` | `{type:'when_defeat', itemVar:rest[0].value, thenStmt}` |
| (fallthrough) | none | `{type:'when_generic', tokens:rest, body:[]}` |

pickup/hit itemVar resolution: from the index after the verb, skip an optional
`any` token, then `itemVar = rest[itemIdx].value` (default `'item'`); inline
action = `parseLine(rest.slice(itemIdx+1))` when more tokens follow.

GOTCHA: `when_key_in` inline action comes from `findInlineAction(rest, 3)` (L1990),
which scans for the FIRST `rbracket` and parses tokens after it **with lineNum 0**
(verified: `thenStmt.lineNum === 0`). All other inline `thenStmt`s carry the
real lineNum. `when_mouse` stores the raw `event` word from `rest[2]` (e.g.
`"clicked"`); it does not validate it.

---

## funcdef + def_* (handled inline in parseLine, not separate sub-parsers)

### funcdef — L1514  (node type: `funcdef`)
`first === 'to'`:
- `to screen X` (`raw.len>=3`, `tv(raw[1])='screen'`) →
  `{ type:'funcdef', name:'screen_'+raw[2].value, params:[], body:[] }`.
- else `name = raw[1].value` (default `'unknown'`); params = every `word` token
  from idx 2 onward whose value is **not** `at` and not `with` → `params.push(value)`.
  `{ type:'funcdef', name, params, body:[] }`.

Verified: `to greet name times` → `params:["name","times"]`;
`to screen menu` → `name:"screen_menu", params:[]`.

GOTCHA: params are PARSED but UNUSED at runtime (per task note). Still must be
emitted for AST parity. Non-word tokens (numbers/strings) between params are
silently skipped. `splitOnAnd` (L1893) refuses to split lines starting with `to`,
so `to ... and ...` stays one statement.

### def_sprite — L1530  (node type: `def_sprite`)
`first='sprite'` AND `raw[1]` is a string:
- `name = raw[1].value`; `hex` = first string token at idx>=2, lowercased (else `''`).
- `{ type:'def_sprite', name, hex }`. Verified `sprite "hero" is "0011"` → hex `"0011"`.

### def_song — L1537  (node type: `def_song`)
`first='song'` AND `raw[1]` is a string:
- `name=raw[1].value`; `tempo` = `Number(firstNumberToken.value)` else `120`;
  `rows` = every string token at idx>=2 (values).
- `{ type:'def_song', name, tempo, rows }`. Verified tempo 140, rows `["c d e","f g a"]`.

### def_sfx — L1545  (node type: `def_sfx`)
`first='define'` AND `tv(raw[1])='sound'` AND `raw[2]` is a string:
- `name=raw[2].value`. `rest` = tokens after `as` (or after idx 3 if no `as`).
- `over D` word → `dur = Number(rest[overI+1].value)` else `0.15`.
- If `rest[0]` word == `notes`: `recipe = {kind:'notes', notes:[Number...] from rest[1..(over|end)], dur}`.
- Else tone: `wave` = `rest[0]` if in `[square,sine,triangle,sawtooth,noise]` else `'square'`;
  `from F0`/`to F1` words give `f0`/`f1` (else first number token → f0; f0 default 440, f1 default null);
  `recipe = {kind:'tone', wave, f0, f1, dur}`.
- `{ type:'def_sfx', name, recipe }`.

Verified:
- `define sound "zap" as sine from 440 to 880 over 0.2` → `{kind:tone, wave:sine, f0:440, f1:880, dur:0.2}`.
- `define sound "arp" as notes 60 64 67 over 0.3` → `{kind:notes, notes:[60,64,67], dur:0.3}`.

---

## Cross-cutting gotchas for the Rust port

1. **Sparse vs always-present fields**: `draw.args` is sparse (only present
   keywords). `meter`/`write`/`button`/`pset` always emit every field with
   baked defaults. Model these differently.
2. **Word-join vs parseExpression vs parseCondition**: colors and write/each
   varName use raw `t.value` joins (space- or empty-joined); coords/counts use
   `parseExpression`; loop/where conditions use `parseCondition`. Do not unify.
3. **`tokensToRef` returns a String**, used by add/remove/assign targets — not
   an expression node.
4. **lineNum=0 anomaly** only for `when_key_in` inline action (findInlineAction).
5. **`userFuncs` must be precomputed** before parsing; it changes `isCommandWord`,
   which changes `splitOnAnd` chaining and `parseEach` list/inline boundaries.
6. **Body `[]` placeholders**: when/repeat/each/funcdef/forever/every all return
   `body:[]` to be populated later by `parseBlock` indentation nesting.
7. **Default targets**: knock target `'player'`, source `'enemy'`; funcdef name
   `'unknown'`; each/when itemVar `'item'`; repeat_range varName `'i'`.
