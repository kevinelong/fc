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

**Answer:**

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

## 🟡 Q8 — Safety-net telemetry: keep it local, or aggregate it?
Owner: kevin. Phase 3 logs what the net keeps fixing (offered heal reasons,
accepted fixes, chosen starters) so the common cases can become natively-accepted
syntax — but **only on each device** (`localStorage`, `window.FC_NET_STATS()`,
copy button in Settings). Aggregating it server-side would need an endpoint + a
privacy stance (the audience is kids; `/privacy/` exists). Recommend: stay local
until the log proves useful, then add an opt-in "send my log" action that posts
the JSON the copy button already produces.

**Answer:**

---

## 🟡 Q7 — Dynamic colors (`draw … in shade`) don't resolve — demos render flat
Owner: kevin. `resolveColor()` maps *literal* names only; a color **variable** is
never looked up, in either engine. So every demo whose effect depends on it paints
one flat color:

- `starfield.fc` — "faster stars are brighter (parallax)": all 70 stars are the
  same white (see `examples/thumbs/starfield.png`).
- `matrix.fc` — "bright head with a fading tail": the whole trail is one shade.
- `sand.fc` — 3-tone grains (`yellow` / `orange` / `gold`) all render white.

Evidence: two-engine probe (`shade is green` + `draw … in shade` → `#fff1e8` white
in JS **and** wasm), and the pinned launcher thumbnails.

Options: (a) implement color-variable resolution at the paint choke-points
(index.html + `fc-core.mjs` + `fc-core-record.mjs` + wasm `paint()`/`resolve_color`,
plus goldens) — a real language change; (b) reword the three demos + taglines to
what they actually do. My recommendation: (a) — the demos were written expecting
it, and it is a small, presentation-only lookup.

**Answer:**

---

## 🟢 Q6 — `write <bare tokens>` semantics (RESOLVED by audit, no answer needed)
`write random 10 at x, y in shade` (examples/matrix.fc) parses in the JS/browser
core as the **literal text** `"random 10"` — `LANGUAGE.md` only ever documents
quoted text with `{var}` interpolation, and `parseWrite` joins raw token values.
The wasm core evaluated the same tokens as an expression instead, which also
shifted the seeded RNG stream (draw consumed `random`). Resolution: wasm aligned
to the JS reference, matrix.fc rewritten to a documented form
(`digit is random 10` + `write "{digit}"`). See docs/STATUS.md.
