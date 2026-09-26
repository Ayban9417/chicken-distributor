# Final Pre-Client QA

## Release decision

**PASS - READY FOR CLIENT UAT**

- Release candidate tested: `cb8238155964edef1128c4685bea37dcb2f5f9a5`
- Branch: `feature/supabase-frontend`
- Hosted environment: disposable data in `chicken-distributor-dev`
- Unresolved BLOCKER: 0
- Unresolved HIGH: 0
- Unresolved MEDIUM: 0
- Unresolved LOW: 0
- Unresolved COSMETIC: 0
- Defects found and fixed during this pass: 1 MEDIUM

The release candidate completed the Owner/Admin, Warehouse, and Salesman business flows, exact inventory and financial reconciliation, direct role-boundary attacks, replay/concurrency attacks, empty-state checks, responsive checks, local-mode checks, and hosted cleanup. No production deployment or merge to `main` was performed.

## Defect record

### RCQA-001

- ID: RCQA-001
- Severity: MEDIUM
- Area: Salesman Dashboard / locked DCR summary
- Role: Salesman
- Precondition: A DCR is locked, then a later payment is recorded for the same day.
- Steps to reproduce:
  1. Lock a DCR with PHP 9,500 expected cash and PHP 9,400 actual cash.
  2. Record a PHP 100 cash payment after the lock.
  3. Refresh the Salesman Dashboard.
- Expected result: The `My DCR` card continues to show the immutable locked snapshot: PHP 9,500 expected, PHP 9,400 actual, and -PHP 100 short. The live `Cash to Remit` metric may reflect the later payment separately.
- Actual result: The card showed the live PHP 9,600 expectation and PHP 0 variance, while the dedicated DCR screen correctly retained the locked snapshot.
- Evidence: Hosted browser reproduction against the disposable QA organization; database DCR row remained correct and immutable.
- Root cause: `SalesmanWorkspace.jsx` read nonexistent normalized fields `locked.expected` and `locked.difference`. Hosted DCR normalization exposes the snapshot at `locked.snapshot.expectedCashRemittance` and the variance at `locked.diff`.
- Fix status: FIXED with the smallest field-mapping change.
- Retest result: PASS. Hosted UI now shows PHP 9,500 expected, PHP 9,400 actual, and -PHP 100 short after the late payment. A focused regression test was added and the full suite passes.

## End-to-end results

| Area | Result | Evidence |
| --- | --- | --- |
| Owner/Admin | PASS | Login, Dashboard, Plant configuration, Stock In, Warehouse, plant-first Inventory, Sales, Payments, Ledger, Collectibles, DCR, Reports, DTR, account deactivate/reactivate, and audit views exercised. |
| Warehouse | PASS | Workspace exposed only Warehouse, DTR, and Trucks. Exact warehouse stock rendered; Owner-only and financial mutations were denied by hosted role tests. |
| Plant-first Inventory | PASS | First view separated BOUNTY, FKIDZ, and MAGNOLIA. Search and drill-down preserved Plant -> Trip -> Product -> Code/Class; coded, uncoded, by-product, zero-cost, and sold-out lines rendered. |
| Salesman | PASS | Dedicated navigation contained Dashboard, My Inventory, Sales, Payments, Collectibles, Ledger, Transfers, Expenses, My DCR, and My DTR. No acquisition cost, valuation, company profit, or another Salesman's private transactions were exposed. |
| Local data mode | PASS | Dashboard, Inventory, Sales, DCR, and the dedicated Salesman workspace rendered with no console errors. |
| Empty organization | PASS | Dashboard, Plants, Warehouse, Inventory, Sales, Payments, Ledger, Collectibles, DCR, Reports, and DTR showed usable empty/zero states without crashes. |

## Exact reconciliation

### Stock

- Original Stock In: `1,215.000 kg`
- Warehouse remaining: `505.000 kg`
- Salesmen remaining: `408.000 kg`
- Sold: `302.000 kg`
- Recomputed: `505 + 408 + 302 = 1,215.000 kg`
- Result: PASS; no negative inventory and no missing stock.

### Financial

- Sales: `PHP 52,315.00`
- COGS / Capital: `PHP 39,815.00`
- Gross Profit: `PHP 12,500.00`
- Approved Expenses: `PHP 350.00`
- Profit Estimate: `PHP 12,150.00`
- Result: PASS. Unsold stock was not expensed as COGS; payments and transfers did not create revenue; free stock used zero acquisition cost.

### Payments

- Valid payments allocated: `PHP 34,275.00`
- Outstanding: `PHP 18,040.00`
- Recomputed sales: `34,275 + 18,040 = PHP 52,315.00`
- Result: PASS. Cash, GCash, Bank, partial, multiple partial, and full payment scenarios reconciled. Electronic references, notes, FIFO allocation, amount validation, authorization, and idempotency were enforced.

### DCR

- Locked cash collected: `PHP 9,850.00`
- Locked GCash: `PHP 5,000.00`
- Locked Bank: `PHP 19,325.00`
- Approved cash-paid expense: `PHP 350.00`
- Expected physical cash: `9,850 - 350 = PHP 9,500.00`
- Actual cash: `PHP 9,400.00`
- Difference: `-PHP 100.00`
- Result: PASS. GCash and Bank did not increase physical cash. A late payment created post-DCR handling while the locked snapshot stayed immutable.

## Security and integrity

- Authentication: PASS. Valid, invalid-user, invalid-password, inactive-user, logout, refresh, throttling, generic errors, and stale-session recovery were exercised. No username enumeration or internal email/SQL/stack/service detail was exposed.
- Direct API/RLS attacks: PASS. Salesman, Warehouse, and anonymous attempts against prohibited Stock In, configuration, inventory movement, financial, account, other-Salesman, DCR, and DTR operations were denied. Expected RLS denials counted as successful tests.
- Financial privacy: PASS. Salesman-safe reads did not expose acquisition cost, cost basis, valuation, or company profit.
- Replay/idempotency: PASS for Stock In, RR, TF, Sale, Payment, Expense, DCR, Time In, and Time Out. Duplicate Trust Receipt and duplicate request IDs produced no duplicate business effects.
- Concurrency: PASS. Competing Sale and Warehouse transfer requests against the same stock allowed only a valid winner; final stock never became negative.
- DTR: PASS. Time In/Out used server timestamps; duplicate/replayed and arbitrary timestamp attempts were rejected or idempotent. Salesman cross-read/correction was denied. Owner correction required a reason and audited old/new values, actor, and time.
- Audit trail: PASS. The QA dataset generated 63 scoped audit events across Plant/config, Stock In, RR, TF, Sale, Payment, Expense, DCR, DTR correction, and account state changes. Update/delete attacks were denied and no credentials or tokens appeared in metadata.
- Error handling: PASS. Expected duplicate, permission, invalid-payment, missing-reference, insufficient-stock, locked-DCR, invalid-DTR, and stale-session failures remained recoverable. No white screens were observed.

## Browser and performance

- Responsive: PASS at `1440x960`, `768x1024`, and `390x844` for Inventory, Warehouse, Sales, Payments, DCR, DTR, and the equivalent Salesman priority screens.
- Page overflow: None. Wide Warehouse/DTR tables remained inside intentional horizontal scroll containers.
- Navigation: Desktop/sidebar and mobile drawer remained usable. Refresh restored the authenticated role workspace. The prototype uses one internal application route, so separate direct screen URLs and browser-history screen routing are not applicable.
- Console: PASS. No browser console errors or warnings in final hosted, stale-session, or local-mode checks.
- Hosted request timing during the QA window: `1,657` successful requests, `85.3 ms` average origin time, `232.8 ms` p95, `1,067 ms` maximum.
- Hosted HTTP stability: no 5xx responses in the inspected QA window. Expected 400/401/403/409/429 responses came from deliberate negative, role, replay, and throttle tests.
- Query/load review: common services use parallel reads and date/role filters. No reproduced N+1 defect or user-visible slow loop was found at the controlled dataset size.

## Automated validation

- Frontend/unit tests: `114/114 PASS` (baseline 113 plus RCQA-001 regression).
- Hosted database role tests: `49/49 PASS` (`finish(true)` completed with `ok 49`).
- Production build: PASS with Vite 7.3.6, 1,679 modules transformed.
- DB lint/security advisor: no error-level findings. Two known warnings remain: intentional authenticated execution of the tightly scoped `complete_own_password_change()` security-definer RPC, and leaked-password protection disabled in hosted DEV.
- DB performance advisor: informational/unresolved optimization backlog includes unindexed foreign keys, Auth RLS init-plan rewrites, multiple permissive policies, and currently unused indexes. Measured QA latency did not establish a release-blocking performance defect.
- Local pgTAP: NOT RUN because Docker is not installed/available on this workstation. Hosted pgTAP role coverage passed instead.
- Migrations: hosted history matches the eight repository migrations through `20260916151519_harden_production_release_candidate`.

## Client UAT rehearsal

- Owner flow: PASS - Login -> Dashboard -> Plant configuration -> Stock In -> Warehouse -> RR -> Plant-first Inventory -> Sales -> Payments -> Ledger -> Collectibles -> DCR -> Reports -> DTR.
- Salesman flow: PASS - Login -> Time In -> My Inventory -> Sale -> partial Payment -> Collectibles -> final collection -> Transfer -> Expense -> DCR -> Time Out.
- Exact calculations were checked from database records and then compared with Dashboard, Reports, Ledger, Collectibles, Inventory, Warehouse, and Salesman workspace output.

## Cleanup and secrets

- Hosted cleanup: PASS. Disposable QA organizations, five temporary users, memberships, operational records, audit records, sessions/accounts, and scoped login-rate records were removed.
- Post-cleanup verification: `0` QA organizations, users, profiles, memberships, operational rows, and scoped rate-limit rows.
- Legitimate DEV baseline preserved: `1 organization`, `2 auth users`, `2 profiles`, `8 audit events`.
- Secret scan: PASS across source, Git diff, staged state, and production bundle. The temporary credential-bearing QA harness was deleted before the scan and was never staged or committed.

## Remaining release follow-ups

These are production-operations follow-ups, not acceptance defects for client UAT:

1. Enable Supabase leaked-password protection before production launch if the selected plan supports it.
2. Reassess the intentional `complete_own_password_change()` security-definer exposure during the production security review.
3. Address advisor performance warnings based on production-sized query plans and measured load; do not remove currently unused indexes based only on this small DEV dataset.
4. Run the local reset/pgTAP path on a workstation or CI runner with Docker before the production deployment rehearsal.
5. Review compatibility before applying the September 2026 PostgreSQL 17.11 minor update. The current app does not use the specifically affected `ltree`, legacy pgcrypto PGP ciphers, `btree_gist` float NaN indexes, or custom operator patterns.

## Changed files

- `src/components/SalesmanWorkspace.jsx` - corrected locked DCR snapshot/variance fields.
- `tests/salesmanWorkspace.test.js` - added the locked DCR dashboard regression check.
- `FINAL-PRE-CLIENT-QA.md` - this acceptance report.

No migration or Edge Function changed. No production deployment was performed. No merge to `main` was performed.

**READY FOR CLIENT UAT: YES**
