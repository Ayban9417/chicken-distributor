# Phase 8.3 Hosted Recovery And Release Preflight

This is a verification record, not approval to deploy. Checked on 2026-10-18 against
`chicken-distributor-dev` (`ruoqkitfsuuvqkbtires`), PostgreSQL 17.6.1.166, from
`feature/supabase-frontend` at base commit `b4542bceb8a2a44bf4342971e1b4a816be534f5b`.
No hosted business rows, migrations, Edge Functions, Vercel deployment, or secrets
were changed. The linked Supabase CLI performed its supported backup operation;
it reported `Initialising login role`, a backup-related administrative step.

## Hosted Backup

Supabase's documented logical-backup route was used: linked `supabase db dump`
for roles, schema, and one snapshot-consistent data dump. The restricted local
directory is outside Git:

- [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups)
- [Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)

`C:\Users\berse\Documents\Chicken Distributor Backups\phase83-20261018`

Only SYSTEM, local Administrators, and the local user have access. The usable
backup set is:

| File | Bytes | Last write UTC | SHA-256 |
| --- | ---: | --- | --- |
| `roles.sql` | 431 | 2026-10-18 10:08:04 | `0decd601faa70260a3a31e8cee63208cc4a4c1f99921bc6f3ed4faf1cd980da3a` |
| `schema-v2.sql` | 408,814 | 2026-10-18 10:43:26 | `1d47f59cdb24fc2f6a475637dfdddc53dfe450d33e8b6dfc33ea0f90c3b210c2` |
| `data-v2.sql` | 664,891 | 2026-10-18 10:43:45 | `e039453d08524b61fb510c3b7845cbc116b654c9ef3873b6aa54d4c9fe1dce14` |

The explicit schema set is `api, public, private, auth, storage, extensions,
supabase_migrations`. The data file contains Auth users, all application tables,
Storage metadata, and migration history. An initial export missed `api`; it was
replaced by the `-v2` set and the incomplete files were removed. The data dump
is internally snapshot-consistent, but the roles/schema/data files were taken
in separate CLI sessions. Hosted migration history and control totals were
unchanged before and after the exports. After restore verification, all three
files were moved out of Temp with unchanged SHA-256 hashes. At release time,
freeze writes where required and take a *fresh* backup; this single-workstation
copy is not encrypted off-site disaster recovery.

The database dump contains Storage metadata, not object bytes. There were zero
`storage.objects` rows at verification. Auth provider settings, JWT/signing
secrets, Edge Function code and secrets, Vercel settings, physical backup/PITR
state, and managed Realtime/GraphQL/Vault objects require separate platform
recovery. Role passwords are not preserved by the logical role export. Do not
commit or transmit these SQL files through Git.

## Restore And Reconciliation

The corrected SQL files restored without error to a blank, isolated local
Supabase PostgreSQL 17.6 database. The local `supabase_admin` role restored
schema/data ownership; the platform roles already existed in the local stack.
The role file was inspected but not replayed over those existing cluster roles.
Restoring as local `postgres` alone initially failed on Supabase-managed Auth
ownership; this is a role limitation, not application-data corruption.

Restored counts and totals matched hosted read-only queries: 4 Auth users, 1
organization, 4 memberships, 20 customers, 5 Plants, 1 Trip with 14 lines and
2,569.300 kg, 14 lots, 67 movements, 14 receiving receipts, 14 Sales totaling
PHP 280,910.50, 4 Payments and 4 allocations totaling PHP 13,200.50 each,
1 DTR, 511 audit events, and 12 migration records. Expenses, DCRs, payroll
entries, trucks, transfers, and Storage objects had zero rows. The 20 customer
balances and 11 collectible rows both reconciled to PHP 267,710.00 outstanding;
18 ledger entries restored. Company, warehouse, and salesman stock views each
reconciled to 0 kg and PHP 0 inventory value. These zeros are observed data,
not proof that a nonempty future dataset is covered by this snapshot.

The restored schema included 32/32 public tables with RLS, 55 policies, 12
`api` RPCs, 239 public constraints, 117 indexes, and 28 custom triggers before
the rehearsal. The dump includes sequence state and constraints. This proves
application-data recovery in a compatible Supabase PostgreSQL stack, not a
standalone rebuild of every managed platform service.

## Migration Rehearsal

The hosted migration list and `supabase db push --dry-run --linked` both show
exactly these nine pending migrations. They were applied in order, each in its
own transaction, to a fresh restored copy as the local `postgres` migration
owner. No migration was applied to hosted DEV.

1. `20261015074217_admin_transaction_correction_foundation.sql`
2. `20261016085749_admin_stock_trip_corrections.sql`
3. `20261016093815_admin_transfer_corrections.sql`
4. `20261016162602_admin_sale_corrections.sql`
5. `20261016175246_admin_payment_corrections.sql`
6. `20261016180902_admin_expense_dcr_corrections.sql`
7. `20261017060229_admin_dtr_payroll_truck_corrections.sql`
8. `20261017115758_nonretryable_correction_conflicts.sql`
9. `20261018010000_order_dcr_amendments.sql`

Rehearsal result: all nine succeeded. Hosted duplicate normalized Trip-reference
groups: 0. Hosted DCR rows: 0; the amendment table/correction ledger do not yet
exist there, so chronology backfill is unnecessary for this snapshot. Keep the
last migration's nonempty-amendment guard and recheck immediately before release.

Phase 3 deliberately backfilled `effective_date` on all 14 receiving receipts;
each equals the original minimum movement date. Phase 7 added attendance fields
to the single DTR row with its existing `present` default. No financial values
were backfilled. Comparing 23 existing business-table row hashes before/after,
excluding only these new columns, found no changed rows. Sales, Payments,
allocations, customer balances, stock, and audit totals were unchanged. After
the rehearsal: 36/36 public tables have RLS, 58 policies exist, all public
constraints are validated, and the Trip-reference index and DCR amendment
identity sequence exist. Both new correction tables are empty. All 331 SQL
assertions passed against the restored, migrated database.

## Authorization Preflight

- Hosted memberships: 1 active Owner/Admin and 3 active Salesmen, all linked to
  active profiles. Warehouse/Cashier membership is absent in this snapshot.
- Hosted RLS: 32/32 public tables enabled, 55 policies. All 12 existing `api`
  RPCs deny anonymous execution and grant authenticated execution. The login
  rate-limit consume/clear RPCs grant service-role execution only.
- Three existing Edge Functions are active: `username-login` has
  `verify_jwt=false` for the credential exchange; `manage-salesman-account`
  and `admin-destructive-action` have `verify_jwt=true`. The six new correction
  Edge Functions are **not deployed**, so their hosted JWT settings and runtime
  authorization cannot yet be verified.
- Hosted Edge secret *names* present: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_ORIGINS`. Values were not read.
  `INTERNAL_AUTH_DOMAIN` was not listed and is not used by the current
  correction authorization code.
- Existing Vercel production project `chicken-distributor-uat` lists
  `VITE_DATA_MODE`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY`. Values
  and the exact project-ref match were not inspected. No service-role key
  belongs in Vite.
- Correction authorization source requires a bearer user, active Owner/Admin
  membership/profile, a fresh current-password verification through Supabase
  Auth, a server-side rate-limit RPC, and a separate transactional RPC role and
  version check. The isolated SQL fixtures cover role denial, organization
  isolation, grants, and audit immutability. These are not substitutes for a
  hosted Owner/Salesman login and correction smoke after approved deployment.

## Release Sequence (Not Executed)

1. Obtain Owner approval, maintenance window, release/rollback owners, RPO/RTO,
   and acceptance criteria. Confirm the exact feature-branch SHA and project ref.
2. Freeze transaction writes if a cross-file backup must represent one point in
   time. Take a fresh hosted logical backup (and record available platform
   physical/PITR recovery points). Store encrypted, access-restricted copies
   outside Git and off this workstation.
3. Hash and inspect the fresh files; restore them to an isolated compatible
   Supabase/PostgreSQL environment. Reconcile Auth, stock/custody, Sales,
   Payments, customer balances, DCR, payroll/DTR, trucks, audit, RLS, grants,
   functions, triggers, sequences, and constraints. Verify Storage bytes and
   platform configuration separately.
4. Recheck hosted migrations, duplicate Trip references, correction objects,
   DCR amendment count and chronology, pending indexes/function signatures,
   RLS/grants, Edge secret names, and Vercel environment target. Run a fresh
   linked dry-run. Stop if the snapshot or pending list differs.
5. Apply only the approved nine migrations in order. Check each result, final
   migration history, RLS/grants, data backfills, and inventory/financial
   control totals before opening correction actions.
6. Deploy the six dedicated correction Edge Functions in this order:
   `admin-stock-trip-correction`, `admin-transfer-correction`,
   `admin-sale-correction`, `admin-payment-correction`,
   `admin-finance-correction`, then `admin-operations-correction`. Explicitly
   verify `verify_jwt=true`, allowed origins, import maps, password/rate-limit
   behavior, service-role custody, and denied Salesman requests.
7. Build and deploy the approved frontend artifact to the existing Vercel
   project only. Confirm its production env targets the intended Supabase ref.
8. With separately approved disposable QA data, run Owner/Admin and Salesman
   smoke tests for preview/apply/history, denied access, stale/replay requests,
   and affected-screen refresh on desktop, tablet, and mobile. Clean QA data
   through an approved procedure.
9. Reconcile stock and valuation, Sales/Payments/allocations, customer balances,
   DCR, payroll, and audit/correction history against the frozen baseline plus
   documented QA deltas. Obtain client acceptance before ending maintenance.

## Recovery Decisions

- Failed migration: stop the sequence and frontend rollout. A failed atomic
  migration needs diagnosis; a committed earlier migration needs a reviewed
  forward fix or isolated restore/cutover. Never blindly reverse DDL or delete
  correction/audit rows.
- Failed Edge deployment or JWT/CORS configuration: retain the previous
  function version or redeploy it, verify grants/Auth, and keep new UI disabled.
  Edge rollback does not reverse database writes.
- Failed frontend deployment or code-only outage: promote the previous known
  Vercel artifact after checking schema compatibility. Do not restore the
  database for a frontend-only defect.
- Incorrect grants/RLS: halt access, compare expected grants in the isolated
  copy, apply a reviewed forward permission fix, and repeat role tests. Do not
  disable RLS as a workaround.
- Data reconciliation failure: freeze writes, preserve logs and current state,
  restore the verified backup to a *separate* recovery environment, account
  for legitimate writes since backup, and obtain Owner approval before cutover.
  In-place restore is not the default recovery action.

## Gate

The hosted application-data backup and isolated migration rehearsal passed.
**NO-GO for client-hosted rollout** until a fresh encrypted off-site backup and
restore, separate platform-object/secret/Storage recovery plan, hosted
Owner/Salesman Auth and authorization smoke, production environment value/ref
validation, and explicit release approval are complete. This task executed
no hosted migration, Edge Function deployment, frontend deployment, or
transaction write.

## Regression

`npm test`: 202/202 passed. `npm run build`: passed, with the existing
non-failing large-chunk warning. The 331 database assertions above ran on the
restored and migrated hosted snapshot, not just on empty local demo data.
