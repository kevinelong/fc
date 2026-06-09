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
| 2. parser (`parse` → AST) | 🔶 **18/40** | `node parse-ast.mjs && node ast-diff.mjs` | 64 KB wasm |
| &nbsp;&nbsp;2.0 allocator | ✅ | `alloc_selftest`==328350; lexer still 1036/1036 | bump arena |
| &nbsp;&nbsp;2.1 AST + contract JSON | ✅ | sorted keys / lineNum strip / int-no-decimal proven | serializer correct |
| &nbsp;&nbsp;2.2 dispatch subset | ✅ | assign/add/remove/double/halve/toggle/call/funcdef/if/else(+if) | 18/40 |
| &nbsp;&nbsp;2.3 expr/cond subset | ✅ | literal/ref/math · eq/cmp/and/or/not/neq/has | — |
| &nbsp;&nbsp;**remaining diffs** | ⬜ | deferred constructs only (no crashes) | see below |

**Remaining 22 diffs are all deferred, known constructs** (the contract + implemented
nodes are correct): list/object/`random`/sprite/`list of`/`item of` expression atoms
(`value.items`/`value.name`/`value.max`); `repeat*`/`each`/`every`/`when*`/`draw`/`write`
/tag statements (currently `call` fallback → `.args` diff); and the bare-truthy condition
wrapper (`condition.expr`). Each is "add the parse arm + emit, watch the count climb."
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
