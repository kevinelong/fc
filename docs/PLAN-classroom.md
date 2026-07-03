# Classroom mode — decision-ready design (needs your sign-off)

The unlock for teacher adoption *and* school revenue. The whole gate is a privacy
decision, so this doc is written to be **approved (or adjusted) in a few minutes** —
then I build it. I deliberately did NOT pre-build the backend: apid is the live
server for sign-in + cloud saves + the gallery, and classroom's shape depends on the
choices below. Not worth risking live auth for an unapproved design.

## The core idea (privacy-first)
A teacher creates a **class** and gets a short **join code** (e.g. `SKY-4821`).
Students go to `codeonline.io`, tap **Join a class**, enter the code and a
**display name** — no email, no account, no personal data. The class gives them a
shared shelf of the teacher's assigned games and (optionally) a place to submit
their own.

Why this clears the bar: **no PII from students** (a display name they choose is
not personal data if you don't tie it to identity), no email, no third-party
anything → sidesteps COPPA (under-13) and FERPA (education records) by not
collecting the things those laws regulate. The teacher is the only account.

## Decisions I need from you (the sign-off)
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

Approve those four (or tweak) and the build is straightforward.

## Implementation (post-sign-off) — all reuses existing apid
- **Flag:** `ENABLE_CLASSROOM` (default off) so it ships dark and flips on cleanly.
- **Store** (new `db.classes`): `{ code: { ownerId, name, createdAt, lastActive,
  students: [{ name, joinedAt }], assigned: [gameCode…], submissions: [{ name,
  title, code, at }] } }`. No emails, no user records for students.
- **Endpoints** (mirror the gallery's style + CSRF `X-CO` on writes):
  - `POST /api/class/new` (teacher, auth'd) → `{ code }`
  - `POST /api/class/join` `{ code, name }` (no auth) → class view (assigned games)
  - `GET  /api/class/:code` → roster + assigned + submissions (teacher sees all)
  - `POST /api/class/:code/assign` `{ gameCode }` (teacher) · `/submit` `{name,title,code}` (student) · `DELETE …` (teacher)
- **Frontend:** a **Join a class** entry on the launcher (code + name), a class
  shelf (assigned games → tap to play/remix), and a teacher **New class** action
  (shows the code + a simple roster). All behind the flag until sign-off.
- **Privacy page:** add a "Classroom mode" section stating exactly what's stored
  (already foreshadowed in `/privacy/`).

## Effort
~1 focused session for the core (endpoints + join/assign UI), given it reuses the
saves/gallery patterns. The teacher dashboard (progress, analytics) and school
licensing/billing are a **later**, larger phase — not needed for a classroom pilot.

## The path to revenue (context)
Free for individual teachers/classes. Schools/districts pay later for a dashboard +
rostering + a private class gallery + support (B2B2C — the school pays, never the
kid). Classroom mode is the foot in the door; licensing is the follow-on.
