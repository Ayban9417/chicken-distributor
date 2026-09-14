import test from "node:test";
import assert from "node:assert/strict";
import {
  hostedDcrValues,
  hostedExpenseValues,
  hostedPaymentValues,
  normalizeHostedCollections,
  normalizeHostedCustomers,
  normalizeHostedDiscrepancies,
  normalizeHostedDcr,
  normalizeHostedLedgerEntries,
} from "../src/services/financeParityService.js";
import { customerBalance, ledgerWithRunningBalance } from "../src/utils/business.js";
import { collectibleRows } from "../src/utils/operations.js";

test("hosted customer parity preserves null credit and product pricing", () => {
  const customers = normalizeHostedCustomers([
    { id: "customer-1", name: "Branch Store", customer_type: "market_vendor", payment_type: "cash_credit", credit_limit: null, payment_terms_days: null, active: true },
  ], [
    { customer_id: "customer-1", product_id: "product-1", selling_price_per_kg: "188.50" },
  ], [
    { id: "product-1", name: "Whole Dressed Chicken" },
  ]);
  assert.equal(customers[0].creditLimit, null);
  assert.equal(customers[0].paymentType, "Cash / Credit");
  assert.equal(customers[0].pricing["Whole Dressed Chicken"], 188.5);
});

test("hosted ledger and collectibles use allocated backend credits", () => {
  const sales = [{ id: "sale-1", trust_receipt_number: "TR-100", salesman_user_id: "salesman-1" }];
  const payments = [{ id: "pay-1", payment_number: "PAY-100", customer_id: "customer-1", salesman_user_id: "salesman-1", payment_date: "2026-09-14", amount: "40", method: "gcash", reference_number: "GC-100", notes: "Downtown branch", verification_status: "pending" }];
  const allocations = [{ payment_id: "pay-1", sale_id: "sale-1", amount: "40" }];
  const ledger = normalizeHostedLedgerEntries([
    { entry_id: "sale-1", customer_id: "customer-1", entry_date: "2026-09-13", reference_number: "TR-100", entry_type: "sale", debit: "100", credit: "0" },
    { entry_id: "pay-1", customer_id: "customer-1", entry_date: "2026-09-14", reference_number: "PAY-100", entry_type: "payment", debit: "0", credit: "40" },
  ], sales, payments, allocations);
  const collections = normalizeHostedCollections(payments, sales, allocations);
  const customers = [{ id: "customer-1", name: "Branch Store" }];
  assert.equal(customerBalance(ledger, "customer-1"), 60);
  assert.equal(ledgerWithRunningBalance(ledger, "customer-1").at(-1).balance, 60);
  assert.equal(collections[0].allocations[0].invoiceRef, "TR-100");
  assert.equal(collections[0].reference, "GC-100");
  assert.equal(collectibleRows(customers, ledger, collections)[0].balance, 60);
});

test("hosted payment, expense, and DCR payloads retain operational context", () => {
  assert.deepEqual(hostedPaymentValues({ customerId: "customer-1", agentId: "salesman-1", date: "2026-09-14", amount: 50, method: "Bank Deposit", reference: "BANK-9", notes: "North branch" }), {
    customerId: "customer-1", salesmanId: "salesman-1", date: "2026-09-14", amount: 50, method: "bank", reference: "BANK-9", notes: "North branch", saleId: null,
  });
  assert.deepEqual(hostedExpenseValues({ agentId: "salesman-1", date: "2026-09-14", category: "Fuel", amount: 20, source: "Cash Collection", description: "Route fuel", status: "Approved" }), {
    salesmanId: "salesman-1", date: "2026-09-14", category: "Fuel", amount: 20, source: "cash_collection", description: "Route fuel", status: "approved",
  });
  assert.deepEqual(hostedDcrValues({ agentId: "salesman-1", date: "2026-09-14", actual: 30, explanation: "Balanced after fuel" }), {
    salesmanId: "salesman-1", date: "2026-09-14", actual: 30, explanation: "Balanced after fuel",
  });
});

test("hosted discrepancies retain severity, relation, and resolved state", () => {
  const rows = normalizeHostedDiscrepancies([
    { id: "disc-1", type: "cash_shortage", status: "open", severity: "high", related_entity_type: "daily_cash_report", related_entity_id: "dcr-1", salesman_user_id: "salesman-1", amount_difference: "-125", quantity_difference: null, description: "Cash was short.", created_at: "2026-09-14T10:00:00Z", resolved_at: null, resolved_by: null },
    { id: "disc-2", type: "post_dcr_adjustment", status: "resolved", severity: "medium", related_entity_type: "payment", related_entity_id: "pay-1", salesman_user_id: "salesman-1", amount_difference: "50", quantity_difference: null, description: "Payment added after lock.", created_at: "2026-09-14T11:00:00Z", resolved_at: "2026-09-14T12:00:00Z", resolved_by: "owner-1" },
  ]);
  assert.equal(rows[0].type, "Cash");
  assert.equal(rows[0].amount, 125);
  assert.equal(rows[0].severity, "High");
  assert.equal(rows[1].type, "Post-DCR");
  assert.equal(rows[1].status, "Resolved");
  assert.equal(rows[1].relatedEntityId, "pay-1");
});

test("locked hosted DCR keeps backend totals and restores payment and expense detail", () => {
  const dcr = normalizeHostedDcr({
    id: "dcr-1",
    salesman_user_id: "salesman-1",
    report_date: "2026-09-14",
    status: "locked",
    cash_collected: "100",
    gcash_collected: "90",
    bank_collected: "0",
    cash_paid_expenses: "10",
    expected_cash_remittance: "90",
    actual_cash_remittance: "85",
    difference: "-5",
    explanation: "Variance reviewed",
  }, {
    customers: [{ id: "customer-1", name: "Branch Store" }],
    collections: [
      { id: "pay-1", customerId: "customer-1", agentId: "salesman-1", date: "2026-09-14", method: "Cash", amount: 100 },
      { id: "pay-2", customerId: "customer-1", agentId: "salesman-1", date: "2026-09-14", method: "GCash", amount: 90 },
    ],
    expenses: [{ id: "expense-1", agentId: "salesman-1", date: "2026-09-14", category: "Fuel", amount: 10, source: "Cash Collection", status: "Approved" }],
  });
  assert.equal(dcr.status, "LOCKED");
  assert.equal(dcr.snapshot.rows[0].customer, "Branch Store");
  assert.equal(dcr.snapshot.rows[0].GCash, 90);
  assert.equal(dcr.snapshot.expenseTotals.byCategory.Fuel, 10);
  assert.equal(dcr.snapshot.expectedCashRemittance, 90);
});

test("locked hosted DCR excludes post-lock activity from its immutable detail", () => {
  const dcr = normalizeHostedDcr({
    id: "dcr-1",
    salesman_user_id: "salesman-1",
    report_date: "2026-09-14",
    status: "locked",
    locked_at: "2026-09-14T10:00:00Z",
    cash_collected: "100",
    gcash_collected: "0",
    bank_collected: "0",
    cash_paid_expenses: "0",
    expected_cash_remittance: "100",
    actual_cash_remittance: "100",
    difference: "0",
  }, {
    customers: [{ id: "customer-1", name: "Branch Store" }],
    collections: [
      { id: "pay-1", customerId: "customer-1", agentId: "salesman-1", date: "2026-09-14", method: "Cash", amount: 100, createdAt: "2026-09-14T09:00:00Z" },
      { id: "pay-2", customerId: "customer-1", agentId: "salesman-1", date: "2026-09-14", method: "Cash", amount: 40, createdAt: "2026-09-14T11:00:00Z" },
    ],
    expenses: [],
  });
  assert.equal(dcr.snapshot.rows[0].Cash, 100);
  assert.equal(dcr.snapshot.totals.Cash, 100);
});
