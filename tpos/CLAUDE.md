# TPOS — Project Context (handoff for a fresh Claude Code session)

**TPOS** ("Trailer Portal Operating System") is a multi-tenant vertical-SaaS spec/prototype for
**industrial-trailer-resale dealerships**: one platform runs a dealer's public storefront **and**
entire back office (inventory → leads → deals → quotes → recon → titles → invoicing → delivery),
"one record, many lenses" across 13 roles (incl. rentals). Sold hosted (monthly), licensed (annual), or self-host
(one-time). Lives under `/home/kevin/codeonline/tpos`, served at `https://codeonline.io/tpos/`.
Git repo root: `/home/kevin/codeonline` (branch `main`).

> This file + `docs/` capture everything needed to continue. Read them before resuming.

## Read these in order
1. [docs/00-status-and-todo.md](docs/00-status-and-todo.md) — **what's done, what's next (START HERE)**
2. [docs/01-document-plan.md](docs/01-document-plan.md) — the three-document structure & what goes where
3. [docs/02-architecture-decisions.md](docs/02-architecture-decisions.md) — proposed backend stack, scaling, real-time
4. [docs/03-frontend-stack.md](docs/03-frontend-stack.md) — frontend/UX technology discussion (JS vs Rust/WASM, Leptos vs Dioxus, data-grid filtering, real-time)
5. [docs/04-research-findings.md](docs/04-research-findings.md) — cited research: security/compliance, accounting export, onboarding, formulas
6. [docs/06-rental-research.md](docs/06-rental-research.md) — trailer-rental research + what was added where
6. [docs/05-build-and-render.md](docs/05-build-and-render.md) — how to render the PDFs, file inventory, environment
7. `docs/_moved-architecture-appendices.html` — raw HTML of the old API/Performance/Architecture-Decisions appendices (lift into the **Proposal**)
8. `docs/_moved-bid-appendices.html` — raw HTML of the old Scope/Integration-register/RACI/Estimate/Delivery-stages appendices (lift into the **Bid & Delivery Pack**)

## The one-paragraph status
The deliverable is being split into **three documents**. **(1) Product Specification** =
requirements only, technology-neutral — **DONE & committed** (`spec/spec.html` → `spec/TPOS-Product-Specification.pdf`,
v2.0, 40pp, appendices A–F). **(2) Functional Specification Proposal** (requirement → proposed
technical solution + stack discussions) and **(3) Bid & Delivery Pack** (scope, integration
register, RACI, estimate, delivery stages) are **NOT yet built** — that's the next task. The raw
content to build them from is preserved in `docs/_moved-*.html`. See `docs/00-status-and-todo.md`.

## Conventions
- HTML→PDF docs are self-contained print-styled HTML rendered with headless Chromium (Playwright). See `docs/05-build-and-render.md`.
- Commit messages end with the current model's co-author footer (now: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`).
- Never commit secrets / `apid/.env` / `apid/data/` / `node_modules`.
