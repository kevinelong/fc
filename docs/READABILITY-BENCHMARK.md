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

### 1. Tolerant input, canonical display

Accept a limited set of natural variants, then offer **Format as canonical fc**.
The editor should show one preferred phrasing and a visible diff. This gives users
forgiveness without making the language an unpredictable collection of synonyms.
It also reduces the output space an LLM must learn.

### 2. Remove the assignment/equality surprise

`is` reads naturally but currently carries multiple roles, while `set X to Y`
has historically behaved as a silent call/no-op in parts of the language history.
Test a canonical distinction such as:

```text
score starts at 0
change score to 10
if score is 10
```

An alternative is to keep `is` for declaration/assignment but make the editor
visually explain its role in context. The benchmark should choose; intuition alone
is not enough.

### 3. Add multi-word function names

Support names that match the user's concept:

```text
to draw title screen
  ...

draw title screen
```

This is already an open design question. It improves closeness of mapping but
requires a clear call grammar so arbitrary prose is not mistaken for a function.

### 4. Prefer named roles over positional arguments

Test readable named forms for operations with several numbers:

```text
draw circle at x 64, y 64, radius 10, color red
```

Keep concise positional forms as accepted input if desired, while the formatter
can prefer named roles for beginners.

### 5. Make units explicit

First-class `pixels`, `frames`, `seconds`, percentages, and angles reduce hidden
assumptions and allow better diagnostics:

```text
move player right 2 pixels
wait 1 second
turn enemy 30 degrees
```

### 6. Make lifecycle and scope visible

Hidden dispatch and magic globals save typing but hurt role-expressiveness. Test
canonical blocks such as `every frame`, `draw each frame`, and `on screen title`.
The editor can also expose implicit behavior in an expandable “what fc does” view.

### 7. Resolve noun/call ambiguities

Define an unambiguous rule for `draw title`, sprite names, and user functions.
Use diagnostics that name both interpretations and offer one-click fixes instead
of silently choosing.

### 8. Treat pronouns and shorthand cautiously

`with player` / `its` blocks and inferred singular names reduce repetition, but
they can introduce hidden binding and force readers to look backward. Keep the
referent close, highlight it in the editor, and compare explicit vs shorthand
forms in comprehension tasks.

### 9. Strengthen pluralization and domain vocabulary

Replace fragile English singularization with explicit aliases or a small tested
inflection table. Prefer consistent domain verbs and nouns; one predictable phrase
is better than many clever synonyms.

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
