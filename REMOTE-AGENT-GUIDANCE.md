# Guidance for the remote coding agent

Updated: 2026-09-29
Status: monitoring active

## Current direction

- Continue the task you were assigned; do not expand into every planning document
  at once.
- Treat the repository plans and their stated recommended choices as the default
  answers for reversible implementation details.
- If implementing display profiles, begin with Phase 0 in
  docs/DISPLAY-PROFILES-PLAN.md and prove that the existing 128 by 128 behavior is
  unchanged before adding syntax or new sizes.
- Keep work in reviewable milestones with the relevant tests green at each one.
- Write progress, verification, blockers, and numbered questions to
  REMOTE-AGENT-STATUS.md using the protocol in AGENTS.md.

## Answers to open questions

No open questions have been received yet.

## Review notes

- The monitoring agent will update this file with decisions and supporting
  reasoning.
- A decision applies only to the named question and should not be interpreted as
  permission for unrelated scope expansion.
- If repository evidence conflicts with a plan recommendation, report the exact
  file and behavior before proceeding.
