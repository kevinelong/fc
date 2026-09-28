# fc — the plain-English fantasy console

A self-contained fantasy console + beginner-friendly programming language, in a
single HTML file. Make little games by writing **plain English**, and run them in
any browser.

> **Live:** https://codeonline.io — free, no install, works offline, **multiplayer built in.**

> **Planning:** [launch readiness and distribution](docs/LAUNCH-READINESS-PLAN.md)
> · [AI market hypothesis](docs/AI-MARKET-PLAN.md)
> · [human and machine readability benchmark](docs/READABILITY-BENCHMARK.md)

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
**step-through debugger** · a **"see it in real code"** view that mirrors your
program as Python or JavaScript — and **exports a runnable, standalone `.html`**
of the JS version · **accessibility** settings (colorblind-safe palette, reduced
motion, high-contrast + larger text).

## Run it
It's a **single self-contained `index.html`** — no build step. Open it directly, or
serve the folder (`python3 -m http.server` → `http://localhost:8000`). It installs
as an offline PWA and ships as an Android APK.

The engine is a **Rust→WASM core** (default) with a JavaScript fallback; the wasm is
**inlined as base64 in `index.html`**, so a fresh clone runs with no build.

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

The **fc→Python/JS transpiler** (`transpile.mjs`, powering the "see it in real code"
view) has the same discipline: `transpile-diff` pins its output over the corpus +
examples, and `transpile-embed-check` asserts the copy inlined in `index.html` stays
byte-identical to the module. Re-pin an intentional change with `node dump-transpile.mjs`.

**visual-golden** adds a *pixel*-level guard. `examples-diff` proves the engines
*agree* on draw ops; `visual-golden` pins the actual rendered 128×128 pixels
(SHA-256 of the RGBA bytes, seed 0, 30 idle frames) so it catches drift the op-level
check can't — a color-resolution change, the bitmap font, layout. It renders headless
in chromium (needs `/usr/bin/chromium` + `python3`). Check: `node visual-golden.mjs`;
re-pin: `node visual-golden.mjs --update`; prove it bites: `node visual-golden.mjs
--cvd` (forces the colorblind palette on → the color-affected examples diff).

## License
MIT — see [LICENSE](LICENSE). Made by [Kevin Long](https://www.linkedin.com/in/kevinelong/).
