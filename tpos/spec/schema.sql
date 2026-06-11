-- =============================================================================
-- TPOS — reference relational schema (PostgreSQL 15+)
-- Hosted multi-tenant with Row-Level Security. Self-host single-tenant: run the
-- same DDL; RLS is a no-op when the connection role bypasses it, or skip the
-- policy block. Tenant scoping at runtime is per-transaction:
--     SET LOCAL app.tenant_id = '<tenant-uuid>';
-- (SET LOCAL, not session SET, so it survives PgBouncer transaction pooling.)
-- Generated from the spec Appendix A. Conventions: uuid PKs, tenant_id on every
-- business table, numeric(12,2) money, jsonb for flexible attributes, audit on
-- mutate via the `activities` table.
-- =============================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;       -- gen_random_uuid()

-- ----- enumerations (match spec Appendix A) ---------------------------------
CREATE TYPE unit_status     AS ENUM ('incoming','recon','available','reserved','on_rent','in_inspection','pending','sold');
CREATE TYPE lead_status     AS ENUM ('new','working','quoted','won','lost');
CREATE TYPE deal_stage      AS ENUM ('lead','quoted','negotiation','financing','delivery','won','lost');
CREATE TYPE wo_status       AS ENUM ('open','in_progress','waiting_parts','done');
CREATE TYPE invoice_kind    AS ENUM ('ar','ap');
CREATE TYPE invoice_status  AS ENUM ('paid','due','overdue');
CREATE TYPE title_status    AS ENUM ('in_hand','applied','pending','lien_release');
CREATE TYPE delivery_status AS ENUM ('scheduled','en_route','delivered');
CREATE TYPE tenant_plan     AS ENUM ('starter','growth','enterprise','license');
CREATE TYPE tenant_status   AS ENUM ('active','trial','licensed','suspended');
CREATE TYPE quote_line_kind AS ENUM ('price','prep','freight','tax','fee');
CREATE TYPE rental_status    AS ENUM ('reserved','on_rent','off_rent','in_inspection','closed','cancelled');
CREATE TYPE maintenance_plan AS ENUM ('full_service','net');
CREATE TYPE deposit_state    AS ENUM ('held','applied','refunded');

-- ----- control plane (NOT tenant-scoped; hosted mode) -----------------------
CREATE TABLE tenants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  plan         tenant_plan   NOT NULL DEFAULT 'starter',
  status       tenant_status NOT NULL DEFAULT 'trial',
  domain       text UNIQUE,                         -- storefront host
  branding     jsonb NOT NULL DEFAULT '{}',
  lots         jsonb NOT NULL DEFAULT '[]',
  billing_ref  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan         tenant_plan NOT NULL,
  mrr          numeric(12,2) NOT NULL DEFAULT 0,
  seats        int NOT NULL DEFAULT 1,
  status       text NOT NULL DEFAULT 'active',
  provider_ref text,
  started_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE usage_metrics (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period    date NOT NULL,
  units int DEFAULT 0, leads int DEFAULT 0, storefront_views int DEFAULT 0, api_calls bigint DEFAULT 0,
  PRIMARY KEY (tenant_id, period)
);
CREATE TABLE license_keys (
  key text PRIMARY KEY, owner text, plan tenant_plan NOT NULL,
  seats int NOT NULL DEFAULT 1, expires_at timestamptz
);

-- ----- tenant-scoped business tables ----------------------------------------
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  password_hash text,
  roles text[] NOT NULL DEFAULT '{}',               -- e.g. {sales,sales_manager}
  lot_scope text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  last_login timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

CREATE TABLE units (                                -- inventory: the spine
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stock_no text NOT NULL,
  type text NOT NULL, year int, make text, length text, axles text, capacity text, condition text,
  status unit_status NOT NULL DEFAULT 'incoming',
  lot text,
  cost numeric(12,2), recon_cost numeric(12,2) NOT NULL DEFAULT 0,
  transport_cost numeric(12,2) NOT NULL DEFAULT 0,                  -- total cost basis = cost + recon + transport (App. D)
  list_price numeric(12,2), floor_price numeric(12,2),
  acquired_at timestamptz, recon_started_at timestamptz,            -- the five date clocks (spec App. D)
  frontline_ready_at timestamptz, sold_at timestamptz, delivered_at timestamptz,
  external_ref text,                                                -- legacy/DMS key; import idempotency (spec App. C)
  oec numeric(12,2),                                                -- original equipment cost (dollar utilization)
  rental_pool boolean NOT NULL DEFAULT false,                       -- unit is in the rental fleet
  annual_inspection_due date,                                       -- FMCSA 49 CFR 396.17
  views int NOT NULL DEFAULT 0, lead_count int NOT NULL DEFAULT 0,
  specs jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, stock_no)
);
CREATE TABLE unit_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  url text NOT NULL, sort int DEFAULT 0, is_cover boolean DEFAULT false
);

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL, company text, phone text, email text,
  address1 text, address2 text, city text, state text, zip text,    -- state = residency, drives per-state breach notice (App. B)
  portal_user_id uuid REFERENCES users(id),
  external_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL, company text, source text,
  interest_unit_id uuid REFERENCES units(id),
  status lead_status NOT NULL DEFAULT 'new',
  owner_id uuid REFERENCES users(id),
  value numeric(12,2), phone text, email text, lost_reason text,
  external_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id),
  unit_id uuid REFERENCES units(id),
  stage deal_stage NOT NULL DEFAULT 'lead',
  value numeric(12,2), probability int CHECK (probability BETWEEN 0 AND 100),
  sale_price numeric(12,2), fees numeric(12,2), taxes numeric(12,2), -- gross inputs (App. D):
  pack numeric(12,2), back_gross numeric(12,2),                      -- front gross = sale_price − unit cost basis − pack
  salesperson_id uuid REFERENCES users(id),
  financing_status text,
  external_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES deals(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES units(id),
  total numeric(12,2), valid_until date, status text DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE quote_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  kind quote_line_kind NOT NULL, label text, amount numeric(12,2) NOT NULL
);

CREATE TABLE work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES units(id),
  type text, status wo_status NOT NULL DEFAULT 'open',
  technician_id uuid REFERENCES users(id),
  hours_est numeric(6,1), hours_actual numeric(6,1) DEFAULT 0,
  parts_cost numeric(12,2) DEFAULT 0,
  opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz
);
CREATE TABLE wo_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  label text NOT NULL, done boolean DEFAULT false, sort int DEFAULT 0
);

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind invoice_kind NOT NULL,
  customer_id uuid REFERENCES customers(id), vendor text,
  deal_id uuid REFERENCES deals(id), unit_id uuid REFERENCES units(id),
  amount numeric(12,2) NOT NULL,
  status invoice_status NOT NULL DEFAULT 'due',
  issued_at timestamptz NOT NULL DEFAULT now(), due_at date, note text
);
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL, method text, reference text,
  recorded_by uuid REFERENCES users(id),
  verified_by uuid REFERENCES users(id),            -- dual-control: REQUIRED for cash >= tenant threshold (spec §10)
  paid_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, reference)                     -- idempotency on external ref
);

CREATE TABLE titles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES units(id),
  status title_status NOT NULL DEFAULT 'pending', state text, lien_holder text, released_at timestamptz,
  UNIQUE (unit_id)
);
CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES deals(id), unit_id uuid REFERENCES units(id),
  kind text, url text, signer text, sign_request_id text, signed_at timestamptz,
  countersigner text, countersigned_at timestamptz, -- employee + customer attestation (spec §10)
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES deals(id), unit_id uuid REFERENCES units(id),
  origin text, destination text, carrier text, driver text,
  status delivery_status NOT NULL DEFAULT 'scheduled', eta date, freight_cost numeric(12,2)
);

CREATE TABLE rental_rates (                          -- the rate book (seasonal rows override base)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type text NOT NULL, lot text,
  daily numeric(12,2), weekly numeric(12,2), monthly numeric(12,2),
  mileage_allowance int, mileage_overage numeric(6,3),
  season_start date, season_end date,                -- NULL = base rate
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE coi_records (                           -- certificate of insurance; expiry gates check-out
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  insurer text, policy_no text,
  liability_limit numeric(12,2), physical_damage boolean NOT NULL DEFAULT false,
  additional_insured boolean NOT NULL DEFAULT false, loss_payee boolean NOT NULL DEFAULT false,
  effective_at date, expires_at date NOT NULL,
  document_id uuid REFERENCES documents(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE rental_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id),
  unit_id uuid NOT NULL REFERENCES units(id),
  status rental_status NOT NULL DEFAULT 'reserved',
  start_at timestamptz, end_at timestamptz,
  off_rent_at timestamptz, returned_at timestamptz,  -- billing stops at off_rent; liability runs to returned
  billing_cycle text NOT NULL DEFAULT 'calendar_month',  -- or 'cycle_28'
  rate_daily numeric(12,2), rate_weekly numeric(12,2), rate_monthly numeric(12,2),  -- snapshot at signing
  mileage_allowance int, mileage_overage numeric(6,3), miles_out int, miles_in int,
  deposit_amount numeric(12,2), deposit_kind text,   -- cash | card_hold (hold = no GL entry)
  deposit_state deposit_state,
  waiver_elected boolean NOT NULL DEFAULT false, waiver_pct numeric(5,2),
  coi_id uuid REFERENCES coi_records(id),            -- required unless waiver_elected
  maintenance_plan maintenance_plan NOT NULL DEFAULT 'full_service',
  holdover_pct numeric(5,2) NOT NULL DEFAULT 50,
  casualty_value numeric(12,2), return_lot text,
  rpo boolean NOT NULL DEFAULT false,                -- rental purchase option
  rpo_credit_schedule jsonb,                         -- e.g. [{months:"1-3",pct:100},{months:"4-12",pct:70}]
  rpo_cap_months int, rpo_option_price numeric(12,2),
  telematics_consent boolean NOT NULL DEFAULT false,
  external_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES units(id),
  rental_agreement_id uuid REFERENCES rental_agreements(id),
  kind text NOT NULL,                                -- check_out | check_in | annual_fmcsa
  hub_miles int, reefer_hours numeric(8,1),
  checklist jsonb NOT NULL DEFAULT '{}', photos jsonb NOT NULL DEFAULT '[]',
  inspector_id uuid REFERENCES users(id),
  at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE consent_records (                       -- e-sign consent (ESIGN/UETA; spec App. B)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id uuid REFERENCES documents(id),
  signer_name text NOT NULL, signer_email text,
  consent_text_version text NOT NULL,
  document_hash text NOT NULL,                       -- tamper evidence
  ip text, user_agent text,
  consented_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz
);
CREATE TABLE retention_policies (                    -- disposal floors vs the 2-yr default (App. B)
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  record_type text NOT NULL,                         -- e.g. credit_application (25-mo ECOA floor), title_doc
  min_keep_months int NOT NULL,
  purge_after_months int,
  PRIMARY KEY (tenant_id, record_type)
);
CREATE TABLE export_batches (                        -- accounting export idempotency (spec App. F)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  target text NOT NULL,                              -- e.g. quickbooks_csv | quickbooks_iif | qbo_api
  params jsonb NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE export_batch_items (                    -- marks records as exported; re-export = no duplicates
  batch_id uuid NOT NULL REFERENCES export_batches(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type text NOT NULL, entity_id uuid NOT NULL,
  PRIMARY KEY (batch_id, entity_type, entity_id)
);

CREATE TABLE activities (                            -- immutable audit log
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type text NOT NULL, entity_id uuid NOT NULL,
  actor_id uuid REFERENCES users(id), action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assignee_id uuid REFERENCES users(id), title text NOT NULL, due_at timestamptz,
  done boolean DEFAULT false, link_type text, link_id uuid
);
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id), kind text, payload jsonb NOT NULL DEFAULT '{}',
  read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoices ADD COLUMN rental_agreement_id uuid REFERENCES rental_agreements(id);

-- ----- indexes: every hot index LEADS with tenant_id (makes RLS ~free) -------
CREATE INDEX ix_units_tenant_status   ON units      (tenant_id, status);
CREATE INDEX ix_units_tenant_acquired ON units      (tenant_id, acquired_at);
CREATE INDEX ix_leads_tenant_status   ON leads      (tenant_id, status, created_at DESC);
CREATE INDEX ix_leads_tenant_owner    ON leads      (tenant_id, owner_id);
CREATE INDEX ix_deals_tenant_stage    ON deals      (tenant_id, stage);
CREATE INDEX ix_deals_tenant_sales    ON deals      (tenant_id, salesperson_id);
CREATE INDEX ix_wo_tenant_status      ON work_orders(tenant_id, status);
CREATE INDEX ix_inv_tenant_status     ON invoices   (tenant_id, status, due_at);
CREATE INDEX ix_pay_tenant_invoice    ON payments   (tenant_id, invoice_id);
CREATE INDEX ix_deliv_tenant_status   ON deliveries (tenant_id, status);
CREATE INDEX ix_act_tenant_entity     ON activities (tenant_id, entity_type, entity_id, at DESC);
CREATE INDEX ix_tasks_tenant_assignee ON tasks      (tenant_id, assignee_id, done);
-- import idempotency: one legacy key per tenant per entity (NULLs exempt)
CREATE UNIQUE INDEX ux_units_tenant_extref     ON units     (tenant_id, external_ref) WHERE external_ref IS NOT NULL;
CREATE UNIQUE INDEX ux_customers_tenant_extref ON customers (tenant_id, external_ref) WHERE external_ref IS NOT NULL;
CREATE UNIQUE INDEX ux_leads_tenant_extref     ON leads     (tenant_id, external_ref) WHERE external_ref IS NOT NULL;
CREATE UNIQUE INDEX ux_deals_tenant_extref     ON deals     (tenant_id, external_ref) WHERE external_ref IS NOT NULL;
CREATE INDEX ix_expitems_tenant_entity ON export_batch_items (tenant_id, entity_type, entity_id);
CREATE INDEX ix_rentals_tenant_status ON rental_agreements (tenant_id, status, end_at);
CREATE UNIQUE INDEX ux_rentals_tenant_extref ON rental_agreements (tenant_id, external_ref) WHERE external_ref IS NOT NULL;
CREATE INDEX ix_coi_tenant_expiry     ON coi_records (tenant_id, expires_at);
CREATE INDEX ix_insp_tenant_unit      ON inspections (tenant_id, unit_id, at DESC);
-- one active agreement per unit at a time
CREATE UNIQUE INDEX ux_rentals_unit_active ON rental_agreements (tenant_id, unit_id)
  WHERE status IN ('reserved','on_rent','off_rent','in_inspection');

-- ----- Row-Level Security: one policy per tenant-scoped table ----------------
-- The app does `SET LOCAL app.tenant_id = '<uuid>'` per transaction (txn-pool safe).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','units','unit_photos','customers','leads','deals','quotes',
      'quote_lines','work_orders','wo_tasks','invoices','payments','titles','documents',
      'deliveries','rental_rates','rental_agreements','coi_records','inspections',
      'consent_records','retention_policies','export_batches','export_batch_items',
      'activities','tasks','notifications']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);  -- even the table owner is policed (App. B)
    EXECUTE format($f$CREATE POLICY tenant_isolation ON %I
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);$f$, t);
  END LOOP;
END $$;

-- ----- append-only guards: the audit log & consent records are immutable -----
-- (run as the migration role; the app role gets INSERT/SELECT only)
REVOKE UPDATE, DELETE ON activities, consent_records FROM PUBLIC;

-- ----- example materialized read model (CQRS-lite) for dashboards -----------
-- Refresh incrementally from the background worker (REFRESH MATERIALIZED VIEW
-- CONCURRENTLY) instead of aggregating on every dashboard request.
CREATE MATERIALIZED VIEW kpi_inventory AS
SELECT tenant_id,
       count(*) FILTER (WHERE status <> 'sold')                         AS units_in_stock,
       count(*) FILTER (WHERE status = 'available')                     AS available,
       coalesce(sum(list_price) FILTER (WHERE status = 'available'),0)  AS inventory_value,
       coalesce(sum(cost) FILTER (WHERE status <> 'sold'),0)            AS inventory_cost,
       coalesce(avg(EXTRACT(day FROM now() - acquired_at))
                FILTER (WHERE status = 'available'),0)::int             AS avg_days_on_lot
FROM units GROUP BY tenant_id;
CREATE UNIQUE INDEX ON kpi_inventory (tenant_id);

CREATE MATERIALIZED VIEW kpi_rentals AS
SELECT t.tenant_id,
       count(*) FILTER (WHERE u.rental_pool)                                        AS fleet_units,
       count(*) FILTER (WHERE u.status = 'on_rent')                                 AS on_rent,
       count(*) FILTER (WHERE r.status = 'on_rent' AND r.end_at < now())            AS overdue,
       count(*) FILTER (WHERE c.expires_at < now() + interval '30 days')            AS coi_expiring_30d,
       round(100.0 * count(*) FILTER (WHERE u.status = 'on_rent')
             / NULLIF(count(*) FILTER (WHERE u.rental_pool), 0), 1)                 AS pct_fleet_on_rent
FROM (SELECT DISTINCT tenant_id FROM units) t
LEFT JOIN units u  ON u.tenant_id = t.tenant_id
LEFT JOIN rental_agreements r ON r.tenant_id = t.tenant_id AND r.unit_id = u.id
       AND r.status IN ('reserved','on_rent','off_rent','in_inspection')
LEFT JOIN coi_records c ON c.tenant_id = t.tenant_id AND c.id = r.coi_id
GROUP BY t.tenant_id;
CREATE UNIQUE INDEX ON kpi_rentals (tenant_id);

COMMIT;
