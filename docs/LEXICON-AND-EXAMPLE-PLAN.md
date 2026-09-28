# Lexicon, data, and example-game implementation plan

**Status:** proposed language and curriculum plan. Except where explicitly
identified as current fc, the phrases in this document are not implemented yet.

**Goal:** make the words fc accepts truthful, predictable, readable by beginning
readers, and easy for a code-generating model to use. Demonstrate each vocabulary
family in one small game, then demonstrate that the families compose in a larger
game.

This document turns the design sketches in
[READABILITY-BENCHMARK.md](READABILITY-BENCHMARK.md) into staged implementation
guidance. It does not authorize implementing every idea in one change. Each phase
below should be a separate, conformance-gated change.

## Outcomes

1. A word accepted by the editor always has a documented effect or a clear error.
2. Each intention has one canonical phrase and, at most, a few input aliases.
3. The formatter displays canonical fc even when the author entered an alias.
4. Common elementary-English words cover the first learning path.
5. Precise game terms remain available when they are clearer than a substitute.
6. Persistent data uses simple save/load shorthand plus explicit
   remember/recall/forget forms.
7. Every new phrase is demonstrated by a small game and covered in both engines.
8. Unknown commands never silently pretend to work.

## Design rules

### One meaning, one displayed phrase

Aliases are an input convenience, not additional language to memorize. For example,
the parser may accept create, make, and spawn, but the formatter should display one
chosen form. Documentation, generated examples, and LLM prompting should use that
same form.

### Prefer familiar words without becoming vague

Use common words when they preserve the role of the operation:

- make, remove, show, hide;
- put, take, keep, pick, mix;
- first, last, next, before, after;
- same, different, more, less;
- touch, near, far, inside, outside;
- start, stop, pause, continue;
- remember, recall, forget.

Do not replace a precise concept with a misleading everyday word. Sprite, pixel,
frame, list, screen, and variable are useful domain words that can be taught with a
picture and one example. HUD, pset, mod, instantiate, concatenate, serialize,
namespace, callback, and coroutine should not appear in the beginner-facing
language.

### Keep hidden behavior small

Plain English does not justify surprising semantics. A phrase should expose its
target, units, collection, storage key, or timing when omitting that information
would force the reader to guess.

### Preserve existing programs

Legacy forms remain accepted unless they are unsafe. New aliases should lower to
existing AST nodes when the behavior is already present. A migration formatter
should offer a visible diff before rewriting stored programs.

### Test words with their intended readers

“Third-grade English” is a design target, not a certified reading level. Candidate
phrases must be tested with children and adults who have not programmed, along with
LLMs. Comprehension and successful edits matter more than raw word length.

## Current lexicon integrity problems

These must be fixed before adding a larger vocabulary.

### False friends

The editor currently treats the following as known verbs even though they have no
corresponding parser/runtime behavior:

- flash;
- shake;
- start;
- hide;
- emit;
- push;
- pull;
- set;
- put;
- get;
- spawn.

Show is only implemented for buttons and meters. Load is an expression, not a valid
standalone command. Song and sprite declarations are implemented but are not in the
same editor vocabulary registry.

The immediate rule is binary: implement and document a word, or remove it from the
accepted vocabulary and produce a useful diagnostic.

### Unreachable stop-music behavior

The generic stop-object parser arm currently sees stop music and stop sound before
the dedicated audio arm. The documented phrase therefore becomes “stop walking the
object named music.” Move the audio cases before the generic stop-object form and
freeze the result in parser and runtime tests.

### Documentation drift

LANGUAGE.md says save games, multiplayer, sound, tilemaps, animation, and particles
are unsupported even though the implementation now contains them. It also uses
flash and spawn in examples even though those words are not implemented.

### Silent unknown calls

An unknown leading word falls through to a user-function call and can become a
silent no-op. After the parser has collected declared function names, an unresolved
call should produce:

    Line 7: I do not know “spwan”.
    Did you mean “spawn”?

Leniency can remain in an explicit compatibility mode, but the default teaching and
LLM paths should not silently discard an intended action.

## A controlled elementary-English layer

The table below is the recommended displayed vocabulary. Accepted aliases are for
entry and compatibility; they should format to the displayed form.

| Intended meaning | Displayed form | Accepted input aliases | Avoid in beginner output |
|---|---|---|---|
| create a game thing | make | spawn, create | instantiate |
| remove a thing | remove | destroy, delete | deallocate |
| assign an initial value | starts at | is, begin with | initialize |
| change a value | change … to | set … to, is | mutate, assign |
| keep a number in a range | keep … between | clamp | constrain |
| choose one item | pick | choose, random item | sample |
| reorder at random | mix | shuffle | randomize |
| append to a list | add … to | put … in | push |
| remove from a list | remove … from | take … out of | splice |
| compare equality | is the same as | is, equals | equality operator |
| compare inequality | is different from | is not | not equal |
| draw one pixel | set pixel | pset, draw dot | raster operation |
| draw a rectangle | draw rectangle | draw rect, draw box | primitive |
| remainder after division | remainder of | mod | modulo |
| screen-fixed drawing | on screen | on hud | viewport overlay |
| same-name durable write | save X | remember X as "X" | persist, serialize |
| same-name durable read | load X | recall "X" into X | deserialize |
| named durable write | remember … as … | save … as … | persist, serialize |
| named durable read | recall … into … | get … from memory | deserialize |
| durable delete | forget | delete saved | remove key |

Recommended relationship words:

- touches;
- is near / is far from;
- is within N pixels of;
- is inside / is outside;
- is before / is after;
- first / last / next / previous;
- all / any / none;
- same / different;
- more / less;
- at least / at most.

Recommended action words:

- make, change, add, remove;
- show, hide;
- move, turn, follow;
- start, stop, pause, continue;
- wait, repeat;
- pick, mix, sort, count;
- save, load, remember, recall, forget;
- join, leave, share.

The first benchmark should compare these pairs:

- make versus spawn;
- remove versus destroy;
- save/load shorthand versus explicit remember/recall;
- recall versus get from memory;
- mix versus shuffle;
- keep between versus clamp;
- set pixel versus pset;
- on screen versus on HUD.

Do not add both members of every pair as equally documented syntax. Select the
winner as canonical after the formative study; retain the other only as an alias
when it materially helps transfer from other tools or LLM generation.

## One machine-readable lexicon contract

Create a source such as spec/lexicon.json. It should be data, not another prose list.
Each entry needs:

- canonical phrase;
- accepted aliases;
- category;
- grammar pattern;
- current implementation status;
- AST node or lowering rule;
- canonical formatter form;
- short description;
- one positive example;
- likely-confusion diagnostics;
- minimum language version;
- example game;
- JS and Rust test identifiers.

Illustrative entry:

    {
      "canonical": "remember",
      "aliases": ["save"],
      "category": "data",
      "grammar": "remember <value> as <key>",
      "lowerTo": "save",
      "formatter": "remember {value} as {key}",
      "exampleGame": "time-attack",
      "status": "proposed"
    }

The contract should drive or be checked against:

- parser command-word recognition;
- the linter and spelling suggestions;
- the healer;
- syntax highlighting;
- quick help;
- LANGUAGE.md and the browser command reference;
- Python/JavaScript translation labels;
- JS and Rust parser fixtures;
- the LLM system prompt or grammar card.

CI should fail when a documented or suggested word lacks a parser form, when a parser
form is absent from the contract, or when JS and Rust report different availability.

## Vocabulary families and exact first versions

### 1. Initialization and change

Recommended canonical forms:

    score starts at 0
    change score to 10
    if score is 10

Compatibility:

- At top level, X is Y remains accepted as initialization.
- In a running block, X is Y remains accepted as mutation.
- set X to Y and let X = Y remain healer aliases.
- The formatter may offer, but must not silently apply, starts at / change to.

First implementation can lower starts at and change … to the existing assign node.
No runtime change is required. The parser must still distinguish comparison inside a
condition.

Tests:

- simple and dotted targets;
- top-level and function-body use;
- inline action following a condition;
- strings containing the words starts, change, or to;
- JS/Rust AST and execution parity;
- formatter idempotence.

Primary demonstration: Coin Quest initialization and restart flow.

### 2. Persistent data: save/load shorthand plus remember/recall

Use the shortest form when the live variable name and storage name are the same:

    score starts at 0
    load score

    if score > high_score
      save score

    forget score

The precise expansion is:

    save score
    = remember score as "score"

    load score
    = recall "score" into score, leaving score unchanged if no memory exists

    forget score
    = forget the stored key "score"; the live score is unchanged

This gives a beginner a familiar save/load pair without requiring keys or assignment
syntax. It also makes the default explicit in ordinary code:

    score starts at 0
    load score

If no saved score exists, score remains 0. If a saved score exists, it replaces the
current value.

Bare and dotted references are allowed:

    save settings.music
    load settings.music
    forget settings.music

Their keys are the canonical reference text, such as "settings.music". Save reports
an error if the live reference does not exist. Load does nothing when the stored key
does not exist. Forget removes only the durable value; it never clears or changes the
live reference.

Use explicit memory phrases when the names differ or when a fallback must be visible.

This is the recommended explicit trio:

    remember score as "high score"
    recall "high score" into high_score otherwise 0
    forget "high score"

Recall is the strongest semantic complement to remember. For younger readers, accept
this teaching alias and compare it in the benchmark:

    get "high score" from memory into high_score otherwise 0

The formatter should display recall unless testing shows that get from memory is
substantially easier to understand.

#### Grammar

    save <target-reference>
    load <target-reference>
    remember <value-expression> as <key-expression>
    recall <key-expression> into <target> [otherwise <default-expression>]
    forget <target-reference-or-quoted-key>
    if <key-expression> is remembered

For save/load shorthand, a bare or dotted reference is treated as both the live
target and the literal storage-key name; it is not evaluated to obtain a dynamic key.
Use the explicit remember/recall forms for dynamic keys or different names.

The first release should document otherwise in every explicit recall example. If it
is omitted, use the legacy missing-value default of 0 for compatibility and issue a
non-blocking suggestion to provide a type-appropriate fallback. Simple load is
different: a missing value leaves the already-initialized target unchanged.

Examples:

    recall "player name" into player_name otherwise "player"
    recall "unlocked levels" into unlocked_levels otherwise []
    recall "settings" into settings otherwise {music: yes}

    if "high score" is remembered
      recall "high score" into high_score otherwise 0

#### Semantics

- save REF stores a snapshot of REF under the canonical text of REF.
- load REF recalls that same key into REF when present and otherwise leaves REF
  unchanged.
- forget REF removes the key named by REF but does not alter the live REF.
- remember stores a snapshot of a JSON-compatible number, text, yes/no value, list,
  or object.
- recall deep-copies the stored value into the target.
- forget removes the stored value locally and queues a cloud deletion.
- Keys are converted to text after evaluating the complete expression.
- A recalled list or object must not alias the stored object in memory.
- Failed or unavailable storage produces a visible warning but does not crash the
  game.
- Legacy save V as K lowers to the same operation as remember V as K.
- Legacy load K remains an expression and preserves its current missing-key behavior.
- Internally, remember may continue lowering to the existing save AST node in the
  first change. Avoid renaming nodes merely for cosmetic consistency.
- Save REF can lower to the same node with value REF and key literal "REF".
- Load REF needs a statement form that can distinguish a missing key from the value
  0; do not implement it as unconditional assignment from the legacy load expression.
- Recall can initially lower to assignment whose value is the existing load
  expression only when its specified missing-value behavior remains equivalent.
- Simple load, otherwise, existence checks, and forget require explicit JS and Rust
  support plus host commands.

#### Canonical formatting

- If value reference, target reference, and literal key have the same canonical
  name, display save REF or load REF.
- If the names differ, display remember VALUE as KEY or recall KEY into TARGET.
- Preserve an explicit otherwise clause.
- Display forget REF for a same-name shorthand and forget "key" for an explicit
  storage name.
- Never rewrite between simple and explicit forms if doing so would change missing
  value behavior.

#### Storage namespace

New remember keys should be isolated by a stable game/project identifier supplied by
the host:

- bundled example: example slug;
- saved local project: project identifier;
- published game: publication identifier;
- standalone export: identifier embedded at export time.

The language should not expose account IDs or storage paths. Legacy save/load keys
must remain readable. Migration should try the namespaced key first and then the
legacy key, but new writes should use only the namespaced location.

#### Local/cloud timing

Recall must be deterministic during one run. At program start, the runtime receives a
snapshot of available memory. A cloud response arriving during play should update the
next-run snapshot, not silently change a live variable. If signed-in cloud hydration
has not completed, the host can briefly delay the first run or clearly indicate that
local memory is being used.

#### Delete behavior

Cloud deletion needs a real tombstone or delete operation; do not encode forget by
storing 0 or an empty string. The server must distinguish a deleted key from a valid
remembered value.

#### Limits and privacy

- Preserve the existing 4 KB per-value and 64 KB per-user limits unless intentionally
  revised.
- Report the key and limit in plain language when a value is too large.
- Never permit one game to recall another game’s memory.
- Standalone exports should remember only in their own browser origin unless the
  user explicitly connects an account service.
- Do not market cloud memory to children until the privacy and deletion descriptions
  match the deployed behavior.

Primary demonstrations:

- Time Attack remembers a numeric high score.
- Memory Garden remembers and recalls a list of plants plus a settings object.
- Both provide a visible reset button that calls forget.
- A tiny first lesson uses score starts at 0, load score, and save score before
  introducing explicit storage names.

### 3. Structured records, remembered collections, and photos

A recipe book is the first proposed non-game data application. It is a useful test
because simple key/value memory is not enough: recipes are structured records, the
book needs queries and editing, and uploaded photos are large binary assets with a
different lifecycle from JSON data.

#### Recipe record

Use ordinary, inspectable data rather than a special recipe type:

    recipe is {
      schema_version: 1,
      id: new id,
      title: "",
      description: "",
      servings: 4,
      prep_minutes: 0,
      cook_minutes: 0,
      ingredients: [],
      steps: [],
      tags: [],
      photos: [],
      cover_photo: "",
      source: "",
      notes: "",
      favorite: no,
      created_at: now,
      updated_at: now
    }

An ingredient should also be structured:

    ingredient is {
      quantity: "1 1/2",
      unit: "cups",
      item: "flour",
      note: "sifted"
    }

Quantity begins as text so the application can preserve “to taste,” “a pinch,”
fractions, and ranges without silently changing what the author entered. Numeric
amounts and unit conversion can be a later opt-in structure for recipe scaling.

A step may begin as text. Add structured duration or temperature only when the UI
uses it:

    step is {
      instruction: "Bake until golden",
      minutes: 20,
      temperature: 350,
      temperature_unit: "F"
    }

The first demo must define which fields are required. Recommended minimum:

- id;
- title;
- at least one ingredient;
- at least one step.

Photos, tags, source, times, and servings are optional. Missing optional fields must
not make an older record unreadable. Schema version supports explicit migrations;
the application must not infer a record version from whichever fields happen to be
present.

#### Stable IDs and time values

Add:

    recipe.id is new id
    recipe.created_at is now
    recipe.updated_at is now

New id returns an opaque stable text identifier. Now returns a timestamp value that
can be displayed in a local format but stored in a locale-independent form. Do not
use list position or title as identity; titles change and two recipes may share one.

#### Remembered collections

Saving the entire recipe book as one list is acceptable for a toy but does not scale
or support safe per-record edits. Add a keyed persistent collection:

    recipes is remembered collection "recipes" keyed by id

Recommended operations:

    remember recipe in recipes
    recall recipe_id from recipes into recipe otherwise {}
    forget recipe_id from recipes

    matches is recipes where title contains search_text
    matches is recipes where tags has selected_tag
    sort matches by title from A to Z
    sort matches by updated_at from newest to oldest
    count is the number of recipes

Remember RECORD in COLLECTION is an upsert by the collection key: create when the
key is new, replace the record when it already exists. The operation should return or
expose whether it created or updated. A future change can add field-level updates;
the first version should replace one complete validated record atomically.

Forget ID from COLLECTION removes one record. It must not delete photos that another
record still references. Collection enumeration and query order must be deterministic
under tests.

#### Validation

Recommended form:

    require recipe.title
    require at least 1 item in recipe.ingredients
    require at least 1 item in recipe.steps

    if recipe is valid
      remember recipe in recipes
    else
      show errors for recipe

The first implementation may define validation in the form component instead of the
core evaluator, but errors must still be represented as data with field, rule, and
message. Do not make the UI scrape error text.

Useful data predicates:

    if recipe.title is empty
    if recipe.photos is empty
    if recipe.servings is less than 1
    if ingredient.name contains search_text

#### Application surface

The existing 128 by 128 canvas is not a sensible recipe editor. Add an application
surface that uses accessible browser controls and responsive layout while retaining
fc as the logic/data language.

Proposed components:

    show text field "Title" for recipe.title
    show long text field "Description" for recipe.description
    show number field "Servings" for recipe.servings
    show list editor "Ingredients" for recipe.ingredients
    show list editor "Steps" for recipe.steps
    show tag field "Tags" for recipe.tags
    show photo field "Photos" for recipe.photos allowing many
    show button "Save recipe"

Events:

    when field "Title" changes
      ...

    when photos are chosen
      ...

    when button "Save recipe" is clicked
      ...

    when form "Recipe" is submitted
      ...

Views:

- recipe list with search, sort, and tag filter;
- create/edit form;
- detail view;
- delete/reset confirmation;
- loading, empty, offline, and error states.

The app surface needs scrolling, keyboard navigation, touch targets, labels,
descriptions, validation focus, and screen-reader announcements. Canvas-rendered
imitation form controls are not acceptable.

#### Photo assets

Do not put base64 image bytes in recipe.photos or in the key/value memory store.
Store each upload as an asset and keep only a reference:

    photo is {
      id: "asset-id",
      name: "pie.jpg",
      type: "image/jpeg",
      width: 1600,
      height: 1200,
      size: 245000,
      thumbnail: "asset-reference",
      image: "asset-reference",
      alt: "apple pie on a cooling rack"
    }

High-level form binding can handle the common case:

    show photo field "Photos" for recipe.photos allowing many

Lower-level operations are still needed for generated/custom interfaces:

    stored_photo is store photo chosen_photo
    add stored_photo to recipe.photos
    remove stored_photo from recipe.photos
    delete photo stored_photo

Store photo copies or uploads the selected file and returns an asset record. Delete
photo removes the durable asset only after reference checks or an explicit force
operation. Removing a photo reference from one recipe must not silently delete a
shared asset.

Required host behavior:

- file chooser and mobile camera input;
- JPEG, PNG, and WebP validation for the first version;
- configurable input-size and pixel-dimension limits;
- decode verification rather than trusting the filename or MIME header;
- orientation correction;
- EXIF metadata stripping, especially GPS;
- thumbnail generation;
- optional downscaling/compression before upload;
- local IndexedDB blob storage for offline use;
- authenticated cloud object storage with unguessable object names;
- ownership checks on read, write, and delete;
- signed or access-controlled delivery URLs;
- upload progress, retry, cancel, and visible failure;
- orphan cleanup after abandoned forms or failed record saves;
- deletion of original and derived variants when no references remain.

Alt text should be requested for accessibility. Automatic suggestions may help, but
the user must be able to inspect and edit them.

#### Record and asset transaction

Saving a recipe with new photos is a multi-step operation. The UI should:

1. validate the record locally;
2. store/upload new photos;
3. add returned asset references to a draft record;
4. atomically remember the recipe record;
5. mark the new assets committed;
6. clean up uncommitted assets after cancellation or failure.

The interface must not show “saved” before both record and asset work succeeds.
Editing recipe text should not re-upload unchanged photos.

#### Local-first and sync behavior

Use IndexedDB for recipe records and photo blobs; localStorage is too small and
unsuitable for binary data. The cloud remains a sync/backup layer.

The first product scope should be:

- private by default;
- one owner;
- local-first create/edit/read;
- later cloud synchronization;
- explicit publish/export.

Conflict handling for the first version may be record-level last-write-wins with
updated_at and a visible warning. Silent merging of ingredient or step arrays is not
acceptable. Collaboration, public comments, OCR, nutrition analysis, shopping lists,
and importing from arbitrary web pages are separate later features.

#### Recipe-demo acceptance

The demo is complete only when it can:

- create, edit, view, search, sort, and delete recipes;
- add, reorder, edit, and remove ingredients and steps;
- attach zero, one, or several photos;
- reload offline and retain records/photos;
- synchronize after reconnect without losing local work;
- prevent one user from reading another user’s private photos;
- remove a photo and eventually reclaim the asset;
- migrate an older record missing newly optional fields;
- export the user’s recipes and photo references;
- delete all recipe data on request;
- work with keyboard, touch, and a screen reader;
- report storage limits and upload failures in plain language.

This demo should be treated as an application-profile proof, not squeezed into the
game canvas or counted as a small beginner game.

### 4. Making, removing, showing, and hiding things

Recommended beginner forms:

    make coin at x 40, y 60 in coins
    remove coin from coins
    hide player
    show player

Accepted aliases:

    spawn coin at x 40, y 60 into coins
    destroy coin from coins

First-version semantics:

- make creates a sprite object using the named built-in or user-defined sprite,
  supplies x and y, and adds it to the explicitly named list.
- The list is required in canonical output. Do not make the runtime scan all
  variables to guess ownership.
- remove keeps its existing list-removal semantics.
- hide sets visible to no; show sets visible to yes.
- Hidden objects are not drawn. Whether hidden objects collide must be explicit:
  the recommended first version is that hidden objects do not draw, collide, receive
  clicks, or trigger pickup/hit handlers.
- Explicit draw sprite hidden_object should still respect visibility.

Do not use make as a general object constructor in the first change. Keep object and
sprite literals for advanced construction until a separate record syntax is chosen.

Primary demonstrations: Bubble Pop and Space Invaders.

### 5. Spatial words

Recommended conditions and expressions:

    if player touches coin
    if ghost is within 20 pixels of player
    if ghost is near player
    if treasure is far from player
    distance is distance between player and treasure
    if player is inside safe_zone
    if player is outside world

Semantics:

- touches uses the existing AABB model and each object’s width/height, defaulting to
  the current 8 by 8 sprite box.
- distance between uses center-to-center Euclidean distance in pixels.
- within N pixels is inclusive.
- near needs a documented default. Start with 16 pixels only if testing confirms it;
  otherwise keep near as an accepted alias that formats to within 16 pixels.
- far from is the negation of within the chosen threshold.
- inside/outside require a rectangle-like object with x, y, width, and height, or the
  built-in world.
- Point, sprite, and rectangle operands must have explicit diagnostics when required
  fields are absent.

Primary demonstrations: Coin Maze and the new Treasure Radar game.

### 6. Time and lifecycle

Recommended forms:

    when game starts
      ...

    when screen play opens
      ...

    after 2 seconds
      ...

    every 24 frames
      ...

    when time runs out
      ...

After should be implemented before wait. After schedules a block and lets the game
continue. Wait implies suspension of the current action and requires a coroutine or
continuation model; implementing it as a busy loop would freeze the game. Until that
model is selected, the healer should suggest after N seconds when a learner writes
wait N seconds.

Event order:

1. program definitions and top-level initialization;
2. when game starts, once;
3. input events;
4. due after/every work;
5. update;
6. motion/collision;
7. drawing and active screen;
8. screen-open event on a transition, once per entry.

The exact order must be reconciled with the existing frame contract and frozen in
SEMANTICS.md.

Primary demonstrations: Time Attack, Memory Match, and Space Invaders waves.

### 7. Collections

Recommended expressions:

    first item of enemies
    last item of enemies
    item 3 of enemies
    random item of enemies
    the number of enemies

Recommended actions:

    add coin to coins
    put coin at start of coins
    put coin at position 3 in coins
    remove coin from coins
    remove first item from coins
    remove last item from coins
    mix cards
    sort scores from high to low

Semantics:

- Positions remain 1-based.
- first and last of an empty list return nothing.
- random item of an empty list returns nothing and does not consume RNG state.
- put at a position clamps to the valid insertion range or reports an error; choose
  one behavior and freeze it. The recommended teaching behavior is a clear error.
- mix mutates the list using the canonical seeded RNG in tests.
- sort is stable.
- high to low and low to high work for numbers; text sorting can be a later change.

Do not use remember for adding something to an in-memory list. The vocabulary
boundary is:

- add/put/remove: data in the current run;
- remember/recall/forget: durable data between runs;
- broadcast: data shared with peers.

Primary demonstrations: Snake and Memory Match.

### 8. Numbers and text

Recommended numeric forms:

    keep player.x between 0 and 120
    rounded_score is round score
    speed is absolute value of ball.dx
    small is the smaller of a and b
    large is the larger of a and b
    remainder is remainder of count divided by 3
    total is total of scores
    average is average of scores

Recommended text forms:

    size is length of player_name
    name is join first_name and last_name with " "
    label is uppercase player_name
    answer is lowercase answer
    if name starts with "A"
    if name ends with "son"
    if name contains "cat"

Keep plus numeric; do not silently make it sometimes concatenate text. Join should
be the explicit text operation. State behavior on empty lists and nonnumeric members
for total/average; the recommended first version reports a clear error rather than
coercing arbitrary values.

Primary demonstrations:

- Breakout for keep-between, absolute value, and rectangle terminology.
- Life and Langton for remainder and set pixel.
- Word Quest for length, join, uppercase/lowercase, and text conditions.

### 9. Control symmetry

Recommended pairs:

    play music "theme"
    pause music
    continue music
    stop music

    follow player with camera
    stop following player

    join game "tag" room "lobby"
    leave game

    pause game
    continue game

Do not overload stop X as both motion and every other stop action. Parse longer,
specific phrases before generic stop-object forms.

Pause game needs explicit scope. The recommended behavior pauses update, automatic
motion, timers, collision, and after/every schedules while continuing to draw the
current frame and accept the unpause button/key.

Primary demonstrations: Coin Quest settings/pause screen and Tag/Hunt multiplayer.

## Example-game curriculum

Use two layers:

1. focused games, each with one obvious teaching purpose;
2. a capstone that proves the features compose.

Do not rewrite every example to use every new alias. Each example should remain
small enough that a learner can identify why each line exists.

### Existing games to update

#### Bubble Pop — entity lifecycle

Current size: about 45 lines. Target: no more than 65.

Demonstrate:

- make/spawn;
- remove/destroy;
- every versus after;
- touches/clicked;
- sound and particles.

Representative result:

    every 24 frames
      make bubble at x 14 + random 100, y 124 in bubbles

    when bubble is clicked
      remove bubble from bubbles
      burst 10 sparks at bubble
      play sound "pop"

#### Coin Maze — spatial relationships

Current size: about 92 lines. Keep the existing tilemap and chase behavior.

Demonstrate:

- touches;
- within N pixels;
- distance between;
- inside/outside;
- camera following.

Replace hand-built bounding-box conditions only where the new phrase genuinely makes
the program easier to understand.

#### Snake — collection vocabulary

Current size: about 87 lines.

Demonstrate:

- first and last item;
- put at start;
- remove last;
- random item;
- count;
- mix only if used for food placement.

The update should make the body-list algorithm clearer, not merely add vocabulary in
comments.

#### Time Attack — time, lifecycle, and scalar memory

Current size: about 40 lines. Target: no more than 60.

Demonstrate:

    high_score starts at 0
    load high_score

    when game starts
      ...

    when time runs out
      if score > high_score
        change high_score to score
        save high_score

Add a reset-best button that calls forget high_score after a confirmation or an
intentionally held action so a child does not erase progress accidentally. Link to
the explicit remember/recall form in the lesson as the next step when a custom
storage name is needed.

#### Space Invaders — waves

Demonstrate:

- make/spawn and remove/destroy;
- after N seconds;
- when game starts;
- next wave;
- first/last enemy where useful.

The program should visibly pause between waves so the scheduling phrase has an
observable purpose.

#### Breakout — elementary numeric and drawing words

Demonstrate:

- draw rectangle;
- keep paddle.x between bounds;
- absolute value;
- reverse;
- all bricks / no bricks.

#### Life and Langton — readable low-level aliases

Use:

- set pixel instead of pset in the teaching view;
- remainder instead of mod;
- row, column, neighbor, same, and different.

Keep pset/mod accepted for compact legacy programs.

#### Coin Quest — capstone

Coin Quest already has screens, buttons, enemies, collectibles, sound, camera
movement, and win/lose states. Update it only after the focused games are stable.

It should demonstrate the composition of:

- starts at / change to;
- make/remove;
- show/hide;
- touches/near/distance;
- when game starts and when screen opens;
- after;
- remember/recall for settings or best score;
- pause/continue music;
- follow/stop following;
- named roles and units.

Do not force advanced text transforms, multiplayer, and every collection operation
into Coin Quest. The suite provides complete coverage; the capstone proves that the
core game-oriented families compose.

#### Tag or Hunt — multiplayer lifecycle

Demonstrate:

- join game;
- when a player joins/leaves;
- leave game;
- broadcast;
- connected/peers;
- cleanup of departed-player state.

### New focused games

#### Memory Match

Purpose: visibility, delayed actions, and list operations.

Target: 60–90 lines.

Core phrases:

    when game starts
      mix cards
      hide all cards

    when card is clicked
      show card
      add card to choices

    after 1 second
      if first item of choices is different from last item of choices
        hide first item of choices
        hide last item of choices
      clear choices

Acceptance:

- no card can be selected twice in one turn;
- input is locked during the delayed comparison;
- matched cards remain shown;
- restarting produces a deterministic test layout under a seed.

#### Treasure Radar

Purpose: spatial vocabulary.

Target: 40–65 lines.

Core phrases:

    distance is round distance between player and treasure
    if treasure is within 16 pixels of player
      write "very warm"
    else if treasure is within 40 pixels of player
      write "warm"
    else
      write "cold"

    if player touches treasure
      show treasure

Acceptance:

- the hidden treasure does not draw or collide before reveal, except for the
  intentional distance calculation;
- warm/cold boundaries are covered by exact tests;
- the program has no handwritten square-distance or AABB math.

#### Word Quest

Purpose: text and collection-to-text operations.

Target: 60–90 lines.

The player collects letter tiles to spell a target word.

Core phrases:

    add letter.text to letters
    answer is join letters with ""
    write uppercase answer at x 24, y 20

    if length of answer is length of target
      if lowercase answer is the same as lowercase target
        go to win

Acceptance:

- the visible word updates after every pickup;
- case behavior is explicit;
- empty join and repeated letters are tested;
- the game works without a keyboard text-entry dependency.

#### Memory Garden

Purpose: durable structured data.

Target: 50–80 lines.

Core phrases:

    recall "garden" into plants otherwise []
    recall "settings" into settings otherwise {music: yes}

    when seed is planted
      add plant to plants
      remember plants as "garden"

    when button "reset garden" is clicked
      forget "garden"
      clear plants

Acceptance:

- a list of objects survives reload;
- recalling returns a deep copy;
- reset deletes local and cloud memory;
- offline use works;
- two different games using the key "garden" do not collide;
- an oversized value produces a useful error.

### New data application

#### Recipe Book

Purpose: prove that the language can describe a useful structured-data application,
not only a canvas game.

The complete data model, remembered-collection operations, application controls,
photo-asset lifecycle, privacy requirements, and acceptance criteria appear in
“Structured records, remembered collections, and photos” above.

The first demo should include:

- private recipe list;
- search by title or ingredient;
- filter by tag;
- title and recently-updated sorts;
- create, edit, view, and delete;
- structured ingredients and steps;
- zero, one, or several uploaded photos;
- offline reload;
- explicit save state and errors;
- data export and complete deletion.

It should not initially include:

- public sharing or comments;
- household collaboration;
- OCR from a photo;
- nutrition calculation;
- shopping-list generation;
- arbitrary website import;
- AI recipe generation.

Those features can obscure whether the core record, query, form, and asset vocabulary
is understandable.

## Coverage matrix

| Vocabulary family | Focused proof | Secondary proof | Capstone |
|---|---|---|---|
| starts at / change to | Time Attack | Snake | Coin Quest |
| make / remove | Bubble Pop | Space Invaders | Coin Quest |
| show / hide | Memory Match | Treasure Radar | Coin Quest |
| touches | Treasure Radar | Coin Maze | Coin Quest |
| near / distance / inside | Treasure Radar | Coin Maze | Coin Quest |
| after / lifecycle | Time Attack | Space Invaders | Coin Quest |
| first / last / put / remove | Snake | Memory Match | Coin Quest inventory only if natural |
| mix / pick | Memory Match | Snake food | — |
| save / load shorthand | Time Attack | Memory Garden | Coin Quest settings |
| remember / recall / forget | Memory Garden | Recipe Book | Coin Quest settings |
| remembered keyed collections | Recipe Book | — | — |
| accessible forms and photo fields | Recipe Book | — | — |
| numeric helpers | Breakout | Treasure Radar | Coin Quest |
| text helpers | Word Quest | HUD labels | — |
| readable drawing words | Breakout, Life, Langton | Treasure Radar | Coin Quest |
| audio/camera symmetry | Time Attack | — | Coin Quest |
| multiplayer lifecycle | Tag/Hunt | Pong Online | — |

## Delivery phases

### Phase 0 — make the current vocabulary truthful

1. Fix stop music / stop sound dispatch order.
2. Reconcile parser verbs, editor verbs, healer verbs, highlighter verbs, and docs.
3. Remove unsupported false friends or mark them proposed.
4. Make unresolved commands visible errors after function-name resolution.
5. Update LANGUAGE.md to match current save, sound, network, map, animation, and
   particle behavior.
6. Add the machine-readable lexicon contract and a drift checker.

Exit condition: every word accepted as built-in has a parser fixture, runtime or
compile-time behavior, documentation entry, and JS/Rust availability status.

### Phase 1 — canonical words that lower to existing behavior

Implement:

- starts at and change … to;
- increase/decrease canonicalization;
- draw rectangle;
- set pixel;
- remainder of … divided by …;
- on screen;
- remember as an alias/lowering of the existing save operation;
- save REF as a shorthand that lowers to save REF as "REF".

Add the optional formatter only after AST round-trip tests exist.

### Phase 2 — complete explicit memory

Implement:

- load REF with leave-current-value-on-missing semantics;
- explicit recall with otherwise fallback;
- forget;
- is remembered;
- per-game namespace;
- deletion/tombstone host seam;
- deterministic memory snapshot at run start;
- Rust/WASM and standalone-export parity.

Ship Time Attack and Memory Garden demonstrations.

### Phase 3 — data-application foundation

Implement:

- stable new id and now values;
- remembered collections keyed by a field;
- atomic per-record remember/recall/forget;
- query, filter, deterministic sort, and count;
- record validation represented as data;
- accessible app-surface forms, lists, details, and error states;
- IndexedDB record/blob host;
- photo chooser, validation, thumbnailing, metadata stripping, and asset references;
- authenticated cloud record and object storage;
- ownership, quota, export, and deletion paths;
- offline synchronization and visible record-level conflict handling.

Ship Recipe Book privately as an application-profile proof. Do not present it as a
small extension of the game canvas.

### Phase 4 — entities and space

Implement:

- make;
- show/hide visibility;
- touches;
- distance between;
- within N pixels;
- inside/outside.

Ship Bubble Pop, Treasure Radar, and Coin Maze updates.

### Phase 5 — time and lifecycle

Implement:

- when game starts;
- when screen X opens;
- after N frames/seconds;
- pause-safe scheduler behavior.

Do not implement wait until suspension semantics are designed.

Ship Memory Match and Space Invaders waves.

### Phase 6 — collections, numbers, and text

Implement:

- first/last/random item;
- put at start/position;
- remove first/last;
- mix;
- keep between;
- round/absolute/smaller/larger;
- length/join/uppercase/lowercase/starts-with/ends-with/contains.

Ship Snake, Breakout, Life/Langton, and Word Quest updates.

### Phase 7 — control symmetry and capstone

Implement:

- pause/continue/stop audio;
- stop following camera;
- pause/continue game;
- leave game and join/leave events.

Update Coin Quest and Tag/Hunt. Run the full human and model readability study before
making public comparative claims.

## Implementation checklist for each phrase

A code-only implementation task is not complete until it supplies all applicable
items:

1. exact grammar and precedence;
2. JS tokenizer/parser behavior;
3. JS AST fixture;
4. JS runtime semantics;
5. Rust tokenizer/parser behavior;
6. Rust runtime semantics;
7. host command when browser/device state is involved;
8. formatter canonical output and alias handling;
9. linter/healer/highlighter vocabulary;
10. conversational diagnostics and typo suggestion;
11. semantic documentation in spec/SEMANTICS.md;
12. grammar documentation in spec/GRAMMAR.md;
13. corpus program and expected variables/errors;
14. tokenizer, AST, execution, transpiler, and fuzz parity;
15. one focused example game;
16. launcher description, thumbnail, smoke test, and visual golden;
17. standalone HTML export behavior;
18. no regression in existing examples;
19. for durable data: namespace, missing-value, quota, migration, offline, conflict,
    export, and deletion tests;
20. for uploaded assets: file validation, ownership, thumbnail, reference, orphan,
    and deletion tests.

Likely implementation paths:

- index.html — reference parser/runtime/editor/transpiler and embedded WASM;
- spec/lexicon.json — proposed vocabulary contract;
- spec/GRAMMAR.md and spec/SEMANTICS.md — source-of-truth prose;
- spec/corpus — conformance programs and goldens;
- spec/heal — linter/healer drift and repair tests;
- spec/port/spike/src/lib.rs — Rust/WASM implementation;
- spec/port/spike test and golden tools — cross-engine parity;
- LANGUAGE.md and docs/index.html — learner-facing reference;
- examples — focused and capstone games.

Relevant verification commands include:

    node spec/heal/eval.mjs
    node spec/port/spike/tokenize-diff.mjs
    node spec/port/spike/ast-diff.mjs
    node spec/port/spike/exec-diff.mjs
    node spec/port/spike/transpile-diff.mjs
    node spec/port/spike/examples-diff.mjs
    node spec/port/spike/fuzz.mjs
    cargo test --manifest-path spec/port/spike/Cargo.toml

Regenerate and inspect goldens intentionally; never update them merely to make a
failing change green.

## Example-game acceptance requirements

Every new or materially changed example must have:

- a one-sentence teaching purpose;
- no dead or decorative vocabulary;
- a seeded deterministic test mode;
- JS/WASM variable and draw parity;
- a smoke interaction script, not only idle frames;
- a launcher tile and concise description;
- a thumbnail or visual golden;
- accessibility checks for keyboard and touch;
- no console errors;
- standalone export verification;
- a line count and concept count appropriate to its teaching position.

For focused examples, aim for one new vocabulary family and fewer than 90 lines.
The capstone may be longer, but every additional concept must have a gameplay reason.

## Measurement

Track:

- intent coverage: percentage of a fixed set of beginner game intentions expressible
  with one documented phrase;
- false-friend rate: percentage of plausible built-in-looking lines that silently do
  nothing; target zero;
- repair rate: percentage of misspelled/aliased lines correctly diagnosed or
  canonicalized;
- novice comprehension and revision success;
- time and workload;
- LLM first-run success and repair turns;
- canonical-form variance across human and model authors;
- per-game feature coverage without comments being counted as implementation.

For elementary vocabulary, compare the candidate words in isolated sentences and in
complete programs. A child recognizing make in a vocabulary test does not prove that
make coin at x 40, y 60 in coins communicates creation and collection ownership.

## Decisions still requiring human or study evidence

1. make versus spawn as canonical display;
2. recall versus get from memory;
3. whether otherwise is mandatory in canonical recall;
4. near as a fixed distance versus always displaying within N pixels;
5. whether hidden things participate in distance checks but not collision;
6. whether put at an invalid list position errors or clamps;
7. how automatic formatting is invoked and reviewed;
8. whether pause game pauses audio by default;
9. how long the first run may wait for cloud memory hydration;
10. whether wait is worth adding after after satisfies most teaching use cases.

The recommendations in this document are the default implementation choices. Change
them only with an explicit design decision or evidence from the readability study.
