# Fantasy Computer

A self-contained fantasy console + beginner-friendly programming language, in a single HTML file.

> **Live demo:** https://kevinelong.github.io/fc/
> **Repo:** https://github.com/kevinelong/fc

```
trees are solid
coins are pickups
enemies are hostile

player is centered sprite {hp: 3, image: "hero"}
trees is list of 12 sprites {image: "tree"}
coins is list of 8 sprites {image: "coin"}

when player picks up any coin
  add 1 to score
  if no coins go to win

when player hits any enemy
  damage player 1
  knock player away from enemy distance 16
```

That's a real, runnable program. No imports. No boilerplate. Reads like a design doc.

---

## What this is

A single `index.html` you open in a browser. On the left (or top) is a **128×128 pixel canvas with CRT effects**. On the right (or bottom) is a **textarea where you type code**. Whenever you stop typing, the code re-runs.

The language inside is intentionally readable to someone who has never programmed. The grammar borrows the best ideas from COBOL, BASIC, Python, SQL, Scratch, Smalltalk, HyperTalk, Logo, Inform 7, and AppleScript — and pushes that trajectory one step further toward "describe what you want in plain English."

## Why this exists

We wanted to design a language that **supersedes COBOL/BASIC/Python from a novice's perspective** — keeping their accessibility goals while removing the pain points each one carried. The thesis: if you can describe a program to a friend, you should be able to type that description and have it run. The fantasy computer (PICO‑8 style 128×128 + 16 colors) is the substrate that makes the language feel like a real product, not a toy.

A secondary goal: this language should also work as **structured pseudocode that an LLM can compile to any target** — JS, Python, Godot, Unity, etc. The verbs are platform-agnostic; the runtime adapter is what changes.

## Quick start

1. Open `https://kevinelong.github.io/fc/` (or open `index.html` locally)
2. Click the canvas to give it keyboard focus
3. Use arrow keys, click buttons, edit the code in the editor

Try editing the program. Changes apply automatically after ~500ms idle.

## Where to read next

- **[PHILOSOPHY.md](PHILOSOPHY.md)** — design principles, what languages we drew from, why we chose what we chose. Read this first if you're picking up the project mid-stream.
- **[LANGUAGE.md](LANGUAGE.md)** — full language reference. Every verb, every pattern, with examples.
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — how the implementation is organized: lexer → parser → runtime, sprite encoding, CRT layering.
- **[ROADMAP.md](ROADMAP.md)** — what's done, what's next, open design questions.

## Status

The MVP is working: a real interpreter, ~50 built-in sprites, scrolling worlds, menus with back-stack navigation, collision detection via declarative tags, CRT scanlines + RGB subpixel + phosphor bleed.

What's not there yet: animation, sound, real RGB subpixel rendering (currently a CSS overlay), saved games, more enemy AI verbs. See ROADMAP.md.

## Files

- `index.html` — the entire fantasy computer (UI, lexer, parser, runtime, sprites, font)
- `README.md` — this file
- `PHILOSOPHY.md` — language design principles
- `LANGUAGE.md` — language reference
- `ARCHITECTURE.md` — implementation details
- `ROADMAP.md` — what's planned
