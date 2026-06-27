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

### A1. Gallery as the social heart  ·  ✅ (surfaced) / 🔜 (flywheel needs seed content)
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

### A2. Win the first 10 seconds  ·  🔜
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

### A4. Lead with "multiplayer you wrote"  ·  🔜
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
