# 02 · Architecture decisions (proposed backend stack + scaling + real-time)

These are the **recommended** technical solutions (advisory — build team owns the call). They lived
in the old Appendices C/D and now belong in the **Proposal**. Full prose + the "roads not taken"
table + citations are in `docs/_moved-architecture-appendices.html`.

## The 14 decisions (summary)
1. **Prototype persistence** — flat JSON + in-browser mock (UI/IA demo only; only the storefront
   lead endpoint is live, via `apid`).
2. **Production DB** — **PostgreSQL** (hosted) + **SQLite** per self-host tenant behind one
   data-access layer. NoSQL rejected (domain is intensely relational; needs transactions + joins).
3. **Multi-tenant isolation** — **shared schema + Row-Level Security**, `tenant_id` on every table.
   Rejected DB-per-tenant (density/ops), schema-per-tenant (migration complexity), app-filter-only
   (one forgotten WHERE leaks data — isolation belongs in the DB).
4. **Service topology** — **modular monolith** (one deployable). Microservices rejected: self-host
   wants one artifact, small team, network hops hurt DB-bound latency.
5. **App framework** — **Django/DRF** (pragmatic) or **NestJS + Next.js** (JS-first).
6. **Media storage** — **S3-compatible object storage** (MinIO for self-host); blobs-in-DB rejected.
7. **Storefront rendering** — **SSR + edge/CDN cache** of available inventory (SEO + first paint).
8. **Runtime under perf-primary** [REVISED] — async/light-concurrency (Go/.NET/Elixir); **Rust not
   required** — for DB-bound CRUD the runtime barely moves throughput (framework gaps collapse once
   Postgres is in the loop; TechEmpower DB rounds).
9. **RLS under perf-primary** [REVISED] — **keep RLS** + `tenant_id`-leading composite indexes.
   The 100× penalty is the *missing index*, not RLS (~0.3 ms at 50 M rows/10 K tenants indexed;
   ~1–5% overhead).
10. **Sharding** [REVISED] — single node + replicas; **defer Citus**; keep schema shard-ready.
11. **Partitioning** — **HASH(tenant_id)** into 16–64 fixed partitions on the largest tables only.
    NOT list/partition-per-tenant (planner blowup).
12. **Connection mgmt** — **PgBouncer transaction-pooling** (~3–5 conns/core) + **`SET LOCAL
    app.tenant_id` per transaction** (session `SET` silently breaks the RLS var under txn pooling).
13. **Data access** — **thin typed SQL** (sqlx/sqlc/Dapper/Ecto) on hot paths; ORM for cold CRUD.
14. **Dashboard reads** — **materialized views / rollups (CQRS-lite)** + replicas + cache (O(1)
    indexed read, not per-request fan-out join).

## Scaling ladder (earn each step)
Vertical + PgBouncer → add read replicas → hash-partition the few largest tables → only then
Citus co-located by `tenant_id`. Vanilla Postgres + replicas goes much further than teams expect.

## Performance dimensions (lever order depends on the goal)
- **p99 read latency** → materialized read models → cache → `tenant_id`-leading indexes → replicas.
- **Write throughput** → index discipline → prepared statements/batching → hash-partition → pool sizing.
- **Tenants per server (density)** → PgBouncer txn pooling → edge-offload storefront → shared-schema low footprint → async runtime.

## Real-time updates (NEW requirement — needs a solution in the Proposal)
The spec now requires others' changes to appear **within ~1–2 s without refresh or polling delay.**
Proposed approach (to write up): a **server-push channel** (WebSocket or SSE) per tenant/topic, fed
by a **change feed** — e.g. Postgres `LISTEN/NOTIFY` or logical replication → an in-process pub/sub
→ push to subscribed clients; scope every channel by `tenant_id`. Invalidate the CQRS read models
on the same events. Avoid client polling. Note the density implication (many long-lived connections
favor an async runtime — ties to decision #8/#12).

> Caveat to carry forward: the RLS timing figures are a single-practitioner benchmark and the
> single-node thresholds are partly vendor framing — present as order-of-magnitude; "benchmark
> your own queries." Sources are listed in the moved-architecture HTML (§D.2).
