# Display profiles, logical screens, and export sizes

Status: proposed implementation plan

This plan expands FC beyond its current fixed 128 by 128 canvas without making
the language harder to learn or breaking existing programs.

The central decision is to separate three things that are currently treated as
one:

1. The **screen** is the coordinate space the program draws into.
2. The **display** is how large that screen appears in a browser or window.
3. The **export** is the pixel size of a saved image, video, or standalone page.

A fourth concept, the **world**, already exists independently. A world may be
larger than the screen, and the camera selects the part that is visible.

This separation lets a child make a 320 by 240 game, show it full-screen on a
4K monitor, and export it at 1920 by 1080 without changing the game's movement,
collision, timing, or coordinates.

## Decision summary

- Keep 128 by 128 as the exact default for every existing program.
- Add one plain-English declaration for logical size:

        screen size is 320 by 240

- Make 320 by 240, 640 by 480, 320 by 180, and 640 by 360 first-class choices
  in the editor and examples.
- Permit 800 by 600 and 1024 by 768 as custom logical sizes. They do not need
  additional language keywords.
- Treat 1920 by 1080 and 3840 by 2160 primarily as display and export sizes,
  not beginner game coordinate systems.
- Keep the program's logical screen fixed while it runs in the first release.
  Resizing the browser changes presentation, not game rules.
- Use a responsive application surface for forms and data-oriented programs
  such as the Recipe Book. Do not stretch a game canvas into a substitute for
  accessible page controls.
- Implement the same behavior in the JavaScript reference runtime, Rust/WASM
  runtime, debugger, standalone exporter, and visual test tools.
- Centralize the current 128 and 64 constants before adding new syntax.

## The learner's mental model

The documentation should introduce the concepts in this order:

- **Screen:** the space where your program draws.
- **World:** the whole place your characters can visit.
- **Camera:** the part of the world the screen can see.
- **Window:** how large the screen looks on this device.
- **Export:** the picture or movie size you save or share.

The first lesson needs only the screen. World and camera appear when a game
scrolls. Window and export can stay in the Run and Share panels until a learner
wants more control.

Example explanation:

> Your game screen can be 320 dots wide and 240 dots tall. FC can make those
> dots look larger on a laptop or phone. The game still thinks its screen is
> 320 by 240.

This is both child-friendly and technically accurate.

## Recommended size catalog

| Size | Ratio | Role | Recommendation |
| --- | --- | --- | --- |
| 128 by 128 | 1:1 | Legacy logical screen | Default; preserve exactly |
| 320 by 240 | 4:3 | Classic logical screen | Primary general game choice |
| 640 by 480 | 4:3 | Detailed logical screen | Primary advanced game choice |
| 320 by 180 | 16:9 | Low-resolution wide screen | Primary wide game choice |
| 640 by 360 | 16:9 | Detailed wide screen | Primary advanced wide choice |
| 800 by 600 | 4:3 | Larger custom screen | Supported, not a separate keyword |
| 1024 by 768 | 4:3 | Larger custom screen | Supported, not a separate keyword |
| 1280 by 720 | 16:9 | HD presentation/export | Offer in Run and Share panels |
| 1920 by 1080 | 16:9 | Full HD presentation/export | Standard high-quality output |
| 3840 by 2160 | 16:9 | 4K presentation/export | High-quality output, never the default |
| Responsive | Device-dependent | Forms and data applications | Use the application surface |

Why there are no keywords such as classic, VGA, full HD, or 4K in the core
language:

- The numbers are clearer than historical display names.
- A learner can read the program without knowing a media standard.
- Editor presets can still label the common choices.
- The language remains stable if popular device sizes change.
- It avoids teaching that export resolution and game coordinates are the same.

The editor can present friendly choices such as “Classic game — 320 by 240”
and insert the ordinary declaration into the program.

## Core language syntax

### Required first feature

        screen size is 320 by 240

Rules:

- It is a top-level declaration.
- It may appear once.
- Both values must be whole positive numbers known when the program starts.
- It is read before setup and run blocks execute.
- Omitting it means exactly 128 by 128.
- Repeating it is a compile-time error with a direct correction.
- Changing it while a program runs is not supported in the first release.

Suggested error messages:

- “The screen width must be a whole number.”
- “The screen height must be at least 64.”
- “This screen has too many dots to run safely. Try 1920 by 1080 or smaller.”
- “A program can say its screen size once. Remove one of these lines.”

### Screen facts available to programs

        middle_x is screen.width / 2
        middle_y is screen.height / 2

        draw player at screen.center_x, screen.center_y

Recommended read-only facts:

- screen.width
- screen.height
- screen.center_x
- screen.center_y

Possible later facts are screen.left, screen.top, screen.right, screen.bottom,
and screen.ratio. Do not add right and bottom until their edge convention is
specified: drawable pixel indexes end at width minus 1 and height minus 1, while
geometry and clipping APIs commonly use width and height as exclusive edges.
width, height, center_x, and center_y are enough for the first release and avoid
teaching an ambiguous boundary.

The examples should prefer center_x and center_y when that makes intent clearer.
They should not require a learner to repeatedly write width divided by two.

### Drawing style

The logical size and the drawing style are separate. A 320 by 240 screen may
contain crisp pixel art or smoothly scaled lines.

Recommended optional declaration:

        screen style is pixel

Values:

- pixel: preserve hard edges and use nearest-neighbor scaling.
- smooth: scale curves, text, and images smoothly.
- auto: let FC choose from the assets and drawing commands.

Compatibility default: pixel. That matches the current FC identity and avoids
changing existing programs. The editor may suggest smooth for diagrams and
data visualizations.

This declaration may follow the size declaration, appears at most once, and
does not change the coordinate system.

### Display preference

A source program may state a presentation preference:

        display fits window

or:

        display fills window

The meanings must be precise:

- fits: show the entire logical screen and add bars if the shapes differ.
- fills: cover the available window and crop equal amounts from opposite edges
  if the shapes differ.

Recommendation: fits is the default and the only mode shown in beginner
lessons. Filling is useful for decorative scenes but is unsafe for games with
important controls at the edges.

Display preference is a hint. The host may override it for embedding,
accessibility, testing, or an editor preview.

### Export preference

The Share panel should own export size in the first release. If a source-level
hint is later needed, use:

        export size is 1920 by 1080

Export size must never change screen.width, screen.height, collision, camera
movement, input coordinates, or program timing.

If the export ratio differs from the logical screen ratio, the default is to
fit and add transparent or configured background bars. Cropping requires an
explicit fill choice.

## Size limits

Recommended first-release validation:

- Minimum width: 64 logical pixels.
- Minimum height: 64 logical pixels.
- Maximum width: 1920 logical pixels.
- Maximum height: 1080 logical pixels.
- Maximum logical area: 2,073,600 pixels.
- Maximum export size: 3840 by 2160 in the browser tool.

Warn, but do not reject, logical screens above 1,000,000 pixels because they
may run slowly on small devices.

The maximum logical area permits the requested 800 by 600 and 1024 by 768
screens. It also gives advanced authors room for diagrams while keeping 4K out
of the interpreted game loop. These limits can later become host capabilities
rather than permanent language law.

## Coordinate and world rules

### Default world

When no world size is declared:

        world.width = screen.width
        world.height = screen.height

This replaces the current assumption that the world is at least 128 by 128.

### A world larger than the screen

        screen size is 320 by 180
        world is 2000 by 600

The screen stays 320 by 180 while the camera moves through the larger world.

For a camera following a target:

        maximum_x = max(0, world.width - screen.width)
        maximum_y = max(0, world.height - screen.height)
        camera.x = clamp(target.x - screen.center_x, 0, maximum_x)
        camera.y = clamp(target.y - screen.center_y, 0, maximum_y)

This removes the current fixed 128 and 64 values.

### A world smaller than the screen

FC should not produce negative camera limits. The camera stays at 0,0. The
remaining screen area shows the clear color.

If centering a small world is desired later, it should be an explicit camera or
layout feature. It should not silently change the established origin.

### Odd sizes

center_x and center_y may be fractional. Rendering and camera values may also
be fractional. Pixel style rounds only at the final drawing boundary, using the
same rule in JavaScript and Rust/WASM.

## Browser presentation pipeline

The browser must track separate values:

- logical width and height from the FC program;
- CSS display width and height from the available page space;
- device pixel ratio from the host device;
- export width and height from the Share panel.

### Pixel style

- Keep the main canvas backing store at logical width by logical height.
- Disable image smoothing.
- Scale the canvas with CSS.
- Use the largest whole-number scale that fits when one is available.
- If a large logical screen must shrink on a small device, allow a fractional
  fit rather than hiding part of the program.
- Keep the aspect ratio; never independently stretch width and height.

### Smooth style

- Keep all program coordinates logical.
- Size the backing store for CSS size multiplied by device pixel ratio.
- Apply one rendering transform from logical coordinates to backing pixels.
- Enable smoothing for images unless an individual asset requests pixel mode.
- Reset the transform before clearing and reapply it consistently.

### Fit calculation

For an available box A and logical screen S:

        scale = min(A.width / S.width, A.height / S.height)
        display_width = S.width * scale
        display_height = S.height * scale

For pixel style, use floor(scale) when scale is at least 1 and integer scaling
fits. Otherwise retain the fractional fit.

### Fill calculation

        scale = max(A.width / S.width, A.height / S.height)

The browser clips the excess around the center. Input mapping must use the
actual clipped content rectangle, not the outer container.

### Letterboxing

- Bars belong to the host, not the logical screen.
- Bar color should be configurable by the editor and exporter.
- Pointer events in the bars do not produce screen coordinates.
- Gamepad controls and editor chrome remain outside the logical screen.

## Input mapping

Mouse, touch, pen, and accessibility input must map through the displayed
content rectangle:

        logical_x = (pointer_x - content.left) * screen.width / content.width
        logical_y = (pointer_y - content.top) * screen.height / content.height

Then clamp or reject based on event type:

- Movement may report that the pointer is outside.
- A click beginning in a letterbox bar does not click the nearest game edge.
- A drag that begins inside may continue reporting outside coordinates until
  release, so drawing tools feel natural.
- Touch hit areas are evaluated in logical coordinates, but the editor should
  warn when their displayed physical size is too small.

Tests must cover all four corners, the center, bars, crop offsets, CSS zoom, and
non-integer display scale.

## Drawing, assets, and text

Changing the screen must not silently resize sprites. An 8 by 8 sprite remains
8 logical pixels on every logical screen.

That produces honest, predictable behavior, but larger screens need additional
authoring help:

- Add examples showing sprites drawn at scale 2, 3, and 4.
- Let imported photos and illustrations specify a drawn width and height.
- Add or document text sizes appropriate for 320, 640, and responsive layouts.
- Keep collision boxes in logical units.
- Keep visual scale separate from interaction padding.
- Warn when text or controls will be physically tiny in the selected preview.
- Make scanline, grid, and subpixel overlays derive from the active screen and
  display scale rather than assuming a square 128-pixel canvas.

A later convenience could be:

        draw hero at 40, 80 at scale 3

That is useful, but it is not a prerequisite for variable screen sizes if FC
already has an equivalent sprite-size operation.

## Export behavior

### Images

- Render to a separate export surface.
- Preserve logical coordinates and aspect ratio.
- For pixel style, prefer a whole-number scale and center any remaining bars.
- For smooth style, render directly at export resolution.
- Never resize the live game canvas just to take a screenshot.
- Record logical size, export size, style, and bar color in export metadata
  where the format permits it.

### Video and animation

- Keep simulation time independent from recording resolution.
- Render each captured frame through the same export transform.
- Offer 1280 by 720, 1920 by 1080, and 3840 by 2160 presets.
- Warn before 4K capture about memory and encoding cost.

### Standalone HTML

The exported page must embed:

- logical screen width and height;
- screen style;
- fit or fill preference;
- a resize handler that preserves aspect ratio;
- correct pointer mapping;
- the same defaults as the editor.

It must not hardcode a 128 by 128 canvas or a 384 by 384 CSS size.

## Responsive application surface

Recipe Book and similar data-oriented examples need a page that can reflow,
scroll, expose accessible form fields, accept uploads, and work with keyboard
and screen readers. That is a different job from a fixed game screen.

Recommended boundary:

- Game and simulation programs use a logical screen.
- Data applications use a responsive application surface.
- An application may contain one or more FC canvases for previews, drawing,
  charts, or games.
- A game may open ordinary host dialogs for files and sharing without becoming
  a responsive application.

Possible future declaration:

        surface is application

It should select a layout/runtime profile, not merely create a very large
canvas. Its detailed semantics belong with the form, collection, file, photo,
and recipe work in the lexicon plan.

Recipe Book would use:

- responsive list and detail layouts;
- ordinary labeled text and number fields;
- a repeating ingredients section;
- an ordered steps section;
- photo upload, preview, caption, and removal controls;
- local save/load behavior and optional sync;
- a small canvas only if the user edits or annotates an image.

## Runtime work inventory

The current implementation uses 128 and its midpoint 64 in many independent
places. The first engineering task is to create one screen configuration object
and route every subsystem through it.

### Browser and editor runtime

Update the browser/editor implementation to use screen.width and screen.height
for:

- canvas backing width and height;
- CSS resize and aspect calculations;
- clear operations;
- default world dimensions;
- map minimum dimensions and culling;
- camera centering and clamping;
- mouse, touch, and pen mapping;
- debug and live-inspection overlays;
- WASM canvas clearing and input bridging;
- standalone HTML export;
- screenshots, recordings, and thumbnails;
- scanlines, grids, palettes, and display decorations.

### JavaScript reference runtime

Update the language reference runtime to receive an immutable screen
configuration before program execution. Replace fixed clear bounds, world
defaults, culling edges, camera limits, and test canvases with that configuration.

### Rust/WASM runtime

Update the Rust runtime to store logical width and height in runtime state.
Parsing and execution must agree with JavaScript on:

- declaration validation;
- default values;
- screen facts;
- clear bounds;
- world defaults;
- camera calculations;
- map culling;
- input coordinates;
- command-buffer output.

The browser/WASM boundary needs an explicit way to learn the chosen logical
size before allocating or clearing the canvas. Acceptable designs include a
small program-info result, exported width/height accessors, or a versioned
command-buffer header. Do not infer size by scanning drawing commands.

### Parser and program model

Add immutable program metadata equivalent to:

        ScreenConfig {
          width,
          height,
          style
        }

The exact internal type name is not language syntax. Both engines must produce
the same diagnostic for duplicate or invalid declarations.

### Test and golden tools

Visual golden generation must accept width and height for each case. Golden
filenames or manifests should record dimensions. Image comparison must reject
unexpected size changes before comparing pixels.

Keep all current 128 by 128 goldens unchanged as the compatibility baseline.

## Repository touch map

The first implementation should expect focused changes in these files rather
than a broad rewrite:

- index.html — browser canvas creation and resize, reference runtime, debugger,
  input mapping, WASM host bridge, transpiled export shim, and standalone HTML
  export;
- spec/lang/fc-core.mjs — extracted JavaScript parser/runtime used as an oracle;
- spec/port/spike/src/lib.rs — Rust parser and runtime;
- spec/port/spike/visual-golden.html — browser renderer used by visual tests;
- spec/port/spike/visual-golden.mjs and visual-golden.json — dimension-aware
  capture and pinned results;
- tools/visual-golden.cjs — end-to-end browser screenshots and layout checks;
- spec/corpus and spec/corpus/_goldens.json — declarations, screen facts,
  diagnostics, and execution cases;
- spec/GRAMMAR.md and spec/SEMANTICS.md — normative grammar and behavior;
- LANGUAGE.md and docs/index.html — learner-facing language reference;
- ARCHITECTURE.md — current fixed-canvas description and the new coordinate
  spaces;
- examples and game launchers — the three focused demonstrations and metadata.

Search for the existing 128 and 64 assumptions, but review every match by hand.
Many are legitimate example coordinates, dimensions of artwork, color values,
or unrelated calculations. Replace only values that mean viewport width, viewport
height, or viewport midpoint.

Relevant verification commands include:

    node spec/heal/eval.mjs
    node spec/port/spike/tokenize-diff.mjs
    node spec/port/spike/ast-diff.mjs
    node spec/port/spike/exec-diff.mjs
    node spec/port/spike/transpile-diff.mjs
    node spec/port/spike/examples-diff.mjs
    node spec/port/spike/fuzz.mjs
    node spec/port/spike/visual-golden.mjs
    cargo test --manifest-path spec/port/spike/Cargo.toml

When an intentional dimension-aware golden format change is required, inspect the
generated differences before accepting them. Never update goldens merely to turn a
failure green.

## Implementation sequence

### Phase 0 — Centralize the existing screen

Goal: no behavior change.

- Introduce a screen configuration with a default of 128 by 128.
- Replace runtime viewport literals with named width, height, center_x, and
  center_y values.
- Do not mechanically replace 128 or 64 inside example art, coordinates,
  palettes, unrelated calculations, or comments.
- Add a check or focused review rule for new fixed viewport literals.
- Prove that current unit tests and visual goldens are unchanged.

Exit condition: 128 by 128 behavior is pixel-identical, and viewport logic has
one source of truth in each runtime.

### Phase 1 — Add language declarations and screen facts

- Parse and validate screen size.
- Expose screen.width, screen.height, screen.center_x, screen.center_y, and
  boundary facts.
- Make the default world match the declared screen.
- Update clear, camera, map, drawing, and input paths in JavaScript.
- Add language reference and error-message documentation.

Exit condition: JavaScript runs square, 4:3, and 16:9 programs correctly.

### Phase 2 — Achieve Rust/WASM parity

- Carry screen metadata across the WASM boundary.
- Match JavaScript execution and diagnostics.
- Add cross-engine command-buffer tests.
- Run the same camera, culling, input, and clear cases in both engines.

Exit condition: the declared screen cannot reveal which engine ran the program.

### Phase 3 — Presentation and export

- Replace square-only browser sizing with aspect-aware fit.
- Add optional fill behavior.
- Add pixel, smooth, and auto rendering policy.
- Handle device pixel ratio deliberately.
- Update screenshots, recording, thumbnails, and standalone HTML.
- Add HD, Full HD, and 4K export presets.

Exit condition: one program behaves identically at several window and export
sizes, including phones and high-density monitors.

### Phase 4 — Examples and editor choices

- Add size presets to new-project and preview controls.
- Keep the inserted source as explicit numbers.
- Add one 320 by 240 game, one 320 by 180 game, and one 640 by 480 creative
  tool or visualization.
- Update applicable lessons to use screen center facts instead of magic numbers.
- Keep existing 128 by 128 examples as the small, immediately understandable
  introduction to FC.

Exit condition: each recommended logical profile has a polished demonstration.

### Phase 5 — Responsive applications

- Specify the application surface with the data/form/file work.
- Build Recipe Book as the acceptance example.
- Test keyboard navigation, screen-reader names, responsive reflow, image upload,
  persistence, and offline behavior.
- Document when to choose a game screen and when to choose an application.

Exit condition: FC can demonstrate both a fixed interactive world and a useful
data application without confusing their layout models.

## Demonstration programs

### Existing 128 by 128 examples

Do not resize them merely to advertise the feature. They prove compatibility
and preserve the delightful small-system constraint.

### Classic adventure — 320 by 240

Demonstrates:

- a larger 4:3 map viewport;
- camera following and edge clamping;
- menus and readable text;
- pointer and keyboard controls;
- pixel-perfect display scaling.

Opening lines:

        screen size is 320 by 240
        screen style is pixel
        world is 1600 by 1200

### Wide runner — 320 by 180

Demonstrates:

- 16:9 composition;
- horizontal camera look-ahead;
- resize-safe input and overlays;
- 1080p and 4K export from a small logical screen.

Opening lines:

        screen size is 320 by 180
        screen style is pixel
        display fits window

### Art studio — 640 by 480

Demonstrates:

- smooth lines and imported images;
- touch drawing with correct coordinate mapping;
- larger text and UI controls;
- exporting at the same size and at 1920 by 1080.

Opening lines:

        screen size is 640 by 480
        screen style is smooth

### Screen size gallery

Add a compact teaching example that displays screen.width, screen.height, and
the center and corners. The editor can rerun it using each preset so learners
see that the same relationships survive different dimensions.

### Recipe Book

Use the responsive application surface, with an optional fixed-size image
editor embedded inside it. This demonstrates that “more room” is not always a
larger canvas; sometimes the right solution is a page that reflows.

## Required test matrix

### Compatibility

- No declaration produces exactly 128 by 128.
- Existing visual goldens are pixel-identical.
- Existing games preserve coordinates, camera behavior, input, and exports.

### Logical sizes

- 128 by 128
- 320 by 240
- 640 by 480
- 320 by 180
- 640 by 360
- 800 by 600
- 1024 by 768
- minimum accepted size
- maximum accepted area
- invalid zero, negative, fractional, excessive, and duplicate declarations

### World and camera

- world smaller than screen
- world equal to screen
- world larger in width only
- world larger in height only
- world larger in both directions
- target at each corner and edge
- odd screen dimensions
- camera follow on and off

### Rendering

- clear covers the full logical screen
- map culling draws the first and last visible cells
- sprites at every screen edge
- pixel scaling at whole and fractional display scales
- smooth scaling on standard and high-density displays
- overlays on square, 4:3, and 16:9 screens

### Input

- center and four corners
- letterbox bars
- fill-mode crop offsets
- mouse, touch, pen, and drag capture
- CSS zoom and device pixel ratio
- browser resize during a running program

### Export

- same-size image export
- 1280 by 720
- 1920 by 1080
- 3840 by 2160
- matching and mismatching aspect ratios
- fit bars and explicit fill crop
- standalone HTML on desktop and phone dimensions

### Cross-engine parity

- identical screen facts
- identical validation failures
- identical clear and draw boundaries
- identical camera and culling results
- equivalent command buffers for deterministic programs

## Documentation changes

Update these materials when implementation begins:

- Language reference: declaration grammar, facts, defaults, and errors.
- Architecture guide: remove statements that define the canvas as permanently
  128 by 128 and explain the four coordinate spaces.
- Tutorial: show screen first, then world and camera.
- Export guide: distinguish logical and output resolution.
- Accessibility guide: physical target size and responsive application choice.
- AI guidance: tell code-generating models to use screen facts instead of magic
  numbers and to preserve the logical/presentation boundary.
- Example catalog: label the logical size and surface type of each example.

## Acceptance criteria

The feature is ready when all of the following are true:

- Programs without a screen declaration remain pixel-identical.
- A program can declare every recommended logical size with one readable line.
- JavaScript and Rust/WASM agree on dimensions and behavior.
- No viewport calculation depends on a literal 128 or 64 outside the default
  profile, tests that intentionally assert it, and example program content.
- Camera, map culling, clearing, and input work on non-square screens.
- Browser resizing never changes logical game state.
- Pixel art remains crisp when enlarged.
- Smooth content respects device pixel ratio.
- Full HD and 4K exports do not require Full HD or 4K game coordinates.
- Standalone exports retain correct aspect ratio and pointer mapping.
- The editor offers the recommended sizes without adding opaque language words.
- Recipe Book uses responsive controls and layout rather than a giant canvas.
- Documentation explains the model in language a third-grade reader can follow.

## Decisions to settle during Phase 0

These should be resolved before parser work, because they affect both engines:

1. Whether style is explicitly pixel by default for all programs or auto for
   newly created non-game projects. Existing programs must remain pixel.
2. Whether export size is source metadata, project metadata, or only a Share
   panel choice. The recommendation is Share panel first.
3. Whether the first release accepts any valid size within the limits or only
   the listed sizes. The recommendation is any valid size, with presets for the
   common choices.
4. Whether fill belongs in source or only in the embedding host. The
   recommendation is an overridable source hint.
5. The exact rounding rule for pixel-style drawing at fractional camera values.
   It must be specified once and shared by both engines.

None of these questions changes the main architecture: logical screen,
presentation, export, world, and responsive application layout are distinct.
