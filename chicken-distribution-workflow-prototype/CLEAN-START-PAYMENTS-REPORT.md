# Clean Start and Payment at Sale

## Optional Payment

Review Sale now includes Payment at Sale, defaulting to No Payment Yet. Add Payment
reveals Amount Paid, Cash/GCash/Bank Deposit, reference and an optional Bank name.
Remove Payment returns to the unpaid flow. The review displays payment, remaining
balance and UNPAID / PARTIALLY PAID / PAID. Money uses the existing formatted input.

Payment can be zero or omitted. Positive electronic payments require a reference.
Amounts over the Sale Total, negative/nonfinite amounts and invalid methods are
blocked both by the confirm control and confirmation validation. No overpayment or
customer-advance feature was introduced. Editing a Sale revalidates payment against
the updated total; New Sale clears the optional payment form.

## Financial Meaning

Confirmation creates one Sale at its full value, exact product/code stock deductions,
one full ledger charge and, only for a positive initial payment, a separate Payment
and payment ledger entry. All updates run synchronously in one React confirmation.
Payment references are unique within the local run and trace back to the Sale.

The initial allocation targets that Sale specifically, not older invoices. Later
Payments continue using existing FIFO, partial payments and electronic references.
Ledger and Sales status derive from allocations. Collectibles derives from balances,
so fully paid invoices add no outstanding collectible.

DCR uses the actual payment method, sale date and selected Agent. Sales do not count
as cash. Bank Deposit retains its verification discrepancy. Initial payments after a
locked DCR raise Post-DCR Adjustment Detected and preserve the locked cash snapshot.
Credit-limit warnings use the unpaid portion of the current Sale.

Daily Summary uses period sale charges minus payments allocated to those sales during
the period for New Receivables. A PHP 50,000 Sale with PHP 20,000 received therefore
shows PHP 50,000 Gross Sales, PHP 20,000 Payments and PHP 30,000 New Receivables.
COGS, revenue and profitability are unaffected by whether payment was received.

## Clean Startup and Reset

Runtime initial arrays are empty for Trips, inventory movements, Sales/Trust Receipts,
customers, Payments, Ledger, expenses, DCRs, discrepancies, audit activity, DTR,
payroll and trucks. No hidden historical transactions affect totals. Truck assets
are also cleared, so no sample maintenance reminders appear.

Retained configuration: Bounty P1/P2/G and by-products; uncoded Magnolia and the other
existing plant configurations; Product Master; general selling-price defaults;
Owner/Admin, three Agents, Cashier and role definitions; truck interval rules.
The repeatable demo date remains September 6, 2026.

Old sample data was relocated to tests/fixtures/historicalDemo.js solely for regression
testing. Nothing in src imports this fixture; the production bundle excludes it.

Owner/Admin sees Reset Operational Data under Administration. A confirmation drawer
explains the complete scope and offers Cancel and Reset Operational Data. Reset clears
all operational arrays plus customers/trucks, closes drawers, discards draft forms,
clears warnings and returns to Dashboard. Current Plant/product/code and user
configuration are retained. Cancel does not change any state. No reset action is
exposed to Agent/Cashier/Warehouse. Reload restores clean startup configuration.

Inventory, Sales, Ledger, Payments, Collectibles, DCR, Reports, Discrepancies and Trucks
now have explicit empty messages and applicable creation/Stock In actions. Empty DCR
submission is disabled. Customer selection and Sale setup tolerate no customers or
Trips. Sample expense amounts and cash-shortage explanations were removed from forms.
Sale detail now resolves customers from live shared state instead of old seed data.

## Verification

37 automated tests pass: all 28 earlier regressions now use historical test fixtures,
plus nine tests covering clean startup/reset, zero payment, no payment, partial/full
Cash, partial GCash/Bank, invalid amounts/references, initial allocation and later FIFO.
Tests assert charges, payments, statuses, balances, Collectibles, COGS, DCR and summary
totals separately. A nonfinite-amount validation defect found by these tests was fixed.

Browser walkthrough completed:

1. Fresh startup: every operational module empty, Dashboard/Reports zero, users and
   dynamic plants still present. No console warnings/errors.
2. Added Golden Chicken House with PHP 100,000 credit limit and PHP 250 selling price.
3. Received 1,200 kg P1 at fictional PHP 142, 300 kg P2 at PHP 146, 300 kg G at PHP 150,
   and 40 kg free Feet. Inventory showed 1,840 kg and PHP 259,200 cost value.
4. Created PHP 50,000 Sale / TR-001. PHP 60,000 payment was blocked; PHP 20,000 Cash
   confirmed as PARTIALLY PAID. Ledger had separate charge/payment and PHP 30,000 balance.
5. DCR showed PHP 20,000 Cash; Daily Summary showed 50,000 Sales / 20,000 received /
   30,000 New Receivables. Dashboard COGS was PHP 28,400, not the payment amount.
6. Two later PHP 15,000 FIFO Cash payments cleared the balance and Collectibles.
   A PHP 500 Agent Expense produced PHP 49,500 expected remittance; DCR was generated
   and submitted/locked.
7. Additional PHP 50,000 Sales tested full Cash, no payment, partial GCash and partial
   Bank Deposit. Electronic confirmations blocked without references. Bank verification
   and post-DCR notices appeared. The locked remittance remained unchanged.
8. Combined Daily Summary reconciled PHP 250,000 Sales, PHP 140,000 received
   (100,000 Cash + 20,000 GCash + 20,000 Bank), PHP 500 expense and PHP 110,000 receivable.
9. Added Bounty P3. Cancelled Reset and verified balances remained. Confirmed Reset:
   all customer/transaction history disappeared, totals returned to zero, P3 remained.
   Agent role had no Reset action.
10. Inspected payment review at desktop 1440x960, tablet 820x1180 and mobile 390x844;
    no page or dialog overflow. Confirmed Bank payment from mobile.
11. Quick Add worked after reset with no stock or customers. Repeated reset and checked
    nine key screens at all three viewports: 27 checks without page overflow or console
    errors. Empty Sales omits invalid Plant/Trip selectors until stock exists.

Production build passes. Frontend-only: no backend, database, persistence, Supabase,
authentication infrastructure or new packages. No GitHub commit/push.

## Files

- src/data/demoData.js: clean operational-state factory and retained master users/rules.
- tests/fixtures/historicalDemo.js: relocated old seed records, test-only.
- src/utils/salePayment.js: initial payment validation and financial event construction.
- src/App.jsx: payment review/confirmation, reset, empty states and safe initialization.
- src/utils/operations.js: net new receivables in shared period calculations.
- src/components/Reporting.jsx: shared receivables and empty reporting states.
- src/components/Supporting.jsx: empty truck state.
- tests/salePayment.test.js: new payment/clean-start regressions.
- tests/business.test.js, tests/plants.test.js, tests/customers.test.js: fixture imports.
- README.md and this report: updated clean-demo walkthrough and validation.
