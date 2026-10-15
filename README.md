# fc — the plain-English fantasy console

A self-contained fantasy console + beginner-friendly programming language, in a
single HTML file. Make little games by writing **plain English**, and run them in
any browser.

> **Live:** https://codeonline.io — free, no install, works offline, **multiplayer built in.**

```
trees are solid
coins are pickups
enemies are hostile

player is centered sprite {hp: 3, image: "hero"}
trees is list of 12 sprites {image: "tree"}
coins is list of 8 sprites {image: "coin"}

when player picks up any coin
  increase score by 1
  if no coins go to win

when player hits any enemy
  damage player 1
  knock player away from enemy distance 16
```

That's a real, runnable program. No imports. No boilerplate. Reads like a design doc.

---

## What this is
A single `index.html` you open in a browser: a **128×128 CRT canvas** and an editor
where the code re-runs as you type. The language is intentionally readable to someone
who has never programmed — it borrows from COBOL, BASIC, Python, Scratch, HyperTalk,
Inform 7, and AppleScript and pushes one step further toward "describe what you want
in plain English." The thesis: if you can describe a program to a friend, you should
be able to type that description and have it run.

## What it has (working today)
Sprites + an in-app pixel editor · sound (built-in SFX, `define sound`, songs) ·
tile/map system + map editor · declarative collision (`coins are pickups`, `when
player hits any enemy`) · screens/menus with a back-stack · on-screen gamepad +
keyboard/mouse/touch · camera/scrolling · enemy behaviors (chase/wander/patrol) ·
frame animation · particles · an optional match timer · **real-time multiplayer**
(16 example games, five of them multiplayer) · cloud saves + a community gallery
(optional sign-in) · a syntax-highlighting editor, a live variable inspector, and a
**step-through debugger** · plain-English runtime messages ("Line 4: hands only
has 2 items, but you asked for item 5") that jump to the line · a **"see it in
real code"** view that mirrors your program in Python, JavaScript, Lua or GDScript
— and **exports a runnable, standalone `.html`** of the JS version · **accessibility** settings (colorblind-safe palette, reduced
motion, high-contrast + larger text).

## Run it
It's a **single self-contained `index.html`** — no build step. Open it directly, or
serve the folder (`python3 -m http.server` → `http://localhost:8000`). It installs
as an offline PWA and ships as an Android APK.

The engine is a **Rust→WASM core** (default) with a JavaScript fallback; the wasm is
**inlined as base64 in `index.html`**, so a fresh clone runs with no build.

**Android:** install the app from **[fc-releases](https://github.com/kevinelong/fc-releases)**
(APK, no account needed), or use *Add to Home Screen* on the site — both work offline. The
Play-facing build needs `targetSdk 36` and lives on `fc-app`'s `target-sdk-36` branch: `main` stays
on `targetSdk 34` on purpose, because 35+ is Android 15+ edge-to-edge and that is a device-pass
question ([DISTRIBUTION.md](./DISTRIBUTION.md) has the order of operations).

## Layout
- `index.html` — the whole app: language, engine, editor, UI (single file).
- `examples/` — the demo games (`.fc` source + thumbnails).
- `spec/` — language spec, golden corpus, the Rust→WASM port, and the test harnesses
  (differential, fuzzer, interaction + two-instance multiplayer smoke, visual goldens).
- `learn/`, `teachers/`, `projects/`, `docs/` — tutorial, classroom lessons, guided
  projects, and the runnable command reference.
- `apid/`, `huntd/` — optional backend services (cloud saves + sign-in; the
  multiplayer relay). fc runs fully without them.
- `tools/` — thumbnail/screenshot/tutorial/OG generators and the wasm-inline step.

## Rebuild the wasm engine (only if you change the Rust core)
```
cd spec/port/spike && cargo build --release --target wasm32-unknown-unknown
node inline-wasm.mjs            # re-inline the wasm into index.html
```
Then run the harnesses in `spec/port/spike/` (exec-diff, ast-diff, examples-diff,
fuzz, smoke, mp-smoke, visual-golden). **Every language change must keep them green
across all engines** (the JS reference in `index.html`, the two JS oracles, and the
Rust/WASM core) — that discipline is how the port stays trustworthy.

**Classroom mode** — a teacher makes a class code, students join with the code and a
display name (no email, no account) — is built and ships **dark** behind apid's
`ENABLE_CLASSROOM`. `tools/class-e2e.mjs` drives the real server and a real browser
through the whole flow (join → shelf → tap to play → hand in → teacher roster, assign
and delete) and then proves the feature is invisible with the flag off; it needs
`cd apid && npm install` first. `tools/ui-check.mjs` covers the same page behaviour
without the server, stubbed.

`node tools/checks.mjs` runs every harness in one pass and fails if any of them stops
producing its summary line (a harness that dies silently or runs zero cases is a FAIL,
not a pass) — it is the guard against the rot that hid a broken `frames-run` for a while.
A check whose prerequisite is absent (a built wasm, Chrome, apid's `npm install`,
`playwright-core` for the pixel goldens) reports **SKIP**, never a pass: **31/31** with every
prerequisite present. CI installs them all and runs `node tools/checks.mjs --strict`, where a
SKIP is a failure — a runner that quietly lost a prerequisite would otherwise leave the guard
green and unguarding. A failing harness prints its own last lines under the table, not just an
exit code.

The pages and the docs have guards too: `tools/a11y-check.mjs` audits every shipped page that is
not the app (the reference, the tutorial, the teacher pages, the projects, the privacy policy,
and the three editors) with axe-core plus a dependency-free structural pass, and
`tools/wasm-doc-check.mjs` holds `spec/WASM.md` to the core it describes (the emitted `op` set
and the exports the host calls).

`tools/core-copy-check.mjs` holds the "one program, three homes" invariant: index.html's
JS core, `spec/lang/fc-core.mjs` and `fc-core-record.mjs` must have identical code for
every shared declaration (three presentation differences are listed with reasons).

Sharing has two guards: `tools/share-e2e.mjs` checks the server-rendered `/s/<id>`
page (OG tags, the code round-trip, a 404 for an unknown id), and `tools/ui-check.mjs`
checks that the Share button emits it once a game is published.

Coverage has a guard too: `shape-diff` lists the parse node types no test program
exercises (pinned, so a new one cannot appear silently) and runs a cross-engine case
per unexercised statement shape — it is what surfaced the ten documented forms the wasm
never parsed (2026-09-30).

Runtime diagnostics have their own guard: `err-diff` pins the messages over
`spec/port/spike/err-tests/*.fc` and asserts the **shipped wasm core and the JS
reference report the same words on the same lines** (then sweeps the corpus to
prove a correct program stays silent). Re-pin with `node dump-err.mjs`.

The **fc→Python/JS/Lua/GDScript transpiler** (`transpile.mjs`, powering the "see it in
real code" view) has the same discipline: `transpile-diff` pins its output over the
corpus + examples in all four languages, and `transpile-embed-check` asserts the copy
inlined in `index.html` stays byte-identical to the module. Re-pin an intentional
change with `node dump-transpile.mjs`. Only the JavaScript target is *runnable* (the
app ships a small runtime shim for it, plus `▶ run this` / `⬇ download .html`); Python,
Lua and GDScript are read-only mirrors, like the panel's own caption says.

**visual-golden** adds a *pixel*-level guard. `examples-diff` proves the engines
*agree* on draw ops; `visual-golden` pins the actual rendered 128×128 pixels
(SHA-256 of the RGBA bytes, seed 0, 30 idle frames) so it catches drift the op-level
check can't — a color-resolution change, the bitmap font, layout. It renders headless
in an auto-detected Chrome/Chromium; set `CHROME=/path/to/chrome` when it is installed
elsewhere. Check: `node visual-golden.mjs`;
re-pin: `node visual-golden.mjs --update`; prove it bites: `node visual-golden.mjs
--cvd` (forces the colorblind palette on → the color-affected examples diff).

## License
Source-available under the **[Functional Source License 1.1](LICENSE)** (`FSL-1.1-MIT`):
use, modify and redistribute it for anything except a product or service that competes with
fc, and every version converts to the MIT license two years after its release.
Made by [Kevin Long](https://www.linkedin.com/in/kevinelong/).
