# 03 · Frontend & UX technology discussion (for the Proposal)

Captured from the session's stack discussion. Goes into the **Proposal** under "Frontend & UX".

## Headline recommendation for TPOS
TPOS is **forms/tables/CRUD-heavy back office + an SEO-critical public storefront** — the two
things whole-app WASM is *worst* at (component ecosystem; crawlable SSR). So:
1. **UI: stay JS/TS** — **Next.js** (or **Django + htmx** for the back office), per Architecture
   decision #5. Pragmatic, hire-able, rich ecosystem.
2. **Storefront must be DOM-SSR** for SEO — rules out canvas-WASM (egui/Flutter/Compose).
3. If Rust-first by conviction, the only WASM options that don't wreck SEO/a11y are **Leptos** or
   **Dioxus** (both DOM + SSR) — but accept a thinner component ecosystem for CRUD.
4. **Use WASM as a *module*, not the whole app** — push hot/correctness-critical logic (pricing,
   the Derived-Field Formulas in spec Appendix D) into a Rust→WASM lib behind a JS UI.

## WASM whole-app options (if asked)
DOM-based (SEO/a11y-friendly when SSR'd): **Leptos**, **Dioxus**, Yew, Sycamore, Blazor.
Canvas-based (bad for SEO/a11y): **egui**, **Flutter Web**, **Compose/Wasm**.

## Leptos vs Dioxus (the two leading Rust/WASM DOM frameworks)
| | Leptos | Dioxus |
|---|---|---|
| Model | Fine-grained **signals**, no VDOM (SolidJS-like) | **VDOM + signals**, React-like (hooks) |
| Syntax | `view!` macro | `rsx!` macro + hooks |
| Primary target | **Web-first** (SSR, islands, fullstack/server-fns) | **Cross-platform**: web+desktop+mobile+TUI+LiveView from one codebase |
| Desktop/mobile | not the focus | **headline** — renders in OS webview (DOM, not canvas) |
| Perf | top-tier fine-grained | very good (optimized VDOM) |
| DX | surgical updates | strong RSX **hot-reload**; React-familiar |
- **Pick Leptos** for a web app where SSR/SEO + max DOM-update perf matter.
- **Pick Dioxus** to share one Rust UI across web + desktop + **mobile** (would only matter for a
  Phase-3 field app).
- **Dioxus TUI**: same *core/logic* (renderer-agnostic VirtualDOM + reactivity), but the **view
  layer is NOT free** across targets — terminal uses a constrained flexbox/element subset, no
  general HTML/CSS; you share components/logic and adapt views. TUI is the least-mature renderer.

## Component libraries (both ecosystems are immature vs React/Vue)
- **Leptos**: **Thaw UI** (leading, styled, Fluent-like), Leptonic (lagging), radix-leptos
  (headless), leptos-use (composables), leptos-struct-table, leptos_icons.
- **Dioxus**: **dioxus-primitives** (headless, maturing), Tailwind+DaisyUI (the common path),
  dioxus-free-icons.
- Both ultimately emit HTML/CSS on web → **Tailwind + DaisyUI/Flowbite** is the pragmatic route for
  either.

## Data-grid "sophisticated filtering" out of the box?
**No** — neither Rust framework ships AG-Grid/TanStack-level filtering. Closest is
`leptos-struct-table` (sorting + pagination + a `DataProvider`; you implement filtering). TanStack
Table does **not** support Leptos/Dioxus.
**Architectural reframe (the actual recommendation):** for a multi-tenant app with tens of
thousands of rows/tenant you want **server-side filtering/sorting/pagination** anyway (the
openapi.yaml already exposes `q`/`status`/`sort`/`page`/`limit`). The table is "dumb"; the heavy
filtering lives in the API/SQL; you hand-build the **filter-input UI** (which is the same effort in
any framework). This is a strong reason TPOS is JS-first with server-side filtering.

## Responsive / device matrix (now an explicit NFR)
Good UX across **phone, tablet, laptop, ultra-wide desktop**; touch + pointer; field roles (recon,
delivery) usable on a phone/tablet; storefront mobile-first; WCAG 2.1 AA.
