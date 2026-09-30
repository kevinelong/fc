# fc Rust→WASM spike

Proves the "one core, web + native" thesis incrementally: each stage ports one
layer of the real interpreter and **differential-tests it against the JS** (via
`../../lang/fc-core.mjs`, whose shared declarations are verified identical to the
browser's by `tools/core-copy-check.mjs` — three declarations differ on purpose and are
listed there with their reasons) over the
corpus + the 9 example games. No layer is trusted until its diff is 0.

## Build
```
. "$HOME/.cargo/env"
cargo build --release --target wasm32-unknown-unknown
```

## Stages
| Stage | Status | Diff harness | Result |
|---|---|---|---|
| 0. command-buffer ABI round-trip | ✅ | (host instantiate + decode) | 532 B wasm, buffer decodes correctly |
| **1. lexer** (`tokenizeLine`) | ✅ | `node tokenize-diff.mjs` | **1036/1036 lines, 0 diff** · 1422 B wasm |
| 2. parser (`parse` → AST) | ✅ **40/40** | `node parse-ast.mjs && node ast-diff.mjs` | 100 KB wasm |
| &nbsp;&nbsp;2.0 allocator | ✅ | bump arena; `alloc_selftest`==328350 | — |
| &nbsp;&nbsp;2.1 AST + contract JSON | ✅ | sorted keys / lineNum strip / int-no-decimal | serializer correct |
| &nbsp;&nbsp;2.2 corpus statements + expr/cond | ✅ | assign/add/repeat/every/tag/when/if-else/math/listliteral/random/item_of/eq/cmp/and/or/not | all 31 corpus |
| &nbsp;&nbsp;2.3 game sub-parsers | ✅ | sprite/object/list-of/count · draw/write/meter/button/each/move/follow/goto/rungame/clearscreen/play/def_sfx/damage/heal/knock/broadcast/net_join · when_key·button·mouse · inline `if` (parseIf heuristic) · splitOnAnd via two-pass userFuncs | **all 9 games** |
| 3. runtime (`exec` → vars) | ✅ | `node exec-diff.mjs` vs `corpus/_goldens.json` | **31/31 corpus, 0 diff** · 133 KB wasm |
| &nbsp;&nbsp;3b-i. render command buffer | ✅ | `node draw-diff.mjs` | **5/5 cmds** (clear/rect/circle/write+interp) |
| &nbsp;&nbsp;3b-ii. game loop (update/draw frames + collision + input) | ✅ | `node examples-diff.mjs` + `dump-vars-diff.mjs` + `smoke.mjs` + `mp-smoke.mjs` | **22/22 examples, 30 frames, bit-identical** · 16/16 smoke · 5/5 two-instance multiplayer |

**3b-i** ports the render command buffer: `clearscreen`/`draw rect`/`draw circle`/`write`
(with `{var}` interpolation) emit `Cmd`s; `COLORS`+`resolveColor` ported (palette→hex);
camera offset handled. The JS oracle (`fc-core-record.mjs`) is the real lang core with
**recording platform stubs** — a recording `ctx` + a `drawText` reassigned to record
high-level text commands — so no interpreter edits are needed. 5/5 match on synthetic
top-level-draw programs. Remaining 3b-ii: the frame loop (update/draw over N frames),
movement/collision/camera, input, and host-side sprite blit — the visual/game-loop half.

**Stage 3** ports the value model (`Num/Str/Bool/List(Rc<RefCell>)/Obj/Undef`),
coercion (`parseFloat`/loose `==`/truthiness), dotted auto-vivify get/set, `eval`,
`eval_cond`, and `exec` (the fixed if/else threading at every level, op budget,
forward-call no-op, polymorphic `add`, seeded mulberry32 `random`). All 31 corpus
programs match `{say,vars,errors}` structurally. The remaining 3b is the game
runtime — the per-frame command buffer + draw/collision — which is what lets the
WASM core fully stand in for the JS interpreter behind a `?core=wasm` flag.

The **parseIf inline-split heuristic** and the **two-pass user-function prescan** (so user
funcs count as command-word boundaries) are both ported and validated by the games passing.
One real bug found & fixed along the way: `UFUNCS` (the user-func set) must be a fresh `Vec`
per program — reusing its buffer after `reset_arena()` recycled the arena caused cross-program
memory corruption (null-byte ref names). Caught by the diff harness.

## ABI (current)
- `input_ptr() -> *u8`, `tok_ptr() -> *u8`, `indent() -> u32`, `tokenize(len) -> count`.
- Tokens: `[type:u8, start:u16, len:u16]` little-endian, where `start/len` index the
  source bytes the host already holds — **no string copying, no allocator** (`#![no_std]`).
  Type codes: 1 string · 2 number · 3 word · 4 operator · 5 dot · 6 comma · 7/8 (l/r)paren
  · 9/10 (l/r)bracket · 11/12 (l/r)brace. String `start/len` reference the inner content;
  number value = `parseFloat(slice)`.

## Size measurements (opt-level=z, lto, strip, panic=abort)
- command-buffer skeleton: 532 B (354 gz)
- + lexer: 1422 B

The real interpreter will grow this (the parser/runtime need an allocator for the
value model + AST), but the trajectory supports WASM.md's "tens of KB inlined" target.

## Status 2026-09-29

Stages 0–3b are done and the wasm core is the **default engine** in index.html
(`?core=js` opts out). The current green table — with the wasm rebuilt from this
source and re-inlined into index.html — is:

| Harness | Result |
|---|---|
| `tokenize-diff.mjs` | 2118/2118 lines |
| `ast-diff.mjs` | 77/77 programs (corpus + examples) |
| `exec-diff.mjs` | 55/55 corpus programs |
| `draw-diff.mjs` | 10/10 render commands |
| `examples-diff.mjs` | 22/22 examples · 30 frames · draw-ops bit-identical |
| `dump-vars-diff.mjs` | 22/22 live-var snapshots (the inspect panel's read) |
| `smoke.mjs` / `frames-run.mjs` / `mp-smoke.mjs` | 16/16 · 5/5 · 5/5 |
| `fuzz.mjs` | 3000/3000 random programs |
| `err-diff.mjs` | diagnostics: JS == wasm == `err-golden.json` (cases) + a program sweep |
| `shape-diff.mjs` | coverage: node types no program exercises (pinned) + one cross-engine case per unexercised statement shape |

Rebuild loop after a core change: `cargo build --release --target
wasm32-unknown-unknown` then `node inline-wasm.mjs` (re-inlines the bytes into
index.html), then re-run the table above and `node ../../heal/eval.mjs`.

## Known port gaps (visible, not hidden)

`shape-diff.mjs` pins the node types no test program exercises and runs a case per
unexercised *statement* shape. As of 2026-09-30:

- `between` is the one node type no program reaches — the parser's `is between A and B`
  path sits behind the `and`-splitting that handles condition conjunctions, so the
  common spellings never produce it. Pinned so it stays visible.
- user-defined **songs** (`song "x" is 120 "notes" …`) register in the JS host's audio
  engine; the wasm can only name a sound across the ABI, so a user song plays by name
  only. The *statement* parses and never creates a variable (that part is fixed).

## Next
No stage is outstanding. The remaining work is language features on the roadmap
(ROADMAP.md "Still planned") and keeping the JS oracle in lockstep: any language
change must be ported to `spec/lang/fc-core.mjs`, `fc-core-record.mjs` and this
crate, with corpus cases added FIRST. index.html carries the same core text (the
JS fallback engine and the oracle are the same code); a diagnostics or language
change belongs in all four, and `err-diff`/the differentials are what prove it.
