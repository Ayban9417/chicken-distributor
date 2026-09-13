# Dynamic Customer Management

## Shared Model

App owns a single local React customer array consumed by Sales, Ledger, Payments,
Collectibles, Dashboard/Reports and Administration. Existing customer IDs, assigned
agents, type labels, credit limits and special selling prices are preserved.

Records add contactPerson, mobile, address, paymentType, optional paymentDays and
active status. Customer types remain free text with suggestions. Credit limits and
prices are numeric values; unset limits/days are null. The existing pricing map stays
keyed by product name. Monetary inputs use existing comma formatting. Clearing a price
removes its override; explicit zero is preserved. No acquisition cost is configured here.

## Entry Points

- Ledger: Owner / Admin sees Add Customer and Edit Customer. The full drawer includes
  contact details, flexible type, Cash/Credit/Cash / Credit, credit limit, terms/days,
  status and customer-specific selling prices.
- Administration > Manage Customers: searchable configuration table with Edit,
  Pricing, View Ledger, Activate/Deactivate and Delete-unused actions.
- Sales: searchable customer selection and lightweight Add New Customer. A no-match
  search offers Add followed by the searched name. Quick Add contains only name,
  contact, mobile, address, payment type and optional credit limit.

Add & Select Customer saves to shared state, closes the drawer and selects the new
customer in the current Sale. Trip/product/code groups, quantities, trust receipt,
date and explicitly selected agent remain. Customer-default selling prices update to
the selected customer's defaults; manually overridden selling prices remain intact.
Cancel leaves the Sale untouched. Quick Add does not navigate away from Sales.

## Financial Integration

New customers initially have zero balance and No Transactions Yet. No extra ledger
or collectible records are manufactured during creation. Sales and Payments continue
to create the existing transaction records; balances and Collectibles derive from them.

Payments immediately includes new customers, supports inactive customers settling old
balances, and retains Cash, GCash, Bank Deposit, electronic references, partial payments
and FIFO allocation. Zero-balance customers are absent from Collectibles but remain in
Ledger. Customer detail displays contact information, terms, credit limit, outstanding,
available credit, transaction history/trust receipt and special selling prices.

Available Credit = Credit Limit - Outstanding. Missing limits display Not set.
Credit-enabled customers exceeding their limit see Credit Limit Exceeded in both the
Sale editor and Review Sale. Submission is allowed and the warning is audited.
This is explicitly a warning-only prototype policy, not a final approval rule.
Payment types/days are descriptive; Cash Sales do not fabricate received payments.

## Duplicates and Permissions

Duplicate checks use case/spacing/punctuation-normalized names and normalized mobile
numbers, including Philippine +63/09 equivalents. Inactive records are checked too.
Possible existing customer offers Use Existing Customer or Create Anyway. Editing
excludes the same customer ID and warns about collisions with other records. Inactive
duplicates cannot be selected for a new Sale through Quick Add.

Customer permissions are centralized in a small configuration map. Owner / Admin has
management and Quick Add; Agent has Quick Add but no management; Cashier/Warehouse
have neither. The existing demo role selector represents access, without authentication.

Customers referenced by any Sale, Payment or Ledger entry cannot be deleted. They may
be deactivated instead. Their IDs and historical transactions remain intact; inactive
customers are excluded from new Sales and confirmation validates active status.

## Verification

28 automated tests passed: 22 existing regressions plus six new customer tests covering
normalization, numeric money, validation, duplicates, consistent search, credit, FIFO
settlement, collectibles, history protection and selling/acquisition cost separation.

Browser validation completed in local demo state:

1. Entered a Sale with 200 kg, PHP 250/kg override and TR-GOLDEN before Quick Add.
2. Searched for Golden Chicken House, created it with contact/mobile/address,
   Cash / Credit and PHP 100,000 credit limit. Input displayed 100,000.
3. Verified automatic selection, preserved Sale inputs and PHP 50,000 review total.
4. Confirmed Sale; Ledger displayed PHP 50,000 charge, trust receipt and outstanding.
5. Collectibles showed the customer; recorded PHP 20,000 Cash using existing FIFO.
6. Ledger showed PHP 30,000 balance and PHP 70,000 available credit.
7. Recorded PHP 30,000; balance became zero, Collectibles cleared, Ledger retained
   the Sale and both Payments.
8. Re-entered the same name: duplicate warning appeared; Use Existing selected the
   original customer without creating another record.
9. Edited address, terms and special Whole Chicken selling price to PHP 180/kg.
   New Sale picked up PHP 180 while the previous PHP 250 sale remained unchanged.
10. Deactivated the customer: history remained, new Sale search excluded it.
11. Reactivated and lowered the limit for a warning test: warning displayed and
    confirmation remained available.
12. Added an unused customer from Ledger: zero balance and No Transactions Yet;
    deleted it from Administration. Historical customer deletion remained disabled.
13. Verified Agent Quick Add availability and absence of management; Cashier had
    neither entry point.
14. Checked Sales, Ledger, Payments, Collectibles and Manage Customers at 1440x960,
    820x1180 and 390x844: 15 checks without page overflow. Inspected desktop full
    editor, mobile Quick Add/management and tablet Ledger screenshots. Corrected
    cramped tablet amounts/contact fields. Browser error/warning console was empty.

Production build passed with Vite. No packages were added.

## Files Changed

- src/App.jsx: shared state, customer editor lifecycle, role gating, Sales/Ledger/
  Payments integration, credit warnings and Administration entry point.
- src/components/CustomerManagement.jsx: full/quick drawers, reusable search/selector,
  duplicate UI and management table.
- src/utils/customers.js: normalization, validation, duplicate/search rules,
  history checks, credit calculations and permission configuration.
- src/components/Reporting.jsx: shared customer search in Collectibles.
- src/utils/business.js: preserve explicit zero selling-price overrides.
- src/index.css: scoped customer management labels/contact layout.
- tests/customers.test.js: customer regression tests.
- README.md and this report: workflow notes and verification.

Frontend-only: all changes reset on reload. No database, backend, Supabase, persistence
or real authentication was added. No GitHub commit or push was made.
