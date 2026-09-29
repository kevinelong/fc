# fc accessibility & learning-tools plan

Sparked by reviewing **codewithelan.org** (Elan's colorblind-safe scheme + step
debugger) against fc. This tracks the work; ✅ = shipped.

## Enabler — Settings / Accessibility panel (⚙)
fc had **no settings UI** (everything was a toolbar button). A `help-overlay`-style
panel is the shared home for the toggles below; each persists via the existing
`STORE` (localStorage + cloud sync) under `a11y:*` keys and applies on load.

## 1. Colorblind-safe (CVD) palette ✅
**Design — presentation remap, NOT a palette change.** fc's 16-color `SPRITE_PAL`
(index.html) is the source of every pixel and both engines (JS + default WASM)
paint through the JS host canvas. Sprites store palette *indices*, so remapping is
free. We keep the base palette and every draw-command byte-identical, and apply a
`cvdMap(hex)` lookup **at the paint choke-points** (`resolveColor()` return,
`drawSprite`/preview `SPRITE_PAL[ci]`, and the WASM `paint()` color). Because the
remap happens *after* the JS≡WASM comparison boundary, `examples-diff`, `ast-diff`,
and any visual-golden stay green — **zero parity risk**.

CVD palette leans on Okabe-Ito / Paul-Tol distinguishable hues: the colors already
safe (blacks, blues, grays, white, yellow, orange, pink) pass through; the
confusable ones (red / green / dark-green / brown / purple / indigo) are re-tuned
apart on the luminance + blue-yellow axes. Values are documented and tunable.
Mirror into `sprite-editor.html` so drawing matches. Default off (CVD isn't
auto-detectable).

## 2. Reduced motion / "plain screen" ✅
The CRT layer (`#subpixels` + `#scanlines` + canvas `filter`) is pure CSS. A body
class disables it; honor `prefers-reduced-motion` on first load. Photosensitivity
accessibility requirement + a real institutional checkbox.

## 3. High-contrast + larger text (editor) ✅
Body classes bump the editor font size and overlay contrast for low-vision
learners. Same panel.

## 4. Step-through debugger (🐞 step) ✅
The WASM core steps only per **frame**; the JS core (`runtime.exec`) is a plain
recursive interpreter where every statement carries `lineNum` — the only core that
can step per statement. `exec()` is synchronous, so async single-stepping would
mean rewriting the interpreter. Instead: **trace-and-scrub** — one lightweight hook
in `exec`'s statement loop records `{line, varsSnapshot}` (bounded) for a debug run
on the JS core; a scrubber (◀ step-back / step ▶ / play) drives a current-line
highlight in the editor overlay and reuses the live inspector's variable rendering.
Non-invasive, and time-travel (step back) is *better* pedagogy than blocking
single-step. Test: a golden asserting the trace's line/vars sequence.

## 5. ARIA / keyboard pass ✅
Visible `:focus-visible` ring (custom buttons showed none); every modal overlay
gets role="dialog" + aria-modal + label, Escape-to-close, focus moved in on open
and restored to the trigger on close, and a Tab focus-trap — wired via a shared
helper + a MutationObserver on each overlay's visibility, so no open/close code was
touched. Close buttons + the canvas got accessible labels; the canvas is now
keyboard-focusable (tabindex).

**Verified 2026-09-29 in a real browser** (`node tools/ui-check.mjs` — a zero-dep
CDP check, since the repo has no bundled playwright): all six dialogs report
role=dialog + aria-modal + a label; Help moves focus in, Escape closes it, focus
returns to the triggering button, and Tab at the last control wraps to the first.
The same tool covers the live-inspect panel (pause gated step, 3 steps → values
change, stays paused).

## Bigger, optional
- **Runnable transpiler export** — ship a tiny fc-runtime shim so an exported
  Python/JS game actually runs elsewhere ("take your game to a real language").
- **visual-golden harness** (backlog) — pixel goldens would de-risk every visual
  change here; worth building alongside the CVD work.

## Order
Settings panel → CVD → reduced-motion → contrast/text (one bundle), then the
debugger as its own pass. **All of the above shipped 2026-07-05** (commits 8a899ed,
e41c4ca) — the ARIA/keyboard pass (#5) is verified working as of 2026-09-29, and
both "bigger, optional" items shipped too (runnable transpiler export =
PLAN-runnable-export.md; visual-golden harness = PLAN-visual-golden.md). Nothing
outstanding in this plan.
