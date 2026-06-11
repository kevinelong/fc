# 00 · Status & TODO (START HERE)

## Where we are
The TPOS deliverable is being restructured from one large spec into **three documents**
(see `01-document-plan.md`). Decided with the user explicitly:
- **3 documents** (not 2): Requirements Spec · Functional Spec Proposal · Bid & Delivery Pack.
- The **Proposal** folds in stack discussions for: **Backend & scaling, Frontend & UX, Integrations & accounting**. (Rust gRPC / future-services was explicitly **excluded**.)

## DONE ✅
- **Product Specification** = requirements only, technology-neutral.
  - File: `spec/spec.html` → `spec/TPOS-Product-Specification.pdf` (v2.0, **40 pages**).
  - Live: `https://codeonline.io/tpos/spec/TPOS-Product-Specification.pdf`
  - Committed: `4298694` on `main`.
  - What changed: removed all tech/bid appendices; re-lettered remaining to **A–F**
    (A Data Dictionary · B Security & Compliance · C Onboarding & Import · D Derived-Field
    Formulas · E Notifications · F Accounting-System Export); rewrote **§12 NFRs** technology-
    neutral and **added** real-time-collaboration, max-users-per-server density, and a
    phone→tablet→laptop→ultra-wide responsive matrix; neutralized Appendix A (logical),
    B (security as *outcomes*, mechanisms removed), F (accounting as a *requirement*);
    new Executive Overview describing the 3-doc set.
  - Verified: 0 JS errors; 6 retained SVG diagrams render (roles, er, flow, store, flow-import, clocks).

## TODO ⏳ (next session)
### 1. Build the **Functional Specification Proposal** (`spec/proposal.html` → PDF)
Structure as **requirement → proposed technical solution**, echoing each requirement area of the
spec and answering with the recommended technology. Fold in the three stack areas:
- **Backend & scaling** — from `docs/02-architecture-decisions.md` and the raw appendices in
  `docs/_moved-architecture-appendices.html` (old Appendix B API design, C Performance & Scaling,
  D Architecture Decisions & Roads-Not-Taken — all reusable). Add a **real-time updates** solution
  (the new NFR): server-push (SSE/WebSocket) + an in-DB change feed / pub-sub; no client polling.
- **Frontend & UX** — from `docs/03-frontend-stack.md`: recommend **JS-first UI** (Next.js or
  Django+htmx), **DOM-SSR storefront** for SEO, **WASM-as-a-module** for hot logic; if Rust-leaning,
  **Leptos** (web) vs **Dioxus** (cross-platform); **server-side data-grid filtering** (the Rust
  ecosystem lacks AG-Grid/TanStack equivalents); the responsive device matrix.
- **Integrations & accounting** — from `docs/04-research-findings.md`: payments (Stripe Connect,
  PCI SAQ-A via tokenized hosted fields), e-sign, email/SMS, listing syndication, and the
  **QuickBooks/accounting-export canonical-model + per-target-adapter** approach (file CSV+IIF
  first, QBO API later).
- Include the security **mechanisms** that were stripped from spec Appendix B (RLS + `FORCE`/
  `SET LOCAL`, Argon2id, PgBouncer, hardened cookies) as the *proposed* solution to the security
  *requirements*.
- Reuse SVG diagrams: tenant-isolation (`#isolation`), accounting canonical-model+adapters
  (`#acctmap`). Their generators were removed from `spec.html` — recover them from git
  (`git show 4298694~1:tpos/spec/spec.html`) or rebuild (code is in the commit history / the
  conversation). Keep `arrowR`, `r`, `rf`, `tx`, `tl`, `cross` helper functions.

### 2. Build the **Bid & Delivery Pack** (`spec/bid-delivery.html` → PDF)
Lift verbatim from `docs/_moved-bid-appendices.html`:
- MVP Scope Matrix & Release Roadmap (MoSCoW per role/capability) + roadmap diagram (`#roadmap`)
- Integration & Third-Party Register (vendor, build-vs-stub, who-owns-keys, review lead times)
- Assumptions, Delivery Model & RACI
- Estimation Worksheet (WBS, ≈95–175 person-weeks / 6–12 months)
- Delivery Stages (Internal demo → GA) + stage-gate diagram (`#stages-dia`)
Add a cover + non-normative banner. Diagram generators (`roadmap`, `stages-dia`) are in git history
(`4298694~1`) — recover them.

### 3. Cross-link & ship
- Add reading-guide cross-links between the three docs.
- Render all three PDFs (see `05-build-and-render.md`), verify 0 JS errors, commit, confirm they
  serve over HTTPS (`curl -I https://codeonline.io/tpos/spec/<file>.pdf`).

## Key open product decisions (not yet locked by the user — carried in the Bid pack as PROPOSED)
MVP scope cutline · hosted-only-vs-self-host at launch · design-ownership · launch jurisdiction.
These four "levers" tighten the estimate; they are the user's calls.
