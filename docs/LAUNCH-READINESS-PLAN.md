# Launch readiness and distribution plan

**Audit date:** 2026-09-28

**Recommendation:** fc is ready for a controlled pilot, but not yet for a broad
classroom or kids-facing launch. Run one hardening sprint, then test it with 3–5
teachers, library or makerspace leaders, or after-school groups. The bottleneck is
release confidence, trust, and distribution—not more features.

## What is ready

- The web app, installable PWA, teacher material, projects, reference, privacy
  page, demo links, and direct Android APK are live at
  [codeonline.io](https://codeonline.io).
- The app includes 22 examples, multiplayer, sharing, offline support,
  accessibility controls, and runnable JavaScript export.
- The live APK is approximately 48.7 MB and reports version 1.0.2 (versionCode 3).
- GitHub authentication is enabled. The community API is live but has no games.
- A clean Rust/WASM rebuild succeeds.
- Healer: 34/34 cases; corpus safety: 70/70; validation gate: 71 known-good
  programs accepted and negative cases rejected.
- Lexer parity: 2053/2053 lines. Runtime parity: 49/49 programs.
- Five of five multiplayer scenarios pass two-instance mechanic and determinism
  checks. All 16 games with interaction smoke specifications pass their assertions.

## P0 — complete before a broad launch

### Release confidence

1. Fix the real `matrix.fc` JS/WASM divergence: JavaScript renders `random 10`
   literally while WASM renders the number. The example suite is 21/22 today.
2. Review and refresh parser and transpiler goldens; each is missing nine newer
   programs.
3. Replace hard-coded `/tmp` output paths and make the visual runner portable or
   give it a documented CI/container environment.
4. Add CI that builds WASM, verifies inlined artifacts, and runs healer, lexer,
   parser, runtime, examples, interaction, multiplayer, transpiler, and visual
   checks. Unreviewed golden drift must fail the build.
5. Complete and check in a dated `docs/TEST-MATRIX.md` pass on iPhone/iPad Safari,
   Android Chrome, the installed APK, a Chromebook, desktop browsers, offline/PWA
   updates, audio unlock, touch/orientation, and two-device multiplayer.

**Gate:** a clean clone builds, every automated check is green in CI, and the
device matrix has no launch-blocking issue.

### Safety, privacy, and operations

1. Align school-facing claims with the implementation. The teacher page says
   users can report community games and admins can remove them; there is no report
   or admin-moderation path in the current frontend/API.
2. For the pilot, disable community publishing or seed a curated gallery with
   3–5 reviewed, remixable games.
3. Replace the claim that classroom codes/display names automatically sidestep
   COPPA and FERPA with narrower factual copy. Obtain a short privacy review before
   enabling classroom storage; names, usernames, persistent identifiers, and
   student-linked work can be regulated data depending on use.
4. Split TPOS and Pool Room work from the fc repository and service boundary.
   `tools/extract-fc.sh` excludes `tpos`, but still carries Pool Room routes embedded
   in `apid/server.js` and its API documentation.
5. Review public access to unrelated stakeholder-submission endpoints.
6. Add baseline nginx headers: HSTS, `X-Content-Type-Options`, an appropriate
   `Referrer-Policy`, `Permissions-Policy`, and CSP. Start CSP in report-only mode
   because the app intentionally contains large inline scripts.
7. Document deployment, rollback, uptime monitoring, and error monitoring.

**Gate:** product claims match real controls, unrelated data/services are
separated, and the school-facing privacy posture has been reviewed.

## P1 — package it for distribution

1. Produce a clean standalone public fc repository. Update the extraction script
   so it cannot include client or Pool Room code.
2. Add `SECURITY.md`, contribution guidance, and a public feedback route that does
   not require a GitHub account.
3. Tag a version and publish a release with source, release notes, known limits,
   the signed APK, a SHA-256 checksum, and reproducible build instructions.
4. Put the Android wrapper source and lockfiles under version control. Produce a
   signed Android App Bundle targeting Android 16 / API 36 for Google Play.
5. Reconcile `ROADMAP.md`, `DISTRIBUTION.md`, architecture notes, and port notes;
   they describe shipped features as future work and contain stale license,
   example-count, and test statements.
6. Point the Support link to an active destination or remove it.

## Distribution by audience

| Audience | Delivery | Ask |
|---|---|---|
| Teachers, libraries, makerspaces, coding clubs | Browser/PWA plus `/teachers/` and its 45-minute lesson | Run one session; note activation, confusion, and whether the adult would reuse it alone |
| Beginners and families | QR to `https://codeonline.io` plus Add to Home Screen | Open a starter, change one thing, run, and share |
| Fantasy-console and AI/developer communities | Clean public repo plus one strong playable demo | Stress the language and fallback engine; report surprising behavior |
| Android users | Google Play closed test after the P0 gate | Test install, touch, audio, rotation, offline upgrades, and multiplayer |
| iPhone/iPad users | PWA first | Verify installation, offline launch, audio, safe areas, and orientation |

The browser/PWA is the primary product: it has the least friction for schools and
Chromebooks and the fastest update loop. Keep the APK as an offline option, not the
main acquisition path.

## Pilot and measures

Recruit 3–5 adults who already convene learners and aim for 20–50 learners total.
Offer a supported 45-minute pilot, not a general endorsement request. Capture only
aggregate counts and adult observations:

- game running within five minutes;
- successful edit-and-run;
- first point that requires help;
- lesson/challenge completion;
- share or peer-play action;
- adult willingness to run it again without support.

Proceed to a broader launch when most learners run something within five minutes,
recurring confusion is understood, at least two pilot leaders would reuse it, no
serious privacy/moderation/reliability issue appears, and support load is sustainable.

## Four-week sequence

### Week 1 — harden

- Fix parity/goldens, add CI, complete device QA.
- Correct moderation/privacy claims and separate unrelated services.
- Add production headers and a public feedback route.

### Week 2 — pilot

- Run 2–3 sessions and fix the top activation problems immediately.
- Seed curated starter games if publishing remains enabled.

### Weeks 3–4 — controlled distribution

- Finish the pilots and begin the Android closed test.
- Publish the standalone repo and tagged release.
- Use the tested pitch in `docs/FEEDBACK-PLAN.md` for Show HN, fantasy-console
  communities, itch.io, and appropriate project-sharing venues.

For a personal Play account created after 2023-11-13, plan for at least 12 testers
continuously opted into the closed test for 14 days before applying for production.
Invite more than 12 to absorb dropouts. Keep iOS on the PWA until demand justifies
the annual native-program cost and a maintained build pipeline.

## Keep parked until the pilot proves demand

- AI generation and the LLM-backed safety-net tier.
- Classroom rosters, submissions, dashboards, and school licensing.
- Subscriptions and premium asset packs.
- Native iOS distribution.
- New language/engine features not tied to an observed pilot problem.

The separate AI-market hypothesis and validation plan are in
[`docs/AI-MARKET-PLAN.md`](AI-MARKET-PLAN.md).

## Current external requirements

- [Google Play target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878)
- [Android App Bundle publishing](https://developer.android.com/guide/app-bundle)
- [Play testing requirements for new personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465)
- [FTC COPPA guidance](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)
- [U.S. Department of Education FERPA PII guidance](https://studentprivacy.ed.gov/content/personally-identifiable-information-education-records)
- [Apple Developer Program membership](https://developer.apple.com/programs/whats-included/)
