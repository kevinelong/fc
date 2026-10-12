# Open questions — decisions & inputs this repo is waiting on

Any process (human or agent) may **answer inline** by replacing the `**Answer:**`
line under a question. Answers are the trigger to unblock the dependent work; the
owner of each item is named so an answer has an obvious consumer.

Status legend: 🔴 blocked · 🟡 answer helps · 🟢 answered (work proceeding).

Technical questions Q3 and Q6–Q11 have repository-grounded answers. Owner decisions
remain open for classroom launch/privacy (Q1), gallery moderation (Q2), real-device
results (Q4), and external feedback posting (Q5). Business/account gates are tracked
separately in GROWTH-PLAN.

---

## 🔴 Q1 — Classroom mode launch and privacy sign-off
Owner: kevin. The implementation exists in `apid/server.js` and the client behind
`ENABLE_CLASSROOM` (the endpoint group returns 404 until it is enabled). That work
does not record owner approval of the product/privacy choices:
1. Student display names — free text only when it matches `^[A-Za-z0-9 ]{2,20}$` and
   is not profane; otherwise a generated adjective+animal (`studentName()`).
2. Student submissions — allowed, stored per class, teacher-deletable, auto-purged.
3. Retention — a class idle for 90 days is deleted (`purgeIdleClasses()`).
4. Caps — 60 students/class, 20 classes/teacher, 40 assigned games, 200 submissions.
Done technically: the **frontend is built** and verified — `tools/class-e2e.mjs` runs the
real apid + a real browser through join → shelf → tap-to-play → hand-in → teacher
roster/assign/delete, and proves the feature stays invisible with the flag off;
`tools/ui-check.mjs` covers the page with the endpoints stubbed. Launch still requires
the choices below, qualified privacy/legal review, retention verification, the
real-device pass, and a controlled-pilot decision. Keep `ENABLE_CLASSROOM=false`.

1. Student display names — free text, or generated adjective+animal list (+ optional
   filtered edit)? *Recommend: generated + optional edit, profanity-filtered.*
2. Do student-submitted games get stored server-side per class? *Recommend: yes,
   teacher-deletable, auto-purge.*
3. Retention — auto-delete a class + its data after 90 days idle? *Recommend: yes.*
4. Caps — students per class (e.g. 60) and classes per teacher (e.g. 20)? *Recommend: yes.*

**Answer:** Pending explicit owner approval. The code reflects the recommendations,
but classroom mode must remain disabled until the launch checklist in
`PLAN-classroom.md` is complete. The review material is drafted and waiting:
`CLASSROOM-PILOT-PACK.md` states each of the four decisions against what the code does today,
drafts the privacy-policy and teacher copy, and lists the enable/rollback steps plus what a
pilot would measure.

---

## 🟡 Q2 — Community gallery moderation stance
Owner: kevin. Currently **post-moderation** (sign-in required, delete-your-own,
caps, name filter) and live. The alternative is **curated/pre-moderation**
(`status:'pending'` + admin approve + admin identity in `.env`) for a kids-facing
audience. This is a trust/UX change, not a code gap.

**Answer:** Pending owner decision. Keep the currently shipped post-moderation behavior
unchanged while this is open; do not treat that operational default as approval for a
kids-facing launch or as authorization to expand promotion.

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

## 🔴 Q4 — Manual device pass (scope agreed in the plan; results not recorded)
Owner: kevin. Touch, mobile audio-autoplay, Safari, PWA-install and the APK can only be
verified on real hardware; the full matrix stays in `docs/TEST-MATRIX.md`. The must-do
list for any release touching input, audio, the canvas or the service worker is these
four, in order:

1. **iOS Safari** — audio unlocks on the first tap (a built-in SFX, a `define sound`,
   and `play music`), and Add to Home Screen launches fullscreen and offline.
2. **Android Chrome** — the on-screen D-pad + A/B move and fire, multitouch works
   (move and fire together), no page scroll, no tap delay.
3. **Installed APK** — loads and runs an example from the launcher.
4. **Two-device multiplayer** — peers appear and the mechanic works in one game
   (tag or online pong), including after backgrounding.

Everything else — the desktop trio, iPad split-view, the sustained-60fps check — is
opportunistic. The automatable slice of the touch path is **done** (2026-09-29):
`tools/ui-check.mjs` emulates a touch device and asserts the pad appears, its buttons
reach the engine, multitouch (move + fire in one frame) works, and dragging on the pad
never scrolls. Audio unlock, PWA install, the APK and iPad still need real hardware.

**Answer:** Pending execution on real hardware. Automated touch coverage passed, but it
does not establish iOS audio/PWA behavior, APK loading, or two-device multiplayer.
Record dated device/OS/browser results in `TEST-MATRIX.md` before launch.

---

## 🟡 Q5 — Feedback launch
Owner: kevin. Copy is written; posting must come from your own accounts (karma /
captcha / anti-spam gating). Nothing to build until posts land — the recurring feedback
list feeds docs/GROWTH-PLAN.md.

**Answer:** Pending owner authorization. The copy and recommended venue order are ready,
but no post should be made from an external account. Classroom launch is not a valid
dependency until Q1 and Q4 are closed; feedback on the existing core product can be run
separately if the owner chooses.

---

## 🟢 Q11 — Dialogue pause semantics (RESOLVED 2026-09-29 — option 1 implemented)
Implemented **non-pausing**: `show dialog` / `show choice` are presentation + state
the engine draws every frame while `dialog` is set, and the game pauses itself with
`if dialog is not "" return`. Nothing in the loop becomes conditional, so the match
timer, behaviors and multiplayer sync keep their meaning; a game that wants a hard
stop writes it in one line.

If you prefer engine-paused dialogue later, the hook is small: the frame's update/
draw phase already checks a single "conversation active" flag — switch it to skip
update/behaviors/timer while that flag is set.

Guards: `spec/corpus/dialogue_forms.fc`, `frame-tests/f_talk.fc` (+ `.keys`/`.mouse`),
and a `tools/ui-check.mjs` case that presses the on-screen A button in the real app.

---

## 🟢 Q10 — `shoot at` projectile model (RESOLVED 2026-09-29 — option 1 implemented)
`shoots at TARGET [every N [seconds|frames]] [speed S]` now fills a
`SUBJECT.shots` list with plain `{x, y, dx, dy}` objects: the engine spawns them on
a frame cooldown, aims at the target's centre at spawn time, flies them each frame
and culls the ones that leave the world — and the game owns collisions (`each sh in
turret.shots`, its own overlap test). No RNG, so the stream is deterministic.

Option 2 (tagged sprites so `when X hits Y` applies) and option 3 (visual-only
particles) remain cheap to add on top if you want engine-owned collisions — the
`shots` list is the substrate either way.

Guards: `spec/corpus/shoot_forms.fc`, `frame-tests/f_shoot.fc`.

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
2. **docs/PLAN-classroom.md** — implementation is complete and dark; production launch
   remains blocked on the four privacy/product decisions and launch checklist (Q1).

The ROADMAP's own "Open design questions" (Q1–Q7 there: multi-word function names,
`draw <noun>` vs a function call, implicit sprite images, built-in sounds per
sprite, per-mode update functions, `go to` with no screen, implicit `clear screen`)
stay in ROADMAP.md as the record of those tensions — not duplicated here.

**Answer:** Defer modularization; the harnessed single-file architecture is
acceptable for the current product. Do not enable or promote the completed classroom
implementation until Q1 is answered.

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

## 🟢 Q7 — Dynamic colors (RESOLVED 2026-09-30 — parity edge case added)
`draw … in <var>` resolved only literal color names, so starfield's parallax
brightness, matrix's fading tail and sand's three grain tones painted flat white.
Implemented across all four cores (`Runtime.colorOf` in index.html + both
`spec/*.mjs` copies, `color_of` in the rust core) at every color choke-point. A
string-valued variable wins over a palette name; an unrecognized string falls back
to white. A non-string variable does not shadow the literal palette word. The
collision case (`yellow is 4` + `in yellow`) is now pinned in `d_dyncolor.fc`.

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
