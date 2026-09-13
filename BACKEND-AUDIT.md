# Backend Migration Audit

## Scope

This audit covers the React/Vite prototype before Supabase integration. The frontend remains a local-state demonstration in Phase 1. No component reads from or writes to Supabase yet.

Reviewed areas include `src/App.jsx`, Warehouse and Salesman Inventory, Plant configuration, Stock In, Sales, Payments, Ledger, Collectibles, DCR, reporting, users, DTR, payroll, trucks, demo data, utility functions, and all 46 frontend tests.

## Current Architecture

- One React component tree owns all operational arrays through `useState`.
- Business operations validate current arrays, then update several independent arrays with separate state setters.
- Inventory is derived from Stock Trips, Warehouse-to-Salesman receipts, Salesman transfers, OUT movements, and adjustments.
- Customer balances and ledger activity are derived from sale charges and payment allocations.
- DCR totals are derived from payments and approved expenses, then copied into a locked local snapshot.
- Roles are a UI selector only. There is no identity, authentication, authorization, persistence, transaction, or concurrency boundary.
- IDs and receipt numbers are generated locally using random UUIDs, timestamps, or current array length.

## Core Entities

- Organization, profile, organization membership, and role.
- Plant, Product, Plant Product, Product Code, and Product Class Type.
- Stock Trip and Stock Trip Line.
- Inventory Lot and Inventory Movement.
- Warehouse Receiving Receipt and line.
- Salesman Transfer Receipt and line.
- Customer and Customer Price.
- Sale and Sale Line.
- Payment and Payment Allocation.
- Expense and Daily Cash Report.
- Discrepancy and Audit Event.
- Truck, Truck Renewal, and Truck Maintenance.
- Time Entry, Payroll Period, and Payroll Entry.

## Transaction Flow

`Plant configuration -> Stock Trip -> Inventory Lot -> Warehouse custody -> Receiving Receipt -> Salesman custody -> optional Salesman Transfer -> Sale -> Payment Allocation -> Customer Ledger / Collectibles -> DCR`

Stock identity is the source lot, which preserves Plant + Trip + Product + optional Code + optional Class Type + acquisition cost. Bags and Head Count are supplemental quantities and never imply a KG conversion.

## Persisted Versus Derived Values

Persist these immutable or historical facts:

- Organization membership and role at the time of authorization.
- Master/configuration records and active flags.
- Stock Trip receipt facts and acquisition cost snapshots.
- Inventory lots and immutable custody movements.
- Receipt headers, receipt lines, document numbers, and client idempotency keys.
- Sale headers and exact source-lot lines, including selling and acquisition price snapshots.
- Payments, allocations, verification state, notes, and void metadata.
- Expense facts, locked DCR snapshots, discrepancies, and audit events.
- Truck, renewal, maintenance, time, and payroll snapshots.

Derive rather than directly overwrite:

- Warehouse available KG.
- Salesman available KG.
- Total company physical stock.
- Customer balance, collectibles, and ledger running balance.
- Gross margin percentages and reporting aggregates.
- Current inventory value.
- Open receivable per Sale.

Sale monetary snapshots such as net sales, COGS, and gross profit should be persisted because they represent the confirmed transaction and protect history from later configuration changes. Database constraints must verify their internal arithmetic.

## Findings

### CRITICAL

1. **Critical writes are non-atomic.** Sale confirmation separately updates Sales, Inventory Movements, Ledger, Payments, Discrepancies, and Audit arrays. An exception, refresh, duplicate click, or future network failure can leave only part of the transaction recorded.
2. **Validation and deduction are separated.** Warehouse transfers, Salesman transfers, Sales, and Payments first calculate availability and then write later. Two concurrent clients can both observe the same balance and oversell or over-transfer it.
3. **There is no real authorization.** The role selector only hides UI. Any future direct database access without RLS and RPC validation would allow cross-organization and cross-Salesman mutation.
4. **No idempotency boundary exists.** A retried Sale, transfer, or Payment can duplicate financial and inventory effects. Random row IDs alone do not identify a retried business request.

### HIGH

1. **Receipt numbering is race-prone.** Sale, Receiving Receipt, Transfer Receipt, and Payment references are based on array length or maximum local value. Concurrent creators can produce the same number.
2. **Trust Receipt uniqueness is UI-only.** The comparison is correctly case-insensitive locally, but it needs a case-insensitive organization-scoped unique index.
3. **Payment allocation integrity is UI-only.** FIFO and manual allocations can race and over-allocate a Payment or Sale unless the open Sales are locked in one transaction.
4. **Inventory movement duplication is unconstrained.** There is no database uniqueness tying one business line to one movement. A repeated handler can deduct the same lot twice.
5. **DCR locks are local snapshots.** Post-lock Payments or expenses are detected only when routed through current component helpers. Direct or concurrent writes could bypass the warning.
6. **Document history depends on mutable arrays.** Deactivation is handled carefully in the UI, but foreign keys and restrictive deletes are required to ensure old stock, receipts, Sales, and costs remain readable.
7. **Electronic payment verification policy is unresolved.** The prototype records Bank/GCash and reduces receivables immediately while separately flagging some verification work. Production policy must decide whether pending electronic Payments affect balances.

### MEDIUM

1. Quantity and money rounding use JavaScript numbers. PostgreSQL should use explicit numeric precision and enforce positive quantities and nonnegative monetary values.
2. Bags and Head Count are independent metadata, but partial-KG transfer allocation has no final business rule. No fixed conversion should be inferred.
3. Customer duplicate detection allows an explicit override. The database should not impose a strict unique customer name until branch/naming rules are confirmed.
4. Credit limits are warning-only. The database design preserves this behavior; hard credit blocking remains a policy decision.
5. Price overrides are detected by comparing the current customer/default price. The confirmed Sale Line must snapshot both the charged price and relevant default.
6. Inventory adjustments are conceptually supported but need explicit reason, actor, location, and immutable audit linkage.
7. Salesman Inventory presentation can show aggregate assignments, while the database must retain lot-level custody and cost basis underneath.
8. Current payment dates and Sale dates are trusted after client-side checks. RPCs must reject allocations to later or ineligible Sales.
9. User, Customer, Plant, Product, Code, and Class Type deactivation needs soft-delete semantics. Operational foreign keys should use `RESTRICT`, not cascading history deletion.

### LOW

1. Local identifiers use mixed prefixes and UUID/timestamp helpers. Production tables should use UUID primary keys and independent business document sequences.
2. Some reports currently aggregate on client-generated arrays. SQL views should establish one canonical definition per metric.
3. Truck renewal dates are derived in JavaScript. The database should enforce the three-month relation.
4. DTR does not support overnight shifts. The conservative schema will reject negative same-day durations until that rule is defined.
5. Payroll is an estimate only and is not a statutory Philippine payroll implementation.

## Inventory Invariants

- Movement quantity is always positive; direction is represented by source and destination custody.
- A Stock Trip Line creates exactly one source Inventory Lot and one initial external-to-Warehouse movement.
- A movement references one exact lot, so cost and Plant/Trip/Product/Code/Class cannot drift.
- Warehouse balance is inbound-to-Warehouse minus outbound-from-Warehouse for one lot.
- Salesman balance is inbound-to-that-Salesman minus outbound-from-that-Salesman for one lot.
- Company physical stock is Warehouse plus all Salesman custody. Internal transfers must net to zero.
- A Sale is the only normal movement from Salesman custody to Customer custody.
- Sold-out lots remain queryable with a zero balance.
- Free-from-Plant lots have zero acquisition cost and therefore zero COGS.

## Concurrency Strategy

Transactional RPCs lock every affected `inventory_lots` row with `FOR UPDATE` in stable UUID order before recalculating custody balances. Serializing all writes for an affected lot is conservative but prevents concurrent overselling and deadlocks caused by inconsistent lock order.

Payments lock eligible Sales rows in oldest-first order before calculating open balances and inserting allocations. Document numbers come from an organization-scoped sequence row updated atomically inside the same transaction. Client request UUIDs are unique per organization and make retries idempotent.

## UI-Only Validation To Move Into PostgreSQL

- Active organization membership and allowed role.
- Active Plant/Product/Code/Class configuration.
- Positive KG, valid bag/head counts, acquisition rules, and exact source lot.
- Warehouse and Salesman availability.
- Unique case-insensitive Trust Receipt and generated receipt numbers.
- Customer and Salesman validity.
- Sale arithmetic and exact source cost.
- Payment method/reference rules and allocation ceilings.
- DCR uniqueness, expected cash calculation, and locked snapshot behavior.
- No self-transfer, backwards truck mileage, overlapping payroll entries, or duplicate time entry date.

## Recommended Migration Order

1. Organization, Auth profile, membership, and role helpers.
2. Plant/Product configuration and historical-safe constraints.
3. Stock Trips, source lots, movement ledger, and balance views.
4. Receiving and Transfer Receipts with atomic RPCs.
5. Customers, Sales, and atomic Sale creation.
6. Payments, FIFO allocations, customer balances, and ledger views.
7. Expenses, DCR snapshots, post-lock discrepancy detection, and audit events.
8. Trucks, DTR, and conservative payroll foundation.
9. RLS policies, explicit grants, database tests, advisors, and generated types.
10. Frontend integration in a separately approved Phase 2.

## Unresolved Business Rules

- Whether pending GCash/Bank verification reduces the customer balance immediately.
- How Bags and Head Count should be apportioned when only part of a KG line moves or sells.
- Whether customer credit limits become hard blocks or remain warnings.
- Who may approve expenses and verify electronic payments.
- Whether Salesmen may view all customer records or only assigned/recent customers.
- Whether Warehouse users may see every Salesman's detailed inventory or only transfer destinations.
- Sale void/refund/return workflows and inventory disposition.
- Inventory adjustment approval thresholds and physical-count workflow.
- Overnight DTR, leave, holidays, and final payroll policy.
- Statutory SSS, PhilHealth, Pag-IBIG, withholding tax, and payroll posting are deferred.

## Production Readiness By Area

- **Ready for schema foundation:** organization isolation, dynamic Plant configuration, exact lot identity, inventory ledger, transfers, Sales, Payments, derived customer ledger, DCR snapshots, audit/discrepancies, trucks.
- **Foundation only:** DTR and payroll.
- **Deferred:** frontend integration, real user onboarding, electronic payment verification workflow, returns/voids, inventory counts, statutory payroll, external integrations, and production data import.
