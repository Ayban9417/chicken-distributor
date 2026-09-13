# Chicken Distributor Phase 1 Execution Report

Date: September 13, 2026

Project: `chicken-distribution-workflow-prototype`

Scope: Supabase backend foundation and hosted validation only. The React prototype remains local-state only; Phase 2 frontend integration was not started.

## Executive Summary

Phase 1 is complete. A dedicated $0/month development project named `chicken-distributor-dev` was created in the `Noderno` organization in `ap-southeast-1`. Its non-secret project ref is `ruoqkitfsuuvqkbtires`. The two pre-existing Supabase projects were not linked, migrated, seeded, or otherwise modified.

Three migrations and the development-only seed were applied to the hosted project. The hosted schema passed Supabase database lint, 27 backend pgTAP assertions, 10 role/RLS pgTAP assertions, and real parallel-session oversell tests. The React prototype still passes all 46 tests and its production build.

No database password, access token, API key, service-role key, or frontend environment configuration was added to the repository.

## Previous Interrupted Run

The first run was interrupted after the frontend audit, protective Git checkpoint, feature branch, Supabase initialization, core schema migration, and backend audit were created. It was waiting for explicit organization, region, and cost confirmation before provisioning a hosted project. The interruption was not caused by a database failure, and no existing Supabase project was touched.

The safe frontend checkpoint is `06603eb chore: checkpoint frontend prototype`, and Phase 1 continued on `feature/supabase-backend`.

## Hosted Project

- Name: `chicken-distributor-dev`
- Organization: `Noderno`
- Region: `ap-southeast-1`
- Project ref: `ruoqkitfsuuvqkbtires`
- Status during validation: `ACTIVE_HEALTHY`
- Cost confirmed by the user: `$0/month`
- Existing projects changed: none

## Database Foundation

`20260913055521_core_schema.sql` creates the normalized organization, identity, configuration, customer, stock, receipt, transfer, Sale, Payment, DCR, expense, discrepancy, audit, truck, DTR, and payroll foundations. It includes numeric checks, restrictive historical foreign keys, organization-scoped uniqueness, idempotency keys, date/arithmetic rules, and supporting indexes.

`20260913055535_transactional_functions_rls_views.sql` adds private authorization helpers; atomic Stock In, transfer, Sale, Payment, and DCR RPCs; organization-scoped document sequences; immutable post-DCR adjustment detection; RLS for all public business tables; and security-invoker reporting views.

`20260913063954_hosted_validation_hardening.sql` replaces hosted default table privileges with explicit grants. Anonymous table/sequence access is revoked. Authenticated clients receive read access plus narrowly scoped insert/update access to editable master/administrative tables. Critical operational writes remain RPC-only, and direct delete privileges are not granted.

The seed contains only one demo organization, Fkidz master configuration, seven Products, seven Plant Products, and four code labels. It contains no users, customers, Stock Trips, Sales, Payments, or DCR history.

Generated hosted schema types are stored at `src/types/database.types.ts`. No Supabase client was created and the types are not imported by the React application in Phase 1.

## Integrity Design

Every Stock Trip Line creates one source inventory lot carrying the exact Plant, Trip, Product, optional Code/Class, quantity, and acquisition cost. Custody and sold-out zero balances are derived from immutable positive movements. Internal transfers preserve the same lot and cost basis.

Transactional RPCs lock affected lots in stable UUID order before checking balances. Payments remain distinct from Sales and allocate against locked unpaid balances. A locked DCR remains immutable; later dated Payments or Expenses create a `post_dcr_adjustment` discrepancy rather than rewriting its snapshot.

## Hosted Validation Results

- Applied migrations: 3 of 3.
- Public business tables: 33 of 33 have RLS enabled.
- Reporting views: 12, all `security_invoker = true`.
- Authenticated RPCs: 6, all `SECURITY DEFINER` with an empty fixed `search_path`; anonymous execution is revoked.
- Backend pgTAP suite: 27 passed.
- Role/RLS pgTAP suite: 10 passed.
- Total hosted database assertions: 37 passed.
- Linked schema lint: passed with no schema errors.
- Security advisor: 0 findings.
- Grant audit: anonymous reads denied; direct Inventory Movement, Sale, Payment, DCR, and Audit writes denied; Plant master select/insert/update allowed and delete denied.

Docker/Podman is unavailable on this workstation, so `supabase test db --linked` could not use the CLI's Docker-backed runner. The same rollback-safe pgTAP files were executed directly against the linked hosted database and passed. Test fixtures were rolled back or explicitly removed; the hosted project finished with only the safe seed data.

## Concurrency Validation

Real parallel hosted sessions raced two 80 kg Sales against one 100 kg Salesman lot. One Sale committed, the second failed with `Insufficient Salesman stock`, and 20 kg remained.

A second parallel test raced two 80 kg Warehouse transfers against one 100 kg Warehouse lot. One transfer committed, the second failed with `Insufficient Warehouse stock`, and 20 kg remained in Warehouse custody.

Across both tests, company stock reconciled exactly: 200 kg initial stock minus the successful 80 kg Sale left 120 kg; transfers did not alter company total. All concurrency fixtures were removed afterward.

## Advisor Review

No security findings or CRITICAL/HIGH findings remain. The performance advisor reports non-blocking optimization notices for 32 unindexed foreign keys, 20 RLS auth initialization plans, 12 multiple permissive policy combinations, and 2 unused indexes. These do not compromise Phase 1 correctness or authorization and are documented for measured optimization once production query patterns exist.

References:

- https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys
- https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan
- https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index
- https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies

## Application Verification

- `npm test`: 46 passed, 0 failed.
- `npm run build`: passed with Vite 7.3.6.
- Frontend files changed for Supabase integration: none.
- Credentials or secrets committed: none.

## Phase Boundary

Phase 1 stops here. Authentication UI, Supabase client setup, environment configuration, data import, and replacement of local React workflows are Phase 2 work and require separate explicit approval.
