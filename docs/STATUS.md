# Status — working through the plans

Running log, newest first. Each entry: what changed, the evidence that it works,
and the commit. Plans are marked in place (`✅ SHIPPED` / `⬜ remaining`) as they
complete; this file tracks the cross-plan view. Blocking decisions live in
[OPEN-QUESTIONS.md](./OPEN-QUESTIONS.md).

## 2026-10-11 — the guard suite runs green, and fc ships as an APK again

**(a) The guard suite had been lying about its own prerequisites.** On a fresh clone — and
on all three CI runs since the workflow was added — `node tools/checks.mjs` failed three
checks, none of them for product reasons. `ast` diffed against `rust-ast.json`, which is
generated and gitignored, so it exited 2 wherever nobody had run `parse-ast.mjs` first.
`class-e2e` hardcoded the Windows Chrome path, so it passed locally and died on
ubuntu-latest, where Chrome is `/usr/bin/google-chrome`. `visual-golden` required
`playwright-core`, an undeclared local dependency, and its `MODULE_NOT_FOUND` was reported
as a check failure. Fixed: `ast` declares a `pre` step, every harness shares the new
`tools/chrome-path.cjs`, `visual-golden` declares `needs:['pw']` and SKIPs loudly, and
`checks.mjs` now prints a failing harness's own last lines — an exit code alone is what made
the CI failure blind. CI is green for the first time: 22/22 on Linux, pixel goldens
included, which meant installing `playwright-core` in the workflow and discovering that
Linux software-Skia pixels match the Windows-pinned goldens. (144f908)

**(b) Every root-relative link was dead inside the packaged app.** The Flutter wrapper
serves the bundle from `/assets/www/`, so `/docs/`, `/learn/`, `/teachers/`, `/projects/`,
`/privacy/`, the hero video `/learn/first-game.mp4`, `/icon-192.png`,
`/apple-touch-icon.png` and `/manifest.webmanifest` all resolved one directory too high —
six 404s measured in real Chrome serving the bundle the way the wrapper loops it back.
Every content link and asset on the root page is relative now, the five sub-pages use `../`
prefixes, and `/fc.apk` points at `https://codeonline.io/fc.apk`, which is the right target
from the site and from inside the app. Left absolute on purpose: `/api/...` (needs a server;
documented as unavailable offline) and the share links built from `location.origin` (a
hosted-origin decision, not a path rewrite). (d50e7ae)

**(c) fc ships again: versionCode 4, APK + AAB.** The published APK was a 2026-07-02
snapshot — 17 examples, `index.html` 578 KB, none of the September language work. The
bundle now carries the current app. Two packaging bugs surfaced only by building and then
inspecting the artifact: Flutter's asset directory entries are **non-recursive** and
`teachers/`, `projects/`, `privacy/` and `examples/thumbs/` were never declared, so those
pages and all 22 launcher thumbnails had been missing from **every** APK built so far; and
the copy script skipped `map-editor.html` (opened by the editor's forge button) and
`*.webmanifest`. Bundled web files: 56 → 83. Build host: WSL2 Ubuntu 24.04 with Flutter
3.47.7 natively (no Docker), which required Gradle 8.9 → 8.14.3, AGP 8.7.0 → 8.11.1, Kotlin
1.9.22 → 2.2.20 and compileSdk 34 → 36 — current Flutter enforces all four floors, so the
project's own documented `flutter:stable` Docker image would have failed too. `targetSdk`
stays 34 (raising it changes runtime behaviour and needs the device pass). `.gitattributes`
pins `*.sh`/`android/gradlew` to LF: a Windows checkout's `core.autocrlf=true` broke the
Gradle wrapper before Gradle started. Result: `app-release.apk` 49,518,572 bytes sha256
`2597d8bb…`, `app-release.aab` 49,206,706 bytes sha256 `2839e8bd…`, signed `CN=fc`, 83
bundled web files, aapt reports versionCode 4 / versionName 1.0.3. Verified by extracting
the APK's own assets and loading them the way the wrapper does: the launcher renders and
every relative resource returns 200, with only `/api/...` failing. (fc-app 4039576)

Signed with a **new** key: the July keystore lived on the old Alpine build host and was
never copied back, so v4 cannot install over a v3 copy. The new key, its fingerprints and
the backup warning live in `C:/Users/kevin/fc-signing/`. **Not published** — the live
`fc.apk` is still v3, and the deploy order is: replace the APK first, then
`fc-version.js` (it advertises 4, and the in-app nudge reads the live file).

*2026-10-12:* the binaries moved out of this repository into the public download repo
**`kevinelong/fc-releases`** (release `v1.0.3+4`: APK, AAB, `SHA256SUMS.txt`), verified
downloadable with no token, and **this repository was made public** — the server can now
fetch the APK straight from that URL. `fc-app` (the Flutter wrapper) stays private. Before
the flip, the whole history was scanned for secrets (none: the only credential-shaped file
ever added is `apid/.env.example`, all placeholders) — but note that the internal working
documents are public now: `docs/STATUS.md`, `HANDOFF.md`, `OPEN-QUESTIONS.md`,
`GROWTH-PLAN.md`, `FEEDBACK-PLAN.md`, `DISTRIBUTION.md` and the plan files.

## 2026-09-30 (c) — CI, field-level coverage, semantic cases, and two bugs they found

**(a) The guards now run by themselves.** `.github/workflows/checks.yml` installs apid's
deps, builds the wasm core, and runs `node tools/checks.mjs` on every push and PR, so the
whole suite (22 checks) is one command in CI as well as on a workstation. Nothing else in
the workflow knows about individual harnesses — that is the point of the runner.

**(b) Coverage went one level deeper: fields, not just node types.** `shape-diff` now
reads the keys each parser literal can emit and compares them with the keys any test
program produces (`if` always with a body? `every` always in frames? `tween` never with an
ease? `else` ever inline?). 234/245 fields are exercised; the 11 leftovers are pinned and
most are the heuristic window capturing a local name next to the literal (labelled as
such). Its first real find: **an inline `else <statement>` was parsed in the wasm into an
empty else** — the statement silently did nothing on the default engine. Case first, then
ported (the JS has two shapes: inline → `thenStmt`, bare → `body`).

**(c) The shape cases now assert values, not just agreement.** Agreement between two
engines is necessary but not sufficient — a shared mistake passes. Each of the 16 cases
carries the result the docs promise. That immediately produced three findings:

- **`if score is between 0 and 50` never fired** (LANGUAGE.md line 91). `parseCondition`
  ran its and/or splitting *before* looking for `between`, so the documented range became
  `x is 1` AND `5` — false. The wasm mirrored the same bug and, as it turned out, had no
  `between` condition at all. Fixed in all three JS copies and ported as a real
  `Cond::Between` in the wasm; **node-type coverage is now 103/103** (the last uncovered
  node, `between`, was unreachable until this).
- Two of *my own* cases used the wrong spelling: a bare `face up` (the docs write
  `face <mover> <direction>`) and an unquoted `draw sprite ball` (the docs quote the name —
  a bare word is a variable). Corrected in the cases; the engine was right.
- The wasm's "no sprite called X" check counted only built-in art, so a **user-defined
  sprite drew correctly and then got a false warning** about itself — a bug in the R1 port
  from the previous entry, caught within minutes of the semantic case existing.

Suite: tokenize 2348/2348 · ast 101/101 · exec 79/79 · draw 13/13 · examples 22/22 ·
dump-vars 22/22 · frames 13/13 · shape-diff 16 semantic cases · 103/103 node types ·
smoke 16/16 · mp-smoke 5/5 · fuzz 2000/2000 · err-diff 15 + 127 sweep ·
transpile 101/101 ×4 · core-copy OK · mirror OK · visual goldens 22/22 ·
heal 99/99 corpus · class-e2e 10/10 · share-e2e 6/6 · api-e2e 10/10 · ui-check 82/82 —
and all of it runs as `node tools/checks.mjs` (22 checks) in CI.

**Resuming?** Read [HANDOFF.md](./HANDOFF.md) — the pick-up view (how to run the
suite, the known gaps, and the next actions in order).

## 2026-09-30 (b) — the guards around the guards, and the classroom launch

The audit in (a) found gaps because nothing ran the whole suite in one place. This entry
is the rest of that list: make the claims checkable, then do the product moves the answers
unblocked.

**`tools/checks.mjs` — one command, and a liveness guard.** It runs every harness and
requires each one's *summary line*, with a minimum case count: exit 0 is not enough, so a
harness that dies silently or runs 0/0 fails. That matters because `frames-run.mjs` had
been throwing before its first frame (an unbound `mouse` map) while its "12/12" kept being
repeated, and it also caught `frames-run` printing nothing to stdout — fixed. Checks whose
prerequisites are missing (the built wasm, Chrome, apid's `node_modules`) SKIP loudly.
`--full` widens the fuzzer, `--only <name>` runs one, `--list` shows them.

**`tools/core-copy-check.mjs` — the "one program, three homes" invariant.** index.html's JS
core, `spec/lang/fc-core.mjs` and `fc-core-record.mjs` must have identical code for every
shared declaration (comments and line endings normalised, `\u2026`-style escapes folded to
their characters, formatting ignored). It found real drift on its first run: the browser's
debugger hooks (`_trace`/`_traceLoopFuncs`, `_fmtVal`, `_snapshotVars`) were missing from
both oracle copies — now mirrored, so the oracle really is the browser's core again. Three
declarations differ on purpose (the app's colourblind-safe colour remap, and the record
core's recorder instead of a painter) and are listed with their reasons.

**`tools/api-e2e.mjs` — the live server's other half.** apid's classroom and share pages
had guards; auth, cloud saves and the gallery were live in production with none. It seeds
a user + session, starts the real server and pins: a write without `X-CO` is 403, without a
session is 401, a signed-in save round-trips, publishing returns an id, the gallery lists
it as mine with the code intact, publishing nothing is 400, deleting removes it, and the
classroom stays 404 without the flag. 10/10.

**`spec/port/spike/transpile-mirror.mjs` — the panel must say what the engine does.** The
panel is a second implementation of the language's *rules* and can drift (it did, for
`draw title`). The one rule it is supposed to mirror is asserted in all four languages; the
four runtime-only rules (image inference, mode dispatch, the missing-screen placeholder,
the diagnostics) are recorded with their reasons rather than left as an omission.

**Doc claims about code get a check or a date.** The spike README's "byte-verified equal to
the browser" now names the check that actually does it; `spec/MODULARIZATION.md`'s
inventory said 4972 lines and the file is 8584 — re-measured with a date, since the plan is
still deferred.

**The coverage case found one more real bug.** Teaching the healer that `sprite "x" is
"<hex>"` is a verb: the safety net was "correcting" it to `write "x" is "<hex>"`, which
silently destroys a user's sprite art on the default path. `VERBS`/`LINT_VERBS` gained
`sprite` and `song`, and the drift check that compares the two lists caught the first,
partial fix immediately.

**Product moves (action 8).** `/privacy/` now describes the classroom mode as it exists
(what is stored, the 90-day purge, teacher deletion) instead of promising a planned
feature; `PLAN-classroom.md` states the launch step in one line (`ENABLE_CLASSROOM=true`
plus a restart); GROWTH-PLAN records that classroom is built and that the Q5 launch can
follow it — helped by `/s/<id>`, which finally makes a *user* game link preview for
scrapers; and TEST-MATRIX leads with the must-do four device entries.

Suite: tokenize 2348/2348 · ast 100/100 · exec 78/78 · draw 13/13 · examples 22/22 ·
dump-vars 22/22 · frames 13/13 · shape-diff 15 cases · smoke 16/16 · mp-smoke 5/5 ·
fuzz 2000/2000 · err-diff 15 + 126 sweep · transpile 100/100 ×4 · core-copy OK ·
mirror OK · visual goldens 22/22 · heal 99/99 corpus · class-e2e 10/10 ·
share-e2e 6/6 · api-e2e 10/10 · ui-check 82/82.

## 2026-09-30 (a) — the coverage audit, and the ten documented forms the wasm never parsed

Every gap found in the previous sessions was invisible because the test corpus lacked a
*shape*, not because a test failed. So the first job was to measure that: **29 of the
parser's 115 node types were exercised by zero of the test programs.**

**`spec/port/spike/shape-diff.mjs`** (new) does two things: it enumerates the node types
the parser can emit (lexer token types excluded, taken from the tokenizer itself),
reports the ones no program exercises, and pins that list (`shape-golden.json`) so a new
node type cannot appear without either a case or an acknowledgement; then it runs one
tiny cross-engine program per unexercised *statement* shape, comparing draw commands,
variables and diagnostics.

**What it found, and what got fixed.** The first run reported 5 divergences; the AST
comparison (once the new cases existed) showed ten documented forms were not parsed by
the wasm at all — they fell through to a generic call and silently did nothing on the
default engine:

| form | wasm before | now |
|---|---|---|
| `has` on a list (`if hands has "shield"`) | false (text-only test) | matches JS (list membership) |
| `sprite "x" is "<hex>"` | created a `spritex` variable, drew nothing | registers the art; the sprite renders |
| `song "x" is N …` | created a `songx` variable | registers; never a variable |
| `forever` | never ran its body | runs until `stop` |
| `X and Y` on one line | one statement | `chain` of both |
| `clear hands` | a call | empties the list |
| `walk`/`face`/`stop walking T` | a call | sets facing/dx/dy/walking |
| `walk`/`face T toward U` | a call | aims on the dominant axis |
| `maybe …` (22 probability phrases) | a call | probability statement |
| `restore mover` | a call | restores the frame's saved position |
| `when key is in [...]` | a call | registered, fires on the key's rising edge |

Also fixed: the wasm's `when … pressed` test was looser than the JS shape check, so
`when "c" or "d" is pressed` became a `when_key` instead of the (inert) generic bucket —
which means all `when` handling now matches the JS again (ast-diff 100/100).

**Cases first**, per the port discipline: 7 new corpus programs
(`shapes_conditions/loops/forever_stop/defs/motion/restore_probability/more.fc`) plus a
frame test for the mode switch. Coverage went from 84/103 to **102/103 node types**; the
one left (`between`) is unreachable behind the `and`-split and is pinned with a note.

**Harness limits recorded honestly** so they cannot look like engine bugs later: the JS
recording core calls AUDIO directly while the wasm emits a sound command the host plays
(so `shape-diff` compares draw commands, not sound ops), and the JS recording core's
`__setKey` writes key state without firing the DOM `keydown` listener that drives
`when key is in [...]` (so that path is covered in the app, not in the frame harness).

Suite: tokenize 2348/2348 · ast 100/100 · exec 78/78 · draw 13/13 · examples 22/22 ·
dump-vars 22/22 · frames 13/13 · shape-diff 15 cases + 102/103 covered · smoke 16/16 ·
mp-smoke 5/5 · fuzz 2000/2000 · err-diff 15 + 126 sweep · transpile 100/100 ×4 ·
visual goldens 22/22 · heal 34/34 · class-e2e 10/10 · share-e2e 6/6 · ui-check 82/82.

## 2026-09-29 (m) — the decided language items, /s/<id> share pages, and the touch slice

All seven design decisions from the answers round are now either shipped or a deliberate
"no change", and the two buildable items from the growth/device lists shipped too.

**Language, ported to all four runtimes with cases first:**

- **`draw <name>` (R1+R2).** It used to parse as an unknown shape and draw nothing. Now a
  function of that name is called, else a sprite of that name is drawn, else the line is
  explained. `draw sprite <name>` with an unknown name says the same.
- **`coins is list of 4 sprites` (R3)** fills in `image: "coin"` — the singular of the list
  name, when it is a built-in sprite and the sprite named no image. An explicit image
  always wins; an unrecognised plural keeps the placeholder.
- **`to update play` (R5)** defines `update_play`, dispatched instead of the bare `update`
  while `mode` is "play" — the machinery `to screen X` already used.
- **`go to win` with no `to screen win` (R6)** draws "NO SCREEN: win" + the fix hint and
  reports it once, instead of a blank frame.

R4 (built-in sounds) and R7 (implicit `clear screen`) were "no change", so nothing was
built for them.

**Sharing (`/s/<id>`).** A published game now has a server-rendered page: OG/Twitter tags
for scrapers, then a redirect into the game, with the base64 percent-encoded (a `+` would
otherwise become a space and the wrong game loads). The Share button emits that link
whenever the editor still holds a published game, and the permalink points at it too.

**The touch slice.** Q4's automatable half: under emulated touch the on-screen pad appears
for a touch device, its buttons reach the engine, multitouch (move + fire in one frame)
works, and dragging on the pad never scrolls the page. The rest of the device pass still
needs real hardware.

**Gaps found on the way, all fixed:** the wasm AST emitted `props: {}` where the JS parser
records `props: null` for a sprite list without properties; the wasm exec JSON hardcoded
empty errors and missed the multiplayer vars a game loop seeds; and
`spec/lang/run-node.mjs` seeded Math.random as `(seed>>>0)||1`, putting seed 0 on a
different stream from the wasm — invisible until a bare `list of N sprites` (random
placement) entered the corpus. Corpus goldens are reproducible now.

Suite: tokenize 2271/2271 · ast 93/93 · exec 71/71 · draw 13/13 · examples 22/22 ·
dump-vars 22/22 · frames 13/13 · smoke 16/16 · mp-smoke 5/5 · fuzz 2000/2000 ·
err-diff 15 pinned + 119 sweep · transpile 93/93 ×4 + embed-check · visual goldens 22/22 ·
heal 34/34 · class-e2e 10/10 · share-e2e 6/6 · ui-check 82/82.

## 2026-09-29 (l) — classroom mode: the frontend, verified against the real server

The four classroom decisions were approved as recommended (OPEN-QUESTIONS Q1), which
unblocked the last piece of the teacher vertical: the app now has a classroom.

**What shipped** (all dark until apid sets `ENABLE_CLASSROOM=true`):

- **Feature probe.** `GET /api/class/enabled` answers 200 only with the flag on; the app
  checks it on load and shows nothing at all otherwise — no dead buttons, no failed
  requests, no console noise.
- **Students.** A launcher button and an editor-toolbar button open the classroom
  dialog: type the class code and a display name, and you land on the class shelf —
  the assigned games as tiles, tap one and it loads into the editor and runs. The shelf
  also appears on the launcher for a returning student (stored in the app's own
  `STORE`), and reopening re-reads the class from the server.
- **Hand-in.** A student can submit the program currently in the editor, titled, into
  the class.
- **Teachers.** Signed in, "I'm a teacher — create a class" makes a code and shows the
  roster; the class view can assign the editor's program, un-assign one (new
  `DELETE /api/class/:code/assign/:id`), remove a submission, and copy the code.
- The dialog registers with the dialog-a11y sweep (role/aria/label, Escape, focus
  restore, Tab trap) like every other overlay, and the launcher's tile helpers are
  shared through one `window.FC_UI` handle instead of three globals.

**Guards.** `tools/class-e2e.mjs` (new) runs the **real** apid with the flag on, a
static+proxy server so the app's relative `/api/...` calls reach it, and a real Chrome:
it seeds one teacher and one class, joins cookieless as a student, taps the assigned
tile into the editor, hands a game in, then installs the session cookie and checks the
teacher's roster/assign/delete controls — then restarts apid with the flag off and
proves the entries and the module are absent. 10/10. `tools/ui-check.mjs` grew section
16 (74/74): same page behaviour with the endpoints stubbed, including the
returning-student re-read and the flag-off invisibility. apid's dependencies are now
installed locally to run it (`cd apid && npm install`; `apid/node_modules` and
`apid/data` are already gitignored).

**To launch:** set `ENABLE_CLASSROOM=true` in apid's environment and add the
"Classroom mode" paragraph to `/privacy/` (what is stored: class code, display name,
assigned games, submissions; 90-day idle purge). No code change needed.

Suite: tokenize 2200/2200 · ast 85/85 · exec 63/63 · draw 12/12 · examples 22/22 ·
dump-vars 22/22 · frames 12/12 · smoke 16/16 · mp-smoke 5/5 · err-diff 13 + 109 sweep ·
transpile 85/85 ×4 + embed-check · visual goldens 22/22 · heal 34/34 ·
class-e2e 10/10 · ui-check 74/74.

## 2026-09-29 (k) — the runtime explains itself: line-tagged diagnostics, both engines

fc's promise is "type English, it always runs", so a bad value never stops anything: an
item out of range becomes `nothing`, text in arithmetic becomes 0, a misspelled field
becomes nothing. That silence was the last ⚠️ item on the roadmap — the only message a
beginner ever saw was the host's generic "I got confused: …" (thrown parse errors
only), with no line and no bounds detail.

**What it says now** — same words from either engine, one message per (line, mistake),
capped at 25 so a broken loop cannot flood the panel:

| the mistake | the message |
|---|---|
| `item 5 of hands` (3 items) | `Line 4: hands only has 3 items, but you asked for item 5` |
| `item 0 of hands` | `Line 4: item numbers start at 1, but you asked for item 0` |
| `item 2 of score` | `Line 3: score isn't a list, so I can't take item 2 from it` |
| `item which of hands` (which = "first") | `Line 4: can't use "first" as an item number` |
| `count of score` | `Line 3: score is a number, so I can't count it` |
| `player.speeed` | `Line 3: player has no speeed — did you mean speed?` |
| `lives.count` (lives = 3) | `Line 3: lives is a number, so it has no count` |
| `score + "abc"` | `Line 3: "abc" is text, so I used 0` |
| `10 / score` (score = 0) | `Line 3: can't divide by zero — I used 0` |

**Where it shows.** The app's existing error panel: its rows already become clickable
`Line N:` links that select that line in the editor, so the UI only needed feeding. The
panel is pumped once per frame (rAF, the watchdog fallback, and a single paused step),
so a mistake inside `update`/`draw` surfaces while the game runs, not only at setup.

**How the engines stay identical.** The JS core tracks the executing statement's line
(statements carry `lineNum`) and reports through `Rt.error(msg, line)`. The wasm AST
deliberately carries no line numbers (the JSON contract strips them), so a line is
carried by a new `Expr::At(line, inner)` stamp instead: the parser wraps every
expression, evaluating one records that line, and the JSON emitter unwraps it — the
emitted AST is unchanged (ast-diff 85/85, same as before). `errors_json()` exports the
wasm's list over the same result buffer `dump_vars` uses. No *value* changed anywhere:
every differential, golden and pixel test is untouched.

**Guards.** `spec/port/spike/err-tests/*.fc` (13 cases: one per class plus a loop-dedupe
case, a 26-mistake cap case and a clean control), `dump-err.mjs` pins them, and
`err-diff.mjs` asserts JS == wasm == golden for the cases and JS == wasm across a
109-program sweep (corpus, examples, draw-tests, frame-tests; 2 of those report
diagnostics on purpose — they exist to exercise the forgiving path). `tools/ui-check.mjs`
grew six browser checks (64/64): the default wasm engine explains a bad item, guesses
the misspelled field, the rows are clickable and clicking selects line 4, the JS core
says exactly the same thing, and a correct program stays silent.

Two bugs surfaced while wiring it, both fixed:

- the wasm's new `fc_is_numeric` used the *forgiving* `js_parse_float` (garbage → 0), so
  "abc" looked numeric and the text-in-maths message never fired. err-diff caught the
  divergence on the first run; it now scans a parseFloat-style numeric prefix.
- the app cleared the error panel on every run with raw `innerHTML`, leaving the host's
  "already shown" watermark stale, so a second run's messages were swallowed. Clears now
  go through `fcDiagClear()`.

`transpile-embed-check` also compares content now, ignoring line endings: git stores LF
and Windows checkouts get CRLF, and the injected region must not depend on which tool
last wrote the file.

Suite: tokenize 2200/2200 · ast 85/85 · exec 63/63 · draw 12/12 · examples 22/22 ·
dump-vars 22/22 · frames 12/12 · smoke 16/16 · mp-smoke 5/5 · fuzz 2000/2000 ·
err-diff 13 pinned + 109 sweep · transpile 85/85 ×4 languages + embed-check ·
visual goldens 22/22 · heal 34/34 · ui-check 64/64.

## 2026-09-29 (j) — real-code panel: Lua + GDScript, and a colour bug the panel exposed

The "see it in real code" view — and `transpile.mjs`, its source of truth — now emits
**four** languages: Python, JavaScript, **Lua** and **GDScript**, the two a kid meets
next (LÖVE2D / PICO-8 / Roblox, and Godot). Four tabs, each with its own accent;
`▶ run this` / `⬇ download` stay JavaScript-only, the one a browser can actually run.

**Refactor.** The second language used to be an `if (lang === …)` inside every fifth
line. A dialect is now a table of formatters + helpers (`fcTpDialect`), so a language
difference lives in one place and a new target is a table, not a fork. Python and JS
output stayed byte-identical to the pinned golden through the whole refactor (0
mismatches over 85 programs × 2 languages, re-checked after every batch).

**Two real bugs fell out of writing the Lua/GDScript tables — both present in *all*
four languages:**

- a **colour word** was emitted as a bare identifier: `shade is dark green` became
  `shade = dark green` (invalid everywhere). A multi-word name is never an identifier,
  and a bare word the program never declares is an fc colour name (fc's own ref
  semantics: variable first, then the palette), so both now emit a string literal.
- the reverse: a colour **variable** was emitted as a quoted name — `in shade` became
  `in "shade"`. A word naming a declared variable now passes the variable, so dynamic
  colours survive the translation.

**Guards.** `transpile-diff` diffs all four languages over corpus + examples (85/85);
`transpile-embed-check` still holds the inlined copy byte-identical;
`tools/ui-check.mjs` grew a final section (58/58) that clicks every tab and asserts the
output really has that language's shape (`def …:` / `function … {` / `… then … end` /
`func …:`) and that the four are distinct; `spec/heal/eval.mjs` now drift-checks the
transpiler's palette copy against the app's `COLORS`.

**Two harness repairs came out of running the battery:**

- `frames-run.mjs` never bound the `mouse` map added last session — the harness threw
  before its first frame, so every "frames" claim since then was unverified. It also
  never forwarded clicks to the wasm (only the JS side got them), which is why
  `f_talk`'s choice pick looked broken. Both fixed: **frames 12/12**, and the wasm's
  `set_mouse` now receives the same one-shot clicks the JS side does. The choice-pick
  parity bug was a harness gap, not an engine bug.
- the wasm core substituted an **unknown** `{var}` with an empty string, while the JS
  reference — and `spec/SEMANTICS.md` (interpolate, [QUIRK]) — leaves the literal
  `{name}` in place. Rust `interpolate` now matches the documented behaviour; wasm
  rebuilt and re-inlined (285 KB → base64 in `index.html`).

**Suite after:** tokenize 2200/2200 · ast 85/85 · exec 63/63 · draw 12/12 · examples
22/22 · dump-vars 22/22 · transpile 85/85 ×4 languages + embed-check · smoke 16/16 ·
frames 12/12 · mp-smoke 5/5 · fuzz 2000/2000 (seed 1) · visual goldens 22/22 ·
heal 34/34 · ui-check 58/58.

Roadmap status: **multi-target compilation** moves to ✅ for the panel's part (Python,
JS, Lua, GDScript); a Unity/C# target is the remaining one.

## 2026-09-29 (i) — true subpixel rendering (opt-in), measured verdict

The roadmap's last unbuilt feature. **Opt-in** via ⚙ → "True subpixel (RGB stripes)"
(default off, so the classic look and every pinned pixel golden are unchanged).

**What it does:** reads the 128×128 frame and writes a 384×384 display canvas where
each logical pixel becomes three vertical R/G/B sub-stripes whose intensities follow
that pixel's own channels (leak 0.28, gain 1.9 — the three-stripe average matches the
original luminance), then the browser scales it up (`image-rendering: pixelated`).
The scanline mask still layers on top; the display is `pointer-events: none` so taps
land on the source canvas; a single rAF loop drives the copy, so BOTH engines are
covered with no engine hook, and it keeps working while the live inspector is paused
or stepping. Reduced motion suppresses it, consistent with how the CRT overlays are
already hidden then.

**Verdict — measured, not asserted:**

- **Cost 0.17–0.29 ms/frame** for the post-process (the plan sketched ~1 ms) — 1–2%
  of a 16.7 ms budget, leaving room to render at the exact display scale if wanted.
- **Quality: better.** Side by side on `time-attack`: the classic fringe is a *fixed*
  gradient blended with `mix-blend-mode: screen`, so it brightens everything
  regardless of content — the play area reads washed blue and sprites lose
  saturation. Real stripes follow the picture: clean blue background, saturated
  cyan/pink/green hero and yellow coins, crisp white HUD text with a subtle, correct
  colour fringe.
- **Worth it?** Yes as an opt-in, and the numbers say defaulting it on is affordable.
  That last step changes the shipped look, so it is left as your call (noted in
  ROADMAP). Known nit if it does become the default: the display is 384px wide and
  the browser upscales it, so an odd CSS scale (5, 7) lands stripes on non-integer
  pixels and loses a little crispness — rendering at the exact scale would fix that
  at slightly higher cost.

**Guards** (`tools/ui-check.mjs`, 47/47): off by default; the ⚙ switch turns it on;
stripes are per-channel (R/G/B dominant on a white pixel); the source canvas is
byte-identical (goldens stay valid); taps pass through the display to the engine; and
the cost is printed on every run.

## 2026-09-29 (h) — the last two language features: shooters and talking

Working the two items that were waiting on a model decision, both implemented with the
option each question recommended (switching later is localized):

- **`shoots at TARGET [every N [seconds|frames]] [speed S]`** (Q10 option 1). The
  engine fills `SUBJECT.shots` with `{x, y, dx, dy}` objects on a frame cooldown,
  aims at the target's centre at spawn time, flies them each frame and culls the ones
  that leave the world; the game owns collisions (`each sh in turret.shots`). No RNG,
  so the stream is deterministic. Guards: `spec/corpus/shoot_forms.fc`,
  `frame-tests/f_shoot.fc` (spawn/aim/flight/culling, 11/11 at the time).
- **Dialogue/NPC** (Q11 option 1 — non-pausing): `when player talks to "X"` (tag or
  sprite name, edge-triggered on space/enter while overlapping), `show dialog`
  + `show choice` set `dialog`/`choice` and are drawn by the ENGINE every frame while
  the conversation is active; clearing `dialog` ends it. Guards:
  `spec/corpus/dialogue_forms.fc`, `frame-tests/f_talk.fc` (+ `.keys`/`.mouse`), and a
  real-app case in `tools/ui-check.mjs` (on-screen A → dialog box pixels).

Three bugs fell out of the dialogue guards, all fixed in both engines: the wasm's
`set_body` didn't know `WhenTalk`, so a handler's indented body vanished; the `at x, y`
search was off by one token (every `show choice … at 4, 60` silently used the default
box, which is why the click missed); and drawing the dialog once from the handler
(rather than every frame from the engine) made it disappear a frame later.

Also: the frame harness can now script clicks — `fc-core-record.mjs` exposes
`__setMouse` and `frames-run.mjs` reads `<game>.mouse` (`frame:x:y`), the symmetric
counterpart of `<game>.keys` — and the healer vocabulary learned `shoot`/`shoots`.

Suite at the end of both: tokenize 2200/2200 · ast 85/85 · exec 63/63 · draw 12/12 ·
examples 22/22 · dump-vars 22/22 · transpile 85/85 + embed-check · smoke 16/16 ·
frames 12/12 · mp-smoke 5/5 · fuzz 3000/3000 · conformance 63/63 · heal 34/34 (84
programs accepted) · ui-check 41/41.

Roadmap status: of the "still planned" list only **true subpixel rendering** (now safe
to attempt — the pixel goldens are regenerable) and **compiler targets beyond
Python/JS** remain, plus the media/dependency items already cleared.

## 2026-09-29 (g) — demo media regenerated + two visual-harness bugs

Cleared the "needs a dependency" items with a local playwright-core (installed in the
repo root, which `.gitignore` already covers — `/node_modules`, `/package.json`,
`/package-lock.json`):

- **Regenerated the 3 stale demo assets** — `examples/thumbs/{matrix,starfield,sand}.png`
  (the in-app launcher reads these) and their `share/*.png` OG cards. Starfield now
  shows the parallax brightness, matrix the green tail, sand the grain tones.
- **`examples/thumbs` + `g/` + `share/` generators normalize line endings** (a Windows
  checkout is CRLF; every published `?code=` link is LF — the base64 payload was
  being generated from CRLF source).
- **`tools/gen-share-pages.cjs` takes optional game names** so one card can be
  regenerated without rewriting all 22 (and skips the sitemap on a partial run).
- **Two real bugs in `tools/visual-golden.cjs`**, found because 16 goldens "failed"
  while the renders were identical:
  1. it compared **SHA-256 of PNG file bytes** → Chrome-build-dependent encoder output
     reported false diffs. It now hashes the **raw RGBA** the canvas holds, decoding
     the golden in-page to the same form.
  2. it launched Chrome **without `--disable-gpu`** → GPU anti-aliasing of circles
     differs from the software (Skia) path that produced the goldens, so the three
     circle-drawing games (pong, breakout, bubble-pop) reported false diffs. Both
     fixes plus a boot-settle before stepping/reading.
- **The golden set now covers all 22 examples** (the 6 generative toys were added);
  `chaos` was re-pinned because it had been captured during the GPU-rasterized run.

Evidence that the session's engine work did not alter the library: rendering
`index.html` from the pre-session commit (`7c2058d`) and from HEAD produced
**identical pixel hashes** for pong, breakout, bubble-pop and snake — matching their
goldens. Final: `tools/visual-golden.cjs` **22/22**, deterministic across runs.

## 2026-09-29 (f) — roadmap feature work: colors, effects, tween, AI, inventory

Working down ROADMAP's "Still planned" list, each item built the repo's way (both
engines, corpus/guard first, goldens regenerated by execution, suite green):

| Shipped | Form | Guards |
|---|---|---|
| Dynamic colors (Q7) | `draw … in <var>` resolves color variables everywhere a color word is accepted | `draw-tests/d_dyncolor.fc`, app pixels (starfield 4 colors) |
| `flash screen` / `shake camera` | frame-counted, host-rendered, skipped under reduced motion | `flash_shake.fc`, `frame-tests/f_effects.fc`, ui-check a11y case |
| `emit` | sustained particle emitter following a sprite, same RNG order as `burst` | `emit_forms.fc`, `frame-tests/f_emit.fc` |
| `tween … ease …` | frame-counted property interpolation, five curves | `tween_forms.fc`, `frame-tests/f_tween.fc` |
| AI: `flee from … [when within N]`, `patrols along [...]` | set-once behaviors mirroring `chase`/`patrol` | `flee_patrol.fc`, `frame-tests/f_flee.fc` |
| Inventories | `SUBJECT has inventory`, `add/remove ITEM … inventory`, `SUBJECT has ITEM in inventory` | `inventory_forms.fc` (exec-diff compares the structure) |
| Declarative animation | `{frames: [...], fps: N}` on a sprite | `frame-tests/f_frames.fc` |

Bugs the new guards exposed and fixed along the way: the wasm's `show meter` ignored
the size-less `at x, y … in color` form; `speed N` swallowed a trailing
`when within N` in both engines; `flees from player` parsed its target as the word
"from"; the rust inventory helper returned a list copy (mutations vanished); the
healer mis-read `player has inventory` as a typo of "play", and didn't know `tween`
at all.

Suite after all of it: tokenize 2176/2176 · ast 83/83 · exec 61/61 · draw 12/12 ·
examples 22/22 · dump-vars 22/22 · transpile 83/83 + embed-check · smoke 16/16 ·
frames 10/10 · mp-smoke 5/5 · fuzz 3000/3000 · conformance 61/61 · heal 34/34 +
82/82 untouched · ui-check 39/39.

Still open from the roadmap: dialogue/NPC (needs a decision about whether the engine
pauses — see Q11), `shoot at player every N seconds` (projectile model, Q10), true
subpixel rendering (would invalidate the app visual goldens, which need
playwright-core), compiler targets beyond Python/JS, and the stale demo media.

## 2026-09-29 (e) — dead verbs, roadmap/growth/spec audits

- **`stop music` / `stop sound` was dead in every engine.** The JS parser's generic
  `stop X` (sprite) form ran first and ate `music`/`sound` as a target name, so the
  `stop_music` node — and its `AUDIO.stopMusic()` handler — were unreachable; the
  wasm had no stop node at all. Music/sound is now checked first in all three JS
  copies, and the wasm gained `Stmt::StopSound` (same `stop_music` AST node, a
  `sound/kind:stopmusic` command the page routes to the audio engine). Verified in
  a browser with `setInterval`/`clearInterval` spied before page scripts: a program
  that plays music and stops it on the 1-second timer shows a created music
  interval being CLEARED, on both engines.
- **First-run blip (growth polish #4)** — the sound existed but was never called.
  The first game start in a session now plays it (`sessionStorage`-gated, silent
  when audio isn't unlocked). Verified by counting `createOscillator` calls from
  before page load: exactly one on a fresh session's first run, none on a re-run.
- **Audits.** ROADMAP.md's "Planned" list is now split into what shipped (with the
  verb/file/harness evidence) and what is verifiably absent (dialogue/NPC,
  inventory, `emit`/`flash`/`shake`, tween/easing, AI extras, dynamic colors, true
  subpixel rendering, non-Python/JS targets). spec/ROADMAP.md carries an audited
  status block (Wave 1 + Wave 2 complete; WASM phase 3b done and default; only the
  iOS TestFlight $99 decision open). docs/GROWTH-PLAN.md's queue is complete except
  dynamic OG cards for user games (Q2) and the Stripe/licensing calls (B2/B3).
  spec/port/spike/README.md's stage table no longer says 3b-ii is "next".
- **Specs.** GRAMMAR.md lost reach of a doubled index.html, so whole shipped
  features were undocumented in it: a new §11 table (parse-function-cited, each row
  frozen by a corpus program) plus SEMANTICS.md §18 cover the match timer, behavior
  verbs, animation, particles, tilemaps, increase/decrease, `with`/`its`, list
  membership, `say` gating, `stop music` — and both mark the dynamic-colors
  limitation as a [QUIRK] (Q7). CONFORMANCE.md's stale paths/counts are marked
  historical in favour of the harness table below.

### Final suite (all green, wasm rebuilt + re-inlined)

| Harness | Result |
|---|---|
| `tokenize-diff` | 2118/2118 lines |
| `ast-diff` | 77/77 programs |
| `exec-diff` | 55/55 corpus |
| `draw-diff` | 10/10 cmds |
| `examples-diff` | 22/22 games · 30 frames |
| `dump-vars-diff` | 22/22 live-var snapshots |
| `transpile-diff` / `transpile-embed-check` | 77/77 · inlined copy matches |
| `smoke` / `frames-run` / `mp-smoke` | 16/16 · 5/5 · 5/5 |
| `fuzz` | 3000/3000 |
| `run-node` corpus conformance | 55/55 |
| `spec/heal/eval.mjs` | 34/34 cases · 76/76 untouched · gate 77 · floor 4 starters |
| `tools/ui-check.mjs` | 36/36 browser checks |

### Where the plans stand now

Every plan with buildable work is done: PLAN-visual-golden, PLAN-runnable-export,
PLAN-community-gallery, PLAN-accessibility, PLAN-duration, PLAN-live-inspect,
PLAN-duration, SAFETY-NET phases 0–3 (Phase 2's client UI included; the endpoint
still ships dark), the safety-net floor and its local telemetry. What is left is
not plan debt:

| Open item | Kind |
|---|---|
| Q1 classroom sign-off · Q2 gallery moderation · Q3 generate key · Q8 telemetry scope · Q9 modularization | your decisions |
| Q7 dynamic colors (`in <var>` paints white) | decision (implement vs reword 3 demos) |
| Q4 manual device pass · Q5 feedback posting · iOS TestFlight ($99) | real hardware / accounts |
| ROADMAP "Still planned" (dialogue, inventory, tween, emit/flash/shake, AI extras, true subpixel, more compiler targets) | new features, not started |

## 2026-09-29 (d) — safety net Phase 2 client + Phase 3 shipped

**Phase 3 (the floor of "it always runs") — shipped.** `spec/heal/scaffold.mjs`
holds four small starters (collect / bounce / shoot / stars) with keyword scoring.
When an explicit run leaves the canvas entirely black and the source has no
`run game`, the app offers an amber banner with two directions; picking one loads
that starter into the editor with the user's own lines kept as `--` comments.
Never auto-applied. Telemetry is **local only** (localStorage counters exposed as
`window.FC_NET_STATS()`, summary + copy button in Settings) so the common rewrites
can be absorbed into the language — server-side aggregation is Q8.

**Phase 2 client — built (the endpoint still ships dark).** A `✎ describe` toolbar
button opens a prompt row, POSTs to `/api/generate` with the `X-CO` CSRF header and
same-origin credentials, and OFFERS the gate-validated result ("here is … as a game
(2 tries) — it already runs") with `✎ use it & run` / dismiss. Failure modes each
get a plain-English line (sign in / too long / daily limit / not enabled on this
server yet / offline). Going live still needs the owner's key + `ENABLE_GENERATE`
(Q3); the larger eval set with a semantic rubric remains open.

Verification: `spec/heal/eval.mjs` asserts every starter and every `scaffold()`
output passes the gate for 8 inputs (gibberish included) and that index.html's
inlined starter data equals the module's. `tools/ui-check.mjs` drives the real app:
the floor appears for a dead end, offers two directions, loads and draws the picked
starter; the telemetry records the run and the offered heal and shows in Settings;
the describe path POSTs with the prompt + CSRF header, offers (not applies) the
code, applies it on tap, and explains a dark endpoint. **32/32 UI checks.**

## 2026-09-29 (c) — `say` works on the default engine

**Bug (user-visible):** `say` was implemented only in the JS core. The wasm core —
the app's default engine — had no `say` statement at all, so it parsed as an
unknown call and did nothing: a beginner's first program (`say "hello"`) drew
**nothing** on the default engine, while `?core=js` showed the text. Nothing caught
it because no corpus/example file used `say`, and `parse_exec_to_json` hardcoded
`"say":[]`.

**Fix:** `Stmt::Say(Expr)` (parse/exec/interpolate), a real say buffer in the live
runtime, `dump_say()` + `has_game()` exports, the exec JSON now reports the buffer,
and `WASMCORE.run` paints the lines exactly like `runJSCore` does — script mode
only, so a game never gets them overlaid. Verified: `say "hello there"` + `score is
42` paints **91 non-black pixels, identical on both engines** (was 0 on wasm);
a game with a `say` line still paints only its own 1600 pixels. New corpus guard
`spec/corpus/say_lines.fc` pins the buffer through exec-diff (54/54) and the AST
through ast-diff (76/76); the three browser assertions are in `tools/ui-check.mjs`
(19/19).

Suite after the change: tokenize 2112/2112 · ast 76/76 · exec 54/54 · draw 10/10 ·
examples 22/22 · dump-vars 22/22 · transpile 76/76 · smoke 16/16 · frames 5/5 ·
mp-smoke 5/5 · fuzz 3000/3000 · ui-check 19/19.

## 2026-09-29 (b) — plans closed out: accessibility, duration, live inspect

Three plans had shipped code with unverified or stale claims; each is now verified
and marked in its own doc, and two new tests close real coverage gaps.

- **PLAN-duration.md → ✅ SHIPPED.** Semantics measured frame-by-frame in both
  engines: `time limit is 5 frames` counts `1 1 1 1 0` and fires the handler
  **exactly once** at the crossing frame; `1 seconds` fires at frame 60; with no
  limit no `timer` exists and no handler runs (all 22 example goldens unchanged).
  `frame-tests/f_timer.fc` now draws a fired-counter (`f {fires}`) so a
  fires-twice regression changes the pixels; still 5/5 JS↔wasm.
- **PLAN-accessibility.md → complete.** The #5 ARIA/keyboard pass was already
  implemented (6 dialogs: role/aria-modal/label, MutationObserver focus in/out,
  Escape-to-close, Tab trap); it had never been exercised. Now verified in a real
  browser — see the new tool below.
- **PLAN-live-inspect.md → ✅ SHIPPED.** `dump_vars()` differential (22/22) plus
  the panel behaviour asserted in the browser.
- **New: `tools/ui-check.mjs`** — zero-dependency browser UI checks (Chrome over
  the DevTools protocol using node's built-in WebSocket/fetch, since the repo has
  no bundled playwright). Covers all six dialogs' ARIA, open→focus-in,
  Escape→close, focus restore, Tab wrap, and the live-inspect panel (step gated on
  pause, pause → "paused", ⏭ ×3 changes a value, panel stays live). **16/16 pass.**
  This closes the UI half of PLAN-live-inspect's test plan and is the repo's first
  browser-side test that needs no external npm install.

Remaining plan work: PLAN-classroom (blocked, Q1), SAFETY-NET Phase 2 go-live
(needs the API key, Q3) and Phase 3, TEST-MATRIX (hardware, Q4), FEEDBACK-PLAN
(human posting, Q5).

## 2026-09-29 (a) — engine parity batch (JS↔wasm) + harness portability

Started from a red baseline: three differential harnesses disagreed with each
other. All causes turned out to be **real bugs**, not harness noise.

### Fixed (all in `spec/port/spike/src/lib.rs` unless noted)

| # | Bug | Effect | Fix |
|---|---|---|---|
| 1 | `parse_cond` treated `not X and Y` as `not X…` via `parse_expr`, so the `and`/`or` structure was lost and the test fell through to "not undef" = **always true** | wrong branch taken in sand.fc (`if not moved and x > 0`) | `not X` now recurses into `parse_cond` (mirrors JS `parseCondition`); `no X` still negates an expression; `not` node emits the JS key `expr` |
| 2 | `Expr::Ref` eval had no color-name fallback, and `parse_expr`'s all-word branch concatenated (`dark gray` → `darkgray`) | `shade is dark gray` stored nothing (null) — bare color words never assigned | `Ref` eval falls back to a palette name string (var wins if declared); dotted refs now require a real `.` token, mirroring JS |
| 3 | `parse_write` evaluated unquoted text as an **expression** (`write random 10` → a random digit) | wasm-only semantics: the JS/browser core writes the literal words, and the expression consumed RNG in `draw`, shifting the whole seeded stream | text is a literal (quoted string, or raw words up to `at`) like the JS `parseWrite`; `examples/matrix.fc` rewritten to the documented form (`digit is random 10` + `write "{digit}"`) so the demo still shows digits |
| 4 | token→text joins used `sval()` (empty for numbers) and multi-token bare refs | `set x to 99` produced the ref `"x to "` | shared `tok_text_join` (JS `tokens.map(t => t.value).join(' ')`) |
| 5 | wasm AST omitted `argExprs` on call nodes; args were re-split at exec time | ast-diff drift on 7 programs once the JS oracle was fixed | `Stmt::Call(name, args, argExprs)`; AST emits `argExprs`; exec binds from the parsed exprs |

**Follow-up in this batch:** `X is in [list]` (documented in LANGUAGE.md §list
membership) silently evaluated as equality in the wasm, so every such test was
false — the app's default engine disagreed with the JS core and the docs. Added
`Cond::In` with strict-equality membership (JS `Array.includes`) + corpus guard
`list_membership.fc`.

### Fixed (JS reference core — `spec/lang/fc-core.mjs`)

The file is the corpus oracle ("byte-verified equal to the browser") but had
silently drifted from `index.html` / `fc-core-record.mjs`: it was missing the
**parentheses fix** (`a is (3 + 4)` → NaN for every game on the `?core=js`
fallback), the **user-function parameter** binding, and the `in` param filter.
Ported all five language hunks.

### New corpus guards (the repo's convention for a language change)

`not_and_condition.fc` · `color_word_assign.fc` · `dotted_then_math.fc` ·
`list_membership.fc`.

### Harness portability (they were Unix-only; results were silently wrong here)

- `spec/lang/run-node.mjs`: `new URL(...).pathname` → `fileURLToPath` (was `C:\C:\…`)
- `spec/port/spike/dump-transpile.mjs`: main-module guard never matched on Windows →
  the golden was **never written** (silent exit 0); fixed with `fileURLToPath`
- `smoke/frames-run/mp-smoke/soak`: `/tmp/...` hardcoded → `os.tmpdir()` (+ soak takes an argv path)
- `run-node.mjs` now compares goldens **canonically** (key-order-insensitive), so a
  serialization order change can't masquerade as a behavior diff

### Verification (whole suite green)

| Harness | Result |
|---|---|
| `tokenize-diff.mjs` | 2105/2105 lines |
| `ast-diff.mjs` | **75/75** programs |
| `exec-diff.mjs` | **53/53** corpus |
| `draw-diff.mjs` | 10/10 cmds |
| `examples-diff.mjs` | **22/22** games, 30 frames |
| `dump-vars-diff.mjs` | **22/22** live-var snapshots |
| `transpile-diff.mjs` | 75/75 programs |
| `transpile-embed-check.mjs` | index.html inlined copy matches transpile.mjs |
| `smoke.mjs` | 16/16 games |
| `frames-run.mjs` | 5/5 programs |
| `mp-smoke.mjs` | 5/5 multiplayer games |
| `fuzz.mjs` | 3000/3000 random programs |
| `run-node.mjs` (corpus conformance) | **53/53** |
| `spec/heal/eval.mjs` | 34/34 cases · 74/74 corpus untouched · gate 75 accepted |
| `tools/ui-check.mjs` | 16/16 browser UI checks |

Rebuilt wasm re-inlined into `index.html` (`inline-wasm.mjs`) after each core
change; the app was checked in headless Chrome (matrix still renders digits; the
inspect panel now reports `shade: "light gray"`, i.e. the color-word fix is live).

### Known gaps found (not yet fixed)

1. **Dynamic colors (`draw … in shade`) never resolve** in *either* engine —
   `resolveColor()` only maps literal names. Every "fading tail" / "brighter stars" /
   3-tone sand effect renders flat white. Product decision: Q7.
2. The visual-golden tool's pinned set (`spec/golden-shots/`) covers the 16 classic
   games but not the 6 generative toys (matrix, sand, starfield, life, langton,
   chaos) — running `tools/visual-golden.cjs` would add them (needs playwright-core).

## Plan state at audit

| Plan | State |
|---|---|
| PLAN-visual-golden.md | ✅ shipped (toys not in its golden set — see gap 2) |
| PLAN-runnable-export.md | ✅ shipped |
| PLAN-community-gallery.md | ✅ shipped (Q2 = the one open product call) |
| PLAN-accessibility.md | ✅ complete (verified 2026-09-29) |
| PLAN-duration.md | ✅ shipped (verified 2026-09-29) |
| PLAN-live-inspect.md | ✅ shipped (verified 2026-09-29) |
| SAFETY-NET-PLAN.md | Phase 0/1 ✅ · Phase 2 gate+proxy ✅ (dark, needs key, Q3) · Phase 3 ⬜ |
| PLAN-classroom.md | ⬜ blocked on Q1 |
| TEST-MATRIX.md | ⬜ hardware-only (Q4) |
| FEEDBACK-PLAN.md | ⬜ human posting (Q5) |
