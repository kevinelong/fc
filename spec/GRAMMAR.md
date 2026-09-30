# fc GRAMMAR (syntax only)

**Status: DESCRIPTIVE, NOT NORMATIVE.** This document describes what the one true
implementation (`/home/kevin/codeonline/index.html`, classic `<script>` L441–4882)
*actually parses*, grounded in source with `~line` citations. It is the SYNTAX layer
only: tokens, block structure, statement dispatch, the expression grammar, and the
condition grammar. **Runtime meaning** (truthiness, coercion, equality, the palette,
1-based indexing, the if/else-by-nesting bug, etc.) lives in `SEMANTICS.md` and is
deliberately kept OUT of this file.

Every heuristic or surprising parse is marked **[QUIRK]**. Because much of fc's parsing
is heuristic line-splitting rather than a clean grammar, the behavior described here
**must be frozen by the conformance suite** (`spec/corpus/`) — the grammar is whatever
these functions do, divergences are bugs against the golden tests, not against this prose.

EBNF-ish conventions: `UPPER` = lexical token class, `'lit'` = literal word/char,
`{ x }` = zero-or-more, `[ x ]` = optional, `|` = alternative, `(...)` = grouping.
The grammar is **not** a formal CFG — several productions are decided by ad-hoc
index scans (`findWord`, `findIndex`), documented inline.

---

> **[2026-09-29] Coverage note.** The `~L` citations below target the revision this
> document was last pass-edited against (`/home/kevin/codeonline/index.html`,
> 4972 lines). The live file is now ~7300 lines and carries verbs this pass did not
> reach; they are listed in **§11 Additions** at the end, cited by parse function
> instead of line number, each frozen by a corpus program. The executable authority
> is the harness suite (`docs/STATUS.md` table): `ast-diff` (77/77 programs) freezes
> the parse, `exec-diff` (55/55) the top-level semantics.

## 1. Lexical layer

Source is split on `\n` into raw lines (`parse`, ~L1437). Each non-blank line is
tokenized independently by `tokenizeLine` (~L1369). There is **no** cross-line lexer
state and **no** continuation — every line is a self-contained token list with an
attached integer `indent`.

### 1.1 Indentation (`tokenizeLine` ~L1372–1378)

Leading whitespace is measured *before* tokens: each space counts 1, each **tab counts 2**.

```
indent_level = floor(total_leading_whitespace_units / 2)
```

So one tab = one indent level; two spaces = one indent level; **[QUIRK]** three spaces
still = level 1 (floor(3/2)=1), and a tab followed by a single space = floor(3/2) = level 1.
Mixed tabs/spaces are summed, not rejected. Indentation is the ONLY block delimiter
(no braces/`end`/`:`); see §2.

### 1.2 Comments

Two forms, both stripping a trailing `--` comment to end-of-line:
- In `parse` (~L1441) a regex `/--.*$/` strips comments for the *blank-line* check.
- In `tokenizeLine` (~L1383) scanning **breaks** on `--` (only when the two chars are
  adjacent: `line[i]==='-' && line[i+1]==='-'`).

**[QUIRK]** There is no string-awareness in the `parse`-level regex strip, but the
tokenizer scans strings first (§1.4) so `--` *inside a quoted string* survives in the
token stream; the line-level regex is only used to decide blankness, the token stream
is authoritative. A lone `-` is not a comment; `--` must be contiguous.

### 1.3 Numbers and negative-number disambiguation (~L1394–1399)

A number token is lexed when the current char is `[0-9]`, **or** when it is `-`
immediately followed by a digit **AND** one of:
- it is the first token on the line (`tokens.length === 0`), **or**
- the previous token's type is one of `{operator, keyword, comma, lparen}`.

Otherwise a leading `-` is lexed as an `operator` token (see §1.5) and unary negation
is resolved later in `parseExpression` (~L2298). Number body is `[0-9.]*` (no exponent,
no sign after the first char). `parseFloat` produces the value.

**[QUIRK]** `keyword` never appears as a token `type` from this lexer (the lexer emits
`word`, not `keyword`), so that branch of the negative-number guard is effectively dead;
in practice negative literals trigger after `operator`/`comma`/`lparen` or at line start.

**[QUIRK]** `5-3` lexes as `number(5) operator(-) number(3)` (the `-` follows a `number`,
not in the allow-list) → subtraction. But `f -3` where `f` is a `word` also lexes `-3`
as... no: prev is `word`, not in allow-list, so `-` is an `operator`. Whereas `(-3)`,
`x, -3`, `* -3`, and a line-leading `-3` all lex a negative literal.

### 1.4 Strings (~L1385–1391)

Opened by `"` or `'`; scanned char-by-char until the **same** quote; the closing quote
is consumed. **[QUIRK]** No escape sequences (`\"` does not work), and an unterminated
string silently consumes to end-of-line. Emits `string` token; the raw inner text is the
value (case preserved).

### 1.5 Operators, brackets, punctuation

- Operators (~L1414): chars from `+-*/><=!`. A second `=` is greedily appended to form
  `==`, `!=`, `>=`, `<=` (also `+=`-style is **not** special; only `=`-suffix). Single
  `=` becomes operator `=`. `>` `<` may take `=`. Emits `operator`.
- Brackets/punct (each its own type): `[`→`lbracket`, `]`→`rbracket`, `{`→`lbrace`,
  `}`→`rbrace`, `(`→`lparen`, `)`→`rparen`, `,`→`comma`, `.`→`dot`.
- Words (~L1423): `[a-zA-Z_][a-zA-Z0-9_]*` → `word`. There is **no keyword token class**;
  keywords are ordinary `word`s recognized positionally by the parser.

### 1.6 Unknown characters (~L1429)

Any char not matching the above is **silently skipped** (`i++`). **[QUIRK]** Garbage like
`@`, `#`, `:` simply vanishes from the token stream (note: object-literal `:` is handled
because `parseObjectLiteral` tolerates its absence, ~L2322).

### 1.7 Token shape

A token is `{ type, value }`. `value` is a JS number for `number`, the inner text for
`string`, and the raw word/char for everything else. The token *list* additionally carries
`.indent` (the line's indent level). Helper `tv(token)` (~L1131) returns
`value.toLowerCase()` for string values else `String(value)` — used pervasively for
keyword matching, so **keyword recognition is case-insensitive**, but string *literals*
and most names preserve case until a consumer lowercases them.

```ebnf
TOKEN   = STRING | NUMBER | OPERATOR | WORD
        | LBRACKET | RBRACKET | LBRACE | RBRACE | LPAREN | RPAREN | COMMA | DOT
LINE    = INDENT { TOKEN }          (* INDENT = floor(ws/2), tab=2 *)
```

---

## 2. Program & block structure

```ebnf
program = { line }                         (* parse ~L1437 *)
```

`parse` builds an array of `{ tokens, indent, lineNum }`, **dropping** blank lines and
lines whose token list is empty (~L1442–1444). It then pre-scans for user function names
(§5) and calls `parseBlock(0, 0)`.

### 2.1 `parseBlock(start, minIndent)` (~L1464)

Indentation-nested, **not** bracketed:

```ebnf
block(minIndent) = { statement_at(minIndent) }
statement_at(I)  = LINE(indent = I) [ block(I + 1) ]   (* deeper lines become .body *)
```

Algorithm: iterate lines with `indent >= minIndent`; lines with `indent > minIndent`
are skipped at this level (~L1468, grabbed as a child block); for a line at exactly
`minIndent`, `parseLine` is called, then **any** immediately-following lines with
`indent > minIndent` are collected and, if non-empty, parsed as `block(minIndent + 1)`
and attached as `stmt.body` (~L1473–1479).

**[QUIRK]** Children are gathered by "indent strictly greater than the parent's
`minIndent`", and the recursive call uses `minIndent + 1`. A grandchild indented two
levels deeper than its grandparent but appearing under a child is handled by the inner
`parseBlock`, but a line that jumps from level 0 to level 2 (skipping level 1) is still
collected as a child of the level-0 statement and re-leveled at `minIndent+1=1` — over-
indentation is **tolerated and normalized**, not an error.

**[QUIRK]** A statement's `body` is only set when `children.length > 0`. Most block
statement nodes (`if`, `repeat_*`, `each`, `every`, `forever`, `when_*`, `funcdef`)
are emitted by `parseLine` with `body: []` and then *overwritten* by `parseBlock`; their
optional **inline** statement (e.g. `if x is 1 say "hi"`) is carried separately in
`thenStmt`/`stmt`, independent of `body`.

---

## 3. Statement dispatch — `parseLine` (~L1486), PRIORITY ORDER

`parseLine(tokens, lineNum)` is a long keyword-dispatch if-ladder on `first = tv(raw[0])`
(plus some scans). **Order matters**: the first matching arm wins; anything matching none
falls through to the generic `call`. Listed here in exact source order.

```ebnf
statement =
   chain                              (* §6: splitOnAnd FIRST, before any keyword *)
 | 'to' ('screen' WORD | NAME {param})            (* funcdef, ~L1515 *)
 | 'sprite' STRING ... STRING                      (* def_sprite, ~L1531 *)
 | 'song' STRING [NUMBER 'bpm'] {STRING}           (* def_song, ~L1538 *)
 | 'define' 'sound' STRING 'as' sound_recipe       (* def_sfx, ~L1546 *)
 | 'go' ('back' | 'to' TARGET)                     (* goback / goto, ~L1571 *)
 | 'follow' TARGET ... 'camera'                    (* follow, ~L1579 *)
 | 'run' 'game' [ 'with' ] {WORD}                  (* rungame, ~L1584 *)
 | 'when' when_event                               (* §4, ~L1595 *)
 | 'if' if_stmt                                     (* §7, ~L1600 *)
 | 'else' [ 'if' if_stmt | inline_stmt ]            (* else / else_if, ~L1605 *)
 | 'repeat' repeat_form                             (* §3.1, ~L1618 *)
 | 'each' each_form                                 (* §3.1, ~L1623 *)
 | 'forever'                                        (* ~L1628 *)
 | 'every' NUMBER ['seconds'|'frames']              (* ~L1633 *)
 | 'jump' [TARGET] [NUMBER]                         (* ~L1639 *)
 | 'join' 'game' STRING ['room' STRING]             (* net_join, ~L1647 *)
 | 'broadcast' expression                           (* ~L1655 *)
 | 'stop'  (alone)                                  (* stop, ~L1660 *)
 | 'return' [ expression ]                          (* ~L1665 *)
 | 'move' TARGET 'with' 'arrows' ['speed' expr]     (* move_with_arrows, ~L1672 *)
 | 'move' TARGET 'by' expr [',' expr] ['blocked' 'by' LIST]  (* move_by, ~L1682 *)
 | 'clear' 'screen' ['to'] COLOR_WORDS              (* clearscreen, ~L1694 *)
 | 'clear' REF                                      (* clear, ~L1700 *)
 | 'draw' draw_form                                 (* parseDraw, ~L1705 *)
 | 'write' ...                                      (* parseWrite, ~L1710 *)
 | 'say' ...                                        (* parseSay, ~L1715 *)
 | 'show' 'button' ...                              (* parseButton, ~L1720 *)
 | 'show' 'meter' ...                               (* parseMeter, ~L1725 *)
 | 'add' add_form                                   (* parseAdd, ~L1730 *)
 | 'remove' remove_form                             (* parseRemove, ~L1735 *)
 | 'toggle' REF                                     (* ~L1740 *)
 | 'double' REF | 'halve' REF                       (* ~L1745 *)
 | 'reverse' REF                                    (* desugars to REF is 0 - REF, ~L1753 *)
 | 'pset' ...                                       (* parsePset, ~L1760 *)
 | PROBABILITY_PHRASE statement                     (* §3.2, ~L1765 *)
 | SUBJECT 'are' TAG                                (* tag, ~L1781 *)
 | ('restore'|'block') [REF]                        (* restore, ~L1789 *)
 | 'knock' TARGET 'away' 'from' SRC ['distance' expr](* parseKnock, ~L1795 *)
 | 'walk' TARGET ('toward' NAME | up|down|left|right)(* ~L1800 *)
 | 'stop' ['walking'] TARGET                        (* stop_walking, ~L1812 *)
 | 'face' TARGET ('toward' NAME | up|down|left|right)(* ~L1821 *)
 | 'damage' [TARGET] [expr]                         (* ~L1835 *)
 | 'heal' [TARGET] [expr]                           (* ~L1842 *)
 | REF 'is' expression                              (* assign, ~L1849 *)
 | 'play' ['music'|'sound'] NAME                    (* play_sound, ~L1857 *)
 | 'stop' ('music'|'sound')                         (* stop_music, ~L1868 *)
 | WORD { token }                                   (* FALLBACK call, ~L1873 *)
```

**[QUIRK] Dispatch-order hazards** (the highest-value freeze targets after §7/§6):

- `chain` (and-splitting) runs **before** any keyword arm (~L1509). So a line is split on
  `and` first, then each part re-enters `parseLine`. See §6 for what counts as a split.
- The bare-`stop` arm (~L1660, `raw.length === 1`) precedes `stop walking`/`stop music`;
  multi-token `stop X` reaches the later `stop_walking` arm (~L1812). `stop music`/
  `stop sound` is matched even later (~L1868) — but only AFTER the `REF is expr` assign
  arm. Because `stop` is not `is`-bearing, ordering is safe here.
- `clear screen` (~L1694) precedes generic `clear` (~L1700).
- `'are'` tag detection (~L1781) is a `findWord('are')` scan with `areIdx > 0`, so it
  fires for ANY line containing the word `are` not at index 0 with something after it
  (e.g. `trees are solid`). **[QUIRK]** This is positional, not anchored to `first`.
- The `REF is expression` assignment arm (~L1849) is also a `findWord('is')` scan — the
  first `is` at index `>0` with a value after it. Any earlier keyword arm that matched
  prevents reaching it; otherwise `X is Y` is an assignment. This interacts heavily with
  the `if` inline-split heuristic (§7).
- **FALLBACK** (~L1873): an unrecognized line becomes
  `{ type:'call', name: first, args: raw.slice(1) }`. The args are **raw tokens**, not a
  parsed expression. Unknown verbs are thus parsed (never a syntax error) and resolved —
  or silently no-op'd — at runtime (see `SEMANTICS.md`).

### 3.1 Loop forms

```ebnf
repeat_form = NUMBER-or-expr 'times'                 (* repeat_times, ~L2557 *)
            | 'with' WORD 'from' expr 'to' expr      (* repeat_range, ~L2562 *)
            | 'while' condition                      (* repeat_while, ~L2572 *)
            | 'until' condition                      (* repeat_until, ~L2575 *)
            | (* bare *)                             (* => forever, ~L2579 *)

each_form   = NAME 'in' expr [ 'where' condition ] [ inline_stmt ]   (* ~L2582 *)
```
**[QUIRK]** `repeat` decides by scanning for the word `times`/`with`/`while`/`until`;
a bare `repeat` (or any unmatched form) silently degrades to `forever` (~L2579).
**[QUIRK]** In `each`, the loop var name is `raw[1..inIdx]` joined by spaces (multi-word
allowed), and the list expression ends at the first **command word** (`isCommandWord`,
§6) found at/after `inIdx+2`; tokens from there on are an inline statement (~L2588–2602).
`where` must appear before that command-word boundary to be recognized as a filter.

### 3.2 Probability prefixes (~L1765, table `PROBABILITY` ~L1120)

```ebnf
PROBABILITY_PHRASE = 'always' | 'almost certainly' | 'very likely' | 'highly likely'
   | 'likely' | 'probably' | 'probable' | 'better than even' | 'maybe' | 'even chance'
   | 'about even' | 'probably not' | 'unlikely' | 'we doubt' | 'little chance'
   | 'chances are slight' | 'improbable' | 'highly unlikely' | 'rarely'
   | 'almost never' | 'almost no chance' | 'never'
```
Multi-word phrases are matched word-by-word against the head of the line (~L1766–1772);
on match the remainder re-enters `parseLine` as the guarded statement. **[QUIRK]** The
table is iterated via `Object.entries` order; phrases are not sorted by length, but each
is matched as an exact prefix of its own length so there is no longest-match contest —
the first table entry that prefix-matches wins.

---

## 4. `when` event handlers — `parseWhen` (~L1928)

Each form may carry an optional **inline action** (the tail after the recognized prefix,
re-parsed via `parseLine`), and additionally a `body` block via §2.

```ebnf
when_event =
   STRING 'is' 'pressed'           [inline]          (* when_key, ~L1932 *)
 | 'key' STRING 'is' 'pressed'     [inline]          (* when_key, ~L1937 *)
 | 'key' 'is' 'in' list_literal    [inline]          (* when_key_in, ~L1942 *)
 | 'mouse' WORD WORD               [inline]          (* when_mouse, event=tv(rest[2]), ~L1947 *)
 | 'button' STRING 'is' 'clicked'  [inline]          (* when_button, ~L1953 *)
 | TARGET 'picks' 'up' ['any'] NAME [inline]         (* when_pickup, ~L1960 *)
 | TARGET 'hits' ['any'] NAME      [inline]          (* when_hit, ~L1971 *)
 | NAME 'is' 'defeated'            [inline]          (* when_defeat, ~L1981 *)
 | (anything else)                                   (* when_generic: keeps raw tokens, ~L1987 *)
```
**[QUIRK]** `picks up` / `hits` are located by scanning (`findIndex`), not by fixed
position, so the subject before them is ignored for matching (the engine assumes
`player`). `when_generic` never errors — it stores the unparsed `rest` tokens and is
interpreted at runtime.

---

## 5. User-function pre-scan (~L1452)

Before parsing, `parse` collects user function names into `userFuncs`:
- `to screen X` ⇒ `screen_<x.lowercased>` (~L1457).
- `to NAME ...` ⇒ `NAME.lowercased` when `raw[1].value` is a string (~L1459).

These names are then treated as **command words** by `isCommandWord` (§6), so a call to a
user function terminates a condition / list the same way a built-in verb does (the comment
at ~L1448 gives the motivating example `if mode is "play" shoot`). **[QUIRK]** This is a
whole-program pre-pass; forward references in *parsing* work even though forward references
at *runtime* may not (functions register at exec time — see `SEMANTICS.md`).

---

## 6. `and`-chaining — `splitOnAnd` (~L1889)  **[HIGH DIVERGENCE]**

`splitOnAnd` runs at the very top of `parseLine` (~L1509). If it yields >1 part, the line
becomes `{ type:'chain', parts: [...parseLine(part)] }`.

Rules:
1. If `first` ∈ {`run`, `when`, `to`} → **never split** (return whole line) (~L1893).
2. Track `inBetween`: set true on the word `between`; the **next** `and` while `inBetween`
   is consumed as part of the range (`between X and Y`) and clears the flag (~L1901–1902).
3. An `and` that is **not** in a between-range, with a non-empty current part, splits the
   line **only if** the following token is a `word` AND `isCommandWord(next)` is true
   (~L1903–1910). Otherwise `and` is kept inside the current part.

```ebnf
chain = statement { 'and' statement }    (* split only at command-word boundaries *)
```

`isCommandWord(w)` (~L1918) = `w ∈ userFuncs` (§5) OR `w` is one of the built-in verbs:
`draw write say add remove clear toggle play move flash shake stop start show hide emit
double halve damage heal push pull set put get load save pset reverse spawn jump join
broadcast if repeat each every return restore block knock follow when else to go face walk`.

**[QUIRK]** This means `and` only chains statements when the right side *starts with* a
recognized command word. `score is 5 and lives is 3` does **not** split (next token after
`and` is `lives`, a bare word, not a command word) — it stays one line and the later
`is`/`are` scans act on the whole thing, almost certainly mis-parsing it. The idiomatic
two-statement form requires the second to begin with a verb, e.g.
`add 1 to score and play "ding"`.

### 6.1 Candidate stress cases (freeze these in corpus)

| Input | Expected split |
|---|---|
| `add 1 to score and play "ding"` | 2 parts: `add 1 to score`, `play "ding"` |
| `if x is between 1 and 10 say "hi"` | NOT split on the between-`and`; `if` arm handles it (first==`if` is not in the no-split set, but the only `and` is consumed by `between`) |
| `move player by 1, 0 and shoot` | 2 parts (`shoot` is a userFunc command word *iff* defined; else NOT split — bare word) **[QUIRK]** |
| `score is 5 and lives is 3` | NOT split (next after `and` = `lives`, not a command word) |
| `run game with update and draw` | NOT split (first==`run`) |
| `say "a and b"` | NOT split (`and` is inside a string token, never seen as a word) |
| `heal player and damage enemy` | 2 parts (`damage` is a command word) |

---

## 7. `if` inline-statement split — `parseIf` (~L2017)  **[HIGHEST DIVERGENCE]**

`if` lines may inline a statement after the condition: `if mode is "play" shoot`,
`if e.x > 118 hit is yes`. There is no delimiter; `parseIf` runs a **heuristic scan** to
find `condEnd`, the index where the condition stops and the inline statement starts.
`condition = parseCondition(raw[1..condEnd])`; `thenStmt = parseLine(raw[condEnd..])` if
`condEnd < raw.length` (~L2070–2071). The block `body` (deeper-indented lines) is filled
later by §2 and is independent of the inline `thenStmt`.

### 7.1 The `seenCompare` algorithm (~L2024–2069)

State: `seenCompare` (bool, reset at clause boundaries). Scan `i` from `1`:

1. **`and` / `or`** (~L2029): reset `seenCompare = false` (a new clause begins), continue.
2. **comparison operator** `> < >= <= !=` (~L2033): set `seenCompare = true`, continue.
3. **`is`** (~L2034):
   - **If `seenCompare`** → this `is` begins an **inline assignment**. Walk back over a
     dotted reference from `i-1` (`while raw[j-1] is dot: j -= 2`) and set `condEnd = j`,
     break (~L2038–2041). I.e. the assignment target is the dotted ref immediately left
     of `is`. Example `if e.x + adir > 118 hit is yes` → cond `e.x+adir>118`, then `hit is yes`.
   - **If NOT `seenCompare`** → ambiguous. Compute the target span `ts` by walking back
     over a dotted ref from `i-1` (~L2051–2052). Look at `pre = raw[ts-1]`. Define
     `continuesLeft` = `pre` is an `operator` OR `dot` OR a word ∈ {`of`,`mod`,`and`,`or`}
     (~L2053–2055). Then:
     - If `ts > 1` AND `raw[ts]` is a `word` AND `pre` exists AND `not continuesLeft`
       → treat as **inline assignment with a bare-boolean condition**: `condEnd = ts`,
       break. Example `if ready done is yes` → cond `ready`, then `done is yes` (~L2056–2059).
     - Else → this `is` is the **condition's own comparison**; set `seenCompare = true`,
       continue (~L2060–2061). Example `if mode is "play" shoot`, `if the number of peers is 5 ...`.
4. **command word** (`isCommandWord`, §6) (~L2063): if the previous token is a word ∈
   {`is`,`not`,`and`,`or`,`in`,`between`} it's part of the condition — continue (~L2065);
   otherwise `condEnd = i`, break. This is how `if mode is "play" shoot` ends: `shoot`
   (a command word) with `pre = "play"` (a string, not in the continuation set) → split.

If the scan reaches end-of-line, `condEnd = raw.length` (no inline statement).

**[QUIRK]** The dotted-ref walk-back uses `j - 1 >= 2` / `ts - 1 >= 2`, i.e. it refuses to
walk before token index 2 (it assumes index 0 is `if` and 1 is the start of the condition).
**[QUIRK]** Only **one** comparison per clause is assumed; the heuristic cannot model a
condition like `if a is b is c`. **[QUIRK]** The "bare-boolean condition + inline assign"
case (3b-i) is what lets `if alive done is yes` work, but it is fragile: it hinges entirely
on whether the token *before the assignment target* looks like a left-operand continuation.

### 7.2 `else` / `else if` (~L1605)

```ebnf
else_stmt = 'else' 'if' if_stmt        (* else_if: borrows inner if's cond/then/body *)
          | 'else' inline_stmt          (* else with inline thenStmt *)
          | 'else'                       (* else with empty inline; body via §2 *)
```
`else if` re-parses `raw.slice(1)` through `parseIf` and lifts its `condition`/`thenStmt`/
`body` (~L1607). (Runtime linkage of else/else-if to the preceding if is a **semantics**
concern — and famously nesting-dependent; see `SEMANTICS.md`.)

### 7.3 Candidate stress cases (freeze these in corpus)

| Input | cond | inline then |
|---|---|---|
| `if mode is "play" shoot` | `mode is "play"` | `shoot` (command word ends cond) |
| `if e.x > 118 hit is yes` | `e.x > 118` | `hit is yes` (seenCompare→next `is` splits) |
| `if e.x + adir > 118 hit is yes` | `e.x+adir > 118` | `hit is yes` |
| `if ready done is yes` | `ready` (bare bool) | `done is yes` (3b-i: `pre`=`ready`, word, not continuation) |
| `if the number of peers is 5 win` | `the number of peers is 5` | `win` (`pre` before `5`'s target = `of`, continuesLeft → cond keeps `is`) |
| `if a + b is 5 stop` | `a + b is 5` | `stop` (`pre`=`+` operator, continuesLeft) |
| `if x is 1 and y is 2 jump` | `x is 1 and y is 2` | `jump` (and resets seenCompare; both `is` are comparisons) |
| `if x is 1 score is 2` | `x is 1` | `score is 2` (first `is`→seenCompare; 2nd `is` splits) |
| `if player.hp < 1 player.dead is yes` | `player.hp < 1` | `player.dead is yes` (walk back over dotted ref) |
| `if no enemies win` | `not(enemies)` | `win` (command word; `pre`=`enemies`) |

---

## 8. Expression grammar — `parseExpression` (~L2186)

Recursive, **right-to-left split** (NOT Pratt; the comments at ~L2280, ~L2295 note the
result matches a precedence parser). Precedence, lowest→highest, by scanning for the
**rightmost** matching operator first (which yields left-associative trees):

```ebnf
expression = additive
additive   = multiplicative { ('+' | '-') multiplicative }     (* split rightmost +/-, ~L2282 *)
multiplicative = unary { ('*' | '/' | 'mod') unary }           (* split rightmost, ~L2288 *)
unary      = '-' atom                                          (* leading only, ~L2298 *)
           | atom
```

Resolution order inside `parseExpression`:
1. length 0 → `literal 0`; length 1 → atom (number/string `literal`, `yes`→true,
   `no`→false, else `ref name`) (~L2187–2194).
2. `[` … → list literal (§8.2) (~L2198).
3. `{` … → object literal (§8.3) (~L2203).
4. `random` expr → `{type:'random', max}` (~L2208).
5. `list of <count> [noun] [{props}]` → `list_of_sprites` (~L2213). **[QUIRK]** count is
   only `tokens[2]` (a *single* token; multi-token counts not yet supported, per the
   inline comment ~L2219).
6. `centered sprite [{props}]` → `sprite_expr position='centered'` (~L2229).
7. `sprite [{props}]` (when `tokens.length===1` or `tokens[1]` is `{`) → `sprite_expr
   position='zero'` (~L2239).
8. **Postfix dotted access** `a.b.c` (when `tokens[1]` is a `dot`) → fold the dotted name
   into one `ref` `"a.b.c"`; if more tokens follow the chain, rebuild `[word(ref), ...rest]`
   and recurse (so `player.x + 1` works) (~L2249–2259).
9. `item N of LIST` → `item_of {index, list}` (~L2263), `of` located by scan.
10. `the number of X` (~L2271) and `count of X` (~L2275) → `count {expr}`.
11. additive split (rightmost `+`/`-`, index ≥ 1) (~L2282).
12. multiplicative split (rightmost `*`/`/`/`mod`; `mod`→op `%`) (~L2288).
13. leading unary `-` (~L2298) — reached only when no binary `+`/`-` split applied
    (because that scan skips index 0). Desugars to `0 - atom`.
14. leading `string` token → `literal` (~L2304).
15. fallback: join all token values with spaces as one `ref` name (~L2309).

**[QUIRK]** Because additive/multiplicative scan from the **right** and require index ≥ 1,
a leading `-` is not consumed as a binary operator, so `-4 + 10` splits at `+` first
(value semantics in `SEMANTICS.md`) while a lone `-X` hits rule 13. **[QUIRK]** There are
**no parentheses in the expression grammar** — `lparen`/`rparen` tokens are not handled by
`parseExpression` at all; they fall through to the join-as-ref fallback (rule 15). Grouping
must be expressed by statement structure, not `( )`.

### 8.1 Atoms

```ebnf
atom = NUMBER | STRING | 'yes' | 'no'
     | ref                                   (* WORD, or dotted WORD{.WORD} *)
     | 'random' expression
     | 'item' expression 'of' expression
     | 'the' 'number' 'of' expression
     | 'count' 'of' expression
     | 'list' 'of' COUNT [NOUN] [ object_literal ]
     | 'centered' 'sprite' [ object_literal ]
     | 'sprite' [ object_literal ]
     | list_literal | object_literal
```
`yes`/`no` are only recognized as booleans in the **single-token** path (rule 1, ~L2192);
embedded in a larger expression they are plain refs.

### 8.2 List literal — `parseListFromTokens` (~L2159)

```ebnf
list_literal = '[' [ expression { ',' expression } ] ']'
```
Depth-aware comma split honoring nested `[`/`{` (~L2166–2179). Result `listliteral{items}`.
A non-`[` token list falls back to a single `parseExpression`.

### 8.3 Object literal — `parseObjectLiteral` (~L2312)

```ebnf
object_literal = '{' [ pair { ',' pair } ] '}'
pair           = KEY [ ':' ] expression       (* ':' is optional/rarely tokenized *)
```
Key is the raw token value; an optional `:` is skipped if present (~L2322 — note `:` is a
single unknown char that the lexer drops per §1.6, hence "rarely tokenized"). Each value is
parsed to depth 0 (next top-level `,` or `}`) and stored as an expression in
`object_expr.props` (evaluated lazily at runtime).

### 8.4 `tokensToRef` (~L2341)

Assignment/clear/toggle targets are flattened to a dotted string by concatenating token
values with `.` for `dot` tokens and bare-join otherwise (so `player . x` → `"player.x"`,
and `player x` → `"playerx"`). **[QUIRK]** Spaces between words are lost in ref targets.

---

## 9. Condition grammar — `parseCondition` (~L2075)

Used by `if`, `else if`, `repeat while/until`, `each ... where`. Distinct from
`parseExpression`: it understands comparisons, logical operators, ranges, membership, and
truthiness. Resolution order:

```ebnf
condition =
   'key' STRING { 'is'|'held'|'pressed'|'down'|'being' }   (* key_pressed, ~L2080 *)
 | 'not' condition                                          (* ~L2088 *)
 | 'no' expression                                          (* not(expr), ~L2093 *)
 | condition 'or' condition                                 (* leftmost split? see below, ~L2098 *)
 | condition 'and' condition                                (* ~L2103 *)
 | expression 'is'? 'between' expression 'and' expression   (* between, ~L2110 *)
 | expression 'is' 'not' 'in' list                          (* not(in), ~L2127 *)
 | expression 'is' 'not' expression                         (* neq, ~L2131 *)
 | expression 'is' 'in' list                                (* in, ~L2133 *)
 | expression 'is' expression                               (* eq, ~L2137 *)
 | expression ('>'|'<'|'>='|'<='|'!=') expression           (* cmp, ~L2143 *)
 | expression 'has' expression                              (* has/contains, ~L2150 *)
 | expression                                               (* truthiness, ~L2156 *)
```

**[QUIRK]** Logical operators bind **looser** than comparisons (split first), and `or` is
checked **before** `and` (~L2098 vs ~L2103), so `or` binds looser than `and`. Both split on
the **first** (leftmost) occurrence found (forward `for` loop, `i` from 1), making them
**right-grouping** when chained: `a or b or c` → `or(a, or(b, c))`. **[QUIRK]** Comparisons
(`is`, `cmp`, `between`, `in`, `has`) split on the **first** match too; only one comparison
per clause is modeled — chained comparisons are not supported (and §7 relies on this).
**[QUIRK]** `between` reads its left operand as `tokens[0..i-1]` (~L2112), i.e. it assumes
the token immediately before `between` is `is` and drops it; `X is between A and B`.
**[QUIRK]** `key STRING ...` only matches if every trailing word is in
{`is`,`held`,`pressed`,`down`,`being`}; any other trailing token disqualifies it and it
falls through to ordinary comparison/expression handling.

`parseListFromTokens` (§8.2) supplies the list operand for `in`/`not in`.

---

## 10. Freezing note

This grammar is the union of these functions' present behavior:
`tokenizeLine, parse, parseBlock, parseLine, splitOnAnd, isCommandWord, parseWhen,
parseIf, parseCondition, parseExpression, parseListFromTokens, parseObjectLiteral,
parseRepeat, parseEach, tokensToRef` and the keyword sub-parsers (`parseDraw`,
`parseWrite`, `parseSay`, `parseButton`, `parseMeter`, `parseAdd`, `parseRemove`,
`parseKnock`, `parsePset`). The heuristic sections (§6 `splitOnAnd`, §7 `parseIf`) and the
positional scans in §3 are where a Rust re-implementation is most likely to diverge; the
stress tables in §6.1 and §7.3 are seed cases for `spec/corpus/`. Any behavioral change
to the above functions is a grammar change and must update both this file and the golden
conformance suite **together**.

---

## 11. Additions after the line-cited pass (2026-09)

Statement and condition forms that shipped after this document's last edit. Every
row is frozen by the corpus program in the last column — that program, not this
prose, is the contract. (JS implementation: `index.html`'s `parseLine` +
`parseCondition`; Rust: `spec/port/spike/src/lib.rs` `parse_line` / `parse_cond`,
differentially tested against it.)

| Form | Production | Frozen by |
|---|---|---|
| `time limit is` expr [`seconds`\|`frames`] | optional match countdown (`Stmt::TimeLimit` / `time_limit`); seconds = ×60 frames | `time_limit_static.fc`, `frame-tests/f_timer.fc` |
| `when time runs out` | timeout handler, fires once at the crossing frame | `frame-tests/f_timer.fc` |
| `increase` REF [`by` expr] \| `decrease` REF [`by` expr] | desugars to `add`/`remove` (default 1) | `english_ops.fc` |
| SUBJECT (`chases`\|`chase`) TARGET [`speed` expr] [`through walls`] | set-once chase behavior | `behaviors_register.fc`, `behavior_list_subject.fc` |
| SUBJECT (`wanders`\|`wander`) \| (`patrols`\|`patrol`) `between` A `and` B | set-once wander / patrol | `behaviors_register.fc` |
| SUBJECT (`flees`\|`flee`) `from` TARGET [`speed` N] [`when` `within` N] | set-once flee, optionally only inside a radius | `flee_patrol.fc`, `frame-tests/f_flee.fc` |
| SUBJECT (`shoots`\|`shoot`) [`at` TARGET] [`every` N [`seconds`\|`frames`]] [`speed` S] | set-once shooter: spawns a shot into `SUBJECT.shots` on a cooldown | `shoot_forms.fc`, `frame-tests/f_shoot.fc` |
| `when player talks to` STRING [`npc`] STRING | talk handler: fires once per talk-key press while the player overlaps a sprite that carries the tag (or is named) STRING | `dialogue_forms.fc`, `frame-tests/f_talk.fc` |
| `show dialog` STRING [`at` X `,` Y] | sets `dialog` and shows a persistent message box | `dialogue_forms.fc`, `frame-tests/f_talk.fc` |
| `show choice` STRING … [`at` X `,` Y] | draws choice buttons (reusing the button hit-test) and keeps `choice` in sync | `dialogue_forms.fc`, `frame-tests/f_talk.fc` |
| SUBJECT (`patrols`\|`patrol`) `along` `[` `{x, y}` … `]` | waypoint patrol (moves to each point in turn) | `flee_patrol.fc`, `frame-tests/f_flee.fc` |
| `animate` NAME `with` STRING … [`every` N `frames`] | frame cycling on the global tick | `animate_and_burst.fc` |
| `burst` expr [WORD] `at` expr [`,` expr] [`in` COLOR] | particle burst (pool cap 400) | `animate_and_burst.fc` |
| `tile` STRING `is` OBJECT | tile type definition | `map_dims_and_solid.fc` |
| `map is grid` W `by` H `of tiles` STRING \| `map is` indented rows | tilemap construction | `map_dims_and_solid.fc`, `map_without_tiles.fc` |
| `map at` expr `,` expr `is` STRING | set one cell | `map_without_tiles.fc` |
| `draw map` | draw the tilemap, camera-aware | `map_dims_and_solid.fc` |
| `is solid at` expr `,` expr | condition: solid cell (blocks movement) | `map_dims_and_solid.fc` |
| `with` WORD … (block) + `its` FIELD | factor out a repeated subject; `its` rewrites to the subject's field | `with_its.fc` |
| `X is in` `[` … `]` \| `X is not in` `[` … `]` | list membership (JS `Array.includes`: STRICT equality) | `list_membership.fc` |
| `X is more/greater than` Y · `is less/fewer than` · `is under/below` · `is over/above` · `is at least` · `is at most` | comparison words (`collapse_cmp`), rewritten to `>` `<` `>=` `<=` before parsing | `english_ops.fc` |
| `say` STRING \| `say` expr | appends an interpolated line to the say buffer (host paints it only without a game loop) | `say_lines.fc` |
| `stop music` \| `stop sound` | one node (`stop_music`); the host stops the looping track. **[QUIRK]** checked BEFORE the sprite form `stop X`, which would otherwise swallow `music`/`sound` as a target name | `stop_music.fc` |
| `flash screen` [COLOR] [`for` N [`seconds`\|`frames`]] | host-rendered full-screen flash, frame-counted (default: white, 6 frames) | `flash_shake.fc`, `frame-tests/f_effects.fc` |
| `shake camera` [`for` N [`seconds`\|`frames`]] [`by` N [`pixels`]] | host-rendered screen jitter, frame-counted (default: 12 frames, 2px) | `flash_shake.fc`, `frame-tests/f_effects.fc` |
| `emit` [N] WORD [`rising`\|`falling`] (`at` X `,` Y \| `from` REF) [`in` COLOR] [`for` N [`seconds`\|`frames`]] | sustained particle emitter (default: 2/frame for 30 frames, `orange`) | `emit_forms.fc`, `frame-tests/f_emit.fc` |
| `tween` REF `from` expr `to` expr `over` N [`seconds`\|`frames`] [`ease` [`in`\|`out`\|`in out`\|`bounce`]] | frame-counted property interpolation on a dotted target | `tween_forms.fc`, `frame-tests/f_tween.fc` |
| `SUBJECT has inventory` | ensures `SUBJECT.inventory` exists (an ordinary fc list) | `inventory_forms.fc` |
| `add` ITEM `to` SUBJECT `inventory` \| `remove` ITEM `from` SUBJECT `inventory` | adds (one entry per distinct item) / removes | `inventory_forms.fc` |
| SUBJECT `has` ITEM `in inventory` (condition) | membership test, strict equality | `inventory_forms.fc` |
| `pset` … | direct pixel write (wasm port followed later) | `draw-tests/` (see README) |
| `show meter` CURRENT `of` MAX [`at` X `,` Y] [`size` W `,` H] [`in` COLOR] | HUD meter; all three shapes parse (index-scan parser) | `meter_forms.fc`, `draw-tests/d_meter.fc` |

**Dynamic colors (implemented 2026-09-29).** Everywhere a color word is accepted
(`clear screen to`, `draw … in`, `pset … in`, `write … in`, `show meter … in`,
`burst … in`), the word resolves to the palette/CSS name — UNLESS a variable of that
name exists, in which case that variable's value names the color:

```
shade is green            -- a variable holding a color name
draw rect at 10, 10 size 8, 8 in shade
red is blue               -- a variable that shadows a palette name WINS
```

An unrecognized string value falls back to the default white. A non-string variable
does not shadow a literal palette word; for example, `yellow is 4` still paints
yellow when a draw uses `in yellow`. A two-word name (`dark gray`) can never be a
variable, so it always stays a palette lookup. Frozen by `draw-tests/d_dyncolor.fc`
(JS↔wasm draw-op parity) and the idle parity of starfield / matrix / sand.
