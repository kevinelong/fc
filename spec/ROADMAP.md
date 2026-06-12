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
| **Frame animation** `animate player with "a" "b" every N frames` | Closes the manual-frame-swap gap. |
| **Particles** (finish the stub) `burst 12 sparks at player` | One-line juice. |
| **WASM port phase 3b** | Per-frame command buffer + draw/sprite/collision so the Rust core can run games behind `?core=wasm`. Spike is conformance-green through runtime; this is the remaining chunk. |
| **Cloud saves** | Wire apid's reserved `states` slot (auth exists) so `save`/`load` sync across devices. After Wave-1 #4 defines the verb semantics. |
| **Embed snippet** | One-click iframe embed for blogs; complements ?code/gist/community. |
| **Multiplayer as headline** | Portal positioning: none of the rivals ship built-in MP; fc has relay + Tag + Hunt. |
| **iOS TestFlight** | Blocked on the $99 Apple Developer decision; path documented in fc-app/IOS-BUILD.md. |

## Working rules (carried from the spec effort)
- Every language change: add corpus `.fc` cases FIRST, regenerate goldens by EXECUTION
  (`node spec/lang/run-node.mjs --update`), never predict outputs; keep `spec/lang/fc-core.mjs`
  in sync with index.html (the extraction is the oracle).
- The Rust spike (`spec/port/spike`) will lag new verbs — note divergences in spec/port/README
  rather than blocking the feature.
- Keep the single-file index.html deployable (no build step); PWA/APK must keep working offline.
- Demos ladder: teaching demos stay plain-English-first; trophies may stretch.
