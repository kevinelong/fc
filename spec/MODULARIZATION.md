# fc — Modularization Plan

**Status:** plan (not yet executed). **Real source:** `/home/kevin/codeonline/index.html`
(4972 lines when this plan was written in 2026-06 — **8584 lines as of 2026-09-30**, so
re-measure the inventory below before executing any of it; one classic `<script>` at
L441–4880, a second tiny `<script>` at L4883–4970
for the service-worker registration). **Goal of this document:** split the monolith into
small source modules with a clean lang↔platform seam, while keeping the *shipped* artifact a
single self-contained `index.html` — the file that is served, bundled into the APK, and
cached by the PWA. Nothing about the served artifact changes; only the *authoring* shape does.

This plan is written to dovetail with the Rust→WASM port already drafted in
`spec/port/fc_core.rs` and the conformance corpus in `spec/corpus/`. The JS `Host` interface
defined below is deliberately the same seam as the Rust `pub trait Host` (fc_core.rs L381–411),
so the eventual WASM core can be dropped in behind the identical boundary.

---

## 0. Guiding constraints

1. **The output stays one file.** `index.html` must remain self-contained: no `<script src>`,
   no `<link rel=stylesheet>` to local JS/CSS, no runtime module fetches. This is a hard
   requirement for the file:// fallback paths in the code (the example loaders at L4373–4376
   and L4444–4446 already warn "use the live site, not a local file" because `fetch` of
   `examples/*.fc` fails on file://). The single-file invariant is what makes the APK bundle
   and the offline PWA work.
2. **`parse()` is and must stay platform-free.** Per the existing structure, the tokenizer +
   parser touch no DOM/canvas/audio/net. The `Runtime` is the only impure part (it reaches
   module-level singletons `ctx`/`AUDIO`/`NET` directly). Modularization formalizes this:
   `lang/` is pure, `platform/` owns all I/O, and the two meet only at a `Host` object.
3. **Behavior-preserving.** This is a *refactor*. Every `[QUIRK]` documented in
   `spec/SEMANTICS.md` and `spec/GRAMMAR.md` must survive byte-for-bit. The corpus
   (`spec/corpus/*.fc`) is the trip-wire.
4. **Beginner-friendliness is unaffected.** This is engine plumbing. The plain-English surface
   language and the editor UX do not change.

---

## 1. Target source layout

```
codeonline/
  src/
    lang/                 # PURE. No DOM, no canvas, no AUDIO, no NET, no window.*
      lexer.js            # tokenizeLine
      ast.js              # node shape constants / factory helpers (doc + dedup)
      parser.js           # parse + parseBlock + parseLine + parseIf + splitOnAnd + parseExpression
      builtins.js         # singularize, COLORS, coercion/equality/isTruthy helpers
      runtime.js          # class Runtime (eval/exec/exec*), parameterized by a Host
      index.js            # re-exports: parse, tokenizeLine, singularize, Runtime, COLORS
    platform/             # IMPURE. The browser implementation of the Host seam.
      font.js             # FONT / FONT_DATA tables + glyph baking
      canvas.js           # ctx + resizeCanvas + clearScreen/fillRect/circle/line/pset/drawText/drawSprite
      audio.js            # AUDIO IIFE (procedural SFX + chiptune)
      net.js              # NET IIFE (wss peers/state sync)
      input.js            # normalizeKey + pressKey/releaseKey + keydown/keyup wiring
      host_browser.js     # assembles canvas+audio+net+input into one Host object for Runtime
    ui/                   # IMPURE. Editor shell, launcher, account, PWA. Not part of the core.
      editor.js           # textarea, debounce-run, tab-insert, errors div
      launcher.js         # buildLauncher, GAMES grid, examples picker, share, forge, keyword bar
      account.js          # ACCOUNT/AUTH IIFE (Google/GitHub sign-in, nicknames, publish)
      app.js              # top-level run(), wiring, boot/init
    styles.css            # the contents of the <style> block (L17–290)
  index.template.html     # HTML shell with <!--CSS--> and <!--BUNDLE--> placeholders
  build.mjs               # esbuild bundle + inline -> index.html  (commit the artifact)
  index.html              # GENERATED, committed (served / APK / PWA)
  copy-web-assets.sh      # UNCHANGED
```

`src/lang/` is exactly the set the WASM port replaces. When `fc_core.rs` compiles to WASM, the
glue layer exports the same `parse`/`Runtime` surface, and `src/lang/index.js` becomes a thin
shim selecting JS-core vs WASM-core — `platform/` and `ui/` are untouched.

---

## 2. Extraction map (cite line ranges in current `index.html`)

### 2.1 `lang/` — pure core (no DOM/canvas/audio/net)

| Module | Source region | Notes |
|---|---|---|
| `lexer.js` | `tokenizeLine` **L1369–~1435** | Typed tokens; tab=2sp, level=floor(spaces/2) (L1374–1378). Negative-number lexing only after operator/comma/lparen/line-start (L1394). Unknown chars silently skipped. PURE already. |
| `parser.js` | `parse` **L1437–~2632**: `parseBlock` (L1464), `parseLine` (L1486), `splitOnAnd` (L1889), `parseIf` (L2017), `parseExpression` (L2186) | This is the keyword-dispatch parser + the `[QUIRK]` heuristics (parseIf inline-statement split L2017–2069; splitOnAnd command-word boundary L1889; right-to-left expression split L2186; `to screen X` → func `screen_`+X at L1516; fallback unknown-line → `{type:'call'}` at ~L1872). Calls only `tokenizeLine` + `singularize`. PURE. |
| `ast.js` | (new; no single source region) | The parser emits ad-hoc object literals (`{type:'if',...}`, `{type:'chain',...}` L1509, `{type:'call',...}` L1872, etc.). Extract the node-`type` vocabulary into named constants/factories so `parser.js` and `runtime.js` share one definition. Pure documentation/dedup move — **must not change emitted shapes** (the corpus pins them). |
| `builtins.js` | `singularize` **L1146–~1161**; `COLORS` **L473–492**; coercion/equality/truthy helpers lifted from Runtime methods | `singularize` is pure and already a free function. `COLORS` (27 named entries, PICO-8 first 16, default `#fff1e8`) is pure data — referenced by both draw (`platform/`) and parse-time color words, so it lives in `lang/builtins.js` and is *imported* by `platform/canvas.js`. The math/equality/`isTruthy` logic currently lives as Runtime methods (`isTruthy` L2698, equality `==`/`!=` L2851, math coercion `parseFloat(x)||0` L2768, `add X to` concat/push split L2932) — extract the *pure* parts as free functions so they can be unit-pinned independently. |
| `runtime.js` | `class Runtime` **L2633–~4014** | The tree-walker: `constructor` (L2634), `reset` (L2661), `error` (L2693), `isTruthy` (L2698), `getVar`/`setVar` (L2709/2725), `evalExpr` (L2740), `evalCondition` (L2847), `interpolate` (L2889), `exec`+`smartExecList`+`execList` (L2897, smart at L3435/L3471), `execDraw` (L3476), `drawButton`/`drawMeter` (L3548/3566), `execWrite` (L3597), `execCall` (L3607), `callFunc` (L3620), `startGameLoop` (L3631), `_autoWalk`/`_collectAllSprites`/`_findEmptySpot` (L3769/3781/3793), `checkCollisions` (L3810), `processKeyPress`/`processMouseClick` (L3986/4001). **This is the impure module** — it reaches `ctx`/`AUDIO`/`NET` and `requestAnimationFrame`/`setInterval` directly. The extraction's central job: route every such reach through an injected `Host` (see §4). |

**Impurity inventory inside Runtime (each becomes a `Host` call):**
- Draw: `ctx.fillRect` (L3344, L3398, L3499, L3559–3593, L3577–3585, L4020, L4033), `drawText` (L3563, L3593, L3604, L4035), `drawSprite` (L3540), `ctx.fillRect(0,0,128,128)` clearscreen (L3344).
- Loop: `requestAnimationFrame` (L3756–3758), `setInterval` 60Hz watchdog (L3763).
- Audio: `play` paths into `AUDIO`.
- Net: peers/connected written from `NET` each frame (~L3637).
- Input: `checkCollisions` fires user handler bodies via `this.exec` (so it can draw/play — not pure; stays in `runtime.js`, side effects go through `Host`).

### 2.2 `platform/` — browser host (all I/O)

| Module | Source region | Notes |
|---|---|---|
| `font.js` | **L496–516+**: `FONT_W/H/SPACING` (L499), `FONT` (L500), `FONT_DATA` bake (L516, fill at L583) | 3×5 bitmap font tables + glyph baking. Pure data + a bake loop; lives in platform because only `canvas.drawText` consumes it. [QUIRK] font is UPPERCASE-only (drawText `toUpperCase`). |
| `canvas.js` | `canvas`/`ctx` (L446–447), `resizeCanvas` (L452–467), `drawText` (L587–603), `drawSprite` (L1102–~1145), plus the raster primitives | Owns the 2d context. Implements the draw half of the `Host` (clear/fillRect/fillCircle/line/pset/text/sprite). Imports `COLORS` from `lang/builtins.js` and `FONT` from `font.js`. |
| `audio.js` | `AUDIO` IIFE **L1162–~1294** | Procedural chiptune SFX + music, `setInterval` music timer (L1254). Custom SFX recipes (L1262) and songs (L1231) are *authored in fc* — so the parser produces sound/song defs that the runtime forwards via `Host.define_sound`/`play_sound`. The `ensure`-on-gesture wiring (L1176–1177) stays here. |
| `net.js` | `NET` IIFE **L1295–~1368** | wss to `codeonline.io` (L1317), `peers` stable-array-rebuilt-in-place, `Object.assign` state merge, `STALE_MS=4000`, `pruneStale` (L1362), reconnect on visibility/online (L1359–1360). Exposes peers/connected for the runtime's per-frame read. |
| `input.js` | `normalizeKey` (L4054), `pressKey` (L4067), `releaseKey` (L4082), keydown/keyup (L4098–4110), tab-insert (L4092–4094) | Keyboard state. Implements `Host.key_down`/`mouse`. Note: tab-insert is editor behavior but currently colocated with key handling — split: tab-insert → `ui/editor.js`, key state → `platform/input.js`. |
| `host_browser.js` | (new; assembles the above) | Constructs the single `Host` object (§4) from canvas+audio+net+input and hands it to `new Runtime(host)`. This is the file that, in the WASM future, is handed to the WASM core instead. |

### 2.3 `ui/` — editor shell, launcher, account, PWA (not the engine)

| Module | Source region | Notes |
|---|---|---|
| `editor.js` | `editor`/`errorsDiv` (L448–449), debounce-run (L4015, L4048–4050), `errorsDiv.textContent` wiring (L4021, L4043), tab-insert (L4092–4094), focus/blur editing class (L4118–4119) | The `#editor` textarea + `#errors` div. **This is where diagnostics finally surface** — today `runtime.errors` is shown at L4043 but the located `error()` facility (L2693) is essentially unused; the WASM seam wires it properly via `Host.error`. |
| `launcher.js` | `buildLauncher` IIFE **L4450–~4690** region | `GAMES` data (L4393), `NEW_GAME_STARTER` (L4418), `APP_VERSION` (L4424), examples picker (L4369–4376), `openForge`/`closeForge` (L4360–4367), `setPlaying`/`showHome`/`openGameView` (L4381–4441), share-as-URL (L4471), keyword bar `kbar` build (L4503–4508 over a `KEYS` table). |
| `account.js` | ACCOUNT/AUTH IIFE **L4710–~4878**: `api()` (L4758), `renderAccount` (L4762), `refresh` (L4792), `signOut` (L4802), sign-in/verify modals, `loginReturn` (L4866) | Third-party sign-in (Google + GitHub), nicknames, publish. `state = {user:null}` (L4720). Talks to `/api/auth/*`. Entirely UI/server — independent of the core. |
| `app.js` | `run` **L4017–~4047**; `init` IIFE (L4690); top-level boot | The orchestrator: `run(source)` parses + constructs Runtime + executes; `say` buffer renders to canvas only when `!gameLoop` (sayBuffer → L3404, render L4030). Owns the boot sequence. |
| `styles.css` | `<style>` **L17–290** | Lifted verbatim; re-inlined at build time. |
| (service worker reg) | second `<script>` **L4883–4970** | The `serviceWorker.register('/sw.js')` block (L4894–4897). Stays inline in `index.template.html` as a trailing script (it is tiny, runs after load, and is unrelated to the bundle). `sw.js` itself is untouched. |

---

## 3. Build pipeline — esbuild + a ~40-line Node `build.mjs`

### 3.1 Recommended tech: **esbuild**

Bundle the ES modules under `src/` into **one IIFE** with esbuild, then inline that IIFE + the
CSS into `index.template.html` to produce the committed, self-contained `index.html`.

Why esbuild specifically:
- **Single zero-transitive-dependency binary.** `esbuild` ships as one native binary with no
  dependency tree. For a project whose entire deploy story is "one HTML file + a shell script
  to copy assets," pulling in a 300-package toolchain would be absurd. esbuild keeps the build
  itself as close to dependency-free as the artifact.
- **Genuine bundling + tree-shaking + minify** in a single fast invocation (`bundle:true`,
  `format:'iife'`, `minify:true`). It resolves the `import`/`export` graph across
  `lang/`/`platform/`/`ui/` and emits one self-contained script — exactly what the single-file
  invariant needs.
- **Programmatic API** (`esbuild.build({ write:false })`) returns the bundle as a string, so
  `build.mjs` can inline it without a temp file.
- **WASM-friendly later.** When `fc_core.wasm` arrives, esbuild can inline it as base64 (or the
  loader can `fetch` it — but for the single-file invariant we base64-embed) without changing
  the build shape.

### 3.2 `index.template.html`

The current `index.html` with the `<style>…</style>` body replaced by `<!--CSS-->` and the
big `<script>…</script>` body (L441–4880) replaced by `<!--BUNDLE-->`. The HTML structure
(launcher L293, canvas L321, editor L349, errors L350, kbar L348, manifest link L8) and the
trailing service-worker `<script>` (L4883–4970) stay as literal template text.

### 3.3 `build.mjs` (sketch, ~40 lines)

```js
// build.mjs — bundle src/ into a single self-contained index.html
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';

const tpl = await readFile('index.template.html', 'utf8');
const css = await readFile('src/styles.css', 'utf8');

const result = await build({
  entryPoints: ['src/app.js'],   // ui/app.js is the boot entry
  bundle: true,
  format: 'iife',
  target: ['es2019'],            // matches the classic-script baseline the code assumes
  minify: true,
  legalComments: 'none',
  write: false,                  // return bundle as string
});
const js = result.outputFiles[0].text;

// Guard the single-file invariant: bundle must not emit external references.
if (/\bimport\s|\brequire\(/.test(js)) {
  throw new Error('bundle is not self-contained (unresolved import detected)');
}

const html = tpl
  .replace('<!--CSS-->',    () => `<style>\n${css}\n</style>`)
  .replace('<!--BUNDLE-->', () => `<script>\n${js}\n</script>`);

await writeFile('index.html', html);
console.log(`wrote index.html (${html.length} bytes)`);
```

Run with `node build.mjs`. **Commit the generated `index.html`** (it is the served/APK/PWA
artifact; CI re-runs `build.mjs` and fails if the committed file drifts from a fresh build —
a cheap "build is reproducible" check). `copy-web-assets.sh` is **unchanged**: it still copies
`index.html`, `examples/`, `sw.js`, icons, manifest, etc. as before.

---

## 4. The lang↔platform boundary: a `Host` interface (matches the WASM seam)

The core must never name `ctx`, `AUDIO`, `NET`, `requestAnimationFrame`, or `window` directly.
`Runtime` takes a `host` in its constructor and routes all I/O through it. The JS `Host`
mirrors the Rust `pub trait Host` already drafted in `spec/port/fc_core.rs` **L381–411** so the
two cores are interchangeable behind one seam:

```js
// the shape Runtime depends on (browser impl in platform/host_browser.js):
const host = {
  // raster (mirror execDraw cases ~L3488, drawText, drawSprite)
  clear(color) {},                       // ctx.fillRect(0,0,128,128) clearscreen
  fillRect(x, y, w, h, color) {},
  fillCircle(x, y, r, color) {},
  drawLine(x1, y1, x2, y2, color) {},
  pset(x, y, color) {},
  drawText(text, x, y, color) {},        // [QUIRK] UPPERCASE-only
  drawSprite(name, x, y) {},

  // input
  keyDown(key) { return false; },
  mouse() { return { x:0, y:0, pressed:false }; },

  // audio
  playSound(name) {},
  playMusic(name) {},

  // definitions / registration
  defineSprite(name, rows) {},
  defineSound(name, spec) {},
  registerSprite(name, x, y) {},

  // diagnostics — finally WIRES UP located errors (JS error() at L2693 is built-but-unwired)
  error(msg, line) {},

  // engine clock + net (frame loop owned by host; core is a pure step())
  now() { return performance.now(); },
  netPeers() { return []; },             // peers stable array (net.js)
  netConnected() { return false; },
  netBroadcast(state) {},
};
const rt = new Runtime(host);
```

Two boundary refinements the extraction should make (both behavior-preserving):

1. **Invert the game loop.** Today `startGameLoop` (L3631) owns `requestAnimationFrame`
   (L3756) and the `setInterval` watchdog (L3763). Move the *scheduler* into
   `platform/host_browser.js` (it calls `rt.step()` each frame); the core exposes a pure
   `step()`/`tick()` that does one frame of state update + emits draw/audio/net calls through
   `host`. This matches `fc_core.rs`'s `step`/replay comment (L505–510) and is the only way the
   WASM core (which cannot own a `requestAnimationFrame`) can drive the same logic. **[QUIRK]
   preserve the JS frame order**: peers/connected WRITTEN from NET first (~L3637), then
   player/gravity/edge-clamp/`screen_<mode>` dispatch — `step()` must keep that order or
   `every N seconds` (round(N*60), 60fps assumption) and net-driven games diverge.
2. **Route `error()` through `host.error`.** This is the seam that finally surfaces located
   diagnostics (the corpus and `spec/CONFORMANCE.md` expect specific error behavior). [QUIRK]
   today silent no-ops (missing func at execCall L3607; forward-referenced func not hoisted,
   registered at exec time L3087) stay silent — the JS browser host should *keep* them silent
   to preserve behavior, while the conformance host records them. Decide per §6.

`net.js`/`audio.js` keep their internal `setInterval` timers (music L1254, pruneStale L1362) —
those are host-owned background tasks, not core logic, and don't cross the seam.

---

## 5. Sequencing

**The corpus safety-net comes FIRST. Extraction is mechanical only once the net is green.**

1. **Corpus first (DONE / extend).** `spec/corpus/*.fc` already pins the high-risk quirks
   (parseIf splits, if/else-in-loop divergence, 1-based `item`, loose `==`, numeric `+`,
   inclusive `random`, singularize, truthy edges). Build a tiny headless harness that runs each
   corpus file through the *current* in-page `parse`+`Runtime` and snapshots
   (tokens, AST, final `vars`, ordered draw/audio/net call log). **Note:** `window.runtime` is
   NOT set today (`run()` uses a local Runtime), so this needs a one-line test hook
   (`window.__rt = runtime`) or to consume the extracted `lang/` directly. Freeze these as
   golden outputs. **Do not proceed until goldens exist and the current monolith reproduces
   them.**
2. **Extract `lang/` (pure).** Move `lexer`/`parser`/`builtins`/`ast`/`runtime` into `src/lang/`
   verbatim; introduce the `Host` param on `Runtime` and route the impurity inventory (§2.1)
   through it. Provide a stub/record `Host` for tests.
3. **Prove corpus green against `lang/`.** Run the golden harness against the extracted
   `src/lang/` (with the record-`Host`). Byte-identical tokens/AST/vars/call-log or the
   extraction is wrong. This is the gate.
4. **Extract `platform/` and `ui/`.** Move canvas/audio/net/input/font and editor/launcher/
   account/app. Assemble `host_browser.js`. Invert the loop (§4.1).
5. **Wire `build.mjs` + `index.template.html`.** Bundle, inline, emit `index.html`. Byte-diff
   *behavior* (not bytes) of the built page vs the original monolith via the same golden harness
   loaded in a real browser/headless. Commit the artifact.
6. **CI reproducibility check.** `node build.mjs` in CI; fail if committed `index.html` differs
   from a fresh build. Run the corpus harness against the built page.
7. **(Later) WASM swap.** `src/lang/index.js` becomes a selector: JS-core vs `fc_core.wasm`
   behind the same `Host`. Differential-test the WASM core against the *same* goldens.

---

## 6. Risks & mitigations

| Risk | Why it bites here | Mitigation |
|---|---|---|
| **parseIf heuristic drift** (L2017–2069, highest-divergence per memory) | Hand-moving the `seenCompare`/`is`-split logic into `parser.js` is exactly where a subtle behavior change hides. | Corpus pins `parseif_*` cases (compare-then-is, and-resets, dotted-inline, is-compare-cond). AST snapshot must be byte-identical. Extract by *cut/paste*, not rewrite. |
| **if/else-in-loop divergence** (smartExecList top-level L3471 vs plain execList in loops L3003) | Tempting to "fix" while refactoring; that changes behavior and breaks goldens. | This is documented behavior, not a bug-to-fix here. Corpus has `ifelse_toplevel_*` and `ifelse_in_loop_*` + `elseif_in_loop`. Preserve verbatim. Raise the fix as a separate decision (see decisions). |
| **Loose equality / numeric `+` / coercion** moved into `builtins.js` | `'5'==5`, `0==''`, numeric `'3'+'4'==7`, `/0→0` are JS-`==`/`parseFloat` artifacts; a "cleaner" helper would diverge. | Extract as thin wrappers over raw JS `==`/`parseFloat(x)||0`. Corpus `eq_*`, `plus_op_*`, `divide_by_zero`, `add_to_*` pin them. |
| **Frame-order / timing** when inverting the loop (§4.1) | Net-write-first ordering (~L3637), 60fps `every N seconds` (round(N*60)), forever-cap 1000 outside loop / maxOps 100000. | `step()` keeps the exact statement order; keep the op caps in core. Differential test a net/`every`/`forever` corpus case with a recording Host. |
| **Single-file invariant broken** by an accidental external `import`/dynamic fetch | A stray `import()` or `<script src>` would silently break APK/PWA/file://. | `build.mjs` guard regex rejects unresolved `import`/`require` in the bundle (§3.3); CI loads the built page from `file://` and runs a smoke corpus to catch fetch-only regressions. |
| **`window.*` exposure** (`window.run/parse/singularize/tokenizeLine`) relied on by tools/forge | The sprite/sound forge iframes and external pages may poke these globals. | `ui/app.js` re-exports the same names onto `window` after boot, preserving the public surface. Audit `sprite-editor.html`/`sound-studio.html` for usage. |
| **Build adds a dependency to a zero-dep project** | Contradicts the "one file + shell script" ethos. | esbuild is a single binary; pin it in `package.json` `devDependencies` only; the *shipped* artifact has zero deps. |

**Cross-cutting mitigation — differential testing against goldens.** Every step (2,3,5,7) is
gated by reproducing the frozen corpus snapshots: tokens, AST, final `vars`, and the ordered
`Host` call log (draw/audio/net). Same inputs → identical outputs, or the change is rejected.
This is also the mechanism that validates the future Rust→WASM core (`spec/port/fc_core.rs`)
against the JS core — one corpus, two cores, behind one `Host`.

---

## 7. Alternatives considered

- **vite-plugin-singlefile.** Vite + a plugin can inline everything into one HTML. It works,
  but drags in the full Vite/Rollup dependency tree and a dev-server model this project doesn't
  need. For a single static page with no HMR requirement, that's heavy and adds supply-chain
  surface. esbuild gives the same single-file result with one binary.
- **Zero-dependency concatenation** (a Node script that `readFile`s each module in dependency
  order and string-concats them, stripping `import`/`export`). Maximally dependency-free, but
  you hand-maintain module order, lose tree-shaking/minify, and must hand-roll an
  `import`/`export` rewrite — fragile exactly where the parser's tangled internal references
  live. esbuild does the graph resolution correctly for one extra (single-binary) dep.
- **Why esbuild wins:** it is the minimum tool that *correctly* bundles an ES-module graph into
  one self-contained IIFE, while keeping the build's own dependency footprint to a single
  zero-transitive-dep binary — matching this project's "one file, one script" ethos. The
  ~40-line `build.mjs` does the HTML/CSS inlining that no bundler should own anyway.

---

## 8. Decisions for the human

- **Fix the if/else-in-loop divergence, or replicate it?** This plan *replicates* it (treats it
  as frozen behavior). If the spec intends to *fix* it, that's a separate, corpus-breaking
  change to schedule after modularization, not during.
- **Should the browser `Host` start reporting today's silent no-ops** (missing func, forward
  reference) now that `Host.error` exists, or stay silent to preserve behavior? Plan default:
  stay silent in the browser host, record in the conformance host.
- **WASM embedding strategy** for the single-file invariant: base64-inline `fc_core.wasm` into
  the bundle (keeps one file, larger HTML) vs. `fetch` it (breaks file://). Defer until §5.7.
