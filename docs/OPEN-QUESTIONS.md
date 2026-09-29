# Open questions — decisions & inputs this repo is waiting on

Any process (human or agent) may **answer inline** by replacing the `**Answer:**`
line under a question. Answers are the trigger to unblock the dependent work; the
owner of each item is named so an answer has an obvious consumer.

Status legend: 🔴 blocked · 🟡 answer helps · 🟢 answered (work proceeding).

---

## 🔴 Q1 — Classroom mode sign-off (blocks PLAN-classroom.md)
Owner: kevin. Four product/privacy decisions must be approved before any backend
is written (apid is live; the shape depends on these):

1. Student display names — free text, or generated adjective+animal list (+ optional
   filtered edit)? *Recommend: generated + optional edit, profanity-filtered.*
2. Do student-submitted games get stored server-side per class? *Recommend: yes,
   teacher-deletable, auto-purge.*
3. Retention — auto-delete a class + its data after 90 days idle? *Recommend: yes.*
4. Caps — students per class (e.g. 60) and classes per teacher (e.g. 20)? *Recommend: yes.*

**Answer:**

---

## 🟡 Q2 — Community gallery moderation stance
Owner: kevin. Currently **post-moderation** (sign-in required, delete-your-own,
caps, name filter) and live. The alternative is **curated/pre-moderation**
(`status:'pending'` + admin approve + admin identity in `.env`) for a kids-facing
audience. This is a trust/UX change, not a code gap.

**Answer:**

---

## 🟡 Q3 — Safety net Phase 2 go-live (LLM tier)
Owner: kevin. `POST /api/generate` is built and ships **dark**. To light it up:

1. Rotate the Anthropic key and place it in `apid/.env`.
2. Set `ENABLE_GENERATE=true` and restart apid.
3. Client "Describe" box that POSTs `{prompt}` and drops the returned code into
   the editor (Phase 1 banner/diff style) — I can build this without the key
   (it stays dark until the flag flips), say the word.

**Answer:** Keep the endpoint dark. The Describe client is already built, so there
is no remaining client task. Do not add or rotate secrets, enable the flag, or
change deployment configuration until kevin explicitly performs the go-live.

---

## 🟡 Q4 — Manual device pass (docs/TEST-MATRIX.md)
Owner: kevin. Touch, mobile audio-autoplay, Safari, PWA-install and the APK can
only be verified on real hardware. Nothing in the headless suite can substitute.

**Answer:**

---

## 🟡 Q5 — Feedback launch (docs/FEEDBACK-PLAN.md)
Owner: kevin. Copy is written; posting must come from your own accounts (karma /
captcha / anti-spam gating). Nothing to build until posts land — the recurring
feedback list feeds docs/GROWTH-PLAN.md.

**Answer:**

---

## 🟡 Q9 — Two bigger directions that need your call
Owner: kevin. Both are drafted in the repo but I have not started them, because
each changes how the project is built rather than what it does:

1. **spec/MODULARIZATION.md** ("plan (not yet executed)") — split the 660 KB
   single-file `index.html` into source modules with a lang↔platform seam, while
   the shipped artifact stays one self-contained file (that file is what the PWA
   caches and the APK bundles). It now needs a build/bundle step and a rewritten
   inventory (the doc still cites a 4972-line file; the corpus/oracle extraction it
   assumed is already done via `spec/lang/fc-core.mjs`). Recommend: only worth it
   if you expect more contributors or plan to ship native targets; otherwise the
   single file plus its harness suite is doing its job.
2. **docs/PLAN-classroom.md** — still blocked on the four privacy decisions (Q1).

The ROADMAP's own "Open design questions" (Q1–Q7 there: multi-word function names,
`draw <noun>` vs a function call, implicit sprite images, built-in sounds per
sprite, per-mode update functions, `go to` with no screen, implicit `clear screen`)
stay in ROADMAP.md as the record of those tensions — not duplicated here.

**Answer:** Defer modularization; the harnessed single-file architecture is
acceptable for the current product. Do not begin the classroom implementation
until Q1 is answered.

---

## 🟡 Q8 — Safety-net telemetry: keep it local, or aggregate it?
Owner: kevin. Phase 3 logs what the net keeps fixing (offered heal reasons,
accepted fixes, chosen starters) so the common cases can become natively-accepted
syntax — but **only on each device** (`localStorage`, `window.FC_NET_STATS()`,
copy button in Settings). Aggregating it server-side would need an endpoint + a
privacy stance (the audience is kids; `/privacy/` exists). Recommend: stay local
until the log proves useful, then add an opt-in "send my log" action that posts
the JSON the copy button already produces.

**Answer:** Keep telemetry local. Do not add a collection endpoint. A later opt-in
send action must preview the exact data and receive a separate privacy decision.

---

## 🟢 Q7 — Dynamic colors (RESOLVED 2026-09-29 — implemented)
`draw … in <var>` resolved only literal color names, so starfield's parallax
brightness, matrix's fading tail and sand's three grain tones painted flat white.
Implemented across all four cores (`Runtime.colorOf` in index.html + both
`spec/*.mjs` copies, `color_of` in the rust core) at every color choke-point; a
variable wins over a palette name, a non-color value falls back to white.

Verified in the app: starfield now paints black + dark gray + light gray + white,
matrix black + dark green + green + white, sand black + yellow + orange + gold —
identically on the wasm and JS engines. Guards: `draw-tests/d_dyncolor.fc` (draw-op
parity), `draw-tests/d_meter.fc`, `meter_forms.fc`.

*While implementing this I also fixed the `show meter` parse in the wasm (it
ignored a size-less `at x, y … in color` form the JS parser accepts).*

---
## 🟢 Q6 — `write <bare tokens>` semantics (RESOLVED by audit, no answer needed)
`write random 10 at x, y in shade` (examples/matrix.fc) parses in the JS/browser
core as the **literal text** `"random 10"` — `LANGUAGE.md` only ever documents
quoted text with `{var}` interpolation, and `parseWrite` joins raw token values.
The wasm core evaluated the same tokens as an expression instead, which also
shifted the seeded RNG stream (draw consumed `random`). Resolution: wasm aligned
to the JS reference, matrix.fc rewritten to a documented form
(`digit is random 10` + `write "{digit}"`). See docs/STATUS.md.
