# Client UAT Checklist

Environment: dedicated DEV/UAT only. Do not use production credentials or opening quantities.

## Owner/Admin

- [ ] Login by username and change a temporary password.
- [ ] Dashboard totals match the selected week and source transactions.
- [ ] Create/edit/deactivate Plant configuration, Product links, codes, and classes.
- [ ] Stock In coded, uncoded, by-product, purchased, and free lines.
- [ ] Warehouse shows exact Trip/Product/code/class and sold-out rows.
- [ ] Transfer Warehouse stock to a Salesman; verify RR and remaining stock.
- [ ] View Plant-first company Inventory and reconcile Warehouse + Salesman + sold.
- [ ] Create/edit/deactivate Customers and selling prices.
- [ ] Create Sale, partial/full Payment, Ledger, and Collectibles checks.
- [ ] Review Expense, DCR, discrepancies, Reports, and audit trail.
- [ ] Create/deactivate/reactivate/reset a Salesman account.
- [ ] Review and correct DTR with a required reason.

## Salesman

- [ ] Login and complete forced password change.
- [ ] Time In; confirm server-recorded time and duplicate-safe behavior.
- [ ] View only own Inventory with no acquisition cost/profit.
- [ ] Create a one-origin Sale and an optional multi-origin Sale.
- [ ] Confirm duplicate Trust Receipt and insufficient stock are blocked.
- [ ] Record Cash, GCash, and Bank Payments; electronic references are required.
- [ ] View own Collectibles and Ledger.
- [ ] Transfer own stock to another Salesman and verify both sides.
- [ ] Record an Expense; repeated submit does not duplicate it.
- [ ] Submit DCR and confirm it locks.
- [ ] Time Out; confirm duplicate-safe behavior.

## Security And Device Checks

- [ ] Warehouse cannot Stock In, collect Payments, edit Plants, view payroll, or view financial reports.
- [ ] Salesman cannot view another Salesman's stock/financial records or company costs/profit.
- [ ] Deactivated Salesman loses access with an existing session.
- [ ] Test 1440x960, 768x1024, and 390x844 with no page overflow or unreachable actions.
- [ ] Simulate offline/network failure and confirm a recoverable message, not a white screen.
- [ ] Browser console has no uncaught errors during the full flow.

## Reconciliation And Sign-Off

- [ ] Original inventory = Warehouse + Salesman remaining + sold +/- approved adjustments.
- [ ] Sale total = paid + outstanding.
- [ ] Expected physical cash = Cash collections - approved cash-paid Expenses.
- [ ] Client records accepted differences and policy decisions.
- [ ] Client representative, implementation representative, date, and release-candidate commit are recorded.
