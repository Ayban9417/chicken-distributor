# Phase 8.4 Production Release Readiness

Checked 2026-10-19 on `feature/supabase-frontend` at
`9c22edb35acf0a53cfb8ccd9fefc17029a659030`. This is a preparation and
verification record, **not authorization to release**. The Phase 8.3 evidence
and migration rehearsal are in [PHASE-8-3-RELEASE-PREFLIGHT.md](PHASE-8-3-RELEASE-PREFLIGHT.md).
No hosted migration, Edge Function, frontend deployment, or business-data write
was performed for this phase.

## Target And Evidence

- Linked Supabase project: `chicken-distributor-dev`, ref
  `ruoqkitfsuuvqkbtires`, organization `knqnrufpakeczonytkbk`, region
  `ap-southeast-1`, PostgreSQL `17.6.1.166`, `ACTIVE_HEALTHY` at check time.
- Existing Vercel project: `chicken-distributor-uat`, project ID
  `prj_z8PA4FRRXfsKRg7JcKVTsAvKarsn`, team ID
  `team_tinm8UNWV74zMv1dsZCZqvch`, production domain
  `https://chicken-distributor-uat.vercel.app/`. No new project is permitted.
- Local `.env.local` names are `VITE_DATA_MODE`, `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`, and `VERCEL_OIDC_TOKEN`. Values were not printed.
  In-memory comparison found local mode `supabase`, URL matching the linked
  Supabase ref, and a nonempty public key. `.env.local`, `.vercel`, and
  `supabase/.temp` are Git-ignored.
- The Vercel production environment lists the three expected `VITE_*` names.
  Its read-only CLI listing returns encrypted blobs for the values, so the
  actual production mode and URL/ref match are **not verified**. An operator
  must inspect them privately before release. Never place a service-role key
  or a correction password in any `VITE_*` variable: Vite bundles these into
  browser code.
- Hosted migration history still has 12 applied entries. The nine correction
  migrations below are still pending. Hosted Edge Functions remain the three
  existing ones (`username-login`, `manage-salesman-account`, and
  `admin-destructive-action`); none of the six correction functions is live.
  Hosted read-only counts at this check: 4 Auth users, 0 Storage buckets, and
  0 Storage objects. These counts must be refreshed at the release window.
- The repo's `supabase/config.toml` configures **local** Supabase. Its Auth
  URLs and settings are not evidence of the hosted Auth configuration.

## Recoverable Asset Inventory

| Asset | Evidence now | Separate recovery requirement | Gate |
| --- | --- | --- | --- |
| PostgreSQL application data, Auth rows, Storage metadata, RLS, functions, triggers, grants, migration history | Phase 8.3 restricted local logical backup restored and reconciled in isolated PostgreSQL 17.6 | Fresh write-consistent backup, encrypted off-site copy, isolated off-site restore and hash/control-total proof | **BLOCKED** |
| Supabase project configuration | Project ref, region and DB version checked; local config tracked in Git | Record hosted API exposure, extensions, backups/PITR entitlement, network restrictions, webhooks, publications, and platform-managed settings in an encrypted operator vault; confirm recovery owner | **BLOCKED** |
| Supabase Auth configuration | Auth user rows restored; 4 users currently present | Separately capture hosted Site URL, redirects, providers, email/SMTP, templates, rate limits, hooks, MFA policy, JWT signing-key custody and rotation plan. Do not put signing keys or user credentials in the database archive or Git | **BLOCKED** |
| Edge Function code and runtime configuration | Existing and pending function source is in Git; hosted list and `verify_jwt` flags checked for the existing three | Preserve approved source SHA, import maps, deployed version/slug/JWT settings and CORS settings. Six new function runtime settings need post-deployment verification | **BLOCKED** |
| Edge Function secrets | Prior read-only check confirmed names `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_ORIGINS` | Credential custodian confirms values and recovery/rotation procedures in an approved secret manager; never export to Git, logs, or the backup manifest | **BLOCKED** |
| Storage | Hosted DB currently reports 0 buckets and 0 objects; database backup contains metadata, not bytes | Recount at release. If nonempty, separately export object bytes with exact bucket/key/version and hash, encrypt off-site, restore to an isolated project, and reconcile metadata against bytes | **PASS for current empty-state inventory; BLOCKED for future recovery readiness** |
| Vercel production configuration | Linked project ID/domain and three env names checked; value listing is encrypted | Operator privately verifies actual `VITE_DATA_MODE=supabase`, URL ref, public-key provenance, domains, build settings, Git production branch, access controls, and a recoverable encrypted env/config record | **BLOCKED** |

Supabase's [backup documentation](https://supabase.com/docs/guides/platform/backups)
states that database backups contain Storage metadata but not object bytes.
Its [manual backup/restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
also distinguishes platform-managed roles and separate configuration. Auth
settings live in the hosted project's
[Auth configuration](https://supabase.com/docs/guides/auth/general-configuration).
Secret names alone do not prove that their values can be recovered.

## Encrypted Off-Site Backup And Restore Procedure

**Status: BLOCKED.** Phase 8.3 produced a restricted local backup and a
successful isolated restore, but there is no approved external storage
destination, encryption-key custodian, or off-site restore attestation in this
workspace. Do not call the local copy disaster recovery.

1. The Owner names a backup operator and an independent restore verifier,
   approves a private off-site destination, retention/access policy, and a
   password-manager or KMS escrow with a second authorized recovery holder.
   Record only vault item IDs and storage object IDs in the release evidence,
   never the key, password, or SQL contents.
2. At the approved window, record UTC time and source project ref, freeze
   transaction writes for a cross-file-consistent logical export, and make a
   **fresh** roles/schema/data dump of `api`, `public`, `private`, `auth`,
   `storage`, `extensions`, and `supabase_migrations` using the already
   rehearsed Phase 8.3 Supabase CLI method. Keep raw files in an ACL-restricted
   directory outside Git. Inspect exit codes, nonzero sizes, expected tables,
   migration history, and SHA-256 per file. Record the database major version.
   Do not use an unfrozen set of separate dumps as a single point-in-time
   recovery image. Record available platform backup/PITR state separately.
   From the linked project directory, after confirming `supabase/.temp/project-ref`
   is the approved ref, the export sequence is:

   ```powershell
   $backup = 'C:\<approved-outside-Git-backup-folder>'
   $schemas = 'api,public,private,auth,storage,extensions,supabase_migrations'
   supabase db dump --linked --role-only -f "$backup\roles.sql"
   supabase db dump --linked --schema $schemas -f "$backup\schema.sql"
   supabase db dump --linked --data-only --use-copy --schema $schemas -f "$backup\data.sql"
   Get-Item "$backup\roles.sql", "$backup\schema.sql", "$backup\data.sql" |
     Select-Object Name,Length
   Get-FileHash "$backup\roles.sql", "$backup\schema.sql", "$backup\data.sql" -Algorithm SHA256
   ```

   Check each dump's exit code before running the next command. Do not use
   `--password`, `--db-url`, or a plaintext connection string in a shell
   command; use the approved CLI authentication and masked prompt. Store the
   hash manifest outside Git without SQL contents or credentials. Match the
   latest Supabase CLI guidance before the release, especially exclusions for
   any new platform-managed Storage/vector tables.
3. With an approved encryption tool, make one AES-256 encrypted archive with
   encrypted file names. On Windows, the 7-Zip GUI supports this without a
   passphrase in shell arguments/history; enter a newly generated high-entropy
   passphrase from the approved vault in its masked dialog. The operator may
   instead use an enterprise KMS-backed encrypted backup workflow. Restrict
   plaintext access and do not email or paste archive contents or credentials.
4. Hash the encrypted archive. Upload it over TLS to the approved private
   off-site location with versioning/retention and no public link. Independently
   confirm remote size/hash, access policy, object version, and that the backup
   can be downloaded by the designated recovery role. A local encrypted file
   or a successful upload alone does not pass this gate.
5. Download a copy to an isolated recovery machine, compare encrypted hashes,
   decrypt using the escrowed key without logging it, and compare each
   plaintext SHA-256 with the manifest. Restore into a **separate disposable**
   Supabase-compatible PostgreSQL 17 environment, never the hosted project.
   Restore required platform roles/ownership using the documented procedure;
   do not treat managed-object permission warnings as application corruption.
6. Verify table counts and control totals for Trips, lots/movements/custody,
   Sales, Payments/allocations, customer ledger/collectibles, expenses/DCR,
   DTR/payroll, trucks, audit history, Auth users, Storage metadata, migration
   history, sequences, constraints, RLS, policies, grants, triggers, and RPCs.
   Restore any Storage bytes separately and compare bucket/key/version/hash.
   Recheck the hosted source counts at the same freeze point. Record exact
   restore warnings, elapsed time, and achieved RPO/RTO.
7. The independent verifier signs the hash, restore, reconciliation, and
   access-control results. Retain recovery evidence in the approved vault;
   remove temporary plaintext copies under the organization's secure disposal
   procedure. Unfreeze writes only under the release plan. A failed checksum,
   incomplete restore, inaccessible key, or unmatched total is **NO-GO**.

The secret/configuration inventory above is a **separate** recovery package.
Database SQL, even when successfully restored, cannot recreate Vercel env
values, Auth providers/JWT keys, Edge secrets, or Storage object bytes.

## Production Deployment Runbook (Not Executed)

**Entry gate:** explicit client release approval below, approved maintenance
window and write-freeze authority, approved source SHA, fresh encrypted off-site
backup **and independent restore PASS**, configuration custody PASS, production
value/ref match PASS, named release/rollback operators, and agreed RPO/RTO.
Any missing item stops the rollout. Tests alone never grant release authority.

1. Record pre-release deployment URL/SHA, hosted migration versions, Edge
   slugs/versions/JWT flags, and a UTC baseline of Auth/membership counts,
   inventory by lot/custodian and acquisition value, Sales, Payments and
   allocations, customer balances/collectibles, DCR/expenses, payroll/DTR,
   trucks, and audit/correction counts. Check duplicate normalized Trip refs,
   DCR amendment chronology, schema signatures, policies/grants and the
   pending list again. Halt if changed from the rehearsed assumptions.
2. Apply the approved migrations **in this exact order**, checking each
   migration's committed status and business totals before continuing:
   `20261015074217_admin_transaction_correction_foundation.sql`,
   `20261016085749_admin_stock_trip_corrections.sql`,
   `20261016093815_admin_transfer_corrections.sql`,
   `20261016162602_admin_sale_corrections.sql`,
   `20261016175246_admin_payment_corrections.sql`,
   `20261016180902_admin_expense_dcr_corrections.sql`,
   `20261017060229_admin_dtr_payroll_truck_corrections.sql`,
   `20261017115758_nonretryable_correction_conflicts.sql`,
   `20261018010000_order_dcr_amendments.sql`. Keep the final migration's
   amendment-history guard; do not bypass it or casually backfill financial
   chronology. Stop on any error or unreviewed data delta.
3. Deploy only the approved source for the six dedicated functions:
   `admin-stock-trip-correction`, `admin-transfer-correction`,
   `admin-sale-correction`, `admin-payment-correction`,
   `admin-finance-correction`, `admin-operations-correction`. Verify each
   deployed version/import map, `verify_jwt=true`, expected CORS origins,
   server-side Owner/Admin/password/rate-limit checks, service-role custody,
   and Salesman denial. Never create a generic mutation endpoint.
4. Build the approved SHA and release it to the **existing** Vercel project
   and domain. Privately verify production env values before building; Vite
   embeds `VITE_*` values at build time. Confirm the deployment's exact SHA,
   environment, domain, and health. Do not promote a preview accidentally.
5. With client-approved disposable QA records only, smoke-test Owner/Admin
   login, preview, password/reason apply, edit history, refreshed transaction,
   inventory and financial summaries; test an incorrect password, replay/stale
   request, and denied Salesman correction. Check Salesman own inventory,
   Sales/Payments/DCR access and cross-user denial. Verify desktop, tablet,
   mobile, browser console, Auth and Edge logs. Do not alter legitimate client
   transactions to demonstrate destructive behavior.
6. Reconcile the post-release totals against the frozen baseline plus every
   approved QA delta. Check inventory by lot/custody and zero/negative guards,
   Sale/payment allocations and outstanding balances, DCR/payroll totals,
   audit/correction row counts and identity preservation. Have the Owner
   accept the reconciliation before ending maintenance; clean QA records only
   through a separately approved, auditable procedure.
7. Monitor Vercel deployment/error logs, Supabase database/Auth/Edge logs,
   correction failures and rate limits, RLS denials, login failures, stock or
   finance reconciliation alerts, and client reports during the agreed watch
   period. Assign an on-call decision maker and record incident timestamps.

**Rollback decision:** stop writes and new corrections for failed migrations,
unexplained financial/stock deltas, incorrect grants/RLS, repeated Auth failures,
or unavailable recovery evidence. A frontend-only defect can use the prior
compatible Vercel artifact; an Edge-only defect can restore its prior version.
Neither undoes database writes. For committed schema/data changes, preserve the
incident state, rehearse a reviewed forward fix or restore to a separate
environment, reconcile legitimate writes after the backup, and obtain explicit
Owner approval before any cutover. Never blindly reverse DDL, erase audit rows,
disable RLS, or restore over the live database. See
[Vercel rollback guidance](https://vercel.com/docs/cli/rollback).

## Client Authorization Gate

The Owner/authorized client representative and release operator must explicitly
approve **this specific release**, not merely tests or this document:

- [ ] Exact source commit SHA, target `ruoqkitfsuuvqkbtires`, Vercel project,
      domain, maintenance window, and allowed transaction-write freeze.
- [ ] Fresh encrypted off-site archive ID/hash and independent isolated restore
      report; RPO/RTO, retention, recovery key escrow, and recovery owners.
- [ ] Separate platform/Auth/Edge/Storage/Vercel recovery package and private
      production value/ref check, with no secrets attached to the approval.
- [ ] Baseline control totals, migration/Edge/frontend steps, QA fixture scope,
      acceptance criteria, monitoring watch, and rollback/cutover authority.
- [ ] Explicit written approval to apply the nine hosted migrations.
- [ ] Explicit written approval to deploy the six correction Edge Functions.
- [ ] Explicit written approval to release the approved frontend to the
      existing Vercel production project.
- [ ] Client acceptance recorded after smoke tests and reconciliation.

Record approver name/role, UTC time, approved SHA, and evidence reference in
the client's change system. No item above is implicitly approved by the Phase
8.4 task or by a passing test suite. Do not perform a production correction
using client data without separate transaction-level authorization.

## Non-Destructive Gates And Recommendation

| Gate | Status | Evidence / stop condition |
| --- | --- | --- |
| Feature branch checkpoint and clean working tree at start | **PASS** | `feature/supabase-frontend`, `9c22edb3...`, local tracking divergence 0/0; no pre-existing changes |
| Phase 8.3 local backup and isolated application restore | **PASS (historical)** | Restricted local copy, restored/migrated snapshot and 331 SQL assertions in Phase 8.3; not an off-site recovery proof |
| Fresh encrypted off-site backup and independent restore | **BLOCKED** | No approved off-site destination/key custodian or completed archive/restore attestation |
| Supabase project/ref, hosted migration/Edge state, local env target | **PASS** | Read-only project/list/count checks and in-memory local comparisons above |
| Actual Vercel production env values and separate secret/config recovery | **BLOCKED** | Names present; CLI listing exposes encrypted blobs, not verifiable plaintext; operator must privately attest |
| Storage bytes backup | **PASS for current empty inventory** | Read-only count: 0 buckets, 0 objects; recount and export if this changes |
| Local unit/integration regressions | **PASS** | `npm test`: 202/202 passed on 2026-10-19 |
| Production build | **PASS** | `npm run build` passed; existing non-failing >500 kB chunk warning |
| Hosted Owner/Admin and Salesman correction smoke | **BLOCKED** | Corrections are intentionally not deployed; execute only after separate release approval |
| Client release authorization | **BLOCKED** | No release approval is conveyed by this preparation task |

**NO-GO** for hosted rollout until every BLOCKED entry is resolved and the
client explicitly approves each deployment stage. No main merge or live
release was performed.

An exploratory read-only `vercel env run` invocation unexpectedly entered the
CLI's deploy path. It failed validation before issuing a deployment URL; a
subsequent read-only deployment listing showed only the four pre-existing
Production deployments (newest about five days old), and Git remained clean.
No deployment or production configuration change was observed. Do not repeat
that command for value verification; use the Vercel Dashboard with an
authorized operator, or a reviewed read-only API procedure, instead.
