# Chicken Distribution Workflow Prototype

This is a concept workflow prototype for a whole-dressed chicken distributor. It supports a local React-state demonstration and an authenticated Supabase DEV mode for client acceptance testing.

It is not the production system.

## Operational roles

- Owner / Admin: full oversight, Stock In, sales, collections, reporting, and administration.
- Warehouse: Warehouse inventory, Receiving Receipts, and Warehouse-to-Salesman transfers. Warehouse cannot Stock In or record customer payments.
- Salesman: own assigned inventory, Sales, customer collections, own expenses and DCR, and permitted Salesman transfers.
- Payroll Admin: DTR/Payroll access where configured.

Customer collections are performed by Salesmen or the Owner / Admin. The client does not use a Cashier role. The historical database value is retained only as a disabled legacy value and is not assignable in the application.

Local mode keeps its data in React state and resets on refresh. Hosted mode uses the linked Supabase DEV project with Auth, RLS, and transactional RPCs. This remains a prototype, not a production deployment.

## Tech Stack

- React
- Vite
- Tailwind CSS
- Lucide React icons
- Supabase Auth/Postgres/RLS in hosted DEV mode
- Local React state fallback mode

## Launch

```bash
npm install
npm run dev
```

Then open the local URL shown in the terminal.

Set `VITE_DATA_MODE=local` for the standalone local demonstration. Hosted mode additionally requires the project URL and publishable/anon browser key in an ignored `.env.local`. Never place a service-role or secret key in the frontend.

## Demo Flow

The local business date is fixed at September 13, 2026 for a repeatable presentation.

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
9. Payments: enter a Salesman Expense. DCR: Generate, enter/check actual remittance,
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

## Supabase Hosted Mode

The `feature/supabase-frontend` branch connects the parity frontend to the development-only Supabase foundation. Authentication, role-scoped navigation, RLS, transactional inventory, sales, payments, DCR, and reports are integrated. See [FINAL-ACCEPTANCE-AUDIT.md](./FINAL-ACCEPTANCE-AUDIT.md) for the current acceptance evidence and [BACKEND-AUDIT.md](./BACKEND-AUDIT.md) for the schema and security model.

With Docker installed, the local workflow is:

```bash
supabase start
supabase db reset
supabase test db
supabase db lint --local
```

The hosted foundation and frontend parity flow are validated against a dedicated development project. Never put a database password, service-role key, or access token in the repository.
