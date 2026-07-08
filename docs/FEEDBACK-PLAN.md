# codeonline.io — feedback / launch plan

Goal: get honest feedback on codeonline.io (the plain-English fantasy console)
from developers, beginners/teachers, and fantasy-console enthusiasts.

**Who does what:** Claude prepares the copy below (done). *You* post it from your
own accounts — these sites gate automation (karma/age minimums, captchas,
shadowbans) and reward a human who replies to comments. Truly anonymous posting
is rare; a **pseudonymous** handle (throwaway account) is fine everywhere here.

---

## Rules of engagement (make or break it)

1. **Post in the right place.** Most subreddits ban standalone self-promo but run
   a weekly *"Share your project" / "Feedback Friday"* thread — use that, or read
   the sidebar rules first. Standalone posts are OK on r/SideProject, r/playmygame,
   r/InternetIsBeautiful (rules permitting), and Show HN.
2. **Never just drop a link.** One line of what/why + **one specific question** +
   the link. Then reply to *every* comment for the first few hours.
3. **One shot per venue.** Especially Show HN — you get one good attempt, so pick
   a day/time you can sit with it (weekday morning US-Eastern is typical for HN).
4. **Space them out.** Don't blast all venues the same hour; 1–2 per day. If one
   post gets traction, focus your replies there before opening the next.

---

## Recommended order

1. **r/SideProject** — low stakes warmup, expects a link, friendly. Gauge the pitch.
2. **Show HN** (Hacker News) — densest technical/educator feedback. Post the refined
   pitch once you've seen what lands in step 1.
3. **A player-side sub** — r/playmygame or r/WebGames or r/InternetIsBeautiful.
4. **Niche enthusiasts** — Lexaloffle BBS (PICO-8), r/fantasyconsoles, itch.io.
5. **(Optional) educational** — r/gamedev Feedback Friday, Indie Hackers, r/EdTech.

---

## Copy to paste

### Show HN
- **Title:** `Show HN: Codeonline.io – a plain-English fantasy console for learning to code`
- **Body / first comment:**
  > I built a tiny fantasy console where the language reads like a design doc —
  > `ball is {x: 20, y: 70}`, `if ball.x > 120 ball.speed is 0 - 1.5`. It's a
  > 128×128, 16-color, 8×8-sprite console that runs in the browser (Rust→WASM core,
  > JS fallback), no install, works offline as a PWA. There are ~20 example games
  > incl. Pong/Snake/Frogger and some generative toys (Conway's Life, Matrix rain,
  > Langton's ant, a falling-sand sim). Every game is one readable file you can
  > edit live and share as a link.
  >
  > I'm trying to keep it genuinely beginner/teacher-friendly. **What I'd love
  > feedback on: is the first 60 seconds clear to someone who's never coded?**
  > Direct link, nothing to install: https://codeonline.io

### r/SideProject
- **Title:** `A plain-English fantasy console for learning to code (no install, runs in the browser)`
- **Body:** same 2-paragraph blurb as above, same ask.

### r/playmygame / r/WebGames
- **Title:** `Tiny browser games you can open, read, and remix — made in a plain-English console`
- **Ask:** "Which example hooks you fastest, and where do you get stuck?" Link to a
  strong demo's share page, e.g. https://codeonline.io/g/snake/ or /g/sand/.

### r/InternetIsBeautiful
- **Title:** `codeonline.io – write a game in plain English, no signup, runs instantly`
- Note: strict rules — emphasize *no login / no install*, link the homepage.

### Lexaloffle BBS (PICO-8) / r/fantasyconsoles
- Frame for the audience: "A constraint-console experiment — 128×128, 16 colors,
  but the language is plain English instead of Lua. Curious what this crowd thinks
  of the tradeoff." Link homepage + one generative demo.

### itch.io (optional, higher effort)
- Publish the console (or a bundle of the demos) as a browser game/tool with the
  same blurb; itch's audience is exactly this niche and comments are built in.

---

## Specific-ask menu (rotate per venue so each post asks one thing)
- Is the first 60 seconds clear to a non-coder?
- Which example hooks you fastest — and where do you get stuck?
- Does "reads like a design doc" hold up, or where does the language surprise you?
- Would you (or a teacher you know) actually use this in a classroom? Why/why not?
- What's the one thing that would make you share it with someone?

## After posting — capture what you learn
Keep a short list here of recurring feedback (confusion points, requested
features, "I wish it did X"). That list should feed docs/GROWTH-PLAN.md.
