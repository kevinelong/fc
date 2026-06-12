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
| **WASM port phase 3b** | Per-frame command buffer + draw/sprite/collision behind `?core=wasm`. **Side-by-side 2026-06-12 (after catch-up): lexer 1274/1274 ✓ · parser 51/51 ✓ · runtime 40/40 ✓** — the Rust core fully matches the grown language at the exec level; what remains for 3b is the frame loop itself (motion/draw/collision). **Slice 1 done: `draw map` renders through the command buffer with pixel parity (6/6 draw-tests); sprite table generated from the JS oracle (gen-sprites.mjs); recording fork regenerated + drawText stub documented.** |
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
