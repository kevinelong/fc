# Classroom pilot pack — what is waiting on Q1

Classroom mode is **built, verified and dark** (`ENABLE_CLASSROOM=false`, so every classroom
endpoint answers 404 and the UI is absent). Everything below is ready for review; none of it is
approval. When the four choices are signed off, this file is the checklist for turning it on and
for reversing that if the pilot goes wrong.

## The four decisions, with what the code does today

Each line is the current behaviour, so "approve as-is" is a real option and any change is a small,
named edit in `apid/server.js` (`CLASS`, `studentName`).

| # | decision | ships as | where it lives |
|---|---|---|---|
| 1 | **Student display names** | Free text only when it matches `^[A-Za-z0-9 ]{2,20}$` and is not profane; otherwise a generated adjective+animal. No edit-after-generation control exists yet. | `studentName()` |
| 2 | **Student submissions** | Stored per class (code + name + title), visible to classmates and the teacher; the teacher can delete one, or the whole class. | class `submissions[]` |
| 3 | **Retention** | A class idle for 90 days is deleted on the next classroom request, together with its submissions. | `purgeIdleClasses()` |
| 4 | **Caps** | 60 students/class · 20 classes/teacher · 40 assigned games · 200 submissions/class · 16 KB per game. | `CLASS` |

Also already true, and worth stating in the policy: **no student emails, no passwords, no accounts**
— a student joins with a class code and a display name, and the only person who signs in is the
teacher (Google or GitHub). The teacher is the data controller for their class; the platform stores
what the table above describes and nothing else.

## Draft privacy-policy addition (paste after sign-off)

> **Classroom mode.** A teacher can create a class and share its code; students join with a code and
> a display name of their choosing — there is no student account, no email address and no password.
> The teacher sees the class roster and any game a student hands in, and can delete either. A class
> and everything in it is deleted automatically after 90 days without activity. Games handed in are
> visible to the other students in that class. Nothing here is used for advertising, profiling or
> analytics, and it is not shared with anyone else.

## Draft teacher copy (what a teacher would be told)

> **Running a class in fc.** Create a class to get a short code. Write the code on the board;
> students open codeonline.io, choose "I have a class code", and type it with a display name — no
> account, no email, nothing to install. You can assign one of the example games, watch the roster,
> and see what has been handed in. Tapping a hand-in plays it. If you delete a class, its roster and
> hand-ins go with it, and a class that sits unused for 90 days is removed automatically.

## Pilot checklist (in order)

1. **Owner sign-off** on the four decisions (or a specific change), and a privacy review of the two
   drafts above by someone qualified — not by me.
2. **Privacy page updated** with the approved wording (the section above is a draft).
3. **Real-device pass** on the `targetSdk 36` build (`docs/TEST-MATRIX.md`, must-do four) — students
   on phones are the whole point of the feature.
4. **Retention verified on the box, not just in the harness**: `class-e2e` proves the purge and the
   teacher delete against `db.json`, but the pilot should confirm the real server's data directory
   holds no classroom records after a delete, and check what the backup job (`bfa_db_nightly`) does
   with `apid/data/` — a deletion that leaves a copy in a nightly backup is not a deletion.
5. **Enable and watch**: `ENABLE_CLASSROOM=true` on the box, one teacher, one class, one week.
6. **Rollback** is one env var: `ENABLE_CLASSROOM=false` and restart apid — the endpoints go back to
   404 and the UI vanishes; existing classroom rows stay until the 90-day purge, or delete the class
   first if that matters.

## What the pilot would be measuring

- Do students get into a class unaided (code + display name) on a school network?
- Does the roster hold up with a real class (30 students, one NAT address — the relay's per-address
  cap is 40 by default and adjustable via `HUNTD_MAX_PER_IP`)?
- Does handing in a game actually reach the teacher, and does deleting a class leave nothing behind?
- Anything the teacher copy above promises that turns out not to be true.
