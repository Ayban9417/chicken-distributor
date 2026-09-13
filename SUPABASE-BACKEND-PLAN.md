# Supabase Backend Phase 1

## Status

This branch contains the hosted-validated backend foundation only. The React prototype still uses local state and no frontend component imports Supabase. The dedicated development project is active; only its non-secret project ref is recorded here.

Branch: `feature/supabase-backend`

Environment: development only

Project: `chicken-distributor-dev` (`ruoqkitfsuuvqkbtires`)

Organization/region: `Noderno` / `ap-southeast-1`

## Schema Overview

The schema is organization-scoped. Auth users remain in Supabase Auth; `public.profiles` stores display information and `public.organization_memberships` stores active role membership. Supported roles are `owner_admin`, `salesman`, `cashier`, `warehouse`, and `payroll_admin`.

Configuration is normalized as `plants -> plant_products -> plant_product_codes / plant_product_class_types`, with active flags and restrictive foreign keys. Historical Trip, Sale, and inventory rows keep references to inactive configuration instead of being deleted.

The operational chain is:

`Stock Trip -> Stock Trip Line -> Inventory Lot -> Inventory Movement -> Receipt or Sale -> Payment Allocation -> Ledger / Collectibles / DCR`

Supporting foundations cover Customers and customer prices, Expenses, Discrepancies, Audit Events, Trucks, DTR `time_entries`, and conservative Payroll periods/entries.

## Inventory Ledger

Each Stock Trip Line creates one immutable `inventory_lot`. A lot carries its exact Plant, Product, optional Code/Class Type, original quantity, and acquisition cost. `inventory_movements` records positive quantities with `from_*` and `to_*` custody fields. Warehouse and Salesman balances, company stock, and inventory cost value are derived from this ledger, so a sold-out lot remains queryable at zero.

Internal transfers move the same lot and therefore preserve its cost basis. A Sale moves quantity from the assigned Salesman to customer custody and snapshots the lot acquisition cost on `sale_lines`. Free-from-Plant stock has zero acquisition cost and zero COGS.

## Transactional RPCs

The `api` schema contains six `SECURITY DEFINER` functions. They validate `auth.uid()`, organization membership, active role/configuration, quantities, dates, and source custody inside the transaction. Public and anonymous execution is revoked; only `authenticated` receives execute grants.

- `create_stock_trip`: creates the Trip, lines, lots, initial Plant-to-Warehouse movements, and audit event.
- `transfer_warehouse_to_salesman`: locks lots, checks Warehouse availability, creates an RR, and records custody movements.
- `transfer_salesman_to_salesman`: locks lots, checks source custody, creates a TF, and records the internal movement.
- `create_sale`: locks lots, validates exact Salesman inventory, snapshots selling/acquisition costs, creates Sale lines and movements, and optionally records an initial Payment.
- `record_payment`: validates method/reference and allocates a Payment to a target Sale or oldest eligible Sales first.
- `submit_dcr`: aggregates dated non-voided Payments and approved cash-collection expenses, snapshots a locked DCR, and records any difference.

Document numbers use an organization-scoped row in `private.document_sequences`, and client request UUIDs make retried Stock In, transfers, Sales, Payments, and DCR submissions idempotent.

## Payment and DCR Strategy

Payments are separate from Sales. Allocation rows connect a Payment to one or more Sales, never exceed the Payment amount, and never exceed each Sale's open balance. The current prototype policy is retained: pending GCash/Bank payments can be allocated, but their verification state remains `pending` for a later business-policy decision.

DCR expected cash is `cash Payments - approved expenses paid from cash collection`. GCash and Bank are included in the snapshot for reconciliation but excluded from physical expected cash. A locked DCR is never rewritten. Later Payments or Expenses dated to a locked report create `post_dcr_adjustment` discrepancies.

## RLS Strategy

All 33 public business tables have RLS enabled. Anonymous access is revoked and Data API privileges are explicit. Organization membership is checked by safe private helper functions. Owners/Admins receive organization-wide operational visibility; Warehouse sees warehouse and transfer scope; Salesmen see their assigned custody, Sales, Payments, expenses, and DCR; Cashiers see financial collections and customer balances; Payroll access is limited to owner/payroll admin or the employee's own time/pay record.

Critical operational tables have SELECT policies but no direct authenticated write grants. Stock, movements, receipts, Sales, Sale Lines, Payments, allocations, DCR, discrepancies, and audit writes go through the RPCs or privileged future workflows. Views use `security_invoker = true` so their results remain subject to underlying RLS.

## Concurrency

Every affected lot is locked with `FOR UPDATE` in stable UUID order before its custody balance is checked. Two simultaneous Sales or transfers for the same lot therefore serialize: one consumes the available quantity and the other sees the reduced balance and fails rather than overselling. The same stable lock order avoids deadlocks for multi-line requests. Payment allocation locks eligible Sales in oldest-first order. Document sequence rows are incremented atomically.

## Migrations and Seed

- `supabase/migrations/20260913055521_core_schema.sql` creates normalized tables, constraints, indexes, timestamps, and the immutable-ledger foundation.
- `supabase/migrations/20260913055535_transactional_functions_rls_views.sql` creates authorization helpers, RPCs, RLS, grants, triggers, and reporting views.
- `supabase/migrations/20260913063954_hosted_validation_hardening.sql` removes hosted default grants and restores explicit least-privilege access.
- `supabase/seed.sql` contains only development master data: one `Chicken Distributor Demo` organization, Fkidz configuration, products, and C1/H/I/CB code labels. It contains no stock, Sales, Payments, customers, users, or DCR history.
- `supabase/tests/database/backend_test.sql` contains 27 rollback-safe integrity assertions.
- `supabase/tests/database/rls_role_test.sql` contains 10 rollback-safe role and cross-organization isolation assertions.
- `src/types/database.types.ts` is generated from the applied hosted schema.

The local Supabase CLI is initialized for PostgreSQL 17. Docker is not installed on this workstation, so local container reset/test execution is unavailable. All three migrations and the seed are applied to the linked hosted development project. The two pgTAP files were executed directly against that database: all 37 assertions passed. Linked database lint reports no schema errors, the security advisor reports no findings, and real parallel-session Sale and transfer races rejected the second overselling transaction.

## Next Frontend Phase

Frontend integration is explicitly deferred. The next phase should add a Supabase client with a publishable key, establish Auth/profile bootstrap, load master data through RLS, replace one workflow at a time with RPC calls, and keep local fixture mode behind a deliberate development switch. Inventory should migrate first, followed by Stock In and transfers, Sales, Payments/Ledger, DCR, and finally administrative/reporting screens. No service-role key belongs in the browser.

## Deferred Decisions

- Whether pending electronic payments affect customer balances before verification.
- Bags/Head Count apportionment when a partial KG lot moves or sells.
- Hard versus warning-only credit limits.
- Approval authority for expenses and electronic payments.
- Sale voids, returns, refunds, and inventory disposition.
- Inventory count/adjustment approval thresholds.
- Overnight DTR, leave, holidays, and payroll approval rules.
- Philippine SSS, PhilHealth, Pag-IBIG, withholding tax, and other statutory payroll calculations.
- User onboarding/bootstrap ownership flow for the first organization member.
