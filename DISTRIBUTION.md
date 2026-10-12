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
   *Wider status checked 2026-10-12:* the deployed **web app** is a 2026-07-08 snapshot of
   this repository — `https://codeonline.io/` is 652,395 bytes against 849,142 here, the
   September markers (`show dialog`, `True subpixel`) are absent, and `tools/checks.mjs`
   404s while `spec/`, `apid/`, `huntd/`, `ROADMAP.md` all serve — so the whole
   September batch is undeployed, not only the APK. The box itself is healthy: apid answers
   (classroom 404 as designed, flag off) and the relay upgrades (426).
   The built binaries live in the public download repository,
   **[kevinelong/fc-releases](https://github.com/kevinelong/fc-releases)** — release
   `v1.0.3+4`, holding the APK, the AAB and `SHA256SUMS.txt` — so downloading them needs no
   token anywhere. `/fc.apk` is gitignored by design, so a `git pull` on the box updates the
   web app and `fc-version.js` but will **not** place the APK; that file has to move
   separately:
   `curl -sSL -o fc.apk https://github.com/kevinelong/fc-releases/releases/download/v1.0.3+4/app-release.apk`
   on the box (verified public: HTTP 200, and the bytes hash to the same `2597d8bb…` as the
   local build), or an scp of the same asset from this workstation.
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

## 🔴 F-Droid — ruled out by the license (decided 2026-10-12)

**Blocker:** fc is source-available under the **Functional Source License 1.1**
(`FSL-1.1-MIT`, see [LICENSE](./LICENSE)), which is **not** an OSI-approved FOSS license,
and F-Droid only lists apps under one. The licence is not a dead end for the project — each
version converts irrevocably to MIT on the second anniversary of its release — but the
current version cannot be submitted. Revisit only if fc is relicensed, or once a release
has aged into its MIT grant and that older version is what gets packaged.
- Otherwise F-Droid's recipe requirements are already satisfied: the wasm is
  version-controlled inline in `index.html` and there is no build step, which is exactly
  what its reproducibility rules want.

## 🔒 iOS — PWA today; native gated on $99

iOS users can "Add to Home Screen" now (PWA). Native App Store needs the $99/yr Apple
Developer Program + a Codemagic build — fully scaffolded; see `fc-app/IOS-BUILD.md`.

---

## What only you can do
1. Post the **`fc.apk` link / QR + "Add to Home Screen"** tip — reaches users today.
2. Create a **Play Developer account** ($25) → I finish the .aab + listing.
3. ~~Decide open-source or not~~ — **done 2026-10-12: source-available under FSL-1.1-MIT**
   (`LICENSE`), which rules F-Droid out for current releases (see above).
4. The **$99 Apple** decision → native iOS.
