> **Status 2026-09-29 (audited).** Wave 1 is complete: this roadmap ✔, the docs
> review ✔, the if/else-in-loop lock ✔, `save`/`load` ✔ (corpus
> `save_load_roundtrip.fc`, `load_missing_default.fc`; cloud mirror via
> `/api/state`), launcher thumbnails ✔ (`examples/thumbs/*`, wired into the
> gallery), Frogger ✔ (`examples/frogger.fc` + thumbnail + share page). Wave 2 is
> complete too: text tilemaps + the ▦ map editor ✔, enemy-AI verbs ✔, frame
> animation ✔, particles ✔, cloud saves ✔, the ▣ embed snippet ✔, multiplayer as
> the launcher headline ✔ — and **WASM phase 3b is done**, not staged: the frame
> loop (update/draw, motion, collision, camera, input, sprite blit) matches the JS
> core over the whole library (`examples-diff` 22/22, `dump-vars-diff` 22/22,
> `smoke` 16/16, `mp-smoke` 5/5, `fuzz` 3000/3000) and the wasm is the DEFAULT
> engine in the browser. The one open row is **iOS TestFlight**, blocked on the $99
> Apple Developer decision (fc-app/IOS-BUILD.md).
>
> Working rules below still hold — and are now enforced by the harness suite rather
> than by hand (see docs/STATUS.md for the current green table).

# fc roadmap — 2026-06 review → expansion plan

From the 2026-06-12 portal review (goals: plain-English north star · docs plan · distribution ·
reimplementation spec; research inputs: demo-games deep-research, PICO-8 competitive study).
**Rule for every item: prefer extending the language with a readable verb over hand-rolled math
in user `.fc` code.**

## Verified during review (no work needed)
- **if/else-in-loop divergence: FIXED & corpus-locked.** `execList` now delegates to
  `smartExecList` at every nesting level (index.html ~2905); `ifelse_in_loop_false.fc` +
  `elseif_in_loop.fc` goldens lock the *fixed* semantics; 31/31 conformance green via
  `spec/lang/run-node.mjs`. (The old memory note "FIX vs REPLICATE open" is resolved: FIXED.)
- **Docs item #1 (editable examples): fully shipped.** docs/ + learn/ examples are textareas;
  ▶ Run executes the *edited* code in the sticky stage; ✎ Open-in-editor carries edits.
- Gravity/jump helper, sound (18 SFX + `define sound` + sequencer), sprite-editor.html,
  sound-studio.html: all shipped — both research snapshots predate these.

## Wave 1 — this session
| # | Item | Why (goal tie) | Done-when |
|---|------|----------------|-----------|
| 1 | This roadmap | plan of record | committed |
| 2 | ~~Verify docs #1~~ | docs plan | ✔ verified shipped |
| 3 | ~~if/else-in-loop fix~~ | beginner trust | ✔ verified shipped + locked |
| 4 | **`save` / `load` verbs** — `save score as "best"` · `load "best" into score` (per-game localStorage namespace; numbers/strings/lists/objects; missing key → 0-ish default, no crash) | research gap "SAVE/LOAD"; unlocks high-score in every demo; plain-English | corpus cases + goldens green; works in browser; documented in docs reference + quirks |
| 5 | **#22 output thumbnails** — Playwright-render each examples/*.fc, screenshot the canvas, wire images into the launcher gallery | last open docs-plan item (13/13) | thumbnails visible in launcher; pages load clean |
| 6 | **Frogger demo** (`examples/frogger.fc`) — lane-based movers, no AI/gravity/tilemap needed | the one missing trophy from the research build order; exercises collision tags + lanes + sound | runs clean via Playwright (0 errors); in launcher with thumbnail |

## Wave 2 — staged next (prerequisites noted; NOT in this session)
| Item | Notes / prerequisites |
|------|----------------------|
| ~~**Text tilemap** + in-app **map editor**~~ | **✔ SHIPPED 2026-06-12.** `tile "#" is {…}` + `map is` indented rows + `draw map` + `solid at x, y`; map solids block movement (axis-restore integrated); world auto-sized; 3 corpus cases, 37/37 green; Coin Maze demo; MAP·FORGE editor (▦ map button) completes the editor trio. |
| ~~**Enemy-AI verbs**~~ | **✔ SHIPPED 2026-06-12.** `ghosts chase player [speed N] [through walls]` · `bats wander` · `guard patrols between X1 and X2` — declarative set-once behaviors; markers live on the sprite (`ghost.behavior.speed` is editable fc data); map-solid slide unless `through walls`; 2 corpus cases (39/39); ghosts added to Coin Maze; docs entry. |
| ~~**Frame animation**~~ | **✔ SHIPPED 2026-06-12.** `animate X with "a" "b" every N frames` — set-once frame cycling on the global tick; marker on the sprite; corpus-locked. |
| ~~**Particles**~~ | **✔ SHIPPED 2026-06-12.** `burst N sparks at player / at X, Y [in color]` (the noun is decorative — `burst 8 stars at …` works too); auto-updated pool (cap 400), drawn over the game layer, camera-aware; maze coins + caught now burst. |
| **WASM port phase 3b** | Per-frame command buffer + draw/sprite/collision behind `?core=wasm`. **Side-by-side 2026-06-12 (after catch-up): lexer 1274/1274 ✓ · parser 51/51 ✓ · runtime 40/40 ✓** — the Rust core fully matches the grown language at the exec level; what remains for 3b is the frame loop itself (motion/draw/collision). **Slice 1 done** (`draw map` pixel parity). **Slice 2 done 2026-06-12: single-frame step** — Rust RunGame executes one frame mirroring the JS loop (update fn → chase/patrol motion with libm IEEE sqrt → animation swap → gravity/clamp → player map-solid axis-restore → camera follow → draw fns → screen dispatch); f_frame1.fc diffs bit-identical (7/7 draw-tests). **Slice 3 done 2026-06-13** (multi-frame step_frame + pickups/hostile, 6 frames bit-identical). **Slice 4 done 2026-06-13: input** — `move with arrows` (+facing/dx/dy/walking), autowalk, and `when "<key>" is pressed` handlers; a `set_key(code,on)` wasm seam + record-fork `__setKey`/`__bindRT` drive a deterministic keyscript; frames-run.mjs 6 frames bit-identical (2/2). **Arena note:** the no_std bump allocator never reclaims across frames, so the multi-frame harness re-instantiates the wasm PER program (a real game loads one program per instance) — don't run two programs' frames on one instance. **Slice 5 done 2026-06-13: `?core=wasm` wired in the browser** — fc programs run through the Rust→WASM core and render via the command buffer onto the real canvas (tilemap+sprites+text proven). draw-sprite ported (render 9/9). **Single-frame static preview only:** the spike's bump arena never reclaims (4MB) and `#[panic_handler]{loop{}}` hangs the tab on the first OOM, so a 60fps loop is unsafe — gated on an allocator + non-hanging panic handler (next 3b task). Frame-by-frame correctness already proven headlessly (frames-run 6/6). **Slice 6 done 2026-06-14: allocator hardening + live loop** — swapped the 4MB never-reclaiming bump arena for `dlmalloc` (`GlobalDlmalloc`, grows/reclaims linear memory) and replaced `#[panic_handler]{loop{}}` with a clean `wasm32::unreachable()` trap (catchable, no tab hang); `reset_arena` is now a no-op. Soak: 3000 frames holding Right, memory flat at 74 pages (`bounded: true`). All 5 harnesses still green (lexer 1274 · parser 51 · exec 40 · render 9 · frames 2). Browser rAF loop re-enabled (badge "⚡ core: wasm (live)"). **Playwright user-perspective verification:** maze game runs sustained past the old ~50-frame OOM point (no crash, ghost chase advancing between frames); open-field input test proves input→motion — hero centroid x 23.5 → 123.5 (hold Right) → 3.5 (hold Left), HUD "X 120", sprite intact (38px). **Slice 7 done 2026-06-15: wander + particles parity — 3b COMPLETE.** `bats wander` now executes in the Rust frame loop (rng short-circuit `(!vx&&!vy)||rng<0.02` + `cos/sin` angle + the map-solid velocity-flip/clamp), and `burst` simulates a real particle pool (3 rng draws/particle: angle·speed·life; `0.96` drag; reverse-index age/draw; 400 cap) emitting one rect/particle between the draw fns and screen dispatch — JS render order. The frames harness seeds `Math.random = mulberry32(0)` to match the wasm seed; f_wander.fc + f_burst.fc diff **bit-identical over 6 AND 50 frames** (libm `cos/sin` matched V8 for all tested inputs; particle aging/death stays in lockstep). All 5 harnesses green (lexer 1274 · parser 51 · exec 40 · render 9 · **frames 4/4**). The Rust→WASM core now fully covers the game runtime. **Slice 8 done 2026-06-15: host seams + THE SWAP — wasm is now the DEFAULT engine.** Three host effects route through the command buffer (single JS source, no reimplementation): (1) **sound** — `Cmd::Sound`/`Cmd::DefSfx` → `AUDIO.play`/`music`/`defineSfx` (recipe shape matched; live: 274 oscillators); (2) **buttons/screens/mouse** — `show button` draws + registers a hitbox IN the core, `set_mouse` feeds taps, `frame_step` dispatches button + `when mouse clicked` handlers, `go to`/`go back` via a screen_stack (live: menu→play on tap); (3) **multiplayer** — `join`/`broadcast` emit net commands (value via `emit_val`), a no_std `json_to_val` parser + `set_net(peers,connected)` feed `peers`/`connected` each frame (headless: reads "peers 2 on true", draws peer ghosts). Then flipped the default: `WASMCORE.active` defaults true (`?core=js` opts out, gated on `typeof WebAssembly`); `run()` routes to wasm and falls back to `runJSCore()` transparently if the wasm fails to load or traps. Verified live: default→wasm, `?core=js`→JS, blocked-wasm→JS fallback, all render. 5 harnesses still bit-identical (exec 40 · render 9 · frames 4/4). The JS core remains the conformance reference. **Slice 9 done 2026-06-15: wasm inlined — true single-file.** `spec/port/spike/inline-wasm.mjs` base64-embeds `fc_spike.wasm` into index.html between `FC_WASM` markers (217KB → 290KB b64; index.html ~516KB); `load()` decodes the inline (URL fetch only as a dev fallback when the marker is empty). This makes the app self-contained (offline/PWA/APK — no separate fetch) AND version-controls the wasm in git (the `/target` binary stays gitignored; the base64 in the committed index.html is the source of truth, so a fresh clone runs `?core=wasm` with no build). Verified live: with the `.wasm` URL blocked the game still runs through wasm (URL never requested). **Build step:** after `cargo build` re-run `node spec/port/spike/inline-wasm.mjs`. **WASM port 3b fully complete — wasm is the default, single-file, conformance-green engine.** **Slice 10 done 2026-06-15: validation hardening.** Two new differential tools: `examples-diff.mjs` (every live `examples/*.fc` JS-vs-wasm, draw ops, 30 frames — 11/11) and `fuzz.mjs` (seeded random valid programs, vars diff — 2000/2000 green, a standing regression guard). Bug-hunting on type-mixed/edge fuzzed inputs found + fixed 5 real silent divergences from the JS reference: UTF-8 interpolation (byte-split → `Â·`), `remove`-by-identity (loose_eq Obj/List via `Rc::ptr_eq`), `as_num` Undef/Obj→NaN (matching `Number()`), `json_num` NaN/Inf→`null`, and the `add` accumulator `(current||0)` coercion. Known narrow quirk: `÷` (U+00F7) isn't in the lexer's ASCII operator set → effectively unsupported in both engines. Also shipped: teaching "did you mean?" hints for misspelled verbs (zero false positives on examples+corpus). |
| ~~**Cloud saves**~~ | **✔ SHIPPED 2026-06-12.** apid `GET/POST /api/state` (session-auth, X-CO, 4KB/value + 64KB/user caps, merge semantics — server-tested end-to-end); client STORE is local-first with a debounced cloud mirror + boot pull (cloud wins at boot, local during play). Signed out/offline = exactly the old behavior. Language semantics unchanged; corpus untouched. |
| ~~**Embed snippet**~~ | **✔ SHIPPED 2026-06-12.** `?embed=1` chrome-free mode already existed; added the ▣ embed toolbar button that copies a ready iframe snippet (clipboard-verified live). |
| ~~**Multiplayer as headline**~~ | **✔ 2026-06-12** — launcher subtitle leads with “multiplayer built in.” |
| **iOS TestFlight** | Blocked on the $99 Apple Developer decision; path documented in fc-app/IOS-BUILD.md. |

## Working rules (carried from the spec effort)
- Every language change: add corpus `.fc` cases FIRST, regenerate goldens by EXECUTION
  (`node spec/lang/run-node.mjs --update`), never predict outputs; keep `spec/lang/fc-core.mjs`
  in sync with index.html (the extraction is the oracle).
- The Rust spike (`spec/port/spike`) will lag new verbs — note divergences in spec/port/README
  rather than blocking the feature.
- Keep the single-file index.html deployable (no build step); PWA/APK must keep working offline.
- Demos ladder: teaching demos stay plain-English-first; trophies may stretch.
