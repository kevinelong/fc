# Guidance for the remote coding agent

Updated: 2026-09-30
Status: historical coordination record; the remote batch has landed

> **Superseded notice:** the pause boundary below describes the state before the
> remote agent completed and pushed its large implementation batch. Do not treat
> it as a current task list. Use `docs/HANDOFF.md` for the verified pickup order and
> `docs/OPEN-QUESTIONS.md` for current decisions. The owner gates Q1, Q2, Q4, and
> Q5 remain open unless the owner explicitly answers them.

## Immediate pause boundary

Do not continue, broaden, or commit the current flash/shake/effects work. Preserve
the in-progress files exactly as they are and report them as paused work; do not
discard or reset them. Those ROADMAP items are new features and were not approved
by the Q7 decision. The only authorized code follow-up is the Q7 numeric-variable
parity regression described below. After that focused fix and its test pass, stop
and wait for owner review of the accumulated branch.

## Current direction

- The completed eleven-commit batch is ready for review. Do not begin another
  broad plan sweep or push the branch until the owner reviews the batch.
- The next approved code change is Q7 only: dynamic color-variable resolution as
  a small, independently verified JavaScript/Rust-WASM parity patch.
- Keep the generation endpoint dark, telemetry local, and modularization deferred.
- Do not implement classroom storage, change gallery moderation, claim hardware
  validation, or post feedback until the owner answers Q1, Q2, Q4, and Q5.

## Technical decisions

### Q3 — generation remains dark

The Describe client is already built according to docs/STATUS.md. Do not add or
rotate secrets, enable the endpoint, or change deployment configuration. There is
no further code task until the owner explicitly performs the go-live steps.

### Q7 — implement dynamic color variables

Implement option (a) as one isolated language change:

- Preserve all current literal color behavior.
- When a paint argument is an identifier, resolve it in the current runtime scope.
- Accept the resolved value only when it is a recognized color string; preserve
  the current unknown-color fallback for compatibility.
- Keep JavaScript reference copies, Rust/WASM, transpiled/export behavior, and
  relevant documentation in parity.
- Add a minimal corpus case plus focused draw/cross-engine tests.
- Review the expected starfield, matrix, and sand visual changes before updating
  their goldens or thumbnails.
- Do not expand this patch into arbitrary CSS colors, gradients, or a new color
  type.

Report the precise lookup/scoping rule if the existing AST loses the distinction
between a literal color word and an identifier; that is the only expected reason
to pause this patch for another decision.

### Q7 live review note

The in-progress shape is acceptable: if a variable with the color token's name
exists, it shadows the palette word; otherwise the token remains a literal color.
Only string variable values participate. Keep JavaScript and Rust aligned by not
coercing numeric values to strings. An unrecognized string retains the existing
white fallback; a non-string value leaves the literal palette token in control. The focused test should pin palette-word
shadowing, an ordinary dynamic color, a multi-word color value, and both unknown
and non-string fallbacks.

Post-commit review found one missing parity case in 09d8f77: with `red is 4` and
`draw rect at 0, 0 size 2, 2 in red`, JavaScript coerces 4 and paints white, while
Rust ignores the non-string variable and falls back to literal red. Align both to
the rule above and add this exact collision case to d_dyncolor.fc before treating
Q7 as complete.

### Q8 — telemetry stays local

Do not add server-side aggregation. Preserve the local counters, Settings summary,
and copy action. A future opt-in send action must show what will be sent and needs
an explicit privacy decision before implementation.

### Q9 — defer modularization

Do not execute spec/MODULARIZATION.md now. The harnessed single-file architecture
is acceptable for the current product. Classroom work remains blocked on Q1.

## Owner decisions still required

- Q1: classroom identity, storage, retention, and caps.
- Q2: post-moderation versus pre-moderation for the gallery.
- Q4: real-device test execution.
- Q5: posting the prepared feedback requests from the owner's accounts.

Keep these items visible in docs/OPEN-QUESTIONS.md and do not infer approval from
the technical decisions above.
