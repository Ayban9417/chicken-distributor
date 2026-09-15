# Final Client-Facing Acceptance Audit

**Audit date:** September 15, 2026
**Project:** Chicken Distributor
**Branch:** `feature/supabase-frontend`
**Validated base checkpoint:** `13b9aad5db12336822dc1ef7de1c1cfdca44a89a`
**Environment:** Hosted Supabase DEV plus local-data mode
**Overall result:** **PASS**

The end-to-end operating workflow, financial reconciliation, inventory traceability, role isolation, responsive layouts, and local fallback mode passed acceptance testing. The final role-model correction makes Stock In Owner/Admin-only in both the UI and database RPC, removes Cashier from the operational application, and limits collections to Owner/Admin and the responsible Salesman.

Customer collections are performed by Salesmen or the Owner/Admin. The client does not use a Cashier role.

No deployment or merge to `main` was performed.

## Audit Method

- Reviewed the current branch and uncommitted parity work before testing.
- Ran the complete automated test suite before and after fixes.
- Created an isolated, disposable hosted QA scenario in the existing DEV organization.
- Tested Owner/Admin, Warehouse, and two Salesmen through UI and direct service/RLS checks.
- Probed the inactive legacy `cashier` database value to confirm that it cannot be activated or used for operational access.
- Exercised coded, uncoded, purchased, free-from-plant, bag-count, head-count, sold-out, transfer, sale, payment, expense, DCR, discrepancy, and reporting paths.
- Reconciled inventory and finance independently from stored records.
- Checked every visible module at desktop, tablet, and mobile widths.
- Checked browser console warnings/errors in hosted and local modes.
- Deleted all temporary hosted users and operational data after validation.
- Scanned tracked changes for credentials and temporary audit identifiers.

## Workflow Acceptance

| Area | Result | Evidence |
| --- | --- | --- |
| Plant configuration | PASS | Owner could manage coded and uncoded products, class/code options, bags, heads, purchased/free acquisition, and costs. |
| Stock In / Trips | PASS | Coded and uncoded trips posted with exact Plant + Trip + Product + Code/Class traceability. Owner/Admin could Stock In; Warehouse and Salesman were denied by both UI access and RPC authorization. |
| Warehouse inventory | PASS | Grouping, original quantity, transfers, remaining stock, cost, and sold-out zero rows rendered correctly. |
| Warehouse to Salesman | PASS | RR transfers preserved kilos, bags, heads, origin, code/class, and cost. |
| Salesman to Salesman | PASS | TF transfer moved only the selected Salesman's exact inventory allocation. |
| Sales / OUT | PASS | One Plant/Trip group appeared by default; assigned stock, special price, TR, duplicate protection, and insufficient-stock checks passed. |
| Payments | PASS | Partial and full Cash, GCash, and Bank payments passed; notes and electronic references were retained; FIFO allocation passed. |
| Ledger | PASS | Charges, payments, running balance, and settled balance reconciled. |
| Collectibles | PASS | Fully paid customer left no open collectible; partial state was verified before settlement. |
| DCR | PASS | Submission locked the snapshot; expected cash, actual cash, methods, expenses, and discrepancy reconciled. |
| Discrepancies | PASS | Cash shortage and post-lock payment adjustment appeared without mutating the locked DCR. |
| Reports | PASS | Date filtering, financial cards, trip summary, inventory, transfers, customer/product/plant profitability, DCR, and discrepancy sections rendered. |
| DTR | PASS | Existing empty state and role visibility worked; no migration or feature changes were made. |
| Payroll | PASS | Owner-only visibility and empty state worked; no migration or feature changes were made. |
| Trucks | PASS | Existing empty state worked; no migration or feature changes were made. |
| Administration | PASS with provisioning note | Owner could review roles/statuses, edit/deactivate memberships, and inspect audit activity. Cashier is not assignable; an existing legacy membership can only remain inactive. Secure account provisioning remains a server-side follow-up. |

## Hosted Scenario Reconciliation

The disposable scenario used a newly configured uncoded plant plus a coded Fkidz product. It stocked 100 kg of uncoded Whole Dressed Chicken, 5 kg of free Small Intestine, 2 kg of coded Whole Dressed Chicken, and a separate 1 kg Warehouse-role authorization probe.

| Reconciliation | Result |
| --- | ---: |
| Original main lot | 100 kg |
| Warehouse remaining | 30 kg |
| Salesman A remaining | 20 kg |
| Salesman B remaining | 20 kg |
| Sold from main lot | 30 kg |
| Main lot reconciliation | 30 + 20 + 20 + 30 = **100 kg** |
| Total sales | **PHP 6,420** |
| COGS | **PHP 4,484** |
| Gross profit | **PHP 1,936** |
| Ledger charges | **PHP 6,420** |
| Ledger payments | **PHP 6,420** |
| Ending customer balance | **PHP 0** |
| DCR Cash / GCash / Bank | PHP 500 / PHP 2,500 / PHP 3,000 |
| Cash expenses | PHP 120 |
| Expected physical cash | PHP 380 |
| Actual remittance | PHP 370 |
| DCR difference | **PHP -10** |

The 2 kg coded lot sold to zero and continued to render as a sold-out row. The 5 kg free by-product retained its class, head count, zero acquisition cost, and origin traceability.

The final role-model regression scenario independently stocked 100 kg as Owner/Admin, transferred 80 kg from Warehouse to Salesman A, transferred 20 kg from Salesman A to Salesman B, and sold 20 kg from Salesman A's own stock. A PHP 4,000 receivable was settled through Cash, GCash, and Bank payments attributed to Salesman A. Notes and electronic references were retained, DCR locking passed, and all unauthorized role probes were rejected.

## Role And RLS Verification

| Role | Result |
| --- | --- |
| Owner/Admin | PASS: Plant management, Stock In, Warehouse, customers, reports, Payroll, and Administration were accessible. |
| Warehouse | PASS: Warehouse inventory, receiving history, Warehouse-to-Salesman transfers, DTR, and Trucks were accessible. Stock In, payments, Plant configuration, DCR, reports, discrepancies, Payroll, and Administration were blocked. |
| Salesman | PASS: only own assigned inventory was visible; Salesman selection was locked; own sales, payments, expenses, and DCR worked. Selling another Salesman's stock, arbitrary inventory movement, and Plant edits were denied. |
| Legacy `cashier` value | PASS: no application role or navigation is exposed. Existing memberships are deactivated by migration, activation is denied, and direct payment/data access is rejected. |

Expected RLS denials were observed and counted as successful security checks. The corrective migration narrowed Stock In, payment, DCR, financial, and membership policies to the final client role model.

## Edge-Case Results

- Duplicate Trust Receipt: PASS, rejected.
- Idempotent Sale resubmission: PASS, no duplicate transaction.
- Idempotent Payment resubmission: PASS, no duplicate payment.
- Idempotent DCR resubmission: PASS, no duplicate/overwrite.
- Insufficient Salesman stock: PASS, rejected.
- Attempt to sell another Salesman's stock: PASS, rejected.
- Inactive customer and inactive Plant: PASS, rejected.
- Zero-quantity operation: PASS, rejected.
- GCash/Bank electronic reference requirement: PASS, enforced.
- Partial payment, FIFO allocation, and final settlement: PASS.
- Payment notes and references: PASS, retained and displayed.
- Warehouse receipt and Salesman transfer traceability: PASS.
- DCR lock and post-lock adjustment: PASS.

## Bugs Found And Fixed

### 1. Weekly Report Remaining Stock

**Classification:** BUG
**Severity:** Medium
**Module:** Reports / Trip Summary
**Reproduction:** Open Weekly Business Report after a hosted trip still has inventory.
**Expected:** `Remaining Now` uses the normalized trip inventory total.
**Actual:** The report read a nonexistent product-level field and displayed zero.
**Fix:** Map the hosted report inventory row from the normalized trip-level `remainingQty`. Sold-out trips still display zero.

### 2. Receipt Bags And Heads

**Classification:** BUG
**Severity:** Medium
**Module:** Warehouse / Inventory transfer history
**Reproduction:** Transfer a receipt line that includes bag or head counts.
**Expected:** RR/TF history retains the supplemental quantity fields from the exact receipt line.
**Actual:** The parity adapter retained kilos but dropped bags/heads.
**Fix:** Load receipt-line metadata through `reference_line_id`, normalize bags and heads, and display Heads in the receipt history.

### 3. Locked DCR Detail Drift

**Classification:** DATA INTEGRITY PRESENTATION ISSUE
**Severity:** Medium
**Module:** Daily Cash Report
**Reproduction:** Lock a DCR, then record another same-day cash payment.
**Expected:** Locked DCR detail remains consistent with its immutable totals; the later payment appears as a discrepancy/adjustment.
**Actual:** Reconstructed customer detail included the later payment even though the locked total did not.
**Fix:** Carry transaction timestamps through the adapter and exclude post-lock payments/expenses when reconstructing locked DCR detail. Added a regression test.

### 4. Mixed Bag-Tracking Trip Summary

**Classification:** MINOR UI ISSUE
**Severity:** Low
**Module:** Reports / Trip Summary
**Reproduction:** A trip has one product with a bag count and another product for which bags are not applicable.
**Expected:** Preserve the known total while clearly indicating that only applicable/recorded lines were counted.
**Actual:** The entire trip displayed `Not recorded`.
**Fix:** Display the total of recorded bag lines as `N recorded`; display a number when every line is recorded and `Not recorded` only when none are recorded. No bags-to-kilos relationship is inferred.

## Remaining Non-Blocking Items

### Secure User Provisioning

**Classification:** CLIENT DECISION REQUIRED
**Severity:** Medium
**Module:** Administration
**Current behavior:** The frontend can review, edit, activate, and deactivate organization memberships but intentionally does not create Auth users with privileged keys.
**Recommended resolution:** Provision users through a secured Edge Function or trusted server using the Supabase Admin API. Never place a service-role key in the frontend.

### Hosted Discrepancy Resolution

**Classification:** CLIENT DECISION REQUIRED
**Severity:** Low
**Module:** Discrepancies
**Current behavior:** Hosted discrepancies are intentionally read-only under current policies.
**Recommended resolution:** Define approval ownership and audit requirements before adding a secured resolution workflow.

## Usability And Responsive Results

- Desktop 1440 x 960: PASS across all 15 modules; no page-level overflow.
- Tablet 768 x 1024: PASS; navigation, forms, tables, and action controls remained usable.
- Mobile 390 x 844: PASS; mobile navigation worked, controls remained reachable, and the Quick Add Customer drawer fit the viewport without overflow.
- New Sale opened with one Plant/Trip origin by default; additional origins remained secondary.
- Loading and empty states were visible and usable.
- Recoverable service errors did not produce white screens.
- Hosted and local browser consoles had no warnings or errors after the audited workflows.

## Local Mode

Local-data mode started successfully. Owner/Admin retained the complete workflow; Warehouse was limited to Warehouse, DTR, and Trucks; Salesman had own-inventory, Sales, Payments, Ledger, Collectibles, DCR, and DTR access. The role selector exposes no Cashier option, and Salesman selectors are locked in Sales and Payments. No hosted credentials are required for local mode.

## Database And Tooling Checks

- Supabase changelog was reviewed before hosted validation. The project runtime uses Node.js 24, so the announced Node.js 20 deprecation is not a blocker.
- Database lint passed for application schemas `api`, `private`, and `public` at error level.
- An all-schema lint run reported only managed pgTAP self-reference noise under the `extensions` schema; this is not an application schema defect.
- Migration `20260914173236_align_roles_with_client_workflow.sql` was applied to hosted DEV and the remote migration state is current.
- The migration preserves `cashier` only as an inactive legacy text value while preventing operational assignment or access.
- The updated pgTAP role files could not be launched by the CLI because Docker/Podman is unavailable on this machine. Equivalent role and RLS paths passed against hosted DEV through the disposable direct integration scenario.

## Cleanup And Security

- Temporary hosted QA users remaining: **0**
- Temporary customers remaining: **0**
- Temporary trips remaining: **0**
- Temporary sales/payments/expenses/DCRs remaining: **0**
- No credentials were written to source files or committed.
- The temporary QA runner was removed after cleanup.
- Supabase sequence counters advanced normally; no operational QA records remain.

## Final Verification

- Automated tests: **86 passed, 0 failed**
- Production build: **PASS**
- Application-schema database lint: **PASS**
- Hosted browser console: **PASS, no errors/warnings**
- Local browser console: **PASS, no errors/warnings**
- Secret scan: **PASS**
- Hosted cleanup: **PASS**

## Acceptance Recommendation

Accept the audited workflow as a **client-ready role-corrected checkpoint**. The implementation is functionally coherent, reconciles end to end, and now matches the confirmed operational roles. Keep secure user provisioning and discrepancy resolution as explicitly scoped follow-up work rather than exposing privileged credentials or weakening RLS in the frontend.
