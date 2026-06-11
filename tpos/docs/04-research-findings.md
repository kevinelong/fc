# 04 · Research findings (cited) — security, accounting, onboarding, formulas

Distilled from web research done this session. The spec appendices carry the *requirement* form;
the **Proposal** needs the *solution/options* form below. All figures are order-of-magnitude;
verify primary sources before relying.

## A. Security, privacy & compliance (spec Appendix B = requirements)
- **A trailer dealer that arranges/extends financing is a GLBA "financial institution"** → the FTC
  **Safeguards Rule (16 CFR Part 314)** applies; TPOS is the **§314.4(f) service provider**. These
  are binding law, not optional. The 9-ish required program elements (314.4(a)–(i)): Qualified
  Individual, written risk assessment, access controls, **encryption in transit & at rest**,
  secure SDLC, **MFA**, secure disposal (≤2-yr unused-PII purge, 314.4(c)(6)), change mgmt,
  monitoring/logging, **annual pen test + 6-month vuln assessment** (314.4(d)), training,
  **service-provider oversight by contract** (314.4(f)), incident-response plan (h), annual board
  report (i). §314.6 partial exemption < 5,000 consumers.
- **Breach reporting** — 16 CFR 314.5: notify FTC ≤30 days for ≥500 consumers' *unencrypted* info
  (effective May 2024). Plus the 50-state breach-notification patchwork (notify by affected
  resident's state → store residency).
- **Privacy Rule** 16 CFR 313 / Reg P: notices + opt-out; the **§313.13 service-provider
  exception** (contractual use-restriction) lets the dealer share NPI with TPOS without opt-out.
- **ESIGN/UETA** (15 USC 7001): consumer-consent gate + tamper-evident reproducible records;
  **titles carved out** (per-DMV). **Red Flags Rule** 16 CFR 681 (creditor ID-theft program).
  **ECOA/Reg B** 12 CFR 1002.12: 25-month credit-application retention.
- **Threat model:** STRIDE × asset; **#1 risk = cross-tenant data disclosure** (OWASP API #1
  BOLA/IDOR). **Proposed mechanisms** (stripped from spec, belong in Proposal): app role is
  non-owner/non-superuser/non-BYPASSRLS; `FORCE ROW LEVEL SECURITY`; `SET LOCAL app.tenant_id`
  per-transaction; `WITH CHECK` on writes; CI cross-tenant negative test; **Argon2id** (m=19 MiB,
  t=2, p=1); hardened cookies (`HttpOnly`/`Secure`/`SameSite`/`__Host-`); MFA; scoped short-lived
  tokens; secrets in KMS; TLS + at-rest encryption; magic-byte upload validation; SSRF allow-list.
- **Payments/PCI:** route all card+ACH through a **PCI-L1 processor (Stripe Connect, direct
  charges → each dealer is merchant)**; **tokenize** via hosted fields/iframe so the PAN never
  touches TPOS servers → keeps every dealer at **SAQ A**. PCI DSS v4.0.1 (mandatory Mar 2025) adds
  payment-page script-integrity reqs (6.4.3/11.6.1) even on SAQ A — get the processor's written
  attestation. **NACHA**: don't store full bank account numbers in plaintext (tokenize); WEB-debit
  first-use account validation; retain authorization ≥2 years. Store only token + last4 + brand.
- Sources: ftc.gov / ecfr / Cornell LII (314.4, 314.5, 313, 681), uniformlaws.org, pcisecurity
  standards.org, stripe.com/docs, nacha.org, owasp.org (API Top 10, ASVS cheat sheets), Postgres
  RLS docs, Supabase RLS guidance.

## B. Accounting-system export (spec Appendix F = requirement)
- Dealer base splits **QuickBooks Online (QBO) vs Desktop (QBDT)** — different ingestion paths.
- Options & hard constraints: **IIF** (Desktop only, Intuit-deprecated, doesn't link
  invoice↔payment); **QBO CSV** (invoice import *blocked when sales tax enabled* + 100/upload cap);
  **.QBO/OFX** (bank transactions only — not viable for AR/AP); **qbXML + Web Connector** (Desktop
  automated, heavy); **QBO REST API** (modern, but OAuth2 + **multi-week Intuit production review**
  + ~500 req/min); **summary journal entries** (balanced debit/credit → mapped GL; sidesteps the
  CSV/tax block; strong v1).
- **Recommendation:** ship v1 as **manual on-demand summary-JE export as a downloadable file
  (CSV for Online + IIF for Desktop)** behind a one-time **GL-account-mapping wizard** — needs **no
  OAuth/no Intuit review**, covers both products. Then QBO API push (Phase 2), Web Connector for
  Desktop detail (Phase 3), unified-API aggregator (Codat/Rutter) only at >2 targets (Phase 4).
- **Architecture:** thin **canonical export model + per-target adapters** (Canonical Data Model
  pattern — ~2N adapters not N²; how Codat/Merge work internally). Idempotency: QuickBooks has no
  idempotency key → use invoice number as `DocNumber`, store returned QB `Id`, query-before-insert;
  stamp file exports with batch+date.
- Sources: developer.intuit.com (IIF, CSV, JournalEntry, Batch, app review, rate limits),
  enterpriseintegrationpatterns.com (Canonical Data Model), Merge.dev/Codat docs (treat aggregator
  marketing as directional).

## C. Onboarding & data import (spec Appendix C)
- TTFV governs; CRM/sales products are slowest *because of import friction*; B2B median activation
  ~37.5%; >14-day cohort largely churned. **The import wizard IS the onboarding bottleneck.**
- Provisioning: one automated IaC path branching on plan tier; first admin in central IdP;
  **async billing (non-blocking)**; seed sample data; land on import wizard.
- Import pipeline `file → parse → map → validate → submit`: ~95% fuzzy auto-map; 3-layer validation
  (type/required/enum + referential [units & customers before deals] + dedup by VIN/serial/stock#);
  **errors-vs-warnings** partial commit; downloadable annotated error report; **idempotent on an
  `external_ref` key**; BOM/encoding/date-format handling; chunked async worker.
- Migration: static (units/customers) ahead, dynamic (open deals) at cutover; "drain the line";
  migrate active only + archive history; reconciliation screen (counts + spot-checks); **>0.5%
  count-variance auto-rollback**; one-time migration (live sync out of scope).
- Sources: AWS SaaS Lens (tenant onboarding), OneSchema/Flatfile (import UX), Salesforce Bulk API
  (upsert-by-external-id), LotPulse/P2-Innovate/Concentrus (DMS migration/cutover).

## D. Derived-field formulas (spec Appendix D)
- Biggest ambiguity is the **age clock** → persist five date stamps per unit: `acquired_at`,
  `recon_started_at`, `frontline_ready_at`, `sold_at` (booked), `delivered_at`.
- Conventions: one day-count convention; every "%" declares its denominator (price vs cost vs
  market); one global "sold" trigger (default **delivered**, per ASC 606; deposit = liability).
- Key formulas: Days-on-lot vs Days-to-sell; inventory turn (COGS/avg-value **and** units/avg-units
  variants); total cost basis = acquisition + recon + transport + capitalizable fees; front gross =
  sale − basis − pack; back gross (F&I); margin vs markup (declare denominator); holding cost/day;
  commission = a **rules engine** (flat / %-of-gross-after-pack / mini-floor / tiered); DSO + AR
  aging; revenue recognized at delivery.
- Mark CONFIGURABLE: aging buckets, turn basis, cost-basis inclusions, holding rate (360/365), all
  commission params, conversion attribution window, tax/fee jurisdiction tables, DSO period.
- Sources: NADA, acvmax, NetSuite, Wall Street Prep, Cox Automotive (floor-plan/holding), vAuto
  (market-days-supply), AccountingTools (margin vs markup), RevenueHub/Deloitte (ASC 606).
