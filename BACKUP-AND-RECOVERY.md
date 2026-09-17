# Backup And Recovery

No production database or production backup currently exists. Configure and verify this plan before go-live.

## Required Production Configuration

- Select a Supabase plan that meets the client's backup retention and point-in-time recovery requirements.
- Enable the available daily backup/PITR controls in the PROD project and record the retention window.
- Restrict dashboard/database recovery access to named administrators with MFA.
- Store deployment logs, migration versions, import manifests, and reconciliation sign-offs outside the database.
- Decide and sign off RPO and RTO. Do not infer them from a plan name.

## Before Every Migration

1. Confirm the target project reference is PROD, not DEV.
2. Review `supabase migration list --linked` and `supabase db push --dry-run --linked`.
3. Verify the latest managed backup and its timestamp.
4. For material migrations, create an encrypted logical backup using the approved production database connection and store it in the restricted backup location.
5. Record counts and control totals for inventory, Sales, Payments, outstanding balances, Expenses, DCR, and DTR.
6. Apply during an approved maintenance window when rollback can be completed.

## Restore Procedure

1. Stop frontend writes or place the application in maintenance mode.
2. Preserve logs and capture the failure timestamp and migration version.
3. Restore to a separate recovery project/database first when possible.
4. Validate schema version, Auth linkage, RLS, Edge Functions, row counts, document sequences, and financial/inventory control totals.
5. Point the frontend only after the recovery copy is approved.
6. Run the production smoke test and obtain Owner/Admin reconciliation sign-off.

## Failed Deployment

- Frontend failure: redeploy the previously approved immutable frontend artifact; do not change database state.
- Edge Function failure: redeploy the previous function version and verify login/account workflows.
- Migration failure before commit: PostgreSQL transaction rollback should leave the prior schema; inspect before retrying.
- Migration committed with a defect: prefer a forward corrective migration. Restore only when forward repair cannot preserve integrity.

## Accidental Inventory Change

Do not edit custody balances directly. Freeze affected transactions, identify the lot and movement chain, compare audit events and source documents, and create an approved adjustment through a controlled database procedure. For broad corruption, restore a copy to the point before the incident, calculate legitimate later movements, and replay only approved transactions. Owner/Admin must sign the final inventory reconciliation.

## Verification Schedule

- Daily: confirm backup job/status and investigate failures.
- Monthly: restore a backup to an isolated environment and run reconciliation checks.
- Before each release: verify backup recency and rollback ownership.
- After restore testing: record duration, gaps, and revised RPO/RTO.
