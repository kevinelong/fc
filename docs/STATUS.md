# Status — working through the plans

Running log, newest first. Each entry: what changed, the evidence that it works,
and the commit. Plans are marked in place (`✅ SHIPPED` / `⬜ remaining`) as they
complete; this file tracks the cross-plan view. Blocking decisions live in
[OPEN-QUESTIONS.md](./OPEN-QUESTIONS.md).

## 2026-09-29 — engine parity batch (JS↔wasm) + harness portability

Started from a red baseline: three differential harnesses disagreed with each
other. All causes turned out to be **real bugs**, not harness noise.

### Fixed (all in `spec/port/spike/src/lib.rs` unless noted)

| # | Bug | Effect | Fix |
|---|---|---|---|
| 1 | `parse_cond` treated `not X and Y` as `not X…` via `parse_expr`, so the `and`/`or` structure was lost and the test fell through to "not undef" = **always true** | wrong branch taken in sand.fc (`if not moved and x > 0`) | `not X` now recurses into `parse_cond` (mirrors JS `parseCondition`); `no X` still negates an expression; `not` node emits the JS key `expr` |
| 2 | `Expr::Ref` eval had no color-name fallback, and `parse_expr`'s all-word branch concatenated (`dark gray` → `darkgray`) | `shade is dark gray` stored nothing (null) — bare color words never assigned | `Ref` eval falls back to a palette name string (var wins if declared); dotted refs now require a real `.` token, mirroring JS |
| 3 | `parse_write` evaluated unquoted text as an **expression** (`write random 10` → a random digit) | wasm-only semantics: the JS/browser core writes the literal words, and the expression consumed RNG in `draw`, shifting the whole seeded stream | text is a literal (quoted string, or raw words up to `at`) like the JS `parseWrite`; `examples/matrix.fc` rewritten to the documented form (`digit is random 10` + `write "{digit}"`) so the demo still shows digits |
| 4 | token→text joins used `sval()` (empty for numbers) and multi-token bare refs | `set x to 99` produced the ref `"x to "` | shared `tok_text_join` (JS `tokens.map(t => t.value).join(' ')`) |
| 5 | wasm AST omitted `argExprs` on call nodes; args were re-split at exec time | ast-diff drift on 7 programs once the JS oracle was fixed | `Stmt::Call(name, args, argExprs)`; AST emits `argExprs`; exec binds from the parsed exprs |

### Fixed (JS reference core — `spec/lang/fc-core.mjs`)

The file is the corpus oracle ("byte-verified equal to the browser") but had
silently drifted from `index.html` / `fc-core-record.mjs`: it was missing the
**parentheses fix** (`a is (3 + 4)` → NaN for every game on the `?core=js`
fallback), the **user-function parameter** binding, and the `in` param filter.
Ported all five language hunks; the `is in [list]` gap is still wasm-only (below).

### New corpus guards (the repo's convention for a language change)

`not_and_condition.fc` · `color_word_assign.fc` · `dotted_then_math.fc`.

### Harness portability (they were Unix-only; results were silently wrong here)

- `spec/lang/run-node.mjs`: `new URL(...).pathname` → `fileURLToPath` (was `C:\C:\…`)
- `spec/port/spike/dump-transpile.mjs`: main-module guard never matched on Windows →
  the golden was **never written** (silent exit 0); fixed with `fileURLToPath`
- `smoke/frames-run/mp-smoke/soak`: `/tmp/...` hardcoded → `os.tmpdir()` (+ soak takes an argv path)
- `run-node.mjs` now compares goldens **canonically** (key-order-insensitive), so a
  serialization order change can't masquerade as a behavior diff

### Verification (whole suite green)

| Harness | Result |
|---|---|
| `tokenize-diff.mjs` | 2084/2084 lines |
| `ast-diff.mjs` | **74/74** programs |
| `exec-diff.mjs` | **52/52** corpus |
| `draw-diff.mjs` | 10/10 cmds |
| `examples-diff.mjs` | **22/22** games, 30 frames |
| `dump-vars-diff.mjs` | **22/22** live-var snapshots |
| `transpile-diff.mjs` | 74/74 programs (golden regenerated) |
| `transpile-embed-check.mjs` | index.html inlined copy matches transpile.mjs |
| `smoke.mjs` | 16/16 games |
| `frames-run.mjs` | 5/5 programs |
| `mp-smoke.mjs` | 5/5 multiplayer games |
| `fuzz.mjs` | 3000/3000 random programs |
| `run-node.mjs` (corpus conformance) | **52/52** |
| `spec/heal/eval.mjs` | 34/34 cases · 73/73 corpus untouched · gate 74 accepted |

Rebuilt wasm re-inlined into `index.html` (`inline-wasm.mjs`); verified in headless
Chrome that `examples/matrix.fc` still renders digits on the default wasm core.

### Known gaps found (not yet fixed)

1. **`is in [list]` is broken in the wasm** (documented in LANGUAGE.md §list
   membership; JS `hit=true`, wasm `hit=false`). No corpus case covered it. Next batch.
2. **Dynamic colors (`draw … in shade`) never resolve** in *either* engine —
   `resolveColor()` only maps literal names. Every "fading tail" / "brighter stars" /
   3-tone sand effect renders flat white. Product decision: Q7.

## Plan state at audit

| Plan | State |
|---|---|
| PLAN-visual-golden.md | ✅ shipped (the 6 generative toys are not in its golden set) |
| PLAN-runnable-export.md | ✅ shipped |
| PLAN-community-gallery.md | ✅ shipped (Q2 = the one open product call) |
| PLAN-accessibility.md | items 1–4 ✅ · #5 ARIA/keyboard ⬜ next |
| PLAN-duration.md | implementation present in all three cores ⬜ (corpus covers only the static form) |
| PLAN-live-inspect.md | feature present + `dump_vars` differential ✅ ⬜ (no UI test) |
| SAFETY-NET-PLAN.md | Phase 0/1 ✅ · Phase 2 gate+proxy ✅ (dark, needs key) · Phase 3 ⬜ |
| PLAN-classroom.md | ⬜ blocked on Q1 |
| TEST-MATRIX.md | ⬜ hardware-only (Q4) |
| FEEDBACK-PLAN.md | ⬜ human posting (Q5) |
