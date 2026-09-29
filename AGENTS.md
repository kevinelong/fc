# Remote coding-agent coordination

These instructions apply to the entire repository.

## Before changing code

1. Read the plan that governs the assigned work. The current planning set is
   linked from README.md.
2. Read REMOTE-AGENT-GUIDANCE.md for current decisions and answers.
3. Preserve user and agent changes already present in the worktree. Do not
   discard, reset, or rewrite unrelated work.
4. Implement the smallest complete phase that can be independently verified.

For display-profile work, follow docs/DISPLAY-PROFILES-PLAN.md in order. Phase 0
must preserve pixel-identical 128 by 128 behavior before new screen-size syntax is
introduced. Recommended choices in that plan are the default decisions unless
repository evidence shows a conflict.

## Status and questions

The coding agent owns REMOTE-AGENT-STATUS.md. Create it if it does not exist and
replace its contents whenever the status materially changes. Use this structure:

    # Remote agent status

    Updated: YYYY-MM-DD HH:MM UTC
    HEAD: commit or working-tree state
    State: working | needs-answer | blocked | ready-for-review | complete

    ## Completed
    - Concrete result with file names.

    ## In progress
    - Current bounded task.

    ## Verification
    - Command and result.

    ## Open questions
    - Q-001: One answerable question, why it matters, the recommended choice,
      and what changes under each alternative.

    ## Next step
    - The next action after the current work or answer.

Use stable question IDs and keep resolved questions in a short resolved section
until the next milestone. Ask only questions that materially change behavior,
scope, compatibility, or user-visible design. For a safe reversible implementation
detail, use the relevant plan's recommendation and report the choice.

The monitoring agent owns REMOTE-AGENT-GUIDANCE.md. Do not edit or delete it.
Check it before starting a new phase and after writing State: needs-answer.

## Engineering guardrails

- Keep the JavaScript reference and Rust/WASM behavior in parity.
- Add or update conformance cases before accepting new language behavior.
- Never update golden outputs solely to make a failure disappear; inspect and
  explain every intentional change.
- Keep existing 128 by 128 programs compatible unless guidance explicitly
  approves a breaking change.
- Do not combine unrelated cleanup with the assigned implementation.
- Report a conflict or divergent branch instead of force-pushing or discarding
  another contributor's work.
- Record the exact checks run and distinguish passing, failing, and not run.

