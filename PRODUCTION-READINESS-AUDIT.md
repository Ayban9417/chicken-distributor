# Production Readiness Audit

- Audit date: 2026-09-17
- Branch: `feature/supabase-frontend`
- Baseline: `fc57acae6619682be87c1d5094b7b91f60dfb5dc`
- Target: release candidate only; no production project, merge, or deployment

## Classification

**RELEASE CANDIDATE**

No unresolved BLOCKER or HIGH technical finding remains in the audited scope. Production remains gated by client UAT, production account/configuration, approved opening data, backup settings, and explicit deployment authorization.

## Evidence

- Frontend unit/integration suite: 113 passing; baseline was 108.
- Hosted database role suite: 49/49 assertions passing inside a rolled-back fixture.
- Hosted direct API fixture: anonymous, Owner/Admin, Warehouse, two Salesmen, financial privacy, transfers, Sale, Payment, Expense, DCR, DTR, idempotency, stale-session, and username-enumeration checks passed.
- Disposable hosted fixture cleanup: zero QA organizations, users, and audit rows remaining.
- Migration `20260916151519_harden_production_release_candidate.sql` applied to DEV.
- Hardened Edge Functions deployed to DEV.
- `npm run build` passes.
- Owner/Admin and Salesman local-mode screens pass desktop (1440x960), tablet (768x1024), and mobile (390x844) checks without page-level or primary-control overflow.
- Hosted login passes the same responsive checks; local and hosted browser consoles contain no warnings or errors.

## Architecture Review

The React/Vite frontend keeps local demo and Supabase modes separate. Hosted operations use RLS-backed tables and transactional RPCs. High-risk writes for Stock In, Warehouse transfer, Salesman transfer, Sale, Payment, Expense, DCR, and DTR are server-authorized. Error and loading states are rendered through `useRemote`, screen-level states, and the application error boundary.

The release migration adds a dedicated `get_salesman_workspace` read model. It exposes quantities, selling information, own collections, and operational records without acquisition cost, COGS, profit, or inventory valuation. Direct Salesman reads from `stock_trip_lines`, `inventory_lots`, `sales`, `sale_lines`, payroll, and cost-bearing stock/report views return no rows.

## Fixed Findings

### HIGH: Salesman cost/profit available through direct API

Fixed at the database boundary. Salesman UI data now comes from the safe RPC; underlying cost-bearing policies are Owner/Admin or Warehouse only as appropriate. Hosted direct API attacks verified costs, COGS, profit, valuation, and another Salesman's records are unavailable.

### HIGH: Expense submit lacked backend idempotency

Fixed with `expenses.client_request_id`, an organization-scoped unique index, and idempotent `record_expense`. Replays return the existing result and create one row.

### HIGH: Raw database diagnostics could reach production UI

Fixed. Known operational failures receive useful messages; unknown production errors receive a generic message. Raw details remain available only in development diagnostics.

### HIGH: Login endpoint lacked application-level abuse controls

Fixed with atomic server-side username/IP attempt buckets, generic credential errors, and explicit origin checks. The rate-limit RPC is service-role only.

### HIGH: Expense and configuration audit coverage was incomplete

Fixed for Expense, Plant, Product, Plant/Product link, code, class, Customer, and Customer Price changes. Existing account, inventory, Sale, Payment, DCR, discrepancy, and DTR correction events remain intact. Ordinary users have no audit update/delete grant.

## Security And Integrity Results

- **Anonymous:** business tables and privileged RPCs denied.
- **Owner/Admin:** full authorized configuration, stock, financial, reporting, and account access retained.
- **Warehouse:** Warehouse view and Warehouse-to-Salesman transfer allowed; Stock In, Payments, Plant changes, payroll, and profitability denied.
- **Salesman:** own safe inventory, Sales, Payments, Expenses, transfers, DCR, and DTR allowed; other Salesman data, company inventory/cost/profit, Stock In, Plant changes, role escalation, user creation, arbitrary movement, arbitrary DTR timestamps, and locked DCR edits denied.
- **Cashier:** remains inactive legacy compatibility only.
- **Inventory:** transactional functions lock custody balances and reject insufficient stock. Hosted fixture reconciled original stock to Warehouse, Salesman, sold, and transferred quantities.
- **Payments:** allocation locks Sale balances, rejects over-allocation, requires electronic references, and supports partial/full payment.
- **Documents:** organization-scoped unique keys protect request IDs and Trust Receipts; `next_document_number` uses atomic upsert semantics.
- **DCR:** one organization/Salesman/date report, advisory transaction lock, immutable submission, and post-lock discrepancy trigger.
- **DTR:** database clock in Asia/Manila, duplicate-safe Time In/Out, direct Salesman timestamp writes denied, Owner correction reason and before/after audit required.

## BLOCKERS

None in the release-candidate code.

## HIGH

None unresolved.

## MEDIUM

- Supabase leaked-password protection is disabled in DEV. Enable it in PROD before account onboarding.
- Supabase password Auth includes an opaque synthetic email identifier in the authenticated user's session/JWT. It is not a real customer email and is never shown by the application, but complete removal requires a different Auth identifier strategy.
- Local zero-to-current `supabase db reset`/pgTAP could not run because Docker/Postgres is unavailable. Migration ordering was reviewed, linked dry-run passed, the additive migration applied to DEV, and hosted pgTAP-equivalent checks passed.
- Several low-frequency RLS policies still trigger Supabase `auth_rls_initplan` and multiple-permissive-policy performance advisories. These are not correctness failures; optimize after production-volume query evidence.
- Some screens intentionally load an organization-wide working set. Supabase `max_rows=1000` limits payload size, but report pagination/archiving should be scheduled before data approaches that threshold.

## LOW

- The database advisor still reports unindexed foreign keys outside current high-growth query paths. Targeted indexes were added for Salesman/date, Sale product, Expense, Payment, discrepancy, and movement access; remaining indexes should follow measured plans.
- `complete_own_password_change` is intentionally an authenticated `SECURITY DEFINER` function. It validates `auth.uid()`, active membership, and updates only the caller's flag; the advisor warning is accepted and documented.
- Login rate-limit buckets are retained for one day and opportunistically cleaned. Monitor table growth after launch.

## CLIENT DECISIONS

- Production Supabase plan, region, backup retention, PITR, RPO, and RTO.
- Final password policy and whether leaked-password protection is mandatory for every account.
- Approved production origin/domain and support contacts.
- Opening inventory cutover timestamp and responsible signatories.
- Whether historical outstanding balances are imported as opening receivables or reconstructed from historical invoices/payments.
- DCR approval/escalation policy and permitted post-lock corrections.
- Data retention periods for audit, DTR, financial, and operational records.
- Whether Trucks and Payroll are in initial production scope.

## Production Gates

1. Client completes `CLIENT-UAT-CHECKLIST.md` and signs the reconciliation.
2. A dedicated PROD Supabase project is created; DEV values are not reused.
3. Backups, leaked-password protection, allowed origins, and monitoring are configured.
4. Migrations are applied to empty PROD without `supabase/seed.sql`.
5. Approved master/opening data is imported and reconciled.
6. Production smoke test and backup verification pass before business use.
