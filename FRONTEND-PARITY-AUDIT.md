# Frontend Parity Audit

Date: 2026-09-14
Branch: `feature/supabase-frontend`

## Architecture Finding

The repository currently has two frontends selected in `src/main.jsx`:

- `App.jsx` is the client-approved prototype. It owns the original shell, navigation, drawers, visual hierarchy, local state, and the detailed workflows.
- `SupabaseApp.jsx` is an authenticated but separate hosted application. It uses `CoreOperations.jsx` and `Hosted*` pages with validated Supabase services/RPCs, but it changes navigation, layout, terminology, and workflow depth.

The target is one original-style application shell and one set of business UI components, supplied by a local or Supabase data/action adapter. Auth, organization, role context, services, RPCs, RLS, and the Supabase client remain reusable infrastructure.

## Navigation Parity

The original `App.jsx` already uses the approved order and labels:

1. Dashboard
2. Plants
3. Warehouse
4. Inventory
5. Sales
6. Payments
7. Ledger
8. Collectibles
9. Daily Cash Report
10. Discrepancies
11. Reports
12. DTR
13. Payroll
14. Trucks
15. Administration

Hosted mode currently inserts `Plant Configuration` and `Stock In` as separate primary items, calls Inventory `Salesman Inventory`, omits Discrepancies and Administration, and places Reports/Trucks differently. This must be replaced by the original ordering; Plant configuration belongs inside Plants/Administration.

## Screen Audit

| Original screen | Current hosted equivalent | Parity gaps |
| --- | --- | --- |
| Dashboard | `LiveDashboard` | Hosted cards are a smaller operational summary. Missing the original weekly/date-range hierarchy, collectibles callouts/actions, whole chicken and by-product measures, richer Sales by Plant/customer/product presentation, inventory summaries, original uppercase headers, and drill-through behavior. |
| Plants | `LivePlantManagement` plus separate `StockInScreen` | Hosted navigation splits configuration from intake and renames the primary item. The original combines Trips/Stock In history, product/code/class rows, bags, heads, free stock, acquisition cost, trip summaries, and Administration entry into one client workflow. Hosted forms persist the core fields but do not preserve the original staged layout and history presentation. |
| Warehouse | `WarehouseScreen` | Core lot and RR transfer persistence exists. Missing the original custody breadcrumb, KPI hierarchy, detailed Plant/Trip/Product/Code/Class table, bags/heads columns, visible zero/SOLD OUT rows, red status, inventory detail drawer, receipt history, and original transfer form layout. |
| Inventory | `SalesmanInventoryScreen` | Core salesman stock and TF RPC exist. Missing original Salesman selector treatment, original/sold/remaining quantities, zero/SOLD OUT retention and red state, cost-basis/detail drawer, bags/heads, warehouse return navigation, and full transfer receipt table. |
| Sales | `SalesScreen` | Hosted mode is a single compact line editor. Missing the approved one-origin-first Plant/Trip group workflow, optional unlimited additional groups, exact group separation/removal, customer search/quick-add, highlighted customer identity, product availability context, edit/review summary, duplicate Trust Receipt wording, customer-specific pricing presentation, price override cues, bags/heads where applicable, and rich OUT history/details. |
| Payments | `FinanceScreen(view="payments")` | Persistence, partial payment, FIFO allocation, methods, reference, and notes exist. Missing original searchable customer-led workflow, highlighted customer/balance, payment allocation preview/detail, richer history columns/drawers, branch-description treatment, and post-DCR adjustment feedback. |
| Ledger | `FinanceScreen(view="ledger")` | Hosted rows include core balances but flatten the original customer-ledger workflow. Missing prominent customer context, salesman and Trust Receipt detail parity, running-balance presentation, sale/payment drill-down drawers, filters, and customer management linkage. |
| Collectibles | `FinanceScreen(view="collectibles")` and report tab | Hosted data identifies open balances. Missing original oldest-first/customer/highest sorting controls, customer search, prominent customer names, due context, inline Payment and Ledger actions, and dashboard compact variant. |
| Daily Cash Report | `DcrScreen` | Validated DCR RPC and expense persistence exist. Missing original salesman-day presentation, collection/payment detail, stronger cash/GCash/bank separation, locked-state history treatment, shortage/overage emphasis, discrepancy creation feedback, and post-DCR alert UI. |
| Discrepancies | None | Entire screen and navigation item are absent in hosted mode. Existing backend discrepancy rows are surfaced only indirectly in reports/DCR behavior; the original list, status, issue detail, customer context, and resolution interaction are missing. |
| Reports | `HostedReports` | Hosted reports now cover financial, plant/product profitability, collectibles, warehouse/salesman stock, transfers, and DCR with date ranges. Missing the original report selector and unified rich report experience: Weekly Business Report, Daily Summary, Inventory, Inventory Transfers, Sales, Payments, Collectibles, Salesman Accountability, Discrepancies, sale references, trip summary, customer profitability, and original table/KPI composition. |
| DTR | `HostedDtr` | Hosted persistence, filters, edit, calculations, loading/error/empty states, and role-aware RLS work. Missing the original Attendance/clock controls, Manual Entry wording/layout, Today shortcut, original responsive table treatment, and original component reuse. |
| Payroll | `HostedPayroll` | Hosted periods, DTR-derived hours, pay calculations, and Draft/Reviewed/Paid persistence work. Missing the original `Payroll` component layout, per-employee draft editor behavior, original DTR snapshot presentation, and original action/summary arrangement. Hosted mode correctly warns that statutory deductions are not implemented. |
| Trucks | `HostedTrucks` | Hosted CRUD, deactivate/reactivate, mileage, LTO, three-month renewal, oil/maintenance history, and alerts work. Missing the original truck-card/editor composition, service interaction layout, exact reminder labels/presentation, and original component reuse. |
| Administration | None, with Plant Configuration exposed separately | Entire original Administration screen is absent. Missing user list/status/actions, audit log, Manage Plants, Manage Customers, historical-record protections, reset placement, and role-aware administrative composition. Auth provisioning must remain separate from ordinary profile/membership management and RLS authoritative. |

## Shared Visual and Interaction Gaps

- Hosted mode uses a different header/sidebar geometry and mobile navigation model instead of the original fixed sidebar, compact header, bottom mobile navigation, footer, toast, and drawer system.
- Original uppercase/bold workflow headings, highlighted `PlantName`, customer emphasis, receipt/detail drawers, responsive table cards, and red SOLD OUT rows are inconsistently absent.
- Hosted screens frequently expose generic sections and inline forms where the prototype uses staged forms, contextual actions, summaries, and transaction detail.
- Loading, empty, and recoverable error states from hosted components must be retained when original components are adapted.
- The original demo-role switch must be replaced by the authenticated role badge/context in Supabase mode, without changing the shell.

## Business Rule Gaps To Preserve During Unification

- Exact Plant + Trip + Product + Code/Class traceability and cost basis must survive every adapter mapping.
- Zero-balance inventory lots must remain visible and display SOLD OUT in red.
- Sales must default to one origin and add further Plant/Trip groups only on request.
- Trust Receipt uniqueness, idempotency, stock sufficiency, partial/full payment, electronic references, FIFO allocation, DCR locking, and post-DCR discrepancies remain backend-authoritative.
- Customer-specific selling price and price override UI must never substitute acquisition cost.
- DTR and Payroll calculations must continue using persisted hosted rows; payroll remains a prototype without statutory deductions.

## Reuse Plan

- Keep and adapt: `App.jsx` shell, `Reporting.jsx`, `InventoryFlow.jsx`, `PlantManagement.jsx`, `CustomerManagement.jsx`, `Supporting.jsx`, shared `ui.jsx`, and the detailed Sales/Payments/Ledger/DCR components currently in `App.jsx`.
- Keep infrastructure: `AppContext`, `AuthScreen`, Supabase client, `operationsService`, `reportingService`, plant service, and hosted Trucks/DTR/Payroll services/utilities.
- Introduce an application adapter boundary that supplies normalized data, loading/error state, permissions, refresh actions, and command handlers to the original components.
- Retire `CoreOperations.jsx` and the visual portions of `HostedReports`, `HostedTrucks`, `HostedDtr`, and `HostedPayroll` only after their corresponding original screen passes local and hosted parity checks.

## Migration Acceptance Checklist

For every screen in the required order:

- Preserve original label, position, layout, terminology, and interactions.
- Map Supabase rows to the exact UI model without weakening traceability.
- Route writes through the existing validated service/RPC layer.
- Preserve local mode behavior.
- Add loading, empty, recoverable error, and role-aware states.
- Verify desktop, tablet, and mobile; confirm no console errors or white screens.
- Run relevant tests before retiring the hosted duplicate.

No backend schema, RPC, RLS, membership, allocation, inventory-ledger, DCR, or idempotency change is justified by this audit.
