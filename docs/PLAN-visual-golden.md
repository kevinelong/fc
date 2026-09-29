# Plan — visual-golden harness (pixel regression) ✅ SHIPPED 2026-07-05

**Status:** shipped (`spec/port/spike/visual-golden.{mjs,html,json}` for the
reference rasterizer; `tools/visual-golden.cjs` + `spec/golden-shots/` for the real
app). The app-level set now covers **all 22 examples** (the 6 generative toys were
pinned on 2026-09-29) and compares **raw RGBA pixel hashes** — comparing PNG *file*
hashes produced false diffs across Chrome builds, since the encoder emits different
IDAT for identical pixels. Note the rasterizer must match: launch with
`--disable-gpu` (GPU anti-aliasing of circles/lines differs from Skia's software
path, which is what the goldens were rendered with — without the flag, pong,
breakout and bubble-pop reported false diffs on Windows). Verified: 22/22
pixel-identical and deterministic across repeated runs; `--cvd` (colorblind palette
forced on) diffs the 10 color-affected examples while palette-unaffected ones pass,
proving it catches a real pixel change. Note on scope: it pins the pixel output of
the engine's deterministic *draw ops* rendered by a reference rasterizer — catching
color/font/shape/layout drift that op-agreement checks miss — rather than driving
index.html's DOM/CSS.

---


`examples-diff` proves JS≡wasm at the **draw-command** level. It does NOT catch
**presentation** changes — the CVD palette remap, reduced-motion CSS, the font, or
a color-resolution bug that keeps the same draw-ops but paints different pixels.
A visual-golden harness closes that gap: render each example, capture the actual
128×128 canvas pixels deterministically, pin them, and diff on change.

## Approach
- **Deterministic render**: seed the RNG (seed 0, matching examples-diff) and run
  a fixed number of idle frames per example, so pixels are reproducible.
- **Real rendering**: capture pixels from the actual drawing code (the font,
  `resolveColor`, `drawSprite`), not the headless oracle — that's the whole point.
- **Capture**: read `getImageData` for the 128×128 canvas, hash it (e.g. SHA-256
  of the RGBA bytes), store `{example: hash}` as the golden. (Hashes keep the
  golden tiny; optionally also save PNGs for eyeballing.)
- **Driver**: headless chromium (`/usr/bin/chromium`, `--headless=new
  --dump-dom`) against a small harness page that renders one example and writes
  its pixel hash into the DOM/title; a node script iterates examples, collects
  hashes, diffs vs golden. Mirrors the existing `*-diff.mjs` style (no
  puppeteer/jsdom in the repo).

## Deliverables (all in `spec/port/spike/`)
- a harness HTML that renders one example deterministically and exposes its pixel
  hash,
- `visual-golden.mjs` — generate/refresh goldens (`node visual-golden.mjs
  --update`) and check (`node visual-golden.mjs`), exit non-zero on drift,
- `visual-golden.json` — pinned hashes,
- a README note wiring it into the harness list.

## Verify the harness itself
It must (a) pass with no change, and (b) FAIL when a pixel actually changes —
prove by toggling the CVD palette on and showing the hash differs, then off →
matches golden again.
