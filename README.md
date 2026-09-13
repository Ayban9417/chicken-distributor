# Chicken Distribution Workflow Prototype

This is a standalone concept workflow prototype for a whole-dressed chicken distributor. It is designed for client presentation and workflow validation only.

It is not the production system.

## What this prototype does not include

- No database
- No backend
- No authentication
- No persistence
- No Supabase
- No external APIs

All data is demo/mock data held in local React state. Data resets on page refresh.
Startup is genuinely empty: no customers, stock, transactions, DTR, payroll or trucks.
Plant/product/code configurations and Owner/Admin, Agent and Cashier users remain.

## Tech Stack

- React
- Vite
- Tailwind CSS
- Lucide React icons
- Local React state only

## Launch

```bash
npm install
npm run dev
```

Then open the local URL shown in the terminal.

## Demo Flow

The business date is fixed at September 6, 2026 for a repeatable presentation.
The default business week is August 31 through September 6.

1. Dashboard starts at zero. Open Ledger > Add Customer, or Quick Add in Sales.
2. Add Golden Chicken House, Cash / Credit, optional PHP 100,000 credit limit.
3. Plants: receive Bounty P1/P2/G with independently entered bags, KG and fictional
   acquisition costs. Add a free by-product if desired.
4. Inventory: inspect each exact Plant / Trip / Product / Code and cost value.
5. Sales: select the customer and received stock. For a PHP 50,000 example, enter
   200 kg at PHP 250/kg with at least 200 kg available, then a Trust Receipt.
6. Review Sale defaults to No Payment Yet. Optionally click Add Payment and enter
   PHP 20,000 Cash. Review shows PARTIALLY PAID and PHP 30,000 remaining.
7. Confirm once. Ledger shows a PHP 50,000 charge and a separate PHP 20,000 payment.
8. Collectibles shows PHP 30,000. Payments can settle it later, including two
   PHP 15,000 FIFO payments. GCash/Bank Deposit require external references.
9. Payments: enter an Agent Expense. DCR: Generate, enter/check actual remittance,
   then Submit. Later payments/expenses flag changes after lock without rewriting it.
10. Daily Summary, Dashboard and Reports keep Sales, Payments, costs and receivables
    separate. Switch date ranges to inspect only actual recorded activity.
11. Administration manages plants, customers and users. DTR/Payroll and Trucks remain
    available for manual setup and activity; none has preloaded runs or history.
12. Administration > Reset Operational Data requires confirmation. It clears all
    operational data, customers and trucks, while keeping current Plant/product/code
    and user configuration. Cancel changes nothing. Reload restores startup defaults.

## Notes

All acquisition costs entered for the demo are fictional, not actual supplier or
market prices. Bags have no implicit KG conversion. Historical sample records now
live only in tests/fixtures/historicalDemo.js and are not imported by the application.

Payroll is a demo estimate, not a Philippine statutory payroll engine. It is not
automatically posted as an operating expense or cash remittance. Customer
advances/overpayments, overnight shifts, and retroactive payroll corrections are
outside this iteration.

Run calculation regression checks with `npm test` and the production build with
`npm run build`. See [UPGRADE-REPORT.md](./UPGRADE-REPORT.md) for implementation
details, verification results and business assumptions.

## Plant Configuration

Choose Owner / Admin in the local demo role selector, then open Administration >
Manage Plants. Add or edit plants, products, free-stock allowances and optional
size codes. Stock In only offers active configurations; coded products require a
configured code. Magnolia's Whole Chicken receipts are uncoded. Configuration edits
do not rewrite receipts that you create during the demonstration.

Deactivation stops new receipts, not the sale of remaining historical inventory.
Used products/codes cannot be removed. Plant, product and code names/categories
are snapshotted on new receipts; subsequent edits never rewrite prior stock or
financial transactions. All configuration and operational changes reset on reload.
The role selector is only prototype UI gating, not security or authentication.

See [PLANT-CONFIGURATION-REPORT.md](./PLANT-CONFIGURATION-REPORT.md) for the model,
integration details and verification results.

## Customers

Owner / Admin can add customers from Ledger and manage them from Administration >
Manage Customers. Sales has a searchable selector and a lightweight Add New Customer
drawer that selects the new record without clearing entered sale products or quantities.
All screens share one customer state, including Payments, Collectibles and Reports.

Search accepts customer names, contact people and mobile numbers. Duplicate names or
mobile numbers prompt Use Existing Customer or Create Anyway. Inactive customers stay
in financial history and Payments but are excluded from new Sales. Customers with
transactions cannot be deleted.

Credit limits are optional and warning-only; payment types/days are descriptive demo
terms, not a final credit-approval policy. Money received can be recorded at Sale
confirmation or later in Payments. Blank customer selling prices use existing defaults.
Acquisition costs remain attached to inventory, never customer configuration.

See [CUSTOMER-MANAGEMENT-REPORT.md](./CUSTOMER-MANAGEMENT-REPORT.md) for the model,
permission preparation, files changed and end-to-end validation results.

## Payment at Sale and Reset

Initial payment is optional, from zero through the Sale Total. Cash needs no external
reference; GCash and Bank Deposit do. Bank verification and locked-DCR alerts remain.
An initial payment is allocated to its own Sale, even if the customer has older debt;
later Payments retain FIFO allocation. Sales never become cash receipts automatically.

See [CLEAN-START-PAYMENTS-REPORT.md](./CLEAN-START-PAYMENTS-REPORT.md) for the latest
implementation and verification. Earlier reports describe previous prototype stages.

## Supabase Backend Foundation (Phase 1)

The `feature/supabase-backend` branch contains a development-only Supabase foundation.
The React prototype is still local-state only; this phase does not connect the UI,
add authentication screens, or import demo operations. See
[SUPABASE-BACKEND-PLAN.md](./SUPABASE-BACKEND-PLAN.md) and
[BACKEND-AUDIT.md](./BACKEND-AUDIT.md) for the schema, RLS, RPC, ledger, concurrency,
and migration notes.

With Docker installed, the local workflow is:

```bash
supabase start
supabase db reset
supabase test db
supabase db lint --local
```

The Phase 1 backend foundation has been validated against its dedicated hosted
development project. See [PHASE-1-EXECUTION-REPORT.md](./PHASE-1-EXECUTION-REPORT.md)
for the hosted test, concurrency, lint and advisor results. Never put a database
password, service-role key or access token in the repository. The React app remains
entirely local-state based until Phase 2 is explicitly approved.
