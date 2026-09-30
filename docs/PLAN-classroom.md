# Classroom mode — implementation complete, launch approval pending

**Status 2026-09-30:** the backend and frontend are built behind
`ENABLE_CLASSROOM`, and the automated flow passes on the real local server
(`tools/class-e2e.mjs` 10/10) and in the browser (`tools/ui-check.mjs`). The flag
defaults to false and `/api/class/*` returns 404 while it is off.

The implementation is ready for owner and privacy review, not production launch.
Do not enable it until Q1 in [OPEN-QUESTIONS.md](./OPEN-QUESTIONS.md) is explicitly
answered, the public privacy copy is reviewed, retention is operationally verified,
and the manual device checks in [TEST-MATRIX.md](./TEST-MATRIX.md) are recorded.

## The core idea
A teacher creates a **class** and gets a short **join code** — six characters from an
unambiguous alphabet (`genClassCode()`: no O/0/I/1/L), e.g. `SKY482`.
Students go to `codeonline.io`, tap **Join a class**, enter the code and a
**display name** — no student email or account. The class gives them a
shared shelf of the teacher's assigned games and (optionally) a place to submit
their own.

This is data-minimized, but it is not accurate to call it “no personal data” or to
claim that the design by itself establishes COPPA or FERPA compliance. A chosen
display name or submitted program can identify a child. Persistent identifiers and
the school/teacher context can matter as well. The safest default is a generated
alias, with any editable-name option treated as an explicit product/privacy choice.

Official references for the launch review:

- FTC, [Complying with COPPA: Frequently Asked Questions](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)
- FTC, [Children's Online Privacy Protection Rule: A Six-Step Compliance Plan](https://www.ftc.gov/business-guidance/resources/childrens-online-privacy-protection-rule-six-step-compliance-plan-your-business)
- U.S. Department of Education, [Student Privacy Policy Office glossary](https://studentprivacy.ed.gov/glossary)

These references are planning inputs, not legal advice. A qualified privacy/legal
review is required before a school-facing launch.

## Decisions still required (Q1)
1. **Display name** — students type a free name, OR you pick from a safe generated
   list (adjectives+animals, like the existing nickname generator) to avoid kids
   typing real/unsafe names? **Recommend: generated + optional edit, profanity-filtered.**
2. **Do students' submitted games get stored server-side?** If yes, that's the only
   student-associated data (a game + a display name, per class). If no, keep it
   view-only (teacher assigns; students play/remix locally). **Recommend: allow
   submit, stored per-class, teacher can delete; auto-purge classes after N days idle.**
3. **Retention** — auto-delete a class + its data after, say, **90 days** of
   inactivity (or teacher deletes)? **Recommend: yes, 90-day idle purge.**
4. **Class size / rate limits** — cap students per class (e.g. 60) and classes per
   teacher (e.g. 20)? **Recommend: yes.**

The code currently implements editable filtered names with generated fallback,
server-side submissions, 90-day idle purge, and the listed caps. Implementation
does not substitute for owner approval or privacy review.

## Implemented design
- **Flag:** `ENABLE_CLASSROOM` (default off) so it ships dark and flips on cleanly.
- **Store** (`db.classes`): teacher owner id/nickname, class code/name, creation and
  last-active timestamps, student display names and join timestamps, assigned game
  codes, and submitted display name/title/code/timestamp. No student account or
  email is requested; the stored fields can still contain identifying information.
- **Endpoints** (mirror the gallery's style + CSRF `X-CO` on writes):
  - `POST /api/class/new` (teacher, auth'd) → `{ code }`
  - `POST /api/class/join` `{ code, name }` (no auth) → class view (assigned games)
  - `GET  /api/class/:code` → roster + assigned + submissions (teacher sees all)
  - `POST /api/class/:code/assign` `{ gameCode }` (teacher) · `/submit` `{name,title,code}` (student) · `DELETE …` (teacher)
- **Frontend:** a **Join a class** entry on the launcher (code + name), a class
  shelf (assigned games → tap to play/remix), and a teacher **New class** action
  (shows the code + a simple roster). All behind the flag until sign-off.
  *Built:* the entries appear only when `/api/class/enabled` answers 200; the shelf
  lives on the launcher, the dialog carries join / class / teacher panes, and the
  teacher can assign the editor's program, delete submissions and un-assign games.
- **Privacy page:** describes the stored fields and dark-launch status without
  making a compliance claim.

## Launch checklist

1. Record the owner's answers to all four Q1 choices.
2. Complete privacy/legal review, including school context, consent/notice needs,
   display-name policy, deletion requests, incident response, and processor/vendor
   obligations.
3. Verify the idle purge with production-like persistence and confirm teacher
   deletion removes every class-associated record.
4. Complete and record the real-device release pass in `docs/TEST-MATRIX.md`.
5. Review the teacher and privacy pages against the final behavior.
6. Only then enable `ENABLE_CLASSROOM`, restart, and run a small controlled pilot
   before broader promotion.

## Later scope and revenue context

The core implementation is complete. The teacher dashboard (progress and
analytics), rostering, school licensing, and billing are later phases. They
increase both product value and privacy obligations; none are implied by this
implementation.

Free for individual teachers/classes. Schools/districts pay later for a dashboard +
rostering + a private class gallery + support (B2B2C — the school pays, never the
kid). Classroom mode can become the foot in the door only after the launch gates
above are satisfied and a controlled pilot validates demand and operations.
