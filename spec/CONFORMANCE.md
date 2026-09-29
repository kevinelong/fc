# fc Conformance Harness Contract

> **[2026-09-29] Status.** The `~L` citations and the `/home/kevin/codeonline/`
> paths in this file describe the revision it was written against; the file has
> since more than doubled. Treat the *contract* sections as current and the line
> numbers as historical. The executable record is the harness suite: the wasm core
> is the browser's DEFAULT engine and matches the JS oracle on `tokenize-diff`
> 2118/2118 lines · `ast-diff` 77/77 programs · `exec-diff` 55/55 · `draw-diff`
> 10/10 · `examples-diff` 22/22 (30 frames) · `dump-vars-diff` 22/22 · `smoke`
> 16/16 · `mp-smoke` 5/5 · `fuzz` 3000/3000 (see docs/STATUS.md). The corpus is now
> 55 programs plus 22 examples.


Status: descriptive contract for validating any fc implementation (the current
JS in `/home/kevin/codeonline/index.html`, and the future Rust→WASM core)
against a shared set of golden programs.

This file defines (1) **what state a conforming run exposes**, (2) **how to
make a run deterministic**, (3) **the minimal enabler hook** needed to capture
state headlessly today, and (4) **the corpus manifest** with PREDICTED outputs.

> Every "Expected" value below is **PREDICTION — confirm via harness**. The
> predictions are read off the source (`~line` citations throughout), not from
> an executed run. They are the *hypothesis* the harness exists to test, not
> ground truth. Where the predicted result is itself a latent bug, it is still
> the conformance target until the spec deliberately changes it.

---

## 1. Captured state (the conformance surface)

A conforming run of a **pure** (non-game-loop) program MUST expose, after
`exec` returns:

| Field    | Source today                              | Notes |
|----------|-------------------------------------------|-------|
| `say`    | `runtime.sayBuffer` (array of strings; `say` appends, ~L3404) | rendered to canvas only when `!gameLoop` (~L4030), but the buffer itself is the captured artifact |
| `errors` | `runtime.errors` (array; ~L350, populated only by top-level catch as `"I got confused: " + e.message`, ~L4039) | [QUIRK] located `error(msg,lineNum)` facility exists (~L2693) but is **unwired**; `execCall` of a missing func is a silent no-op (~L3607). So most "bad" programs produce `errors: []`, not a diagnostic. |
| `vars`   | `runtime.vars` (the single global scope; ~all funcs share it) | capture **final scalar vars** by name. Lists/objects are by-identity; compare structurally. |

For **game** programs (those that start a loop), additionally capture, **once a
WASM core with an explicit command buffer exists**:

| Field      | Meaning |
|------------|---------|
| `commands` | the ordered per-frame draw/play command buffer (clearscreen / rect / circle / line / sprite / drawText / play …). Today these calls go *directly* to module singletons `ctx`/`AUDIO` (~L447, ~L1162) with no buffer, so they are **not capturable headlessly without refactor**. The host-seam extraction (`lang/`) is expected to route them through a recordable host. Until then, game programs are tested only via `say`/`vars` side effects or are excluded. |

`peers`/`connected` are NET-driven (~L3637) and MUST be excluded from
deterministic tests (or stubbed to a fixed empty peer set).

---

## 2. Determinism requirements

A conformance run MUST be reproducible. Two non-determinism sources exist:

1. **RNG.** `random N` is `Math.floor(Math.random() * (N+1))` (~L2785) —
   unseeded, inclusive `0..N`. Sprite placement `_findEmptySpot` burns up to 80
   `Math.random()` draws (~L3797). The harness MUST **replace the engine's
   random source with a seeded PRNG** before `exec`. For the JS impl this means
   overriding `Math.random` (or, post-extraction, injecting a `rng` into the
   host). The seed is part of the test vector. Use a small explicit PRNG
   (e.g. mulberry32) so JS and Rust produce **bit-identical** sequences — do NOT
   rely on each platform's stdlib RNG.

2. **Time / frames.** The game loop is `requestAnimationFrame` + a 60 Hz
   `setInterval` watchdog (~L3756, ~L3763); `every N seconds` assumes 60 fps
   (`round(N*60)`, ~L3057). For determinism:
   - **Pure tests:** run with **no game loop** (the program must not call the
     loop-starting verbs). `exec` returns synchronously; capture immediately.
     This is the default and covers the entire corpus below.
   - **Frame tests (future):** drive a **fixed timestep** — call the frame
     function exactly `N` times with a fixed dt, then capture. Never wall-clock.

Operation caps are themselves deterministic and part of the contract:
`maxOps || 100000` (~L2899); `forever` outside a game loop caps at **1000**
iterations (~L3049). A test that relies on the cap must document it.

---

## 3. Minimal enabler hook (REQUIRED today)

**Problem:** `run()` uses a *module-level* `runtime` (`let runtime = new
Runtime()`, ~L4014) and `window.runtime` is **never assigned**. `window.run`,
`window.parse`, `window.singularize`, `window.tokenizeLine` are exposed
(classic-script function decls) but none returns captured state — `run()`
returns `undefined` and only paints the canvas / `#errors` div.

**Option A — 3-line test hook (smallest change to the monolith).** Add inside
the classic `<script>`, after the `Runtime` class is defined:

```js
window.__fcRun = function (src, seed) {
  const _r = Math.random;
  if (seed !== undefined) { let s = seed >>> 0; Math.random = () => (s = (s*1664525+1013904223)>>>0) / 4294967296; }
  const rt = new Runtime();
  try { rt.exec(parse(src)); } catch (e) { rt.error("I got confused: " + e.message); }
  Math.random = _r;
  return { say: rt.sayBuffer.slice(), errors: rt.errors.slice(), vars: rt.vars };
};
```

A Puppeteer/Playwright driver loads `index.html`, calls
`page.evaluate(s => __fcRun(s, 12345), program)`, and asserts on the returned
object. This builds a *fresh* `Runtime` per call (avoids `reset()` coupling) and
restores `Math.random`. It does **not** capture the command buffer (see §1).

**Option B — `lang/` extraction (PREFERRED).** Pull the platform-free pieces
(`tokenizeLine`, `parse`/`parseBlock`/`parseLine`/`parseExpression`,
`singularize`, the `Runtime` class) into an ES module under
`/home/kevin/codeonline/lang/` with **no** references to `ctx`/`AUDIO`/`NET`
module singletons — those become an injected **host** object
(`{ draw, play, net, rng }`). Then a Node harness does:

```js
import { parse, Runtime } from '../lang/index.js';
function fcRun(src, { seed = 12345 } = {}) {
  const rt = new Runtime(makeRecordingHost(seed));   // host carries seeded rng + command sink
  rt.exec(parse(src));
  return { say: rt.sayBuffer, errors: rt.errors, vars: rt.vars, commands: rt.host.commands };
}
```

Option B is preferred because: it runs in Node (no browser), it gives a real
seam for the seeded `rng` and the **command buffer** (unblocking game-program
conformance), and it is the same `parse()`/`Runtime` the WASM port will be
validated against as the single source of truth. The Rust→WASM core exposes the
identical `fcRun` shape (`{say, errors, vars, commands}`) so one JSON vector set
validates both.

---

## 4. Comparison rules

- `say`: ordered array equality, string-exact (case preserved in the buffer;
  note `drawText` uppercases at *render* time only, ~drawText, so the buffer
  keeps original case).
- `vars`: for each var named in the manifest, structural equality. Numbers
  compared **exactly** (so `0.1+0.2` floating drift, ~String() formatting, is a
  conformance detail both impls must reproduce — do NOT round). [QUIRK]
- `errors`: array length + substring match on the located/unlocated message.
- Unlisted vars are ignored (engine seeds `peers`, `connected`, `world`, etc.).

---

## 5. Corpus manifest

All programs live in `/home/kevin/codeonline/spec/corpus/*.fc`. Capture column
names match §1. **All Expected values are PREDICTION — confirm via harness.**

### 5a. if / else — top-level vs in-loop (THE BIG ONE, ~L3471 vs ~L3003)

| Program | Capture | Expected (PREDICTION) | Why |
|---|---|---|---|
| `ifelse_toplevel_true.fc`  | `vars.result` | `"then"` | top-level `smartExecList` links if/else correctly |
| `ifelse_toplevel_false.fc` | `vars.result` | `"else"` | else runs because `lastIfResult===false` |
| `ifelse_in_loop_true.fc`   | `vars.result` | `"else"` | [QUIRK] inside `repeat`, plain `execList`: `if` true branch sets `"then"`, THEN the trailing `else` body runs **unconditionally** (~L3003) and overwrites with `"else"` (last writer wins). Top-level would give `"then"` — the file exists to surface exactly this divergence. |
| `ifelse_in_loop_false.fc`  | `vars.result` | `"else"` | if false → else body runs unconditionally anyway → `"else"` (coincidentally "right" when the if is false) |
| `elseif_in_loop.fc`        | `vars.result` | `"elifbody"` | [QUIRK] in-loop `else if` evaluates its OWN condition with no link to the preceding `if` (~L2994); both an if and its else-if can fire |

> NOTE on `ifelse_in_loop_true.fc`: in a loop body, `if` (true) runs its body,
> then the separate `else` statement (~L3003) runs its body **unconditionally**.
> If both write `result`, the **last writer wins** → predicted final
> `result == "else"`. This is the latent bug; the file is constructed so the
> harness reveals it (top-level would give `"then"`).

### 5b. parseIf inline-statement split stress (~L2017, HIGHEST divergence risk)

| Program | Capture | Expected (PREDICTION) | Why |
|---|---|---|---|
| `parseif_compare_then_is.fc` | `vars.msg` | `"big"` | after a compare (`seenCompare`), `is` begins an inline assignment (walk back, j-=2) |
| `parseif_is_compare_cond.fc` | `vars.hit` | `"yes"` | `is` used as the comparison itself (no prior compare) → condition, not assignment |
| `parseif_and_resets.fc`      | `vars.tag` | `"ok"` | `and` resets `seenCompare`; the post-`and` `is` is disambiguated by the token before target |
| `parseif_dotted_inline.fc`   | `vars.\`player.hp\`` (object) | `player.hp == 5` | inline assignment target is a dotted ref; walk-back consumes the dotted chain |

### 5c. == loose coercion (raw JS `==`/`!=`, ~L2851)

| Program | Capture | Expected (PREDICTION) | Why |
|---|---|---|---|
| `eq_string_number.fc`   | `vars.r` | `"equal"`   | `'5' == 5` is true |
| `eq_zero_emptystring.fc`| `vars.r` | `"equal"`   | `0 == ''` is true |
| `eq_yes_boolean.fc`     | `vars.r` | `"equal"`   | `'yes'` parses to literal `true` (~L2192); `true == true` |

> NOTE: a pure `NaN != NaN` test was **dropped** — the language has no NaN
> source. `/0` and `%0` are guarded to return `0` (~L2778), and non-numeric
> string math coerces via `parseFloat(x)||0`, so NaN is unreachable from fc. The
> `eq_yes_boolean.fc` case exercises the `yes`→`true` literal path instead.

### 5d. singularize bindings (~L1146) — **game/frame test, deferred**

These exercise `singularize` binding a pickup handler `when player picks up any
berry` to the list `berries` (~L3866). That binding only *fires* via the
collision system inside the game loop with placed sprites — so these are **game
programs**, not pure, and need the frame harness + command-buffer seam (§1, §2),
not `__fcRun` alone. They are seeded now so the binding divergence is captured
the moment frame testing exists. The pure, isolatable assertion a unit test CAN
make today is on `singularize()` directly (exposed as `window.singularize`):

| Input | `singularize(x)` Expected (PREDICTION) | Rule (~L1146) |
|---|---|---|
| `"berries"` | `"berry"` | endsWith `ies` → -3 + `y` |
| `"coins"`   | `"coin"`  | trailing `s` dropped |
| `"glasses"` | `"glas"`  | [QUIRK] endsWith `ses` → `slice(0,-2)` (NOT `"glass"`) |

| Program (frame test) | Capture | Expected (PREDICTION) | Why |
|---|---|---|---|
| `singularize_ies.fc`    | `vars.score` | `1` after pickup | "berries" → "berry" binds handler; deferred (needs loop+collision) |
| `singularize_plain_s.fc`| `vars.score` | `1` after pickup | "coins" → "coin"; deferred |

> NOTE: `make berries` / `make coins` parse as the FALLBACK call
> `{type:'call', name:'make', ...}` (~L1872) and are **silent no-ops** (no
> `make` func, ~L3607); the list is established by the `... are pickups`
> declaration, not by `make`.

### 5e. forward-reference no-op (funcs not hoisted, ~L3087)

| Program | Capture | Expected (PREDICTION) | Why |
|---|---|---|---|
| `forward_ref_noop.fc` | `vars.x` | `1` (NOT `2`) | call to a func defined *later* is a silent no-op; only the post-definition call runs |

### 5f. 1-based `item N of list` (~L2826)

| Program | Capture | Expected (PREDICTION) | Why |
|---|---|---|---|
| `item_one_based.fc` | `vars.first`, `vars.second` | `"a"`, `"b"` | `item 1 of list` → `list[0]` |

### 5g. random bounds (seeded, ~L2785)

| Program | Capture | Expected (PREDICTION) | Why |
|---|---|---|---|
| `random_inclusive_bounds.fc` | `vars.lo`, `vars.hi`, `vars.ok` | `lo>=0`, `hi<=3`, `ok=="yes"` | `random 3` ∈ {0,1,2,3} inclusive. With seed fixed, the **exact** sequence is asserted; without a seed only the bound invariant holds. |

### 5h. `add to` concat/push vs `+` numeric (~L2924 vs ~L2768)

| Program | Capture | Expected (PREDICTION) | Why |
|---|---|---|---|
| `add_to_string_concat.fc` | `vars.label` | `"score9"` | `add 9 to label` where label is a string → string concat |
| `add_to_list_push.fc`     | `vars.bag` (list) | `["x","y"]` | `add to` a list pushes |
| `add_to_number.fc`        | `vars.n` | `5` | `add to` a number adds numerically |
| `plus_op_numeric.fc`      | `vars.r` | `7` | [QUIRK] `'3' + '4'` via expression `+` is **numeric** = 7, NOT `"34"` |
| `plus_op_nonnumeric.fc`   | `vars.r` | `0` | [QUIRK] `"hi" + "x"` → `0` (parseFloat→NaN→0) |

### 5i. divide / mod by zero (~L2778)

| Program | Capture | Expected (PREDICTION) | Why |
|---|---|---|---|
| `divide_by_zero.fc` | `vars.q`, `vars.m` | `0`, `0` | `/0` and `%0` both yield `0` (not Infinity/NaN) |

### 5j. truthiness — yes/no/empty (~L2698)

| Program | Capture | Expected (PREDICTION) | Why |
|---|---|---|---|
| `truthy_yes_no.fc`     | `vars.a`, `vars.b` | `"t"`, `"f"` | `'yes'` truthy, `'no'` falsey |
| `truthy_empty_list.fc` | `vars.r` | `"f"` | empty list `[]` is falsey |
| `truthy_zero.fc`       | `vars.r` | `"f"` | numeric `0` is falsey (~L2702) |

> [QUIRK] aside (not a corpus file): the string `"0"` is a *non-empty string* →
> **truthy** (~L2703), unlike the number `0`. A port must distinguish numeric 0
> from `"0"`.

### 5k. bidirectional repeat range (~L3018)

| Program | Capture | Expected (PREDICTION) | Why |
|---|---|---|---|
| `repeat_ascending.fc`  | `vars.sum`, `vars.last` | `6`, `3` | `repeat n from 1 to 3` inclusive |
| `repeat_descending.fc` | `vars.sum`, `vars.last` | `6`, `1` | from>to descends (step -1), inclusive, also runs |

### 5l. two `every` blocks — line-number-keyed cadence (~L3056, ~L3060)

| Program | Capture (after **N=6** fixed frames) | Expected (PREDICTION) | Why |
|---|---|---|---|
| `every_two_blocks_line_keyed.fc` | `vars.a`, `vars.b` | `a == 3`, `b == 2` | [QUIRK] `_everyCounters[key]` is keyed by `stmt.lineNum` (~L3060), not by block identity. Over 6 frames, `every 2 frames` fires at frames 2/4/6 → `a=3`; `every 3 frames` fires at 3/6 → `b=2`. **Frame test** — needs the loop + fixed timestep (§2), so it is deferred until the frame harness exists. A WASM port MUST key by source line identically or cadences diverge. There is **no inline form** for `every` (parser is line-based, ~L1633, body is an indented block), so two `every` blocks can never share a physical line — the fidelity risk is the line-keying scheme itself, not a same-line collision. |

---

## 6. Coverage notes / gaps

- Programs in 5a–5k are **pure** (no game loop) and runnable today via the
  `window.__fcRun` hook (§3 Option A).
- 5l requires the game loop → deferred to the fixed-timestep frame harness
  (§2) and the command-buffer seam (§1). Included as a `.fc` seed so the
  divergence is captured the moment frame testing exists.
- Anything touching NET, audio output, or canvas pixels is **out of scope for
  scalar conformance** and belongs to the future command-buffer vector set.
