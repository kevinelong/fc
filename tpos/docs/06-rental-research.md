# 06 · Trailer-rental research digest (cited) — basis for the rentals feature

Added 2026-06-12. Two research threads (operations + contract/accounting). Full detail was
integrated into the documents; this is the durable digest with sources.

## Operations & economics
- **Rate tiers:** weekly ≈ 3× daily, monthly ≈ 3× weekly (configurable; seasonal overrides;
  reefer/harvest spikes). Order-of-magnitude: dry van $25–55/day · $600–800/mo; reefer
  $65–120/day · $1,200–1,800/mo. (LendControl, Booqable, XTRA Lease, COOP, Repowr, CostBrief)
- **Fees:** delivery/pickup, one-way drop ($500–2,000 at XTRA), reefer refuel/washout, mileage
  overage (~$0.10–0.15/mi over allowance), damage items, **holdover ≈ +50% of rate** past term.
- **Lifecycle:** credit + **COI gate before release** → check-OUT inspection (photos, meter) →
  on-rent (extensions, breakdowns) → **off-rent call stops billing; liability runs to physical
  return** → check-IN inspection → damage/deposit itemized → available. Unit sub-states:
  available → reserved → on-rent → (overdue) → in-inspection → available.
- **KPIs (ARA conventions):** **time utilization** = days on rent ÷ available days (healthy
  ~60–75%); **dollar utilization** = annualized rental revenue ÷ **OEC** (~55–65%); fleet age;
  **rental-to-retail pipeline** (XTRA keeps fleet <5 yrs then retails it). (ARA via
  ForConstructionPros, InTempo, Construction Executive, Hapn)
- **RPO / rent-to-own:** % of paid rent credits toward purchase — e.g. 100% of months 1–3 then
  70% to month 12, capped (Luby); variants 80–100% (NMC Cat, Altorfer). Configurable schedule.
- **Renter requirements:** $1M CSL liability naming lessor **additional insured** + physical
  damage naming **loss payee**, COI on file pre-release (Premier); or **damage waiver** at
  ~10–15% of rental charges (Sunbelt RPP 15%; "not insurance"); commercial credit app
  (2+ yrs in business, references); DOT/MC for OTR.
- **Software table stakes:** availability calendar + conflict detection, **cycle billing**
  (calendar-month or 28-day → 13 periods/yr), off-rent processing, telematics/GPS (recovery;
  ARA: theft >$1B/yr, recovery ~85% with tracking vs <25% without), PM scheduling,
  **FMCSA 49 CFR 396.17 annual inspection** per trailer (report kept 14 months).

## Contract / accounting / compliance (HARD rules flagged)
- **ASC 842 lessor [HARD]:** operating-lease rental income **straight-line over the term**
  (842-30-25-11); unit **stays on the lessor's balance sheet and depreciates** (842-30-45-2);
  variable charges (mileage) recognized when incurred; short-term exemption is **lessee-only**.
  **RPO → sales-type lease when exercise "reasonably certain"** (842-10-25-2; ~75%/90%
  benchmarks): derecognize unit, recognize selling profit, remaining income = interest.
  (Deloitte DART, PwC, KPMG, RSM)
- **Deposits [HARD]:** liability until applied/forfeited — never revenue (GAAP + *Commissioner v.
  Indianapolis Power & Light*, 493 U.S. 203). Card pre-auth holds = no GL entry; vehicle/equipment
  MCCs get extended auths (~30 days, incremental allowed). Itemized deduction statement = best
  practice (contract-driven; only residential is statutory).
- **Taxes [HARD, jurisdictional]:** majority of states tax **each rental payment**; some have
  lessor elections (CA Reg 1660/1661 — trailers are "mobile transportation equipment"); trailers
  often follow **motor-vehicle rental tax** (TX: 10% ≤30 days, 6.25% 31–180 days; >180 = lease);
  IL/ME flipped regimes Jan 2025 (IL carves out registered semitrailers). **FET** (12%,
  26 USC 4051/4052): trailers >26,000 lb GVW; a **lease ≥1 yr is the taxable first retail sale**
  (presumed markup 0% for trailers, 26 CFR 145.4052-1); short-term rental fleet FET was due at
  the rental company's purchase. → tax computes per recurring invoice with duration + class inputs.
- **COI tracking:** ACORD 25 fields; certificate "confers no rights" — store **endorsement**
  evidence; expiry alerts + dispatch block is the standard workflow (myCOI/TrustLayer category).
- **OTR rentals [HARD]:** 49 CFR 376 written lease with **exclusive possession** clause; copy
  travels with the unit; renter operates under **its own DOT number**; SAFER is the verification
  source.

## What was added where (2026-06-12)
- **Spec:** 13th role (Rental Manager, §6.11 + wireframe), personas, domain entities (rental
  agreement/rate book/inspection/COI), dual status machine (§4), storefront Rent section (§7),
  Rentals KPI row (§9), permissions Rent column + row (§10), telematics integration (§11),
  acceptance scenario Reserve→rent→return (§13), glossary; App. A (tables/enums), App. B (FMCSA
  row, COI in B.6), App. D.5 rental formulas (+register), App. E rental notifications, App. F
  rental GL buckets/ASC 842 note.
- **schema.sql:** rental_rates, rental_agreements, coi_records, inspections; unit_status rental
  states; units oec/rental_pool/annual_inspection_due; invoices.rental_agreement_id; one-active-
  agreement-per-unit partial unique index; kpi_rentals matview; RLS on all (26 tables).
- **openapi.yaml:** rentals tag + 9 endpoints (incl. gated /transition, inspections multipart,
  rate book, COI, availability, public/portal rentals); rentals in reports enum & events topics;
  webhooks rental.overdue + coi.expiring. 75 paths.
- **asyncapi.yaml:** rentals topic, rental_agreement/coi entity kinds.
- **Proposal:** §3 rental schema bullet, §4 rentals API block, §9 telematics row, §10 ASC 842
  lessor bullet, §12 traceability row.
- **Bid pack:** §2.2 rentals = SHOULD (Phase 2, swap-in rule), roadmap diagram Phase-2 item,
  §5 WBS row 10–18 pw (excluded from the Phase-1 rollup).
