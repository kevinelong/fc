# Philosophy

This document captures **how we think about language design here**. If you're another Claude session picking up this project, read this before suggesting any language additions or changes.

---

## The core thesis

> If you can describe a program to a friend, you should be able to type that description and have it run.

Every design choice is judged against that line. When two options conflict, pick the one closer to how a non-programmer would naturally describe the behavior aloud.

## The trajectory we're extending

We trace a line through these languages and extend it:

| Language | What it contributed | What it left painful |
|---|---|---|
| **COBOL** (1959) | Code should read like English so anyone can understand it | Verbose, ceremonial, division/section bureaucracy |
| **BASIC** (1964) | Code should be simple enough that a kid can type it and see something happen immediately | GOTO spaghetti, line numbers, no structure |
| **Python** (1991) | Code should look clean, do what you mean, and get out of your way | Still requires `def`, `:`, `__init__`, imports, type errors |

The next step on that line, our thesis: **code should read like you're explaining what you want to a friend** — and crash gracefully with English error messages when it can't.

## Other languages we mined and what we took

We did real research (web searches, language docs) on these. Each gave us something specific:

### SQL
- **`is`/`is not`** — natural comparison without `==`
- **`between A and B`** — range without two `>=`/`<=` conditions
- **`in [list]`** — membership without chained ORs
- **`where`** — filter inside a loop or query
- **`any`/`all`/`no`** — collection-as-quantifier (`if any enemy is alive`, `if no coins`)
- **`as`** — naming/aliasing reads naturally
- **Declarative pattern**: describe *what*, let the engine figure out *how*

### Scratch
- **`when`** as universal event prefix (`when "space" is pressed`, `when player hits any coin`)
- **`repeat N times`** — counted loop without an index variable
- **`forever`** — zero-argument infinite loop
- **`add X to list`**, **`item N of list`** — 1-based, English possessive form
- **"and wait" suffix** turning sync/async via natural-language modifier
- **Block-level grammar**: scripts always begin with a hat-style `when`

### Smalltalk
- **Collection messages**: `select:`, `collect:`, `do:`, `inject:into:`, `detect:` — these are verb-based collection operations, not magic syntax
- **Keyword arguments woven into method names**: `between: 3 and: 12` reads as a sentence
- **Everything is an expression**: even `if` is a message; this informed our "expressions can be conditions" decision

### HyperTalk
- **`put X into Y`** as alternative assignment (we ultimately chose `is` for shortness, but `put` remains an option)
- **Chunk expressions**: `the first word of the third line of field "X"` — accessing data by linguistic unit, not index math
- **`repeat for each word in X`** — name the linguistic unit, not just "element"
- **Properties via `set the visible of card button "Submit" to false`** — English prepositions for property access
- **Message handlers** as a structuring concept (`on mouseUp` ... `end mouseUp`)

### Logo
- **Direct command verbs to an agent**: `forward 100`, `right 90` — second-person imperative
- **Anonymous `?` slots**: `map [? * ?] over scores` — short forms when you don't need to name the binding
- **Body-syntonic reasoning** — the user imagines being the actor

### Inform 7
- **Description-as-filter**: `repeat with X running through the alive enemies in the kitchen` — the description IS both the loop AND the condition
- **Multi-word variable names**: `the dinner guest` is one variable, not a method call
- **Reads as prose**, not code

### AppleScript
- **`every X whose Y`** — collection + filter inline
- **`every file of the desktop`** — possessive chain, not dot access

## Design rules we follow

### 1. Use the shortest real English word a 6th grader knows

We compared `else` vs `otherwise` and chose `else` because it's both shorter AND more familiar. Conversely, we chose `is` over `=` because `is` is short *and* readable.

The principle isn't "avoid programming words." Every word we use is one a 6th grader would say. Programming-only words (`bool`, `init`, `var`) are out. Real words that happen to be common in code (`if`, `else`, `is`) are in.

### 2. Verbs over expressions when a common verb exists

```
add 10 to score        -- yes
score is score + 10    -- only when no verb fits
```

| Operation | Mechanical | Verb (preferred) |
|---|---|---|
| increment | `x is x + n` | `add n to x` |
| decrement | `x is x - n` | `remove n from x` |
| reset | `x is 0` / `""` / `[]` | `clear x` |
| negate boolean | `x is not x` | `toggle x` |
| double | `x is x * 2` | `double x` |
| halve | `x is x / 2` | `halve x` |

The escape hatch: `score is lives * 100 + bonus` for arbitrary expressions. But default to verbs when one fits.

### 3. No ceremony

- No imports
- No `main()` / entry point
- No type declarations
- No semicolons
- No required parens around conditions
- No `def`, `function`, `class` keywords (just `to NAME`)
- No `;` to end statements

The first line of a program does something visible.

### 4. Forgiveness

- Trailing commas OK
- Type coercion (numbers ↔ strings) where the meaning is unambiguous
- One line is the default; indent only when complex
- `and` chains commands on one line: `damage player and flash screen red`
- Errors are friendly English, not stack traces ("I don't know how to add text to a number. Did you mean…")

### 5. Truthiness for everything

```
if score        -- true if score is nonzero
if name         -- true if string is non-empty
if enemies      -- true if list has items
if alive        -- "yes"/"no" or true/false both work
```

The user thinks "is there any?" or "does this exist?" not "is this exactly equal to true?". The runtime maps this intuition automatically.

| Type | Falsy | Truthy |
|---|---|---|
| number | 0 | anything else |
| text | "" | anything else |
| state | `no`, `false` | `yes`, `true` |
| list | `[]` (empty) | has items |
| object | `{}` (empty) | has properties |
| nothing | always falsy | — |

### 6. Words over symbols, but not at the cost of length

- `and` not `&&`
- `or` not `||`
- `not` not `!`
- `is` not `==`
- `mod` not `%`
- `+`, `-`, `*`, `/` keep their symbols (no shorter English exists)
- `>`, `<`, `>=`, `<=` keep their symbols (saying "greater than" is verbose)

### 7. Progressive complexity

A beginner's first program is one line: `clear screen to dark blue`. Their tenth is a working game. They never have to learn parsers, classes, generics, or memory management.

We hide complexity, not features. The runtime can be sophisticated; the language stays simple.

### 8. Probability words for randomness

Don't make beginners write `if random 100 < 30`. Map natural-language probability words to percentages (sourced from a UIUC perception-of-probability-words study):

```
likely drop heart from enemy           -- 70%
unlikely drop key from enemy           -- 20%
rarely drop fairy from enemy           -- 5%
almost certainly emit smoke            -- 95%
maybe show "dialog"                    -- 50%
```

This converts a math operation into a design decision. Designers think in these words anyway.

### 9. Tags declare behavior, handlers add reactions

For collisions and similar:

```
trees are solid       -- declarative: describes what they are
coins are pickups
enemies are hostile

when player picks up any coin
  add 1 to score      -- imperative: describes what to do as a result
```

Tag = property of the thing. Handler = consequence. They compose: a `solid` thing auto-blocks AND can fire a hit handler if defined.

### 10. Conventions to remember intent levels

Three levels of "do something to many":

| Form | Use |
|---|---|
| `all enemies` | one-liner action on the group: `damage all enemies where hp > 0` |
| `each enemy in enemies` | block form when you need to act per-item |
| `any enemy is alive` | quantifier: yes/no question about the group |

`no enemies` = none exist (a stronger negation than "not any").

## Decision precedents

When you're stuck on a design choice, here's how we've broken ties before:

| Tension | What we chose | Why |
|---|---|---|
| `is` vs `=` for assignment | `is` | Reads as English; context disambiguates from comparison |
| `=` vs `==` for comparison | `is` | Same reason; one form for both |
| `yes`/`no` vs `true`/`false` | Both work | Yes/no reads more naturally; true/false is familiar enough |
| `else` vs `otherwise` | `else` | Shorter AND familiar |
| `for each` vs `each` | `each` | "for" adds nothing |
| `each` vs `every` vs `all` | All three (different intents) | `all` for one-liner; `each` for block; `every` is sugar |
| `to NAME` vs `def NAME` | `to NAME` | Reads as instruction: "to win, do this" |
| Single-line vs always-block | Single-line preferred | Indent only when complex; chain with `and` |
| `put X into Y` vs `Y is X` | `Y is X` | Shorter; we kept `put` available as a future option |
| Function name conflicts with verbs | Avoid (e.g., `to draw title` collides with `draw`) | Use unique names; or screen abstraction handles it |

## What "good" feels like

A line of well-written program in this language:
- Reads aloud as English without inflection contortion
- Has zero punctuation that doesn't carry meaning
- Has zero words that aren't doing semantic work
- Is shorter than the equivalent in Python, but easier to read

Counter-examples (things we'd reject):

- ❌ `if (score == 0) { mode = "title" }` — too symbolic
- ❌ `score := score + 1` — assignment-only, no verb
- ❌ `def restart_game(self):` — type/scope ceremony
- ❌ `lives -= 1; if lives < 1: state = "dead"` — chained punctuation
- ✅ `if score is 0 mode is "title"` — reads as a sentence
- ✅ `add 1 to score` — verb intent
- ✅ `to restart game` — direct
- ✅ `remove 1 from lives and if lives is 0 mode is "lose"` — natural chaining

## How to evaluate new feature proposals

When the user (or you) propose a new construct, run it through:

1. **Would a 6th grader read it correctly without explanation?**
2. **Is there a shorter common English word for the same concept?**
3. **Does it conflict with any existing verb?** (Especially `draw`, `show`, `add`, `remove`, `clear`.)
4. **Can it be written as a one-liner for the simple case, with indented block for the complex case?**
5. **Does the parser need a new keyword, or can it ride on existing ones?**
6. **Will it crash readably when misused?**

If the proposal feels English-natural but breaks a existing parser pattern, the parser is wrong, not the proposal. We've changed the parser more than once to accommodate readability (e.g., the second-`is` heuristic for `if X is Y foo is bar`).

## What we won't do

- Strict type system
- Required type annotations
- Mandatory parens around `if` conditions
- Curly braces for blocks
- `;` to end statements
- Lambda / arrow function syntax
- Generics
- Modules / imports
- Operator overloading
- Unicode-only operators
- Anything that requires a manual to use safely

If a feature can't fit the philosophy, it doesn't go in the language — even if it's "more powerful."
