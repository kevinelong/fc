# codeonline.io — growth & sustainability plan

The thesis that ties "make it more appealing" and "make it self-supporting"
together: **they are the same funnel.** Grow free *learners* (appeal), then earn
from the *edges* (individual pros) and *institutions* (schools) — and never charge
the kid. The appeal work below is literally the top of the only revenue funnel
that is both ethical and real for a learn-to-code tool: education.

fc's three non-copyable edges, which decide audience and channel:
1. **Plain-English** — the lowest syntax/reading barrier of any code tool (youngest
   learners, ESL, non-coders).
2. **Zero-install** — browser + offline PWA + APK; runs on a locked-down school
   Chromebook or a phone.
3. **Multiplayer built in** — "two kids, two phones, same room," which nobody else
   in this lane offers cheaply, and which is a classroom/club dream.

Status legend: ✅ shipped this pass · 🔜 buildable next · 🔒 gated on a decision or
an external account (Stripe / Apple / legal).

---

## Part A — Appeal (grow the free base)

### A1. Gallery as the social heart  ·  ✅ (surfaced + "Remix these" shelf shipped)
**Why.** Scratch's entire engine is *play what others made → remix → publish*. fc
already has the gallery (`/api/games/community` + the `#lr-community` shelf +
one-tap remix), but it sits empty and unlabeled, so the loop is invisible.
**What to build.** (a) A clear "Community games" label + an inviting empty-state
("Be the first — publish yours") so the mechanic reads even at zero content.
(b) Once there's traffic: play counts, "remix" wording on every tile, a "newest /
most-played" sort. (c) Seed it: publish 3–5 *remixable* starter games so a new
visitor always sees something to open and tweak.
**Effort.** (a) tiny; (b)/(c) small. **Metric.** publishes/week, remix clicks,
gallery → editor conversion.

### A2. Win the first 10 seconds  ·  ✅ (hero line + autoplaying muted clip + starter games)
**Why.** Time-to-first-win is the #1 thing that decides whether a beginner stays.
Today the home is a grid of demos; the "type English → it moves" magic is one
click in.
**What to build.** A tiny **live, editable** mini-program on the landing — three
lines, already running, with a one-word change invited ("change `red`, watch it
change"). Keep it lightweight so it can't break the launcher layout. Lower-risk
interim: a single prominent **"✏️ Start coding"** primary CTA that loads the
3-line starter into a running stage.
**Effort.** small–medium (layout care on a live page). **Metric.** bounce rate,
% who edit-and-run within the first session.

### A3. Teacher on-ramp  ·  ✅ (page+lesson) / 🔒 (classroom mode)
**Why.** Teachers are the **audience multiplier** (1 teacher = 30 kids, every
term) *and* the bridge to the only durable revenue (schools). They adopt only what
is turnkey and privacy-safe. fc has none of this yet (no teacher page, no lessons,
no classroom mode, no privacy page).
**What to build.** (✅) A `/teachers/` page: why fc fits a classroom (no install,
offline, multiplayer, plain English), one ready 45-minute lesson plan, and a clear
privacy stance. This doubles as the school-sales asset. (🔒) **Classroom mode:** a
teacher creates a class **code**; students join with the code and a display name —
**no accounts, no PII** — which sidesteps COPPA/FERPA *and* removes the biggest
adoption blocker. Needs apid work + a privacy review.
**Effort.** page = small; classroom mode = medium + a privacy decision.
**Metric.** teacher-page visits, lesson downloads, class codes created.

### A4. Lead with "multiplayer you wrote"  ·  ✅ (launcher subtitle + 5 multiplayer demos)
**Why.** It's the sharpest, least-copyable hook, and we just shipped five
multiplayer demos (Tag, Hunt, Light Cycles, Online Pong, Joust).
**What to build.** Feature a multiplayer demo first on the home; a "grab a friend,
two phones" line; a 30s clip for short-form video.
**Effort.** tiny (copy/ordering) + one video. **Metric.** multiplayer-demo opens,
share clicks.

### Foundational caveat — privacy/COPPA
Kids < 13 + email auth + a public-ish gallery is both a teacher blocker and a legal
issue. The **no-account "classroom code"** path (A3) fixes the appeal *and* legally
unlocks the school revenue (B3). Do it before chasing education money.

---

## Part B — Self-supporting (earn from edges + institutions, never the kid)

### B1. Support / Sponsor link  ·  ✅
**Why.** Hosting is cheap (a shared VPS); a loved free tool's costs are often
covered by a handful of fans. Zero downside, 10-minute add.
**What to build.** A "♥ Support" link in the footer → GitHub Sponsors (and/or
Ko-fi). **Effort.** trivial. **Dependency.** enable GitHub Sponsors / create Ko-fi.
**Metric.** monthly recurring from sponsors vs hosting cost (break-even = "self-
supporting" in the literal sense).

**Status (2026-06-27):** the footer ♥ support link is live (→ GitHub Sponsors)
and `.github/FUNDING.yml` is wired, BUT nothing can accept money yet — that step
is **owner-only and not automatable**. Enabling GitHub Sponsors has **no API/CLI**;
it is a manual web onboarding tied to your identity + bank:
1. Go to github.com/sponsors → join the program, accept the terms.
2. Set up the payout (Stripe Connect) — bank details.
3. Complete tax + identity verification (W-9 / W-8).
4. Add tiers. The repo Sponsor button + the site link then go live automatically.

Faster alternative (recommended if you want donations this week): **Ko-fi / Buy
Me a Coffee** — ~5 min, payout via PayPal/Stripe, no waitlist. To use it: create
the account, then edit `.github/FUNDING.yml` (`ko_fi:`/`custom:`) and repoint the
footer link in `index.html` (the ♥ support anchor in `#lr-foot`). I can do the
file wiring in seconds once you pick a platform/handle; only the account creation
is yours.

### B2. Self-serve Pro (~$3–5/mo or one-time)  ·  🔒 (Stripe account)
**Why.** Keep the core free forever (ethic + growth); charge individuals who want
power features. Passive, self-serve, mission-safe.
**What to build.** Gate behind a `pro` flag on the existing user record (apid
already has auth + a user store): **private (unlisted) games, more cloud-save
space, "export your game as a standalone HTML/APK," premium asset packs** (you
already have sprite/sound/map studios). Add Stripe Checkout + a webhook that flips
`pro`. **Effort.** medium. **Dependency.** 🔒 your Stripe account + keys (in
`apid/.env`); pricing decision. **Metric.** free→Pro conversion, MRR.

### B3. Education licensing (the real business, if you want one)  ·  🔒
**Why.** This is how every tool in the lane sustains (Tynker, CodeMonkey,
code.org-for-orgs): **B2B2C — the school pays, the child never does.** Higher
revenue per sale, slower relationship-driven motion.
**What to build.** On top of classroom mode (A3): a teacher dashboard (rosters,
progress, private class gallery), a curriculum (scope & sequence), and site-license
billing. **Effort.** large + a sales motion. **Dependency.** 🔒 teacher traction
first; a real curriculum; possibly grants/CSR. **Metric.** schools licensed, seats.

### Not recommended
- **Ads** — never on a kids' product (COPPA + ethics + UX). 
- **Charging learners for the core** — kills the growth engine and the mission.

---

## Sequence (and why this order)
1. **B1 Support link** + **A1 gallery label/seed** + **A4 lead-with-multiplayer** —
   today, free, compounding.
2. **A3 teacher page + first lesson** — unlock the multiplier; it's also the B3
   sales asset.
3. **A2 landing hook** — lift activation once traffic arrives.
4. **A3 classroom mode** (privacy unlock) → **B2 Pro** (passive revenue) → **B3
   school licensing** (the business) — each gated on a decision/account.

You can't monetize an audience you don't have, so appeal (A) precedes revenue (B);
and the same teacher investment (A3) is the on-ramp to the only durable revenue
(B3). Free-for-learners is both the ethic and the flywheel.

---

> **Audit 2026-09-29.** The whole "buildable-now" queue is shipped: **A** the Remix
> shelf lives on the home (`#lr-remix`, tiles opening straight into the editor),
> **B** the demo wall grew with the generative toys (life, matrix, langton, chaos,
> sand, starfield) plus particle bursts in maze/coin-quest, **C** the home leads
> with ⭐ Featured today, **D** teacher Lessons 1–3 are on /teachers/, **E** the
> printable cheat-sheet ships (teachers/cheatsheet.html), **F** /projects/ is live.
> In the polish queue: **#1** per-game share cards ship for built-in demos,
> **#2** the landing has an autoplaying muted clip, **#4** the once-per-session
> first-run blip shipped 2026-09-29 (`AUDIO.play('blip')` on the first game start,
> sessionStorage-gated; verified in the browser by tools/ui-check.mjs), **#5** the
> landing carries `canonical` + `author` and the teachers/projects pages carry OG
> tags, **#6** ⭐ Featured today rotates deterministically by date.
>
> Still open: **#1's next step** — dynamic OG cards for *user* `?code=`/gallery
> games (gated on the gallery moderation decision, OPEN-QUESTIONS Q2) — and Part B
> **B2/B3** (Stripe account / licensing: business decisions, not code).

## Appeal build queue — "meanwhile" (no accounts/gates needed)
Already shipped this arc: gallery empty-state, For Teachers page + Lesson 1, moving
starter, Support link. Already present (don't rebuild): recipes (learn/ HOW-TO),
share/embed (🔗 share), "Your Turn" challenges (learn/). The buildable-now queue:

- **A · "Remix these" shelf** (flywheel seed). 5–6 *tiny, tweak-friendly* games on
  the home, each with an explicit "your turn: change X" hint, that open straight
  into the editor (not just play). Inline in `index.html` (code as strings, like
  the New-Game starter) — no new files, no test-suite entanglement. Each verified
  to run clean through the engine. *Why:* the create-loop is empty; this gives a
  first-timer an obvious next move after the bouncing-ball starter and seeds the
  publish habit. *Metric:* remix-tile opens → edits.
- **B · Juicy demos** (broaden the "wow"). 1–2 flashy single-player examples
  (particle arcade shooter; simple gravity platformer). Full pipeline: `examples/`,
  launcher tile + icon, thumbnail, visual golden, smoke spec, idle parity 1:1.
  *Why:* only `maze` uses particles today; flashier demos showcase the engine and
  are short-form-video fodder. *Metric:* demo opens, share clicks.
- **C · Featured ordering.** Lead the grid with the strongest demos (multiplayer +
  juicy). Light frontend. *Why:* best-first lifts first-impression.
- **D · Teacher Lessons 2 & 3.** Build on the For Teachers page: enemies/avoidance,
  then title screens & menus (or a 2-player multiplayer lesson). Lesson code
  verified. *Why:* the multiplier audience; also the school-sales depth.
- **E · Printable cheat-sheet.** A one-page, print-friendly commands + game-loop
  skeleton for a classroom handout. *Why:* teachers want a paper artifact.
- **F · Projects page** (`/projects/`). Guided "build a Snake / shooter / platformer"
  mini-projects — a step up from one-off recipes. *Why:* depth for hobbyists +
  self-directed learners.

Build order: A + C (home flywheel) → B (wow) → D + E (teachers) → F (depth).

## Polish queue — share/activation/retention (2026-06-30)
Shipped: social OG card + meta (every shared link now previews). Already present
(don't rebuild): **PWA install nudge** (beforeinstallprompt + iOS Add-to-Home tip,
with dismissal). Buildable-now:

- **#2 Landing clarity + motion.** A crisp what-is-this line + a small autoplaying
  muted multiplayer/first-game clip on the home so the grid isn't all static — a
  visitor sees something *move* immediately. *Metric:* bounce, first-run rate.
- **#4 First-run delight.** A subtle one-per-session confirmation blip the first
  time a game runs (the first-win moment), respecting the audio-unlock gesture.
  *Risk:* annoyance — keep it quiet + once. *Metric:* qualitative.
- **#5 SEO/branding hygiene.** `canonical` + `author` meta on the landing; OG tags
  on the teachers/projects subpages so those links preview too. *Metric:* search
  + share quality.
- **#6 Daily featured game.** A "featured today" highlight that rotates
  deterministically by date, so returning visitors see something fresh. Frontend
  only. *Metric:* returning-visitor demo opens.
- **#1 Per-game share previews** — SHIPPED for built-in demos (2026-06-30).
  `tools/gen-share-pages.cjs` generates, per `examples/*.fc`: a 1200x630 OG card
  (`share/<name>.png`, the game's thumbnail + title/tagline parsed from the .fc's
  first comment line) and a scraper-friendly `g/<name>/index.html` with that game's
  OG/Twitter tags that JS-redirects a human into the playable game
  (`/?code=<url-encoded base64>` — note: base64 MUST be encodeURIComponent'd or the
  `+` becomes a space and the wrong game loads). The in-app 🔗 Share button emits
  the clean `/g/<name>/` link when the loaded code is an unmodified built-in demo,
  else the self-contained `?code=` link. Verified: scrapers see per-game OG tags
  (curl), humans land in the right game, share button switches correctly.
  **Next step (gated, not built):** dynamic cards for *user* `?code=`/gallery games
  needs a server render path (an apid-served `/s/<id>` that stores the game + serves
  HTML with OG tags), since client `?code=` can't carry meta for scrapers.
