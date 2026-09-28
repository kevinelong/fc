# Measuring human and machine readability

**Goal:** measure whether people can understand and change fc programs more
successfully than equivalent Python, and whether LLMs can generate fc more
reliably or cheaply than equivalent executable code.

## There is no universal programming-language readability score

Several established approaches are useful, but none supplies an accepted ladder
from machine code through Python to fc:

- Buse and Weimer learned a readability predictor from human ratings and local
  code features. Scalabrino and colleagues extended this with textual features
  and thousands of human ratings. These models are useful for comparing snippets
  similar to their training data, but they are not a neutral cross-language ruler;
  a model trained on Java-style source can reward formatting conventions that do
  not apply to a declarative language.
- Halstead difficulty, cyclomatic complexity, maintainability index, line count,
  nesting, and token count measure aspects of complexity or size—not whether an
  untrained person correctly understands a program.
- The Cognitive Dimensions of Notations framework is valuable for language design:
  closeness of mapping, consistency, role-expressiveness, viscosity, hidden
  dependencies, progressive evaluation, and related dimensions. It is primarily
  a structured design vocabulary, not a single quantitative score.
- Stefik and Siebert compared syntax empirically by asking novices to interpret
  constructs in several languages, including Python, Ruby, Java, Quorum, and a
  randomized syntax. This is the closest precedent for the claim fc wants to make:
  syntax intuitiveness must be measured with people, not inferred from familiarity.
- Program-comprehension studies commonly use correctness, response time,
  explanation quality, edit/debug success, subjective difficulty, NASA-TLX
  workload, and sometimes eye tracking. Recent work also shows that perceived
  readability and actual task performance can disagree.

The defensible headline is therefore not an opaque automated score. It is a human
outcome such as:

> Novices understood program behavior with **X percentage points higher accuracy**,
> completed correct edits **Y times faster**, and reported **Z% lower workload**
> in fc than in equivalent Python.

## The Readable Executability Benchmark

Create a public benchmark with two independent tracks. Do not collapse them until
both raw result sets have been published.

### H-track — human comprehension and revision

Primary outcomes:

1. **Behavior comprehension:** accuracy on questions about what a program does.
2. **Revision success:** percentage who make a requested behavior change correctly.
3. **Time to correct answer/edit:** use survival or mixed-effects analysis so
   incorrect/time-out responses are not quietly discarded.
4. **Explanation fidelity:** blinded scoring against a short rubric of required
   concepts.
5. **Workload:** NASA Raw-TLX or a preregistered subset measuring mental demand,
   effort, and frustration.

Useful secondary outcomes:

- confidence calibration;
- delayed recall of the program's behavior;
- error localization and repair success;
- reading path or fixation count in a later eye-tracking study;
- which tokens or lines participants say caused confusion.

### M-track — model generation and repair

Keep this separate from human readability. Measure:

1. syntax/parse success;
2. first-pass bounded execution;
3. semantic-intent success on a hidden rubric;
4. interaction and visual checks;
5. repair turns/model calls;
6. output and context tokens;
7. latency and cost;
8. deterministic replay;
9. unsupported or unsafe operation attempts.

Plot languages on a **Human–Machine Legibility Map** rather than claiming that one
property represents both:

- horizontal axis: human comprehension/revision performance;
- vertical axis: LLM generation reliability at a fixed cost/model;
- Python baseline normalized to 1.0 on each axis;
- fc's desired position is the upper-right quadrant.

Assembly or WebAssembly text can be included as a calibration anchor, but machine
code should not be the main comparison. It creates a floor effect and tests a
different abstraction level. Python, JavaScript/canvas, and PICO-8-style Lua are
the decision-relevant baselines.

## A transparent summary score

Raw outcomes remain primary. If one display number is needed, call it the
**Executable Readability Score (ERS)** and preregister it before collecting data.

Normalize these four measures to 0–1 within the benchmark:

- comprehension accuracy (`C`);
- correct revision rate (`R`);
- time efficiency, including time-outs (`T`);
- low cognitive workload (`W`).

Use an equal-weight geometric mean:

```text
ERS = 100 × (C × R × T × W)^(1/4)
```

The geometric mean prevents a language from hiding a serious weakness behind one
excellent dimension. It also avoids inventing weights that conveniently favor fc.

Report improvement against Python as:

```text
Readability lift vs Python = (ERS_fc / ERS_python - 1) × 100%
```

Always display the four component outcomes and confidence intervals next to the
composite. “X% more readable” is acceptable only after the formula, tasks, and
analysis have been preregistered and the raw results are public.

## Study design

### Participants

Use separate cohorts:

- true novices with no programming instruction;
- beginners with limited programming exposure;
- experienced Python programmers.

The primary marketing claim should name the cohort. “Novices read fc faster than
Python” does not imply that professional Python developers will prefer fc.

Run a small usability pilot first, then determine the final sample through a power
analysis. A credible public result will probably require substantially more than
the eight-prompt LLM evaluation or a handful of friendly testers.

### Materials

Create 20–30 semantically paired programs across:

- variables, conditions, and loops;
- input and state;
- lists and object properties;
- drawing and animation;
- collision and scoring;
- timers and screens;
- one or two intentionally faulty programs.

Match identifiers, comments, behavior, formatting quality, and visible output.
Do not compare polished fc with deliberately poor Python. Include simple and
moderately compositional tasks; tiny “hello world” examples will ceiling out.

### Assignment

Use a randomized Latin-square or balanced design so participants see equivalent
difficulty in each language without seeing the same task twice and learning its
answer. Counterbalance language and task order. Hide the project hypothesis from
participants where practical.

Collect comprehension before allowing execution; then test revision with the
normal editor/runtime. This distinguishes readable notation from the benefit of
fc's immediate visual feedback, while still measuring the full programming system.

### Analysis and release

- Preregister the tasks, primary outcomes, exclusion rules, score formula, and
  statistical model.
- Use mixed-effects models with participant and task as random effects.
- Publish anonymized data, programs, rubrics, and analysis code.
- Report absolute results, effect sizes, and uncertainty—not only p-values.
- Repeat the study after major syntax changes; do not reuse exposed hidden tasks.

## Automated diagnostics, not marketing proof

Static proxies can help find language-design problems before human testing:

- **ceremony ratio:** syntax/boilerplate tokens divided by all tokens;
- **domain-word ratio:** tokens that directly name entities, actions, conditions,
  or units divided by all tokens;
- punctuation density;
- nesting depth and forward-reference distance;
- number of simultaneously live identifiers;
- number of implicit runtime actions not visible in source;
- spec-to-code alignment, measured with a fixed method;
- canonical-form variance: how many surface phrasings express the same operation.

These can be gamed and should never be the basis of “better than Python.” They are
instrumentation for language designers.

## Changes likely to improve fc readability

Every change below should be A/B tested using the H-track. Preserve old programs
through aliases or a migration formatter rather than making speculative breaking
changes.

The proposed forms below are **design sketches, not currently supported syntax**
unless identified as current fc. They make each hypothesis concrete enough to
prototype and test.

### 1. Tolerant input, canonical display

Accept a limited set of natural variants, then offer **Format as canonical fc**.
The editor should show one preferred phrasing and a visible diff. This gives users
forgiveness without making the language an unpredictable collection of synonyms.
It also reduces the output space an LLM must learn.

For example, a beginner or model might enter any of these:

```text
add 1 to score
score goes up by 1
increase score by 1
```

If all three are accepted aliases, the formatter should display just the canonical
form:

```text
increase score by 1
```

The same rule could normalize harmless variation such as `colour` to `color` or
`at x 20 and y 30` to `at x 20, y 30`. The editor remains forgiving at entry time,
while saved programs, documentation, examples, and model outputs converge on one
form.

### 2. Remove the assignment/equality surprise

`is` reads naturally but currently carries multiple roles, while `set X to Y`
has historically behaved as a silent call/no-op in parts of the language history.
In current-style fc, the same word can mean initialization, later mutation, or a
comparison:

```text
score is 0

to restart game
  score is 0

if score is 10
  go to win
```

A reader must infer the role of each `is` from its position. Test a canonical
distinction such as:

```text
score starts at 0

to restart game
  change score to 0

change score to 10
if score is 10
  go to win
```

An alternative is to keep `is` for declaration/assignment but make the editor
visually explain its role in context. The benchmark should choose; intuition alone
is not enough. A hover could say “creates score,” “changes score,” or “compares
score” for the three current-style uses.

### 3. Add multi-word function names

Support and formally document names that match the user's concept. The repository
already contains phrases such as `to restart game`; the design question is whether
arbitrary multi-word declarations and calls are parsed consistently.

A terse or encoded name makes the reader translate it:

```text
to title
  clear screen to dark blue
  write "STAR QUEST" at 34, 30 in white

title
```

A descriptive name can state both action and object:

```text
to draw title screen
  clear screen to dark blue
  write "STAR QUEST" at 34, 30 in white

draw title screen
```

This improves closeness of mapping but requires a clear call grammar so arbitrary
prose is not mistaken for a function. Parameter roles should remain readable too:

```text
to award points amount to player recipient
  increase recipient.score by amount

award points 10 to player hero
```

The exact parameter grammar is a hypothesis to test, not a recommendation to add
unbounded natural-language parsing.

### 4. Prefer named roles over positional arguments

Current fc drawing code can require the reader to remember what each number means:

```text
draw circle at b.x, b.y size 7 in pink
draw rect at brick.x, brick.y size 14, 7 in orange
```

Test readable named forms for operations with several numbers:

```text
draw circle at x b.x, y b.y, radius 7, color pink
draw rectangle at x brick.x, y brick.y, width 14, height 7, color orange
```

Keep concise positional forms as accepted input if desired, while the formatter
can prefer named roles for beginners. This is especially valuable when two adjacent
arguments have the same type and swapping them still produces a valid program.

### 5. Make units explicit

First-class `pixels`, `frames`, `seconds`, percentages, and angles reduce hidden
assumptions and allow better diagnostics:

```text
-- Meaning must be remembered from the operation
move player by 2, 0
every 24 frames
time limit is 20 seconds
```

fc already expresses time units well in the last two lines. Extend that strength
to spatial and visual values:

```text
move player by x 2 pixels, y 0 pixels
draw circle at x 64 pixels, y 64 pixels, radius 10 pixels
turn enemy by 30 degrees
set music volume to 60 percent
```

Units also enable targeted errors: “expected pixels for radius, but received
seconds” is more useful than a generic type error.

### 6. Make lifecycle and scope visible

Hidden dispatch and magic globals save typing but hurt role-expressiveness. Test
canonical blocks such as `every frame`, `draw each frame`, and `on screen title`.
The editor can also expose implicit behavior in an expandable “what fc does” view.

Current fc uses specially named functions plus a separate wiring statement:

```text
to update
  move player with arrows

to draw
  clear screen to black
  draw sprite player.image at player.x, player.y

run game with update and draw
```

An event-shaped alternative puts the trigger next to the behavior:

```text
every frame
  move player with arrows

draw each frame
  clear screen to black
  draw sprite player.image at player.x, player.y
```

Likewise, compare `to screen title` with a more explicit `on screen title` block.
The benchmark should test whether the added words improve comprehension enough to
justify them.

### 7. Resolve noun/call ambiguities

Define an unambiguous rule for `draw title`, sprite names, and user functions.
Use diagnostics that name both interpretations and offer one-click fixes instead
of silently choosing.

For example, this phrase could mean “call my action named `draw title`” or “draw
the object stored in `title`”:

```text
draw title
```

One design avoids the collision by reserving drawing verbs for built-in shapes and
using a distinct verb for the custom action:

```text
to show title screen
  write "STAR QUEST" at 34, 30 in white

show title screen
draw sprite title at title.x, title.y
```

Another candidate is an explicit fallback such as `call draw title`. Whichever
rule tests better should be enforced consistently, with a diagnostic such as:
“`draw title` could refer to an action or a sprite; use `show title screen` or
`draw sprite title ...`.”

### 8. Treat pronouns and shorthand cautiously

`with player` / `its` blocks and inferred singular names reduce repetition, but
they can introduce hidden binding and force readers to look backward. Keep the
referent close, highlight it in the editor, and compare explicit vs shorthand
forms in comprehension tasks.

Current shorthand is pleasantly compact:

```text
with player
  its x is 128
  its y is 96
  its hp is its max_hp
```

The explicit alternative is longer but locally unambiguous:

```text
player.x is 128
player.y is 96
player.hp is player.max_hp
```

The tradeoff becomes clearer when blocks nest:

```text
with player
  with nearest enemy
    if its hp is less than 1
      increase its score by 1
```

Whose `score` changes—the player’s or the enemy’s? A safe rule could forbid nested
pronoun scopes, require `player.score` at the ambiguous line, or display the bound
name beside every `its`. Test those treatments rather than assuming fewer words
means easier reading.

### 9. Strengthen pluralization and domain vocabulary

Replace fragile English singularization with explicit aliases or a small tested
inflection table. Prefer consistent domain verbs and nouns; one predictable phrase
is better than many clever synonyms.

Regular forms look effortless:

```text
enemies is list of 3 sprites {image: "slime"}
each enemy in enemies
  draw sprite enemy.image at enemy.x, enemy.y
```

Irregular forms expose the hidden language rule:

```text
mice is list of 3 sprites {image: "mouse"}
each mouse in mice
  move mouse with arrows
```

If the runtime or editor derives `mouse` from `mice`, that rule must be complete
and predictable. An explicit alternative removes the guess:

```text
mice is list of 3 sprites called mouse {image: "mouse"}
```

Vocabulary should be canonical as well. If these all mean the same operation—
`delete coin`, `destroy coin`, and `remove coin from coins`—accepting aliases may
help entry, but the formatter and documentation should consistently display:

```text
remove coin from coins
```

### 10. Improve the programming system, not just syntax

Readability includes the editor and runtime. Continue investing in:

- step/inspect with changed values highlighted;
- hover or tap explanations in plain English;
- visible event and data-flow links;
- indentation guides and block selection;
- example-backed errors with one-click repair;
- the real-code comparison view;
- progressive disclosure of generated/implicit behavior.

These features directly improve progressive evaluation and error recovery, two
areas a syntax-only score misses.

For example, while stopped on this code:

```text
each coin in coins
  if player touches coin
    remove coin from coins
    increase score by 1
```

the editor could show:

```text
coin = sprite at (80, 48)
player touches coin = yes
coins: 8 -> 7
score: 6 -> 7
```

Hovering `each coin in coins` could explain “runs once for every item in `coins`;
`coin` means the current item.” Hovering an implicit `update` block could say “fc
runs this once per frame.” A misspelling such as `draw cirlce` could produce “I
don't know `cirlce`; did you mean `circle`?” and apply the repair in one click.
The real-code view could place the generated Python or JavaScript beside the exact
fc phrase that produced it instead of presenting an undifferentiated translation.

## Recommended first experiment

Before redesigning the grammar, run a 30–50 person formative study comparing
current fc and Python on six paired tasks. Measure comprehension, edit success,
time, and Raw-TLX. At the end, test three fc variants for the most likely pain
points:

1. current `is` versus explicit `starts at` / `change to`;
2. positional versus named drawing arguments;
3. current function calls versus multi-word functions.

Use the observed failures to choose the next language changes. Then run the larger,
preregistered benchmark required for a public “better than Python” claim.

## References

- [Buse & Weimer, A Metric for Software Readability](https://web.eecs.umich.edu/~weimerw/p/weimer-issta2008-readability.pdf)
- [Scalabrino et al., A Comprehensive Model for Code Readability](https://onlinelibrary.wiley.com/doi/abs/10.1002/smr.1958)
- [Stefik & Siebert, An Empirical Investigation into Programming Language Syntax](https://doi.org/10.1145/2534973)
- [Replication study on programming-syntax intuitiveness](https://link.springer.com/article/10.1007/s11219-023-09631-7)
- [Cognitive Dimensions of Notations resources](https://www.cl.cam.ac.uk/~afb21/CognitiveDimensions/)
- [NASA Task Load Index](https://www.nasa.gov/human-systems-integration-division/nasa-task-load-index-tlx/)
- [Eye-tracking study of readability rules and comprehension](https://doi.org/10.1007/s10664-024-10532-x)
- [2026 study: perceived readability can differ from novice performance](https://www.sciencedirect.com/science/article/pii/S0164121226000592)
