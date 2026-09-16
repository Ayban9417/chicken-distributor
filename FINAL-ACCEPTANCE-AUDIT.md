# Final Client-Facing Acceptance Audit

**Audit date:** September 16, 2026
**Project:** Chicken Distributor
**Branch:** `feature/supabase-frontend`
**Pre-account-management checkpoint:** `85a79b9b19a5af9045fb0507386d0761663620d9`
**Environment:** Hosted Supabase DEV plus local-data mode
**Overall result:** **PASS**

The end-to-end operating workflow, financial reconciliation, inventory traceability, role isolation, responsive layouts, local fallback mode, and secure hosted account lifecycle passed acceptance testing. The final role-model correction makes Stock In Owner/Admin-only in both the UI and database RPC, removes Cashier from the operational application, and limits collections to Owner/Admin and the responsible Salesman.

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
| DTR | PASS | Salesmen can Time In and Time Out only for themselves using server time; duplicate actions are idempotent. Owner/Admin corrections require a reason and create an audit event. |
| Payroll | PASS | Owner-only visibility and empty state worked; no migration or feature changes were made. |
| Trucks | PASS | Existing empty state worked; no migration or feature changes were made. |
| Administration | PASS | Owner can create, edit, activate, deactivate, and reset Salesman accounts. The UI has no role selector and cannot create privileged roles. Cashier is not assignable. |

## Account Management Acceptance

- Client login accepts Username and Password only; no email address is displayed or returned by the resolver.
- The username resolver returns one generic response for an unknown username and an incorrect password, and anonymous profile enumeration is denied.
- Owner/Admin created `salesman01` through the deployed DEV Edge Function. A deliberately supplied `owner_admin` browser payload was ignored and the database created only a Salesman membership.
- Duplicate normalized username creation was rejected.
- Salesman first login required a temporary-password change. Current-password verification, successful replacement, and clearing the required-change flag passed.
- Owner/Admin password reset set a new temporary password and restored the required-change flag.
- Salesman attempts to create/reset accounts, edit Plant configuration, rewrite profile identity, or promote their own role were denied.
- Deactivation blocked a new username login and removed organization visibility from an already issued session. Reactivation restored access.
- Passwords were absent from profile rows and audit payloads. Account creation, password change/reset, activation, and deactivation produced audit events without secret values.
- Username login and both account-management Edge Functions were deployed only to the linked hosted DEV project.

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
| Salesman | PASS: the dedicated workspace exposes Dashboard, My Inventory, Sales, Payments, Collectibles, Ledger, Transfers, Expenses, My DCR, and My DTR only. Own workflows passed; cross-salesman inventory/sales, arbitrary inventory movement, Plant edits, role promotion, and completed-DTR edits were denied. |
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

## Dedicated Salesman Workspace Acceptance

- The common field workflow is now isolated from Owner/Admin navigation and starts on a Salesman dashboard.
- The dashboard derives own Sales, Collections, Expenses, Cash to Remit, assigned inventory, collectibles, DCR status, and attendance from the same local or hosted operational records used by the detail screens.
- My Inventory displays assigned, sold, and remaining quantities by exact Plant + Trip + Product + Code/Class. Acquisition cost and profitability are not rendered.
- Transfers is a separate working screen; My Inventory does not show transfer controls or receipt history.
- Sales, Payments, Ledger, Collectibles, Expenses, and DCR use the signed-in Salesman's identity without a selectable employee field.
- My DTR provides one-click Time In/Time Out. The browser sends only the organization ID; the database supplies `auth.uid()` and Manila server time.
- The hosted acceptance route completed a PHP 950 Sale, PHP 450 in partial Collections, a PHP 50 Expense, a locked PHP 400 DCR, a Salesman transfer, and a complete 35-minute attendance record. Dashboard and detail screens reconciled after each action.
- Hosted authorization probes passed for Stock In denial, cross-salesman Sale denial, hidden cross-salesman inventory/financial rows, Plant and role-edit denial, direct inventory-write denial, locked-DCR rewrite denial, completed-DTR edit denial, and electronic-payment reference enforcement.

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

### 5. Password Change Event Race

**Classification:** BUG
**Severity:** Low
**Module:** Account security
**Reproduction:** Complete the first-login password change while Supabase emits `USER_UPDATED` before the required-change database flag is cleared.
**Expected:** The success confirmation remains visible and Continue refreshes the access record once.
**Actual:** The access record could reload early and remount the forced form.
**Fix:** Treat `USER_UPDATED` as a session-only refresh. The explicit completion RPC clears the flag, and Continue performs the authoritative access reload. Added a regression assertion.

## Remaining Non-Blocking Items

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

Local-data mode started successfully. Owner/Admin retained the complete workflow; Warehouse was limited to Warehouse, DTR, and Trucks; Salesman received the dedicated Dashboard, My Inventory, Sales, Payments, Collectibles, Ledger, Transfers, Expenses, My DCR, and My DTR workspace. Local Time In/Time Out shares state between Dashboard and My DTR. The role selector exposes no Cashier option, and Salesman identity is fixed in field workflows. No hosted credentials are required for local mode.

## Database And Tooling Checks

- Supabase changelog was reviewed before hosted validation. The project runtime uses Node.js 24, so the announced Node.js 20 deprecation is not a blocker.
- Database lint passed for application schemas `api`, `private`, and `public` at error level.
- An all-schema lint run reported only managed pgTAP self-reference noise under the `extensions` schema; this is not an application schema defect.
- Migration `20260914173236_align_roles_with_client_workflow.sql` was applied to hosted DEV and the remote migration state is current.
- Migration `20260915074952_secure_username_account_management.sql` was applied to hosted DEV; a final linked dry run confirmed no pending migrations.
- Migration `20260916135900_salesman_attendance_clock.sql` was applied to hosted DEV. It provides self-only, server-timestamped Time In/Time Out RPCs and audited Owner/Admin corrections.
- The `username-login` and `manage-salesman-account` Edge Functions were deployed to DEV and passed the hosted account lifecycle/security scenario.
- Database advisors returned no error-level findings. The warning for authenticated execution of `complete_own_password_change()` is intentional: it is a targetless `SECURITY DEFINER` RPC bound to `auth.uid()` and an active membership. Remaining warnings are the project-level leaked-password-protection setting and pre-existing RLS performance suggestions.
- The migration preserves `cashier` only as an inactive legacy text value while preventing operational assignment or access.
- The updated pgTAP role and account-security files could not be launched by the CLI because Docker/Podman is unavailable on this machine. Equivalent role, account, and RLS paths passed against hosted DEV through the disposable direct integration scenario.

## Cleanup And Security

- Temporary hosted QA users remaining: **0**
- Retained configured DEV accounts: **1 Owner/Admin and 1 Salesman**
- Temporary customers remaining: **0**
- Temporary trips remaining: **0**
- Temporary sales/payments/expenses/DCRs remaining: **0**
- No credentials were written to source files or committed.
- The temporary QA runner was removed after cleanup.
- Supabase sequence counters advanced normally; no operational QA records remain.

## Final Verification

- Automated tests: **108 passed, 0 failed**
- Production build: **PASS**
- Application-schema database lint: **PASS**
- Hosted browser console: **PASS, no errors/warnings**
- Local browser console: **PASS, no errors/warnings**
- Secret scan: **PASS**
- Hosted cleanup: **PASS**

## Acceptance Recommendation

Accept the audited workflow as a **client-ready account-management checkpoint**. The implementation is functionally coherent, reconciles end to end, and now matches the confirmed operational roles. Keep hosted discrepancy resolution as an explicitly scoped follow-up instead of weakening RLS without an approved ownership and audit design.
