# parseLine dispatch ladder (index.html L1486-1873)

`parseLine(tokens, lineNum)` classifies a single statement line. It builds:
- `words = tokens.map(t => t.value)` (unused below except conceptually)
- `raw = tokens`
- `first = raw[0] ? tv(raw[0]) : ''` — lowercased value of the first token (`tv` lowercases word values; see lexer)

Helpers defined inside parseLine:
- `findWord(w, startIdx=0)` — first index `>= startIdx` where token is a `word` and `tv === w.toLowerCase()`, else `-1`.
- `findAnyWord(ws, startIdx=0)` — first index where token is a `word` and `ws.includes(tv(...))`, else `-1`.

External helpers used:
- `tokensToRef(tokens)` (L2341): join token values into a dotted/path string; a `dot` token contributes `'.'`, every other token contributes `t.value` (NOT `tv`, so original case/value), joined with `''`. So `player.x` -> `"player.x"`; `score` -> `"score"`. Note: words separated by spaces but no dot get concatenated with NO separator (e.g. `score is` subject -> `"scoreis"`).
- `parseExpression(tokens)` (L2186): produces expression nodes (`literal`, `ref`, `math`, etc.).
- `tv(t)`: lowercased token value.

The ladder is a sequence of `if` checks in source order. The FIRST match returns. **Order matters** — see dependency notes. Below: each rung in exact order, its trigger, and the node produced. All nodes carry `lineNum`.

---

## 0. AND-chaining (L1509-1512) — runs FIRST, before any keyword check
- `andParts = splitOnAnd(raw)` (L1889). If `andParts.length > 1`:
  - `{ type:'chain', parts: andParts.map(p => parseLine(p, lineNum)), lineNum }`
- Recurses parseLine on each part. `splitOnAnd` only splits at `and` tokens that sit at a command-word boundary (see `isCommandWord` L1918), so `between X and Y` is NOT split.
- DEPENDENCY: must precede everything; a chained line is dispatched per-part.

## 1. `to` — function definition (L1515-1528)
- `first === 'to'`:
  - If `raw.length >= 3 && tv(raw[1]) === 'screen'`: `{ type:'funcdef', name:'screen_'+raw[2].value, params:[], body:[], lineNum }` (note `raw[2].value`, not tv).
  - Else: `name = raw[1] ? raw[1].value : 'unknown'`; `params` = each `raw[i].value` for `i>=2` where token is a `word` and `tv !== 'at'` and `tv !== 'with'`. `{ type:'funcdef', name, params, body:[], lineNum }`.

## 2. `sprite "name" ... "<hex>"` — def_sprite (L1531-1535)
- `first === 'sprite' && raw[1] && raw[1].type === 'string'`:
  - `hexTok` = first string token at idx `>= 2`. `{ type:'def_sprite', name: raw[1].value, hex: hexTok ? String(hexTok.value).toLowerCase() : '', lineNum }`.

## 3. `song "name" at N bpm "row"...` — def_song (L1538-1543)
- `first === 'song' && raw[1] && raw[1].type === 'string'`:
  - `bpmTok` = first `number` token. `rows` = string tokens at idx `>= 2` (.value). `{ type:'def_song', name: raw[1].value, tempo: bpmTok ? Number(bpmTok.value) : 120, rows, lineNum }`.

## 4. `define sound "name" as ...` — def_sfx (L1546-1568)
- `first === 'define' && tv(raw[1]) === 'sound' && raw[2] && raw[2].type === 'string'`:
  - `asIdx = findWord('as')`; `rest = raw.slice(asIdx>=0 ? asIdx+1 : 3)`.
  - `overI` = index in `rest` of word `over`; `dur` = `Number(rest[overI+1])` if present else `0.15`.
  - `w0 = rest[0] ? tv(rest[0]) : 'square'`.
  - If `w0 === 'notes'`: recipe `{ kind:'notes', notes:[numbers in rest[1..end]], dur }` (end = overI if >=0 else rest.length).
  - Else: `wave` = w0 if in `['square','sine','triangle','sawtooth','noise']` else `'square'`; `from`/`to` indices give `f0` (default 440) and `f1` (default null); if no `from`, first number -> f0. recipe `{ kind:'tone', wave, f0, f1, dur }`.
  - `{ type:'def_sfx', name: raw[2].value, recipe, lineNum }`.

## 5. `go to X` / `go back` (L1571-1576)
- `first === 'go' && raw.length >= 2`:
  - `tv(raw[1]) === 'back'` -> `{ type:'goback', lineNum }`.
  - `tv(raw[1]) === 'to' && raw.length >= 3` -> `{ type:'goto', target: raw[2].value, lineNum }`.
  - NOTE: if neither sub-condition matches (e.g. `go fast`), this `if` falls through (no return) and the line eventually hits the fallback `call` node. Verified: `go fast` -> `{type:'call',name:'go',...}`.

## 6. `follow X with camera` (L1579-1581)
- `first === 'follow' && raw.length >= 4 && tv(raw[last]) === 'camera'` -> `{ type:'follow', target: raw[1].value, lineNum }`.

## 7. `run game with ...` (L1584-1592)
- `first === 'run' && raw.length >= 2 && tv(raw[1]) === 'game'`:
  - `funcs` = `raw[i].value` for `i>=2` where token is `word` and `tv` not in `['with','and']`. `{ type:'rungame', funcs, lineNum }`.
  - (Verified `run game with update and draw` -> funcs `["update","draw"]`.)

## 8. `when ...` (L1595-1597) -> `parseWhen(raw, lineNum)` (see parseWhen L1928).

## 9. `if ...` (L1600-1601) -> `parseIf(raw, lineNum)` (see parseIf L2017).

## 10. `else` / `else if` (L1605-1615)
- `first === 'else'`:
  - `raw[1]` is `if`: `inner = parseIf(raw.slice(1),lineNum)`; `{ type:'else_if', condition: inner.condition, thenStmt: inner.thenStmt, body: inner.body, lineNum }`.
  - else `raw.length > 1` (inline): `{ type:'else', thenStmt: parseLine(raw.slice(1), lineNum), lineNum }`.
  - else: `{ type:'else', body:[], lineNum }`.

## 11. `repeat` (L1618-1619) -> `parseRepeat(raw, lineNum)` (L2555).

## 12. `each` (L1623-1624) -> `parseEach(raw, lineNum)` (L2582).

## 13. `forever` (L1628-1630) -> `{ type:'forever', body:[], lineNum }`.

## 14. `every N frames|seconds` (L1633-1636)
- `first === 'every' && raw[1] && raw[1].type === 'number'`:
  - `unit` = `'seconds'` if `raw[2]` is word `seconds`, else `'frames'`. `{ type:'every', n: Number(raw[1].value), unit, body:[], lineNum }`.

## 15. `jump X [by N]` (L1639-1643)
- `first === 'jump'`:
  - `target = raw[1] ? raw[1].value : 'player'`; `numTok` = first number token; `force = numTok ? Number(...) : 4.5`. `{ type:'jump', target, force, lineNum }`.

## 16. `join game "X" room "Y"` — net_join (L1647-1652)
- `first === 'join' && tv(raw[1]) === 'game'`:
  - `strs` = string token values; `game = strs[0] || 'fc'`; `room = strs[1] || 'lobby'`. `{ type:'net_join', game, room, lineNum }`.

## 17. `broadcast EXPR` (L1655-1657)
- `first === 'broadcast' && raw.length >= 2` -> `{ type:'broadcast', value: parseExpression(raw.slice(1)), lineNum }`.

## 18. `stop` (bare) (L1660-1662)
- `first === 'stop' && raw.length === 1` -> `{ type:'stop', lineNum }`.
- DEPENDENCY: must precede rung 28 (`stop walking X / stop X`) which requires `raw.length >= 2`; the two are disjoint on length so order between them is safe, but this bare-stop must win for a lone `stop`.

## 19. `return [EXPR]` (L1665-1667)
- `first === 'return'` -> `{ type:'return', value: raw.length>1 ? parseExpression(raw.slice(1)) : null, lineNum }`.

## 20. `move X with arrows [speed N]` — move_with_arrows (L1672-1677)
- `first === 'move' && raw.length >= 4 && tv(raw[2]) === 'with' && tv(raw[3]) === 'arrows'`:
  - `target = raw[1].value`; `spIdx` = index of word `speed`; `speed = spIdx>0 ? parseExpression(raw.slice(spIdx+1)) : null`. `{ type:'move_with_arrows', target, speed, lineNum }`.
- DEPENDENCY: must precede rung 21 (`move X by ...`) — both start with `move`; this one is the more specific `with arrows` form.

## 21. `move X by DX, DY [blocked by WALLS]` — move_by (L1682-1691)
- `first === 'move' && raw.length >= 4 && tv(raw[2]) === 'by'`:
  - `bIdx` = index of word `blocked`; `vec = raw.slice(3, bIdx>0 ? bIdx : raw.length)`; `ci` = comma index within `vec`.
  - `dx = parseExpression(ci>=0 ? vec.slice(0,ci) : vec)`; `dy = ci>=0 ? parseExpression(vec.slice(ci+1)) : {type:'literal',value:0}`.
  - `blockedBy = (bIdx>0 && raw[bIdx+2]) ? raw[bIdx+2].value : null` (skips the `by` after `blocked`). `{ type:'move_by', target: raw[1].value, dx, dy, blockedBy, lineNum }`.

## 22. `clear screen to COLOR` — clearscreen (L1694-1697)
- `first === 'clear' && raw.length >= 2 && tv(raw[1]) === 'screen'`:
  - `colorTokens = raw.slice(findIndex(tv===' to')+1)`; `{ type:'clearscreen', color: colorTokens.map(t=>t.value).join(' '), lineNum }`.
- DEPENDENCY: must precede rung 23 (`clear VARIABLE`).

## 23. `clear VARIABLE` — clear (L1700-1702)
- `first === 'clear'` -> `{ type:'clear', target: raw.slice(1).map(t=>t.value).join('.'), lineNum }`. (Joins with `.`; for a single var like `bag` -> `"bag"`.)

## 24. `draw ...` (L1705-1706) -> `parseDraw(raw, lineNum)` (L2361).

## 25. `write ...` (L1710-1711) -> `parseWrite(raw, lineNum)` (L2431).

## 26. `say ...` (L1715-1716) -> `parseSay(raw, lineNum)` (L2530). Produces `{type:'say', text:<expr>, lineNum}`.

## 27. `show button "label" at x, y` (L1720-1721)
- `first === 'show' && raw.length >= 3 && tv(raw[1]) === 'button'` -> `parseButton(raw, lineNum)` (L2469).
- DEPENDENCY: precedes rung 28 (`show meter`).

## 28. `show meter ...` (L1725-1726)
- `first === 'show' && raw.length >= 3 && tv(raw[1]) === 'meter'` -> `parseMeter(raw, lineNum)` (L2487).

## 29. `add ...` (L1730-1731) -> `parseAdd(raw, lineNum)` (L2537). Produces `{type:'add', value:<expr>, target:tokensToRef(...), lineNum}` (`add X to Y`).

## 30. `remove ...` (L1735-1736) -> `parseRemove(raw, lineNum)` (L2546). Produces `{type:'remove', value:<expr>, target:tokensToRef(...), lineNum}` (`remove X from Y`).

## 31. `toggle X` (L1740-1742) -> `{ type:'toggle', target: raw.slice(1).map(t=>t.value).join('.'), lineNum }`.

## 32. `double X` (L1745-1747) -> `{ type:'double', target: raw.slice(1).map(t=>t.value).join('.'), lineNum }`.

## 33. `halve X` (L1748-1750) -> `{ type:'halve', target: raw.slice(1).map(t=>t.value).join('.'), lineNum }`.

## 34. `reverse X` — desugars to assign (L1753-1757)
- `first === 'reverse' && raw.length >= 2`:
  - `refTokens = raw.slice(1)`. `{ type:'assign', target: tokensToRef(refTokens), value: { type:'math', op:'-', left:{type:'literal',value:0}, right: parseExpression(refTokens) }, lineNum }`.
  - i.e. `reverse ball.dx` == `ball.dx is 0 - ball.dx`. Verified.

## 35. `pset x, y in color` (L1760-1761) -> `parsePset(raw, lineNum)` (L2608).

## 36. PROBABILITY phrases (L1765-1777)
- For each `[phrase, prob]` in `PROBABILITY` (object iteration order, see table below), split phrase on spaces into `phraseWords`. If `raw.length >= phraseWords.length` AND `tv(raw[pi]) === phraseWords[pi]` for every pi:
  - `{ type:'probability', prob, stmt: parseLine(raw.slice(phraseWords.length), lineNum), lineNum }`.
- Match is EXACT token-by-token on the leading words; only listed phrases trigger (`maybe`, `probably`, `always`, `never`, `unlikely`, multi-word `almost certainly`, `probably not`, etc.). Unlisted words (e.g. `definitely`) do NOT match and fall through to fallback `call`. Verified.
- PROBABILITY table (L1120): always 1.0, almost certainly 0.95, very likely 0.85, highly likely 0.90, likely 0.70, probably 0.70, probable 0.70, better than even 0.60, maybe 0.50, even chance 0.50, about even 0.50, probably not 0.25, unlikely 0.20, we doubt 0.20, little chance 0.10, chances are slight 0.10, improbable 0.10, highly unlikely 0.05, rarely 0.05, almost never 0.02, almost no chance 0.02, never 0.0.
- GOTCHA: multi-word phrases share prefixes (`probably` vs `probably not`, `almost certainly`/`almost never`/`almost no chance`). Because object-insertion order is iterated, `probably` (0.70) is tested BEFORE `probably not` (0.25): for `probably not say X`, `probably` matches first and `not say X` becomes the inner stmt. A faithful port MUST preserve insertion order of the table to reproduce this.

## 37. `X are TAG` — tag declaration (L1781-1786)
- `areIdx = findWord('are')`. If `areIdx > 0 && areIdx < raw.length - 1`:
  - `subject = raw.slice(0, areIdx).map(t=>t.value).join('')` (joined with NO separator).
  - `tag = raw.slice(areIdx+1).map(t=>t.value).join(' ').toLowerCase().trim()`.
  - `{ type:'tag', subject, tag, lineNum }`.
- **CRITICAL DEPENDENCY**: this precedes the `X is Y` assignment (rung 45). If a line contains BOTH `are` and `is`, the `are` tag wins. Verified `x is y are z` -> `{type:'tag', subject:'xisy', tag:'z'}`.

## 38. `restore` / `block` position (L1789-1792)
- `first === 'restore' || first === 'block'`:
  - `target` = join (with `.`) of `raw.slice(1)` word tokens excluding word `position`; default `'player'` if empty. `{ type:'restore', target, lineNum }`.
  - NOTE: `block` is an ALIAS that also yields a `restore` node. Verified.

## 39. `knock X away from Y [distance N]` (L1795-1796) -> `parseKnock(raw, lineNum)` (L1876). Node `{type:'knock', target, source, distance:<expr>, lineNum}`.

## 40. `walk X DIR` / `walk X toward Y` (L1800-1809)
- `first === 'walk' && raw.length >= 3`:
  - `target = raw[1].value`.
  - `tv(raw[2]) === 'toward' && raw.length >= 4` -> `{ type:'walk_toward', target, towardName: raw[3].value, lineNum }`.
  - else if `tv(raw[2])` in `['up','down','left','right']` -> `{ type:'walk', target, direction: dir, lineNum }`.
  - else: no return; falls through (e.g. `walk hero sideways`).

## 41. `stop walking X` / `stop X` (L1812-1818)
- `first === 'stop' && raw.length >= 2`:
  - `targetIdx = tv(raw[1]) === 'walking' ? 2 : 1`. If `targetIdx < raw.length`: `{ type:'stop_walking', target: raw[targetIdx].value, lineNum }`.
- **CRITICAL DEPENDENCY / DEAD-CODE GOTCHA**: this is BEFORE rung 47 (`stop music|sound`). So `stop sound` -> `{type:'stop_walking', target:'sound'}` and `stop music` -> `{type:'stop_walking', target:'music'}`. The dedicated `stop_music` node at L1868 is UNREACHABLE for these inputs. Verified empirically. A faithful Rust port MUST keep this order (i.e. `stop music`/`stop sound` produce `stop_walking`, not `stop_music`).

## 42. `face X DIR` / `face X toward Y` (L1821-1832)
- `first === 'face' && raw.length >= 3`:
  - `tv(raw[2]) === 'toward' && raw.length >= 4` -> `{ type:'face_toward', target: raw[1].value, towardName: raw[3].value, lineNum }`.
  - else if `tv(raw[2])` in dirs -> `{ type:'face', target: raw[1].value, direction: dir, lineNum }`.
  - else falls through.

## 43. `damage X [N]` (L1835-1839)
- `first === 'damage'`:
  - `target = raw[1] ? raw[1].value : 'player'`; `amt = raw.length>2 ? parseExpression(raw.slice(2)) : {type:'literal',value:1}`. `{ type:'damage', target, amount: amt, lineNum }`.
- DEPENDENCY: precedes `X is Y` (rung 45). `damage is 5` parses as damage with target `"is"`. Verified.

## 44. `heal X [N]` (L1842-1846)
- `first === 'heal'`: same shape as damage. `{ type:'heal', target, amount, lineNum }`.

## 45. `X is Y` — assignment (L1849-1854)
- `isIdx = findWord('is')`. If `isIdx > 0 && isIdx < raw.length - 1`:
  - `{ type:'assign', target: tokensToRef(raw.slice(0,isIdx)), value: parseExpression(raw.slice(isIdx+1)), lineNum }`.
- NOTE: `set` is NOT a keyword; assignment is purely `is`-based. Target via `tokensToRef` (dots preserved, spaces concatenated). Reaches here only after `are`/`damage`/`heal` and all earlier rungs fail.

## 46. `play sound|music "X"` (L1857-1865)
- `first === 'play' && raw.length >= 2`:
  - `kind = tv(raw[1]) === 'music' ? 'music' : 'sound'`.
  - `name`: scan `i` from 1: first `string` token's value, OR first `word` token whose tv is not `sound`/`music`; first hit wins (break). `{ type:'play_sound', kind, name, lineNum }`.

## 47. `stop music` / `stop sound` (L1868-1869) — **DEAD CODE** (see rung 41)
- `first === 'stop' && raw[1] && (tv(raw[1])==='music' || tv(raw[1])==='sound')` -> `{ type:'stop_music', lineNum }`.
- UNREACHABLE: rung 41 already captures any `stop <word>` (length>=2) as `stop_walking`. This branch never fires in practice. A port may include it for fidelity but it will never execute given the current order. Keep the ordering — do NOT promote this above rung 41.

## 48. FALLBACK — function call (L1872-1873)
- Anything not matched above: `{ type:'call', name: first, args: raw.slice(1), lineNum }`.
- `args` is the RAW token array (token objects), not strings. At runtime this is a silent no-op if `name` is not a defined function. Verified `frobnicate a b c` -> `{type:'call', name:'frobnicate', args:[{type:'word',value:'a'},...]}`.

---

## Dispatch-order dependency summary (must preserve in port)
1. AND-chaining (rung 0) before all.
2. `move ... with arrows` (20) before `move ... by` (21).
3. `clear screen` (22) before `clear VAR` (23).
4. `show button` (27) before `show meter` (28).
5. bare `stop` (18) and `stop <word>` (41) — disjoint by length; both before dead `stop music/sound` (47).
6. `stop walking/stop X` (41) BEFORE `stop music/sound` (47) — makes 47 dead code for `stop music`/`stop sound`.
7. `X are TAG` (37) BEFORE `X is Y` assignment (45) — a line with both `are` and `is` becomes a tag.
8. `damage`/`heal` (43,44) BEFORE `X is Y` (45) — `damage is 5` is a damage statement.
9. PROBABILITY (36) iterates the table in insertion order; shorter prefixes (`probably`) win over longer (`probably not`). Preserve table order.
10. `funcdef`/`def_*`/keyword forms all precede the generic `is`/`are`/fallback so a keyword first-word is never treated as an assignment subject.

## Notes on value extraction (port-critical)
- `raw[i].value` (raw, case-preserving) is used for targets/names in most movement/funcdef nodes; `tv(...)` (lowercased) is used only for keyword/direction COMPARISONS.
- `tokensToRef` concatenates with `''` and inserts `'.'` only for `dot` tokens. `toggle/double/halve/clear` instead use `.map(t=>t.value).join('.')` (different join — `.` between every token).
- All nodes include `lineNum`.
