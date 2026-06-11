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
CREATE TYPE unit_status     AS ENUM ('incoming','recon','available','pending','sold');
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
  cost numeric(12,2), list_price numeric(12,2), floor_price numeric(12,2),
  acquired_at timestamptz, sold_at timestamptz,
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
  portal_user_id uuid REFERENCES users(id),
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
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id),
  unit_id uuid REFERENCES units(id),
  stage deal_stage NOT NULL DEFAULT 'lead',
  value numeric(12,2), probability int CHECK (probability BETWEEN 0 AND 100),
  salesperson_id uuid REFERENCES users(id),
  financing_status text,
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
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES deals(id), unit_id uuid REFERENCES units(id),
  origin text, destination text, carrier text, driver text,
  status delivery_status NOT NULL DEFAULT 'scheduled', eta date, freight_cost numeric(12,2)
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

-- ----- Row-Level Security: one policy per tenant-scoped table ----------------
-- The app does `SET LOCAL app.tenant_id = '<uuid>'` per transaction (txn-pool safe).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','units','unit_photos','customers','leads','deals','quotes',
      'quote_lines','work_orders','wo_tasks','invoices','payments','titles','documents',
      'deliveries','activities','tasks','notifications']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format($f$CREATE POLICY tenant_isolation ON %I
        USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);$f$, t);
  END LOOP;
END $$;

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

COMMIT;
