# fc safety net — "type English, it always runs"

## The promise (exact wording)

> **Type English — it always runs, and you can always see what it's doing.**

NOT "it always does what you meant" (intent is unknowable from vague input). The
guarantee is **no dead ends** + **full transparency**: you never end up staring
at a red error with nothing running, and every change the net makes is shown.

## The net is a terminating cascade

Every run lands somewhere runnable; intervention is visible and *proportional*:

1. **Parses/lints clean** → run it. (Silent — nothing happened.)
2. **Won't parse/lints dirty → deterministic heal** (typos, colors, `=`→`is`,
   smart quotes) → runs. *Quiet* "tidied a couple things," diff one tap away.
3. **Still not valid → LLM rewrite** to nearest valid fc, validated by parse +
   N-frame run, self-repair ≤2× → runs. *Shown* as a diff, easy undo.
4. **Too vague to rewrite → runnable scaffold** that does something on screen,
   keeps the user's English as comments, and asks "did you mean X or Y?" — the
   floor that makes the guarantee hold no matter what.

**Core principle: transparency scales with intervention.** A one-char typo fix is
nearly invisible; a full reinterpretation is loud with a big undo. Never silently
change meaning — that's the one thing that would betray a learner.

Near-fc input is caught cheaply/quietly (deterministic net); far-from-fc input
("make a dragon eat coins") is *interpreted* loudly (generative net). Same
validate-by-actually-running loop either way.

## Phases

- **Phase 0 — deterministic tier (DONE).** Offline, no LLM, zero cost. Fixes the
  common beginner mistakes and reports every change. Code: `spec/heal/`.
- **Phase 1 — in-app UX (DONE).** The healer is inlined in index.html (reusing
  LINT_VERBS/COLORS/damerau; extra vocab drift-checked by eval.mjs). On run, if
  there are confident fixes, a green "Safety net: I can fix N things … [✎ Fix &
  run]" banner appears; one tap rewrites the editor to the healed code and re-runs.
  Never auto-applied — the user's text is untouched until they tap.
- **Phase 2 — LLM tier (scaffold + gate DONE; model call needs a key).** The
  validation gate `spec/heal/validate.mjs` (parse + N-frame run + lint-clean) is
  built and self-evaluated by eval.mjs: 71 real programs accepted, deliberately
  broken snippets rejected, and every deterministic-heal output passes it. The
  LLM prototype `spec/heal/llm-tier.mjs` builds a grounded prompt (fc spec + real
  few-shots, all gate-valid) and runs the generate→gate→self-repair(≤2) loop;
  every returned program provably parses and runs. Run it offline with your key
  (`ANTHROPIC_API_KEY=… node spec/heal/llm-tier.mjs "…"`, or `--dry` to inspect
  the prompt) to measure quality BEFORE shipping any endpoint.
  Validated end-to-end once (claude-haiku-4-5) via `spec/heal/llm-eval.mjs`:
  8/8 varied prompts produced gate-passing fc on the FIRST attempt (bounce,
  repair, 8×8 grid, countdown, starfield, paddle, matrix rain, trail). Code
  inspected — semantically sound; one nit: countdown displays a raw float instead
  of whole seconds (a prompt-refinement, not a gate failure).
  The gated proxy `POST /api/generate` is now built in apid/server.js — **ships
  dark**: returns 503 unless BOTH a key is in apid/.env AND `ENABLE_GENERATE=true`.
  Login-gated, per-user + global daily caps (`GEN_DAILY_PER_USER`/`GEN_DAILY_GLOBAL`),
  1000-char prompt cap, key server-side only; it calls llmHeal so only
  gate-validated code is returned. Guard paths smoke-tested (403 no-CSRF / 401
  no-session / 503 disabled).
  Remaining to go live: (1) rotate the key and put it in apid/.env, set
  `ENABLE_GENERATE=true`, restart apid; (2) client UI — a "Describe" box that
  POSTs `{prompt}` and drops the returned code into the editor (Phase 1's diff/
  banner style); (3) a larger eval set + semantic rubric (gate-pass ≠ intent).
- **Phase 3 — runnable-scaffold floor + telemetry.** The always-runs fallback,
  plus logging which inputs the net keeps rewriting the same way → those become
  natively-accepted syntax (the net shrinks over time).

## Phase 0 status

`spec/heal/healer.mjs` — `heal(src) -> {code, changes[], remaining[]}` and
`lint(src) -> [issue]`. Deterministic, precision-first (only flags/heals what it
can confidently fix; leaves anything ambiguous alone).

Handles today:
- **verb typos** → nearest command (`clera`→`clear`, `darw`→`draw`), Damerau
  distance with length-scaled budget and subsequence tie-breaking
  (`gren`→`green`, not `grey`).
- **color typos** in real color contexts (`in <c>` for draw/write/pset,
  `clear … to <c>`): `gren`→`green`, `dark gren`→`dark green`, `darkgreen`→`dark green`.
- **normalizations**: `x = 5`→`x is 5`, `set x to 0`→`x is 0`, `let h = 3`→`h is 3`,
  smart quotes → straight.
- **fixpoint**: re-lints after each round so a fixed verb can reveal a color on
  the same line (`clera screen to gren` → `clear screen to green`).

Precision guards (the hard part): complete leading-word vocabulary (LINT_VERBS +
parser dispatch words + structural `its`/`with`/`forever`…), the behavior pattern
(`crab wanders …` is valid, not a typo), declared-symbol skipping (a variable used
as a dynamic color like `in shade` is left alone), and "only flag with a confident
fix."

Eval: `node spec/heal/eval.mjs`
- 34/34 curated cases (incl. false-positive/clean cases) pass.
- 70/70 real programs (examples/ + spec/corpus/) untouched — no false corrections.
- vocab drift-guarded against index.html; healed code is re-run on the oracle.

Not yet (Phase 1+): missing-space splits (`drawcircle`), reordered args, and
anything structural — those are the LLM tier's job.
