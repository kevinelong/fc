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
| 2. parser (`parse` → AST) | 🔶 **31/40** | `node parse-ast.mjs && node ast-diff.mjs` | 65 KB wasm |
| &nbsp;&nbsp;2.0 allocator | ✅ | `alloc_selftest`==328350; lexer still 1036/1036 | bump arena |
| &nbsp;&nbsp;2.1 AST + contract JSON | ✅ | sorted keys / lineNum strip / int-no-decimal proven | serializer correct |
| &nbsp;&nbsp;2.2 statements | ✅ | assign/add/remove/double/halve/toggle/call/funcdef/if/else(+if)/repeat*/every/tag/when_pickup·hit·defeat | **all 31 corpus pass** |
| &nbsp;&nbsp;2.3 expr/cond | ✅ | literal/ref/math/listliteral/random/item_of · eq/cmp/and/or/not/no/neq/has/bare | — |
| &nbsp;&nbsp;2.4 game sub-parsers | ⬜ next | the 9 example games | sprite/draw/each/when_key/object |

**Remaining 9 diffs are all the example GAMES** (corpus is 31/31). They need the
game sub-parsers not yet ported: sprite expression atoms (`sprite`/`centered sprite`/
`list of N` → `value.name`), object literals `{..}`, and `draw`/`write`/`each`/`when key`
/`move`/`follow`/`rungame`/`clearscreen` statements (→ `.args` from the `call` fallback).
Then the `parseIf`/`splitOnAnd` heuristics last (stress tables ready).
| 3. runtime (`exec` → vars + command buffer) | ⬜ | compare `{say,vars,errors}` + per-frame cmds vs the corpus goldens | — |

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
