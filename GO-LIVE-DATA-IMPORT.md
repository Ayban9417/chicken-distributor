# Go-Live Data Import

Production must not load `supabase/seed.sql`. That file is DEV-only demo master data and is used by local reset tooling.

## Approved Import Order

1. Organization and initial Owner/Admin.
2. Plants.
3. Products.
4. Plant/Product links and behavior flags.
5. Product codes and class types.
6. Customers and customer-specific selling prices.
7. Salesman accounts and role assignments.
8. Trucks, only if included in initial scope.
9. Opening inventory.
10. Approved opening customer balances, if required.

## Import Package

Use reviewed CSV/XLSX source files with stable external reference columns. Each file must include source owner, extraction date, row count, checksum, validation status, and approver. Reject duplicate normalized usernames, Plant codes, Product mappings, customer identities, and references before import.

## Opening Inventory

Load opening stock through the Stock In transaction path or a reviewed one-time import function that produces equivalent lots, movements, and audit events. Every line must preserve:

- Plant
- opening Trip/reference and effective date
- Product
- code and class, when configured
- kilograms
- bags and head count, when applicable
- acquisition cost per kilogram
- purchased/free acquisition status
- import batch and source document

Use an explicit reference such as `OPENING-YYYYMMDD-BATCH-N`, never a fake supplier Trip. Reconcile per Plant, Product, code/class, and total acquisition value before allowing Warehouse transfers.

## Outstanding Balances

Client decision required. Preferred options are approved opening receivable documents with original customer, reference, date, terms, amount, and assigned Salesman, or a full historical Sale/Payment reconstruction. Never insert a balance directly without ledger-supporting records and an audit batch.

## Cutover

1. Freeze source-system entry at the agreed timestamp.
2. Export and checksum the final files.
3. Import into a disposable/staging copy first.
4. Run duplicate, referential, negative-value, and required-field checks.
5. Reconcile inventory kilograms/value, customer balances, user counts, and master-data counts.
6. Obtain written approval.
7. Import once into PROD using the same scripts and manifest.
8. Archive the signed manifest and reconciliation report.

## Prohibited

- Running DEV seed/reset commands against PROD.
- Importing Fkidz demo quantities or QA users.
- Storing temporary passwords in import files or public tables.
- Directly setting derived inventory balances, COGS, profit, DCR totals, or document counters.
