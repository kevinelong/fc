# WASM.md — Architecture for an fc Language Core hosted by HTML

Status: design / recommendation. Grounds every claim in the real reference
implementation (`/home/kevin/codeonline/index.html`, ~4972 lines) and the
existing Rust sketch (`/home/kevin/codeonline/spec/port/fc_core.rs`).

This document specifies the boundary between an **fc core compiled to WASM**
and the **HTML page that hosts it**. The companion artifacts are
`SEMANTICS.md` (what the bytes mean), `GRAMMAR.md` (what parses),
`CONFORMANCE.md` (how we prove the port matches), and `port/fc_core.rs`
(the in-progress core that already establishes the `Host` trait and a
`DrawCmd` enum — this document turns those into a concrete WASM ABI).

---

## 0. The honest headline: WASM is NOT a speed win here

The fantasy console renders at **128×128** (`ctx.fillRect(0,0,128,128)`,
~L3344, ~L4020). Each frame the tree-walker emits at most a few hundred draw
ops under a hard op budget of `maxOps || 100000` (~L2899) and a `forever`
cap of 1000 outside the game loop (~L3047). A tree-walking interpreter over
that workload is already trivially fast in JS; nothing here is CPU-bound.

**Do not pursue WASM for performance.** The prize is twofold and both halves
are architectural, not perf:

1. **Single source of truth for web + native.** One core, compiled to
   `wasm32-unknown-unknown` for the page and to a native target for an
   APK / desktop / CLI oracle. The native build is what runs the golden
   conformance vectors (`CONFORMANCE.md` already names the Rust→WASM core as
   "the single source of truth" — see CONFORMANCE.md L114–117).
2. **An enforced host seam.** The reference monolith reaches module-level
   singletons `ctx` (~L447), `AUDIO` (~L1162), `NET` (~L1295) *directly* from
   the `Runtime`; its constructor takes **no host** (this is exactly the
   coupling `fc_core.rs` L15–20 calls out). A WASM boundary is a *physical*
   wall: the core literally cannot touch the canvas, so the seam can never
   silently rot back into direct calls.

Everything below optimizes for those two wins and for a **small inlined
artifact**, not for throughput.

---

## 1. The boundary: a per-frame COMMAND BUFFER, not per-call host imports

There are two ways to let a WASM core affect the page:

- **(A) Per-call host imports.** The core imports `clear`, `fill_rect`,
  `draw_text`, `play_sound`, … from JS and calls them one at a time as it
  executes statements. This mirrors `fc_core.rs`'s `Host` trait
  (`fn clear`, `fn fill_rect`, … L381–413) translated literally into WASM
  imports.
- **(B) A command buffer (RECOMMENDED).** The core writes an ordered list of
  draw/sound commands into its own linear memory during `step()`, then
  returns a count. JS makes **one** crossing per frame to learn the count,
  then reads the commands out of the shared memory and replays them onto the
  canvas / WebAudio. This is exactly the `DrawCmd` drain path already
  sketched in `fc_core.rs` (L416–435: "collect a frame's worth of draw
  operations into a `Vec<DrawCmd>` and drain it once… This is the clean WASM
  boundary").

**Choose (B).** Three reasons, in priority order:

1. **The buffer IS the conformance golden output.** `CONFORMANCE.md` (L31–35,
   L107–117) defines the captured artifact as `{say, errors, vars, commands}`,
   where `commands` is "the ordered per-frame draw/play command buffer
   (clearscreen / rect / circle / line / sprite / drawText / play …)." The
   command buffer is therefore *not a side effect of the design — it is the
   thing we already decided to diff*. With option (B) the runtime's normal
   output path and the conformance capture are the **same bytes**. With
   option (A) we'd have to add a *separate* recording host just for tests
   (`makeRecordingHost`, CONFORMANCE.md L107), and then prove that the
   recording path and the live import path agree — extra surface, extra
   divergence risk.

2. **Far fewer boundary crossings, no per-call string marshaling.** Per-call
   imports cross the WASM↔JS boundary once per primitive *and* must marshal a
   color string (`"dark blue"`, ~L475) and, for text/sprite, a content string
   on every single call. WASM has no native string type — every such call
   becomes "pass a `(ptr,len)` into JS, have JS decode UTF-8." With a command
   buffer, the core writes everything into linear memory in its own encoding
   and JS decodes lazily, in bulk, once per frame. A frame that draws 200
   rects is 200 boundary calls + 0–200 string decodes under (A), versus
   ~1 call + a single contiguous memory read under (B).

3. **Determinism / replayability.** A drained buffer is a pure value: it can
   be hashed, snapshotted, diffed, shipped to a native oracle, or replayed by
   *any* backend (canvas, native framebuffer, a headless recorder). Per-call
   imports bury the frame's output inside the timing of JS callbacks.

The cost of (B) is an in-memory wire format and a decode loop in JS. That
format is specified in §3.

---

## 2. Opcode set

The opcodes are a 1:1 image of what the reference runtime can actually emit.
Grounding for each (the JS `execDraw` switch is ~L3386–3520; clearscreen
~L3341; pset ~L3394; play/music ~L3347–3354; sprite/song/sfx definitions
~L3356–3366). The set deliberately matches `DrawCmd` in `fc_core.rs`
(L422–435) plus the definition/registration ops the `Host` trait carries
(L405–408).

> **As built, the payload is JSON, not these bytes.** The byte numbers below are the
> *design sketch*. The core that actually ships (`spec/port/spike/src/lib.rs`) emits the
> frame's commands as JSON records keyed by `op` — see §3.2, `emit_cmd` at
> `spec/port/spike/src/lib.rs:3435`. The *semantics* stated here still hold (color by
> name, uppercase-at-render, defaults baked at emit time, screen-space coordinates); only
> the encoding differs. Treat this table as the op *inventory* and §3.2 as the wire format.

| Op | byte | Payload (after the op byte) | Reference |
|----|------|------------------------------|-----------|
| `CLEAR`   | `0x01` | color | clearscreen ~L3341–3344 |
| `RECT`    | `0x02` | x, y, w, h, color | rect ~L3496–3500 (default w=8, h=w) |
| `CIRCLE`  | `0x03` | x, y, r, color | circle ~L3489–3494 (default r=4; filled `ctx.arc`+`fill`) |
| `LINE`    | `0x04` | x1, y1, x2, y2, color | line ~L3502–3511 (1px stroke) |
| `PSET`    | `0x05` | x, y, color | pset ~L3394–3399 (single pixel) |
| `TEXT`    | `0x06` | x, y, color, str | drawText ~L587–605 — **[QUIRK] rendered UPPERCASE-only** (`toUpperCase`, ~L590); 3×5 font, 1px spacing |
| `SPRITE`  | `0x07` | x, y, str(name) | drawSprite ~L1102–1115; 8×8 nibble-hex; nibble 0 = transparent |
| `SOUND`   | `0x10` | str(name) | `AUDIO.play` ~L3350 |
| `MUSIC`   | `0x11` | str(name) | `AUDIO.music` ~L3349 |
| `STOP_MUSIC` | `0x12` | — | `AUDIO.stopMusic` ~L3354 |
| `DEF_SPRITE` | `0x20` | str(name), 64-nibble hex | ~L3356–3358 (validates length 64) |
| `DEF_SONG`   | `0x21` | str(name), tempo, rows… | `AUDIO.defineSong` ~L3362 |
| `DEF_SFX`    | `0x22` | str(name), recipe | `AUDIO.defineSfx` ~L3366 |
| `ERROR`   | `0x30` | line(u32, 0=none), str(msg) | wires up the BUILT-BUT-UNWIRED `error()` facility (~L2693); see `fc_core.rs` L410 |

Notes that the port MUST honor or buffers diverge:

- **Color is a string, not a palette index.** The reference resolves color
  late, by name, against a **27-entry palette** including `gray`/`grey` and
  `gold`/`cyan`/… (`COLORS`, ~L473–486) with default `#fff1e8` and pass-
  through for `#hex`/`rgb(...)` (`resolveColor`, ~L587–595). The core does not
  know hex; it carries the *name string* in the buffer and the host resolves
  it. This keeps the palette in one place (the host) and keeps the golden
  buffer human-diffable ("dark blue", not `0x02`). [QUIRK] two-word names are
  stored verbatim (`stmt.color` is `colorTokens.map(t=>t.value).join(' ')`,
  ~L1696).
- **`TEXT` content is NOT uppercased in the buffer.** The bitmap font
  uppercases at *render* time only (~L590). The golden buffer therefore
  preserves the author's case (CONFORMANCE.md L124–126 makes this explicit).
  The port must store the raw string and uppercase only inside the host's
  glyph blitter.
- **Defaults are baked at emit time.** `rect` with no `h` emits `h = w`
  (~L3498); `circle` with no `r` emits `r = 4` (~L3490). The core resolves
  these defaults so the buffer is fully specified.
- **Camera offset is applied in the core.** World-space draws subtract
  `camera.x/y`; HUD draws do not (~L3478–3479, `stmt.hud`). The emitted
  coordinates are already screen-space, so the host blits them literally.
  (This mirrors `DrawStmt.hud` in `fc_core.rs` L359.)

Numbers are emitted as **f64** because the reference is JS-number-everywhere
(`String(Number)` display leaks `0.1+0.2`, see SEMANTICS / ~L2768 coercion).
The host floors where the reference floors (pset/sprite floor coords:
`Math.floor`, ~L3395/L1113).

---

## 3. Linear-memory layout

The core owns one `WebAssembly.Memory` (exported). Three fixed regions plus
the heap. Offsets are illustrative; the only contract is that the ABI
functions (§4) report the live pointers/lengths so JS never hardcodes them.

```
+----------------------------+ 0
|  INPUT BUFFER  (host -> core, fixed size)
+----------------------------+
|  COMMAND BUFFER (core -> host, grows within a cap)
+----------------------------+
|  SOURCE staging (host -> core: the .fc program text)
+----------------------------+
|  heap / stack (Rust allocations)
+----------------------------+
```

### 3.1 Input buffer (host writes, core reads)

A small fixed struct the host overwrites *before each `step()`*. It is the
WASM image of the reference's `keyState` map (~L2850), `mouseState`
(`{x,y,down,clicked}`, ~L2641), and the `peers/connected` net-read (~L3637).

| Offset | Type | Field | Reference |
|--------|------|-------|-----------|
| +0  | u32 (bitset) | key bitset | `keyState[key]` ~L3641 / `pressKey`/`releaseKey` ~L4067–4084 |
| +4  | i32 | mouse x | `mouseState.x` ~L2641 |
| +8  | i32 | mouse y | `mouseState.y` |
| +12 | u8  | mouse down (held) | `mouseState.down` ~L3669 |
| +13 | u8  | mouse clicked (edge, this frame) | `mouseState.clicked` ~L3648; **host clears after the core reads it**, matching `self.mouseState.clicked = false` ~L3675 |
| +14 | u8  | connected (net) | ~L3637 |
| +16 | u16 | frame counter low / tick | drives `every N seconds`≈`round(N*60)` (60fps assumption ~L3763) and `every N frames` line-keyed cadence (CONFORMANCE.md L261) |

**Key bitset assignment.** The reference uses *named* keys after
`normalizeKey` (`' '`→`space`, `escape`→`esc`, ~L4060–4063). The ABI fixes a
canonical bit order so core and host agree. Minimal documented set (the page
hints list, ~L398): `left=0 right=1 up=2 down=3 space=4 enter=5 esc=6`,
with the remaining bits reserved for single-character keys mapped by a small
shared table. The core's `key_down("left")` indexes this bitset; arbitrary
letter keys (`when "a" is pressed`) use the extended slots. [QUIRK] this
replaces JS's open-ended string map with a fixed table, so any key not in the
table is the one observable behavior change — the table must cover every key
the corpus uses.

Mouse: a single `(x,y,down,clicked)` read mirrors `Host::mouse()->(x,y,down)`
in `fc_core.rs` L401, extended with the `clicked` edge flag the reference
tracks separately (~L3648 vs ~L3669).

### 3.2 Command buffer (core writes, host reads)

**As built: a JSON record stream, not the byte stream this section used to describe.**
One static buffer holds the frame's commands as JSON text, and the host `JSON.parse`s it
once per frame. Both frame entry points build the same text:

- `parse_render(len, seed)` — parse, run frame 1, stash the runtime in `LIVE_RT`, return
  the command array (`spec/port/spike/src/lib.rs:3452-3467`).
- `step_frame()` — advance one more frame off the stashed runtime and rebuild the array
  (`spec/port/spike/src/lib.rs:3514-3528`).

Each writes into `RES` (`RES_CAP = 1 MiB`, `spec/port/spike/src/lib.rs:3306`) and returns
the byte length; the host reads `res_ptr()` for that many bytes and parses it — `readJson`
at `index.html:7237`, called as `paint(readJson(w.step_frame()))` at `index.html:7263` /
`:7280` and `paint(readJson(w.parse_render(len, 0)))` at `index.html:7330`. That is the §1
win (one crossing per frame) made concrete; only the payload's encoding changed.

A record is `{"op": …}` plus the fields its op needs (`emit_cmd`,
`spec/port/spike/src/lib.rs:3435-3448`):

| op | fields | source |
|---|---|---|
| `rect` | color, x, y, w, h | `draw rect` (defaults baked at emit time, §2) |
| `circle` | color, x, y, r | `draw circle` |
| `line` | color, x1, y1, x2, y2 | `draw line` |
| `text` | color, x, y, text | `write` / `draw text` (case preserved, §2) |
| `sound` | kind, name | `play …`; `kind` is `music` / `stopmusic` / (empty) |
| `defsfx` | name, recipe | `define sound`; `recipe` is emitted JSON (tone or notes) |
| `flash` | color | `flash screen` |
| `shake` | magnitude | `shake camera` |
| `net` | kind, a, b | `join game … room …` / `broadcast …` |
| `store` | key, value | `save v as "k"` — **new 2026-10-12** |
| `song` | name, tempo, rows | `song "x" is <tempo> "<notes>"` — **new 2026-10-12** |

[QUIRK] **Overflow truncates; it does not error.** Every writer copies `min(len, RES_CAP)`
bytes (`spec/port/spike/src/lib.rs:3464`, `:3519`, `:3525`), so a frame whose JSON exceeds
1 MiB is silently cut — the earlier sketch's "emit an `ERROR` record and stop" was never
implemented. It has not fired (the op budget keeps a 128×128 frame far under the cap), but
a decoder must not assume the array is well-formed if it ever does.

**The host does more than blit — seven ops are effects, not draw calls.** `index.html`'s
`paint()` routes them before the canvas (`index.html:7241-7247`): `sound`→`AUDIO`,
`flash`→`fcFlash`, `shake`→`fcShake`, `defsfx`→`AUDIO.defineSfx`, `net`→`NET`,
`store`→`STORE.set`, `song`→`AUDIO.defineSong`. Everything else falls through to the `ctx`
draw path.

**Delivery differs by design, and the guards say so.** The JS reference calls
`AUDIO`/`STORE`/`NET` in process; the wasm cannot, so it emits a command the host applies.
`spec/port/spike/shape-diff.mjs:146` therefore filters the host-effect ops
(`sound`, `defsfx`, `net`, `store`, `song`) out of the cross-engine command comparison — the
engines must agree on *what the program means*, and the *effect* is pinned separately by
`tools/app-api-e2e.mjs` (the real app on the wasm engine). See `docs/STATUS.md` (i).

### 3.3 Source staging

The program text is UTF-8 copied here by the host before `load()`. The core
tokenizes/parses from this region (the reference `tokenizeLine`/`parse` are
platform-free — `parse()` is "platform-FREE", per the source map; CONFORMANCE
treats parse as host-independent). After parsing, this region may be reused.

---

## 4. ABI (exported functions + the one export that matters)

Mirror the `{say, errors, vars, commands}` capture shape (CONFORMANCE.md
L107–117) so the WASM core and the JS reference produce identical vectors.

```
// ---- exports (WASM -> JS) ----
memory : WebAssembly.Memory          // THE shared linear memory (see §3)

alloc(len: u32) -> ptr               // host asks core for a staging region
input_ptr() -> ptr                   // pointer to the §3.1 input struct
cmd_ptr()   -> ptr                   // pointer to the start of the §3.2 buffer

load(ptr: u32, len: u32) -> i32      // parse program text at [ptr,len].
                                     //   returns 0 on success, or writes
                                     //   ERROR records + returns count<0 sentinel.
                                     //   (parse is platform-free; ~L1437)

step() -> u32                        // advance ONE frame:
                                     //   1. read input struct (§3.1)
                                     //   2. run the frame body / handlers
                                     //   3. fill the command buffer (§3.2)
                                     //   returns cmdCount = number of records.

// capture accessors for conformance (drained as buffers/JSON by the host):
say_ptr()   -> ptr ; say_len()   -> u32   // sayBuffer (~L3404)
err_ptr()   -> ptr ; err_len()   -> u32   // located errors (~L2693, finally wired)
vars_json_ptr() -> ptr ; vars_json_len() -> u32  // scalar var snapshot for diffing
```

**As built (2026-07-…2026-10-12) — the sketch above is the design, not the artifact.** The
shipped core's `#[no_mangle]` exports in `spec/port/spike/src/lib.rs` are: `parse_render
(len, seed)` and `step_frame()` (each runs one frame, writes the §3.2 JSON into `RES`, and
returns its byte length; the host reads `res_ptr()` for that many bytes), `parse_exec_to_json
(len, seed)` (the exec / `{say, errors, vars}` capture the differential uses), `set_key
`(code, on)`, `set_mouse(x, y, down)`, `set_net(len, connected)`, `seed_store(len)`, `src_ptr()`
(the staging pointer every host→core payload is written through — program text, peers JSON, the
seed), and the read-only accessors `dump_say()`, `dump_vars()`, `errors_json()`, `has_game()`
(`spec/port/spike/src/lib.rs:3452`, `:3514`, `:3308`, `:3472`, `:3479`, `:3486`, `:3502`, `:1226`,
`:3531`, `:3555`, `:3545`, `:3540`, `:3307`). There is **no** `load` / `step` / `cmd_ptr` /
`input_ptr` / `alloc`: input arrives as `set_*` calls rather than a fixed struct the host
writes, and the command buffer is a length-returning JSON write, not a `count` read.

The **load/step contract**:

- `load(ptr,len)` is called once per program edit. It does tokenize + parse
  (recursive descent, keyword-dispatch if-ladder, ~L1486) and registers
  funcs/screens. [QUIRK] funcs are *not hoisted* in the reference — registered
  at exec time (~L3087) so a call to a later-defined func silently no-ops. The
  port preserves this: `load` parses, but forward references still no-op (or
  emit `ERROR` if we choose to wire it — that is a `decisions_needed` item).
- `step()` is the per-frame entry. The host calls it once per `requestAnimation
  Frame` tick (the reference's 60 Hz `setInterval` watchdog, ~L3763, becomes a
  host concern). `step()` returns the command count; the host then reads
  `cmd_ptr()` and decodes `count` records. For *non-game* programs (no game
  loop) the host calls `step()` exactly once and the `say` buffer is the
  artifact (matching "rendered to canvas only when `!gameLoop`", ~L4030).

This is intentionally a *count-returning* `step()` rather than a callback-per-
op design: one crossing in (`step`), one crossing out (the count), then a bulk
memory read. That is the §1 win made concrete.

**`seed_store(len)` — the durable `save`/`load` values, fed in before the first frame
(added 2026-10-12).** The payload is the `store` op (§3.2) in reverse. A `save` the core
emits is applied by the host into `STORE` (localStorage + `/api/state`), but `load` reads
the *core's own* store, so on a fresh page the durable copy must be handed back: the host
streams a JSON object of `key → value` through the source buffer and `seed_store` parses
it and stashes the pairs in `PENDING_STORE` for `Rt::new` to apply to every run
(`spec/port/spike/src/lib.rs:3499-3512`; `Rt::new` applies them at `:1777`). The host side
is `index.html`'s `seedStore()` (`index.html:7308-7321`), which seeds both `STORE._mem`
and the `fc:save:` localStorage keys — `STORE.get` falls back to localStorage, so seeding
only memory would miss a value saved before this page load. It is called once, before
`parse_render` (`index.html:7329`).

---

## 5. Minimal host-import surface (core -> JS)

With the command buffer carrying all *output*, the imports the core genuinely
needs from JS shrink to the irreducible ones — capabilities WASM cannot
provide for itself:

```
env.now()        -> f64      // monotonic time, only if the core wants it;
                             //   normally the host drives timestep and the
                             //   core stays deterministic (preferred).
env.rng_seed()   -> u32      // ONE seed at init. [QUIRK] reference random is
                             //   unseeded Math.random (~L2783, INCLUSIVE 0..N).
                             //   For conformance the seed is part of the test
                             //   vector (CONFORMANCE.md L51) and the core runs
                             //   its OWN small PRNG — so even rng need not be
                             //   an import; prefer a core-internal seeded PRNG
                             //   and pass the seed via load() params.
env.trace(ptr,len)           // optional: debug/log passthrough. Not required.
```

Net (`NET`, ~L1295, wss to codeonline.io ~L1317) is **out of scope for the
core**: peers/connected enter via the input buffer (§3.1) and `broadcast`
becomes a command-buffer op consumed by a host networking shim. Keeping NET in
the host preserves the "peers is a STABLE array rebuilt in place" behavior on
the JS side without the core owning a socket.

Net effect: **zero per-draw imports, zero per-call string marshaling, one
optional seed import.** Audio, canvas, and networking are all *output*
(command buffer) or *input* (input buffer), never synchronous imports.

---

## 6. Language tradeoff for THIS shape

Requirements that should drive the choice: (a) a **dynamically-typed,
string-heavy tree-walker** (the `Value` union number|string|bool|list|object|
undefined, `fc_core.rs` L45–63; loose `==` coercion L144–169); (b) a **small
inlined artifact** (we want to base64 it into one HTML file, §7); (c)
**web + native from one source** so native is the conformance oracle.

Ranked:

1. **Rust — recommended.** Native + `wasm32-unknown-unknown` from one
   codebase, so the native binary is the golden oracle and the WASM is the
   page core (CONFORMANCE.md L114–117 already assumes this). `enum` + `match`
   model the AST and the loose-equality switch cleanly — the existing
   `fc_core.rs` already encodes `Value`, `Expr`, `Stmt`, `loose_eq`,
   `DrawCmd`, and the `Host` trait this way. No GC; with `opt-level="z"`,
   `panic=abort`, `lto`, `wasm-opt`, and no `std` formatting machinery, the
   artifact is small. Mature `wasm32` target. **This is the path the port is
   already on.**

2. **Zig — smallest artifact, but pre-1.0.** No runtime, no allocator you
   didn't write, freestanding `wasm32` out of the box; likely the smallest
   `.wasm` of any option. Tagged unions + `switch` model the AST fine. The
   real cost is **pre-1.0 churn** (language + stdlib still moving) and a
   thinner ecosystem for the conformance/test harness. Pick only if artifact
   size becomes the dominant constraint and you accept tracking breaking
   releases.

3. **AssemblyScript — easiest onramp, but WASM-only.** TypeScript-flavored,
   so the syntactic distance from the current JS is smallest and a port is
   quick. **Disqualifying for the stated goal:** it compiles to WASM *only* —
   there is no native target, so you **forfeit the native oracle**. The whole
   single-source-of-truth premise (a native binary running the golden vectors,
   CONFORMANCE.md) collapses; you'd be diffing WASM against the very JS it
   replaces, with no independent third implementation.

4. **C — max control, max footguns.** Can produce a tiny freestanding
   `.wasm` and compiles native trivially. But a string-heavy dynamic
   interpreter in C means hand-rolled tagged unions, manual memory for every
   `Value`, and manual UTF-8 — exactly the surface where silent
   divergence/UB hides. The reference's loose-equality and coercion quirks
   (`'5'==5`, `0==''`, NaN!=NaN; `fc_core.rs` L124–169) are precisely the
   bugs that are hardest to reproduce *faithfully* and safely in C.

5. **Go — avoid for the core.** `GOOS=js/GOARCH=wasm` ships a multi-MB
   runtime + GC (TinyGo helps but reintroduces a maturity/feature-gap tax and
   still isn't ideal for this). Wrong tool for a small inlined fantasy-console
   core. **Keep Go for the backend** (the relay / matchmaking that today is
   `wss://codeonline.io`, ~L1317) where a GC runtime is fine and irrelevant to
   artifact size.

Decision: **Rust → WASM**, continuing `spec/port/fc_core.rs`.

---

## 7. Inlining the `.wasm` into the single file

The reference is a single self-contained `index.html`. To keep that property:

- **Base64-inline the `.wasm` into the HTML.** Embed the module as a
  `data:`/base64 string and instantiate with
  `WebAssembly.instantiate(Uint8Array.from(atob(B64), c=>c.charCodeAt(0)))`.
  Cost: base64 inflates the binary ~33% in the *text* of the file, but it
  preserves the "one file, double-click to run, works offline" property the
  project values. At 128×128 the core is small (tens of KiB with `opt-level=z`
  + `wasm-opt`), so even +33% is modest.
- **Or fetch it as a sibling asset** (`fetch('fc_core.wasm')` →
  `instantiateStreaming`) when shipping a normal web deploy. Smaller bytes on
  the wire, but two files.
- **APK / PWA can bundle the raw `.wasm`** alongside assets and load it
  locally — no base64 penalty, still offline. For a packaged native build, the
  core is just linked in directly (the whole point of choosing Rust).

Recommendation: keep an inlined-base64 build as the canonical "one HTML file"
artifact for parity with today, and a fetched-asset build for web deploys that
care about transfer size. Both instantiate the *identical* module.

---

## 8. Differential-test plan (WASM beside JS)

The command buffer makes this nearly free, because §1 made the buffer the
golden output and CONFORMANCE.md already defines the vector shape
`{say, errors, vars, commands}`.

1. **Corpus.** Reuse `spec/corpus/*.fc` (already 29 seed programs covering the
   loose-equality, singularize, 1-based indexing, if/else-in-loop, parseIf
   heuristic, and random-bounds quirks). Expand toward draw-emitting programs
   (the §2 ops) since those are exactly what the command buffer captures and
   what the reference could not previously test headlessly (CONFORMANCE.md
   L31–35 notes draw programs were excluded for lack of a recordable host).
2. **Two runners, one harness.**
   - JS: the seam-extracted `fcRun(src, seed)` returning
     `{say, errors, vars, commands}` (CONFORMANCE.md L107–109).
   - WASM: `parse_render()` the same source, drive input with `set_key`/`set_mouse`/
     `set_net`, `step_frame()` the same fixed number of frames, and read each frame's JSON
     command array from `res_ptr()` (the plan's `load`/`step`/`cmd_ptr` names, as built —
     §4).
3. **Diff.** Byte/string-exact on `say` (case-preserved, L124), ordered
   equality on `commands`, scalar equality on `vars`, and located-error
   equality on `errors`. Any mismatch is a port bug *or* a newly-discovered
   reference quirk (file it in SEMANTICS as a [QUIRK]).
4. **Frame tests** (game programs) use a **fixed timestep**: the host drives
   `step()` N times with a scripted input buffer (CONFORMANCE.md L61, L261 —
   e.g. `every N frames` line-keyed cadence must match). Determinism comes from
   the seeded core PRNG (§5) + scripted inputs, never wall-clock.
5. **Native oracle.** Run the *native* build of the same Rust core over the
   corpus in CI. Native vs WASM must be bit-identical (same source, different
   target); native vs JS is the real fidelity test. This is the
   single-source-of-truth payoff.

The known fidelity traps the diff MUST catch (from the source map): if/else
inside loop bodies (`execList` runs `else` unconditionally, ~L3003, vs correct
`smartExecList` at top level ~L3471 — THE BIG ONE); 1-based `item N of list`
(~L2826); inclusive bidirectional `repeat` (~L3018); inclusive `random 0..N`
(~L2783); numeric `+` (`'3'+'4'==7`, ~L2768) vs concatenating `add X to`
(~L2932); `singularize` rules (~L1146); line-keyed `every` cadence (~L3060).

---

## 9. Concrete Rust → WASM SPIKE plan

> *(Historical plan, kept as written. Its `load()`/`step()`/`cmd_ptr()` names are the
> pre-implementation sketch; the exports that shipped are §4's "As built" list, and the
> JS-side decoder it asks for is the `JSON.parse` in `index.html`'s `readJson`, §3.2.)*

Goal: prove the boundary end-to-end on the **smallest useful subset**, behind a
page flag, and collect measurements before committing to a full port. Keep it
in `spec/port/` next to `fc_core.rs` (which already has the `Value`, `Stmt`,
`Host`, `DrawCmd`, op-budget scaffolding).

**Scope (smallest subset that exercises every boundary mechanism):**
- Lexer: `tokenizeLine` semantics — tab=2 spaces, `level=floor(spaces/2)`
  (~L1374–1378), typed tokens, negative-number lexing rule (~L1394).
- ~6 statements, chosen to touch input, math, control flow, and all three
  output channels:
  1. `NAME is <expr>` — assignment (the ONLY assign form; `set` is not a
     statement). A `Value` + the loose math coercion (assign arm ~L1849).
  2. `if … / else` at **top level** (the `smartExecList` path, ~L3471 — so the
     spike encodes the correct branch and we later add the loop-body quirk)
  3. `repeat N times` (inclusive count; ~L3018)
  4. `clear <color>` → `CLEAR` record
  5. `draw rect …` / `draw circle …` → `RECT`/`CIRCLE` records (defaults
     baked, §2)
  6. `write <text> at x,y` → `TEXT` record (raw case preserved)
- `step()` reads the input buffer (at minimum: is `space` down) so one branch
  can be input-driven, then drains the command buffer.

**Wiring:**
- Compile to `wasm32-unknown-unknown`, `opt-level="z"`, `lto=true`,
  `panic="abort"`, run `wasm-opt -Oz`. Base64-inline per §7.
- Add a **page flag** (e.g. `?core=wasm`, alongside the existing
  `?gamepad`/`?force-gamepad` query flags, ~L4117/the gamepad wiring) that
  swaps the JS interpreter for the WASM core: same editor text → `load()` →
  `step()` loop → decode command buffer → existing canvas blitter. Default
  stays the JS reference; the flag is opt-in so nothing regresses.
- Implement the JS-side command-buffer **decoder** (the §3.2 single linear
  pass) and feed records into the *existing* `ctx` drawing code so the spike
  reuses the reference renderer (apples-to-apples pixels).

**Measurements to collect (this is the deliverable of the spike):**
1. **Artifact size**: raw `.wasm`, after `wasm-opt -Oz`, and base64-inlined
   delta to `index.html`. (Decides §7.)
2. **Fidelity**: run the subset corpus through both `?core=wasm` and the JS
   reference; diff `{say, errors, vars, commands}`. Target: zero diffs on the
   six-statement subset. Log any quirk the spike *fails* to reproduce.
3. **Boundary crossings per frame**: confirm it is ~1 (`step` + count read +
   bulk decode), not O(draws). Instrument the decoder.
4. **Frame time at 128×128**: median/95p `step()` + decode + blit, to *quantify*
   the §0 claim that perf is a non-issue (expect it to be dominated by the
   canvas blit, not the core).
5. **Build ergonomics**: native build of the same subset runs the corpus in CI
   and is bit-identical to the WASM build (proves the single-source oracle).

**Exit criteria:** zero fidelity diffs on the subset, artifact small enough to
inline (or a clear decision to fetch), and confirmation that crossings are
per-frame not per-draw. If all four hold, expand statement coverage toward the
full `Stmt` set in `fc_core.rs`, prioritizing the §8 fidelity-trap programs.
