# Contributing to fc

Thanks for looking. This page is short on purpose: the project has one rule that matters —
**the guards decide** — and one command runs them.

## Run the app

There is no build step for the web app: open `index.html`, or serve the folder
(`python3 -m http.server`) and browse to it. The engine is a Rust→WASM core with the wasm
inlined as base64 in `index.html`, so a fresh clone runs as it stands.

The Android wrapper lives in a separate repository (`kevinelong/fc-app`).

## Before you open a pull request

```
node tools/checks.mjs          # every harness the project has (31 checks, ~2 min)
node tools/checks.mjs --strict # also fail on a SKIP — what CI runs
node tools/checks.mjs --list   # names + what each one needs
```

A prerequisite you don't have (a built wasm, Chrome, apid's `npm install`,
`playwright-core`) is reported as **SKIP**, never as a pass. `docs/HANDOFF.md` lists the
prerequisites, and what each guard exists to catch. CI runs the suite with `--strict`, so on
the runner — where every prerequisite is installed deliberately — a SKIP fails the build.

## The rules that keep the engine trustworthy

- **Cases first, then the change.** A behaviour change lands with a case in `spec/corpus/`,
  `draw-tests/`, `frame-tests/` or `err-tests/`.
- **Language and engine changes go to four runtimes**: index.html's JS core,
  `spec/lang/fc-core.mjs`, `spec/port/spike/fc-core-record.mjs`, and
  `spec/port/spike/src/lib.rs`. The differentials then prove they agree, and
  `tools/core-copy-check.mjs` proves the two JS copies are one program.
- **Two engine bugs are always two bugs** (JS *and* wasm). Prefer value assertions over
  agreement — two engines can be wrong together, and have been.
- **Re-pin intentionally, never to make a test pass.** `docs/HANDOFF.md` has the exact
  re-pin command for each golden.
- **One change per commit**, pushed as it lands.

## What not to send

- Secrets, tokens or personal data of any kind. The CI needs no credentials, and the
  repository is public.
- Build output — `fc-app/build/`, `node_modules/`, `spec/port/spike/target/` and
  `spec/port/spike/rust-ast.json` are generated and gitignored.

## License

fc is source-available under the [Functional Source License 1.1](LICENSE) (`FSL-1.1-MIT`).
By contributing you agree that your contribution is licensed under the same terms.
