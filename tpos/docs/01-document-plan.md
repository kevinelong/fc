# 01 · The three-document structure

The user explicitly chose **three separate documents** (not one combined, not two). The split
principle: **the Specification says WHAT must be true (technology-neutral); the Proposal says HOW
we'd build it; the Bid Pack says scope/cost/delivery.**

## ① Product Specification — `spec/spec.html` (DONE)
Requirements only, **no prescribed technology**. Sections §1–14 + Appendices A–F.
- §1 Vision/business model · §2 Multi-tenancy & deployment modes · §3 Personas/roles (12) ·
  §4 Domain model (one-record-many-lenses) · §5 Lifecycle · §6 Functional spec by role (12, with
  B&W wireframes) · §7 Storefront · §8 Cross-cutting · §9 Reporting/KPIs · §10 Permissions matrix ·
  §11 External integrations (capability-level) · §12 NFRs (neutral; incl. real-time, density,
  responsive) · §13 Acceptance criteria · §14 Glossary.
- Appendix **A** Data Dictionary (logical) · **B** Security/Privacy/Compliance (as *outcome
  requirements*) · **C** Onboarding & Data Import · **D** Derived-Field Formulas · **E**
  Notification & Document Catalog · **F** Accounting-System Export (requirement statement).
- Machine-readable companions already on disk: `spec/schema.sql`, `spec/openapi.yaml` — these are
  **implementation artifacts**; reference them from the **Proposal**, not the Spec.

## ② Functional Specification Proposal — `spec/proposal.html` (TO BUILD)
For each requirement area, **echo the requirement, then give the proposed technical solution.**
Folds in the stack discussions (backend/scaling, frontend/UX, integrations/accounting). This is
where ALL the technology lives. Source material:
- `docs/02-architecture-decisions.md` + `docs/_moved-architecture-appendices.html` (old App. B/C/D).
- `docs/03-frontend-stack.md` (frontend recommendations).
- `docs/04-research-findings.md` (security mechanisms, accounting, integrations).
- `spec/schema.sql`, `spec/openapi.yaml` (the concrete schema & API).
Suggested section flow: Architecture overview → Data & persistence (schema.sql, RLS isolation) →
API design (openapi.yaml) → Frontend & UX → Real-time updates → Scaling & performance →
Security mechanisms → Integrations → Accounting export → (each tied back to the spec requirement
it satisfies).

## ③ Bid & Delivery Pack — `spec/bid-delivery.html` (TO BUILD)
Lift from `docs/_moved-bid-appendices.html` (old Appendices J–N):
MVP Scope Matrix + Roadmap · Integration & Third-Party Register · Assumptions/Delivery-Model/RACI ·
Estimation Worksheet (WBS) · Delivery Stages (Internal demo → GA).

## Naming for the PDFs
- `spec/TPOS-Product-Specification.pdf` (exists)
- `spec/TPOS-Functional-Specification-Proposal.pdf` (to create)
- `spec/TPOS-Bid-and-Delivery-Pack.pdf` (to create)
There is also a one-page `spec/TPOS-Decision-Summary.pdf` / `decision-summary.html` (older
architecture front-sheet) — reconcile or fold into the Proposal.
