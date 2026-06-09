# fc Rust→WASM spike

Proves the "one core, web + native" thesis incrementally: each stage ports one
layer of the real interpreter and **differential-tests it against the JS** (via
`../../lang/fc-core.mjs`, which is byte-verified equal to the browser) over the
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
| &nbsp;&nbsp;3b. game runtime (command buffer + frame loop) | ⬜ next | draw/sprite/collision per-frame cmds | — |

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

## Next
Stage 2: port `parse()`. The parser is the highest-divergence layer (parseIf split,
splitOnAnd) — diff serialized ASTs line-by-line against JS before touching the runtime.
