# Distribution kit — getting fc into users' hands

The review's punchline: all this work is "shipped to the server," not to users. This
doc closes that gap. **Two channels work TODAY with zero accounts; the app stores need
your accounts/decisions.** Everything the stores need that I *can* prepare is prepared
below — your remaining step is the account.

---

## ✅ Distribute today — no account, no cost, ready now

1. **Direct APK.** `https://codeonline.io/fc.apk` is a signed release build, live now.
   Share the link (or a QR). Users tap it, allow "install from this source," done.
   The **best immediate distribution** — no gatekeeper, no wait.
   *Status 2026-10-11:* the live file is still the 2026-07-02 build (versionCode 3). A
   **versionCode 4** build is ready at
   `fc-app/build/app/outputs/flutter-apk/app-release.apk` — 49,518,572 bytes, sha256
   `2597d8bb…` — carrying the current web app (23 examples, the September language and
   engine work, and every linked page now actually bundled). Replacing the live file is a
   deploy step that has not been done. **Order matters:** publish the APK first, then
   `fc-version.js` (now advertising 4), because the in-app nudge reads the live file —
   bumping it first would point v3 installs at the v3 download. Note also that v4 is signed
   with a **new** key (the July keystore was never recovered), so it cannot install over a
   v3 copy: existing users uninstall once.
2. **PWA (installable web app).** `https://codeonline.io` → browser menu →
   **Add to Home Screen** (works on Android *and* iOS). Installs an offline,
   fullscreen app icon. No store, no review, instant updates. Already wired
   (manifest + service worker + the in-app install nudge).

These two reach every phone right now. If the goal is "get it into hands this week,"
post the `fc.apk` link / a QR and the "Add to Home Screen" tip — that's the whole task.

---

## 🟡 Google Play — needs a Play Developer account ($25, one-time)

**Ready:** a signed release build (`fc-app`, now **versionCode 4 / 1.0.3**, with an `.aab`),
a privacy policy (`https://codeonline.io/privacy/`, now also bundled inside the app so it
works offline), and draft screenshots (`store/01-home.png`,
`02-play.png`, `03-code.png`).

**The .aab now exists** (2026-10-11): `flutter build appbundle --release` produces
`fc-app/build/app/outputs/bundle/release/app-release.aab` — 49,206,706 bytes, sha256
`2839e8bd…`, same signing config as the APK — so the only remaining Play blocker is the
account. One thing to check before uploading: `targetSdk` is still **34**, which is below
Play's current floor for new listings; raising it changes runtime behaviour (edge-to-edge,
permission prompts) and should follow the device pass in TEST-MATRIX.md.

**Listing copy (paste-ready):**
- **Title:** `fc — code games in plain English`
- **Short description (≤80):** `Make games by writing plain English. Play on your phone. Multiplayer built in.`
- **Full description:**
  > fc is a fantasy console you program by writing plain English. Type a few lines —
  > "move player with arrows", "when player picks up any coin, increase score by 1" —
  > and a real game runs. No setup, no syntax to memorize.
  >
  > • Learn to code by making games, right on your phone
  > • Built-in sprite, sound, and map editors
  > • Multiplayer built in — two phones, same room, a game you wrote
  > • 16 example games to play, read, and remix
  > • Works offline
  >
  > Free. Made for beginners, kids, and classrooms.

**Assets still to make:** feature graphic 1024×500 (I can generate one like the OG
card); the 512×512 icon exists as the adaptive icon; screenshots in `store/` are drafts
— refine framing before upload.

**Data-safety form (answers, from the privacy policy):** No data collected or shared is
*required*. Optional account collects **email** (account management) + user content
(saved/published games) — not shared, not sold, no ads, no third-party analytics.
Content rating: **Everyone / PEGI 3**.

---

## 🟡 F-Droid — free, but requires an open-source license (DECISION)

**Blocker:** there is **no LICENSE file** in the repo. F-Droid only lists apps under an
OSI-approved FOSS license.
- **If fc is open source:** add a `LICENSE` (MIT / Apache-2.0 / GPL-3.0 — your call) and
  submit an `fdroiddata` metadata merge request. Note for the recipe: the app bundles a
  copy of the web build; the wasm is version-controlled inline in `index.html` (no build
  step), which helps reproducibility.
- **If fc stays proprietary:** skip F-Droid; use the direct APK + Play.

This is a product decision (open-source or not), not a code task — hence flagged, not done.

## 🔒 iOS — PWA today; native gated on $99

iOS users can "Add to Home Screen" now (PWA). Native App Store needs the $99/yr Apple
Developer Program + a Codemagic build — fully scaffolded; see `fc-app/IOS-BUILD.md`.

---

## What only you can do
1. Post the **`fc.apk` link / QR + "Add to Home Screen"** tip — reaches users today.
2. Create a **Play Developer account** ($25) → I finish the .aab + listing.
3. Decide **open-source or not** → unlocks (or rules out) F-Droid.
4. The **$99 Apple** decision → native iOS.
