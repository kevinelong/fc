# Guidance for the remote coding agent

Updated: 2026-09-29
Status: decisions below are active; owner decisions remain open

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
