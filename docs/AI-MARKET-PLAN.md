# AI market hypothesis for the fc language

**Status:** promising hypothesis; validate before repositioning the product.

## Short answer

Descriptive English may make fc easier for an LLM to use, but English alone is
not the advantage. Models have vastly more training exposure to Python and
JavaScript than to fc, so a new English-like DSL can initially be harder for them
to generate exactly.

The stronger advantage is the combination of:

- a small, bounded vocabulary;
- little boilerplate and short programs;
- an explicit grammar and semantic spec;
- a safe interpreter instead of arbitrary generated JavaScript;
- parse, lint, execution, cross-engine, interaction, and visual checks;
- a deterministic repair loop;
- source that the end user can read and edit;
- standalone HTML export when the result is ready to leave fc.

That makes fc a candidate **human-auditable intermediate representation for
AI-generated interactive software**. The message is not “English guarantees that
the model is right.” It is “the model produces a small program that we can show,
run, validate, repair, and hand back to a person.”

The existing safety-net experiment is encouraging but preliminary: eight varied
prompts produced gate-passing fc on the first attempt in one model run. That is a
useful signal, not a market or quality proof. Passing the gate also proves
runnability—not that the result satisfies the user's intent.

## Why the hypothesis is plausible

1. **Intent and artifact share vocabulary.** A user says “coins are pickups” and
   the program can contain nearly the same phrase. Less translation is required
   between request, generated representation, explanation, and user edit.
2. **The output space is constrained.** A compact grammar and known built-ins
   reduce the number of APIs, imports, framework versions, and incidental choices
   a model must get right.
3. **Programs are token-efficient.** A complete game can be tens of readable
   lines rather than a web project with markup, state management, event wiring,
   assets, and build configuration.
4. **Validation is executable.** fc can parse, run for N frames, compare engines,
   inspect state, check interactions, and hash pixels. The LLM can receive concrete
   failures instead of a vague “try again.”
5. **Execution is contained.** Generated fc runs through a bounded interpreter;
   it is a safer artifact surface than executing arbitrary model-generated JS.
6. **Humans can take over.** The artifact remains understandable to a learner,
   teacher, reviewer, or product operator instead of disappearing behind chat.

Research on grammar- and type-constrained generation supports the general idea
that constraints can guarantee structure and combine with compiler/execution
feedback. It also warns that grammar correctness can distort generation or yield
syntactically valid but semantically poor output. fc should therefore combine
few-shot grounding, validation, repair, and semantic evaluation rather than rely
on grammar constraints alone.

## Where fc should compete

Do not position fc as a richer alternative to large prompt-to-3D-game platforms.
Roblox Build/Cube and Rosebud sell breadth, assets, worlds, and visual spectacle.
fc's defensible position is the opposite:

> **Small, inspectable, deterministic interactive programs that an AI can create,
> a runtime can verify, and a human can understand.**

### Primary market wedge: interactive artifacts for AI products

Potential customers are AI tutoring products, coding assistants, educational
publishers, and agent/chat products that want to return a playable simulation,
exercise, or microgame—not another paragraph of text or a blob of unsafe code.

Examples:

- a math tutor generates a manipulable fractions game;
- a language tutor generates a vocabulary challenge;
- a lesson author turns a learning objective into a small simulation;
- a chatbot returns a playable explanation or quiz;
- an AI coding tutor shows the generated program and lets the learner modify it;
- an agent produces an embeddable interactive artifact that is validated before
  the host application displays it.

This market is adjacent to the children/education product, so the same core and
examples serve both without requiring an immediate general-purpose language.

### Secondary market: evaluation and research

fc can be a compact benchmark for model program synthesis and repair:

- natural-language request to executable program;
- syntax, runtime, state, interaction, and pixel-level scoring;
- JS/WASM differential oracle;
- deterministic seeds and bounded programs;
- human readability as an additional measured outcome.

This is more likely to create credibility, contributors, and model-provider
relationships than large direct revenue, but it can be the proof that wins SDK
design partners.

### Longer-term option: executable intent language

If the game/education wedge succeeds, the core could grow toward interactive
diagrams, explainers, and simple simulations. Do not market fc as a general
business-workflow or agent language yet; its primitives and proof are currently
game-centric.

## Product package for AI developers

Keep `codeonline.io` focused on learners. Present the developer product as
**fc Core** or **fc Runtime**, with a separate `/ai` or `/developers` entry point.

Minimum package:

1. A versioned WASM runtime with JavaScript fallback and a small embedding API.
2. A web component or SDK that accepts fc source and mounts its declared logical
   screen, defaulting compatibly to 128×128. The embedding contract keeps logical
   screen size separate from window and export resolution; see
   [DISPLAY-PROFILES-PLAN.md](DISPLAY-PROFILES-PLAN.md).
3. Tool/API operations:
   - `validate(source)` — parse, lint, and bounded execution;
   - `repair(source)` — deterministic fixes first, model repair second;
   - `run(source, seed, frames, inputs)` — deterministic state/draw result;
   - `render(source)` — preview image or interactive embed;
   - `exportHtml(source)` — standalone artifact;
   - later, `generate(prompt)` — grounded generation plus validation and repair.
4. Machine-readable grammar, built-in vocabulary, examples, and error schema.
5. Explicit resource limits and a security model for untrusted generated programs.
6. A small integration example for an agent/tool-calling environment.

Possible positioning lines:

- **Prompt to a program you can read, run, and verify.**
- **The tiny executable language for AI-generated interactive artifacts.**
- **AI writes it. fc validates it. People can understand it.**

Avoid “verified correct.” The validator can prove syntax and bounded behavior; it
cannot prove that an underspecified prompt was interpreted as the user intended.

## The benchmark that decides whether this is real

Build a public, reproducible benchmark before investing in a separate AI brand.

### Prompt set

Use 100–200 prompts stratified across:

- drawing and animation;
- input and state;
- collision and scoring;
- timers and screens;
- lists, maps, and procedural/generative toys;
- multiplayer mechanics;
- ambiguous or underspecified requests;
- repair of deliberately broken programs.

Keep a hidden test set so prompt tuning does not become benchmark overfitting.

### Baselines

Run the same intent through:

- fc, zero-shot;
- fc with its spec and few-shot examples;
- fc with grammar constraints where supported;
- fc with generate → validate → repair;
- standalone JavaScript/canvas with an equivalent runtime scaffold;
- optionally PICO-8-style Lua as another small game-language baseline.

Test at least one frontier model and two smaller/cheaper models. The most valuable
result may be that fc lets a small model produce reliable artifacts cheaply, not
that it improves an already strong frontier model.

### Measures

- parse/lint success;
- first-pass bounded execution;
- interaction and visual checks;
- semantic-intent score from a blinded rubric;
- repairs and model calls required;
- output tokens, latency, and cost;
- deterministic replay rate;
- unsafe/unsupported operation attempts;
- time for a novice to understand and make a requested edit;
- standalone-export success.

### Proceed criteria

Treat these as targets to test, not current claims:

- at least 95% runnable within one repair;
- at least 80% semantic-intent success on the hidden set;
- materially fewer output tokens or lower cost than the JS baseline;
- a clear reliability or cost advantage for smaller models;
- non-programmers can correctly explain and edit generated fc more often or
  faster than generated JavaScript;
- the sandbox rejects unsupported behavior without escaping into arbitrary code.

If fc does not beat the scaffolded JS baseline on reliability, cost, safety, or
human editability, keep AI as an assistive feature for the education product
rather than a separate market.

The human side of that comparison—including a transparent score, study design,
Python baseline, and syntax experiments—is specified in
[`docs/READABILITY-BENCHMARK.md`](READABILITY-BENCHMARK.md).

The bounded vocabulary, persistent-data model, focused games, and proposed Recipe
Book application proof are specified in
[docs/LEXICON-AND-EXAMPLE-PLAN.md](LEXICON-AND-EXAMPLE-PLAN.md).

## Go-to-market experiment

### Phase 0 — proof, 2–3 weeks

- Finish the release-confidence work in `docs/LAUNCH-READINESS-PLAN.md`.
- Build the benchmark and publish methodology plus results, including failures.
- Add one live `/ai` demo: prompt → generated fc → validation trace → editable
  source → playable result → standalone export.
- Show the same prompt as fc and JavaScript so the auditability/token difference
  is concrete.

### Phase 1 — three design partners, 4–6 weeks

Recruit one partner in each category:

- an AI tutoring or education product;
- an agent/chat product that wants interactive artifacts;
- a program-synthesis or code-generation researcher/team.

Offer an embedded prototype, not a platform contract. Measure integration time,
generation cost, successful artifacts, user edits, and support burden.

### Phase 2 — developer preview

- Publish the standalone runtime/spec under the existing open-source license.
- Release a versioned SDK and hosted validation/render endpoint.
- Provide a free local tier and metered hosted generation/repair.
- Ship an evaluation dataset and reference harness so model teams can compare
  their own systems.

### Phase 3 — focused marketing

Lead with evidence, not “AI magic”:

- an interactive benchmark report;
- short before/after videos showing prompt, source, validation, and play;
- a technical Show HN launch;
- posts and demos for AI engineering, program synthesis, edtech, and
  fantasy-console communities;
- direct outreach to AI education/tool teams with a working embed tailored to one
  of their lessons or workflows;
- talks or write-ups on constrained generation plus execution feedback.

The open-source runtime is the trust and adoption layer. Potential revenue is in
hosted generation/repair/rendering, higher limits, private deployments, commercial
embedding support, and education/institutional products—not in hiding the language.

## Risks and guardrails

- **Training-data disadvantage:** models know JS/Python better. Counter with a
  compact context pack, canonical examples, retrieval, and a measured repair loop.
- **English ambiguity:** readable syntax is still syntax. Preserve visible diffs,
  undo, clarification, and semantic evaluation.
- **Valid but wrong programs:** never equate gate-pass with intent satisfaction.
- **Prompt injection/content risk:** treat prompts and community programs as
  untrusted; expose only bounded fc capabilities to the runtime.
- **Market compression:** large platforms can generate richer games. Win on
  inspectability, determinism, embedding cost, safety, and human handoff.
- **Split focus:** do not starve the learner pilot. The benchmark should reuse the
  existing language/runtime work and establish a go/no-go result quickly.

## Research and market references

- [Flexible and Efficient Grammar-Constrained Decoding (ICML 2025)](https://proceedings.mlr.press/v267/park25l.html)
- [Type-Constrained Code Generation with Language Models (PACMPL 2025)](https://doi.org/10.1145/3729274)
- [Grammar-Aligned Decoding (NeurIPS 2024)](https://papers.neurips.cc/paper_files/paper/2024/file/2bdc2267c3d7d01523e2e17ac0a754f3-Paper-Conference.pdf)
- [ChopChop: Semantically Constraining LM Output (PACMPL 2026)](https://doi.org/10.1145/3776708)
- [Rosebud prompt-to-game workflow](https://www.play.rosebud.ai/tutorial)
- [Roblox Build documentation](https://create.roblox.com/docs/ai/build)
- [Roblox Cube direction](https://about.roblox.com/newsroom/2026/02/accelerating-creation-powered-roblox-cube-foundation-model)
