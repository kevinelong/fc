# Manual device / browser test matrix

The headless harnesses (`spec/port/spike/*.mjs`) prove JS↔wasm parity, gameplay,
multiplayer, and pixel-level rendering on this server. They **cannot** cover what
only a real device exposes: touch input, mobile audio-autoplay policy, Safari
quirks, and PWA install behavior. Run this checklist by hand before a release that
touches input, audio, the canvas, or the service worker.

Status legend: ✅ pass · ⚠️ issue (note it) · — not tested.

## Must-do four (any release touching input/audio/canvas/SW)

Recommended release gate (OPEN-QUESTIONS Q4); owner approval and results are still
pending. The full matrix below is opportunistic; these four are the proposed minimum:
(1) iOS Safari — audio unlocks on the first tap, Add to Home Screen launches offline;
(2) Android Chrome — the pad moves and fires, multitouch works, no page scroll or tap
delay; (3) the installed APK runs an example; (4) two-device multiplayer in one game.
The touch *wiring* is automated (`tools/ui-check.mjs` emulates a touch device: pad
appears, multitouch reaches the engine, dragging never scrolls); everything else here
needs real hardware.

## Latest release results

| Date | Target | Result | Tester / notes |
|---|---|---|---|
| — | iOS Safari audio + PWA | — | Not yet recorded |
| — | Android Chrome touch | — | Not yet recorded |
| — | Installed APK | — | Not yet recorded |
| — | Two-device multiplayer | — | Not yet recorded |

## Devices / browsers to cover
| Target | Why it matters |
|---|---|
| iOS Safari (iPhone) | WebKit-only engine; strict audio-autoplay gate; Add-to-Home-Screen PWA path |
| iPadOS Safari | larger touch target; split-view |
| Android Chrome | primary Android browser; gamepad + touch |
| Android (installed APK / WebView) | the bundled app — flutter_inappwebview, localhost server |
| Desktop Chrome / Firefox / Safari | keyboard path; wasm + JS fallback |

## Checklist per target
1. **Load + run** — open the site (or APK), load each example from the launcher; it renders within ~1s, no console errors.
2. **Engine** — `?core=wasm` (default) runs; `?core=js` runs; on a browser without WebAssembly it falls back to JS (badge/behavior sane).
3. **Keyboard** (desktop) — arrows/space/A/B drive the games; no stuck keys.
4. **Touch / D-pad** — the on-screen D-pad + A/B buttons move and fire; multitouch (move + fire together) works; no 300ms tap delay; taps don't scroll the page.
5. **Audio** — **the autoplay gate**: sound is silent until the first user gesture (tap), then SFX + music play. Verify a built-in SFX (pickup), a `define sound`, and `play music`. iOS Safari is the strict one.
6. **Multiplayer** — open a multiplayer game (Tag / Light Cycles / Online Pong / Hunt) on **two** devices in the same room; peers appear; the mechanic works (tag transfer / crash / ball sync / frag); reconnect after backgrounding.
7. **PWA** (iOS Safari) — Add to Home Screen; launches fullscreen offline; icon correct.
8. **Orientation / safe-area** — portrait + landscape; canvas centered; notch/safe-area not clipping the HUD or D-pad.
9. **Performance** — sustained ~60fps on a mid-range phone for an active scene (space-invaders, cycles).

## Known gates to watch
- **iOS audio**: WebKit blocks audio until a user gesture; fc unlocks the AudioContext on first tap — verify it actually unlocks (the "click the screen first" hint exists in several games).
- **localhost in WebView**: the APK serves bundled assets via `InAppLocalhostServer`; an ATS exception is set for iOS. Confirm assets load (no mixed-content / CORS blocks).
- **Service worker staleness**: after a deploy, the PWA should pick up the new single-file `index.html` (network-first HTML). Hard-refresh / reinstall if stale.

> This file is the executable spec for the manual pass; fill in a dated results
> table per release. It is intentionally not automated — the value is on real
> hardware. (Headless render regressions are covered by `tools/visual-golden.cjs`;
> browser-side UI behaviour — dialog a11y, the live-inspect panel — by
> `node tools/ui-check.mjs`, which needs no npm install.)
