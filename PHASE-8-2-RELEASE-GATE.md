# Phase 8.2 Correction Release Gate

This is a preparation record, not authorization to deploy. No hosted migration, Edge Function, Vercel deployment, or client-data write was performed for Phase 8.2.

## Target And Migration Compatibility

- Branch: `feature/supabase-frontend`; Phase 8.1 checkpoint: `319d7ca9af00ba8f1fabb3b92b0bf357b83a8205` (pushed to origin).
- Hosted DEV: `chicken-distributor-dev`, project `ruoqkitfsuuvqkbtires`. Read-only checks on 2026-10-18 found migrations only through `20261013120155`, no `public.dcr_amendments` or `public.transaction_corrections` table, and zero `daily_cash_reports` rows. Existing amendment count is therefore zero; identical amendment timestamps and chronology backfill are not applicable in current hosted DEV state.
- `20261016180902` creates an empty `dcr_amendments` table before `20261018010000` checks it. Keep the latter's protective nonempty-history guard. Recheck the hosted migration list and amendment count immediately before deployment; if rows appear, stop and design a reviewed chronology backfill, then test it against a restored isolated copy. Never remove the guard to force the migration.

## Required Release Sequence

1. Obtain Owner approval, a maintenance window, release owner, rollback owner, RPO/RTO, and a current restorable hosted backup. Record the Git SHA, database project ref, artifact hash, and baseline inventory/financial control totals.
2. Restore that hosted backup in an isolated project/database and reconcile Auth users, organization membership, stock lots/movements, Sales, Payments/allocations, DCRs, correction/audit history, payroll, and trucks. Verify restore warnings and permissions. A CLI dry-run is not a backup.
3. Verify the project ref twice, compare hosted `supabase_migrations.schema_migrations` with local files, and run `supabase db push --dry-run --linked`. Review the exact pending migrations in this order:
   - `20261015074217_admin_transaction_correction_foundation.sql`
   - `20261016085749_admin_stock_trip_corrections.sql`
   - `20261016093815_admin_transfer_corrections.sql`
   - `20261016162602_admin_sale_corrections.sql`
   - `20261016175246_admin_payment_corrections.sql`
   - `20261016180902_admin_expense_dcr_corrections.sql`
   - `20261017060229_admin_dtr_payroll_truck_corrections.sql`
   - `20261017115758_nonretryable_correction_conflicts.sql`
   - `20261018010000_order_dcr_amendments.sql`
4. Only after approval and the backup gate, apply the reviewed migrations. Check row-level security, execute grants, append-only audit triggers, and correction previews before enabling UI access. Do not reset DEV or run destructive seeds.
5. Deploy the dedicated Edge Functions after their RPCs exist: `admin-stock-trip-correction`, `admin-transfer-correction`, `admin-sale-correction`, `admin-payment-correction`, `admin-finance-correction`, then `admin-operations-correction`. Verify each function's import map, JWT behavior, allowed origins, password reauthentication, rate limit, and Owner-only authorization. Never expose service-role credentials to Vite.
6. Run hosted Owner and Salesman smoke checks with disposable records after separate authorization. Confirm a correction preview/apply/history path, stale-version and replay denials, downstream dependency blocks, inventory and financial reconciliation, and no page/console errors. Preserve real client transactions.
7. Run `npm test`, `npm run build`, and SQL fixtures on the release SHA. Deploy the immutable frontend artifact to the existing Vercel project only after database/Edge checks pass and explicit deployment approval. Verify desktop, tablet, 390px mobile, and the production domain.
8. Reconcile post-deployment stock, valuation, Sales, Payments/allocations, collectibles, locked DCR totals, payroll, and audit/correction counts against the recorded baseline plus authorized QA deltas. Obtain Owner sign-off.

## Isolated Rehearsal Evidence

- Local PostgreSQL and `pg_dump`/`pg_restore`: 17.6. A custom-format local synthetic dump was created at 2026-10-18 06:26:25 UTC inside the disposable PostgreSQL container (`/tmp/phase82-local.dump`), size 881,711 bytes, SHA-256 `2ae824c351d347fa9a910836fae5b73311c9ec207918938f165caee6af8e0eb1`.
- Archive directory was readable. A full blank-database restore stopped on Supabase-managed `realtime.list_changes`, whose `log_min_messages` setting requires platform privileges. This is a platform-object limitation, not an application-table restore success claim.
- A separate application-scope restore of `extensions`, `auth`, `private`, `public`, and `supabase_migrations` into `phase82_app_restore` exited successfully after creating the empty target schemas. `--no-owner --no-acl` means original ownership and grants were not rehearsed. This local container archive is ephemeral, not a durable hosted backup.
- Source and restored control totals matched: 14 Auth users; 6 Trips and lines totaling 104 kg; 6 lots totaling 104 kg; 35 movements totaling 189 kg of movement volume; 10 Sales totaling PHP 1,300; 9 Payments totaling PHP 500; 7 allocations totaling PHP 300; 8 DCR amendments; 56 correction rows; 3 payroll entries totaling PHP 2,400 net; 2 trucks totaling 2,401 km; and 105 audit events.
- Supabase Auth configuration, Edge Function code/secrets, Storage objects, project settings, and platform-managed roles/permissions are not fully proven recoverable by this local logical restore. Export/version and rehearse these separately. A current hosted backup and isolated restore have **not** been obtained for this release.

## Recovery Procedure

1. Stop writes, preserve logs and the failure timestamp, and identify the failing migration/function/frontend SHA.
2. For a frontend-only defect, redeploy the previous immutable Vercel artifact. For an Edge defect, redeploy the previous approved function version and retest authorization. Neither action rewinds database writes.
3. For a committed schema or data defect, prefer a reviewed forward-fix. Never blindly reverse correction/audit rows or disable RLS. Restore the verified hosted backup to a separate recovery project first; reconcile records and legitimate writes after the backup timestamp before any cutover.
4. Validate Auth linkage, policies/grants, Edge secrets, migration versions, stock/custody, ledger/allocations, DCR amendments, payroll, and audit history in the recovery copy. Obtain Owner approval before redirecting the application.

## Gate Status

The code and isolated synthetic workflow gate passed, but **NO-GO for a client-hosted rollout** until a current hosted backup, isolated hosted restore, environment-specific authorization smoke, and explicit deployment approval are completed. No Phase 8.2 deployment was executed.
