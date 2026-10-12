## What this changes

<!-- One or two sentences. If it is a fix, say what was broken and how it showed. -->

## Checks

- [ ] `node tools/checks.mjs` is green (or the SKIPs are ones this machine cannot avoid)
- [ ] a behaviour change landed **with a case** (`spec/corpus/`, `draw-tests/`, `frame-tests/`, `err-tests/`)
- [ ] a language/engine change was made in **all four runtimes** (index.html's core,
      `spec/lang/fc-core.mjs`, `spec/port/spike/fc-core-record.mjs`, `src/lib.rs`) and the
      wasm was rebuilt + re-inlined
- [ ] any golden I re-pinned was re-pinned **because the change is intended**, and I have
      said so above
- [ ] docs describing the change are in this commit (`docs/STATUS.md` for the record,
      `docs/HANDOFF.md` if the pickup order changed)

## Notes for the reviewer

<!-- Anything you decided, anything you are unsure about, anything you deliberately did not do. -->
