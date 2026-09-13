import test from "node:test";
import assert from "node:assert/strict";
import { collectibleSummary, dcrSummary, financialSummary, inDateRange, salesByPlant, salesByProduct } from "../src/utils/hostedReports.js";
import { loadHostedReports } from "../src/services/reportingService.js";

function recordingClient() {
  const queries = [];
  class Query {
    constructor(table) { this.table = table; this.steps = []; queries.push(this); }
    select(value) { this.steps.push(["select", value]); return this; }
    eq(column, value) { this.steps.push(["eq", column, value]); return this; }
    neq(column, value) { this.steps.push(["neq", column, value]); return this; }
    is(column, value) { this.steps.push(["is", column, value]); return this; }
    in(column, value) { this.steps.push(["in", column, value]); return this; }
    gte(column, value) { this.steps.push(["gte", column, value]); return this; }
    lte(column, value) { this.steps.push(["lte", column, value]); return this; }
    order(column, value) { this.steps.push(["order", column, value]); return this; }
    then(resolve) { resolve({ data: [], error: null }); }
  }
  return { queries, from: (table) => new Query(table) };
}

test("financial report uses hosted sale snapshots and approved period expenses", () => {
  const result = financialSummary([
    { gross_sales: 2000, sales_deductions: 100, net_sales: 1900, total_cogs: 1200 },
    { gross_sales: 1000, sales_deductions: 0, net_sales: 1000, total_cogs: 600 },
  ], [
    { amount: 250, approval_status: "approved" },
    { amount: 999, approval_status: "rejected" },
  ]);
  assert.deepEqual(result, { grossSales: 3000, salesDeductions: 100, netSales: 2900, cogs: 1800, expenses: 250, profitEstimate: 850 });
});

test("plant report combines daily rows inside the requested period", () => {
  const rows = salesByPlant([
    { plant_id: "b", plant_name: "Bounty", sale_count: 2, quantity_kg: 20, gross_sales: 4000, cogs: 2800, gross_profit: 1200 },
    { plant_id: "b", plant_name: "Bounty", sale_count: 1, quantity_kg: 10, gross_sales: 2000, cogs: 1400, gross_profit: 600 },
    { plant_id: "m", plant_name: "Magnolia", sale_count: 1, quantity_kg: 5, gross_sales: 1000, cogs: 730, gross_profit: 270 },
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { plantId: "b", plantName: "Bounty", saleCount: 3, quantityKg: 30, sales: 6000, cogs: 4200, grossProfit: 1800 });
});

test("product profitability preserves exact product, code, and class identities", () => {
  const rows = salesByProduct([
    { product_id: "whole", product_name: "Whole Dressed Chicken", category: "Whole Chicken", code_id: "p1", product_code: "P1", quantity_kg: 10, line_sales: 2000, line_cogs: 1400, line_gross_profit: 600 },
    { product_id: "whole", product_name: "Whole Dressed Chicken", category: "Whole Chicken", code_id: "p2", product_code: "P2", quantity_kg: 5, line_sales: 1000, line_cogs: 750, line_gross_profit: 250 },
    { product_id: "liver", product_name: "Liver", category: "By-product", class_type_id: "a", class_type: "Class A", quantity_kg: 4, line_sales: 600, line_cogs: 400, line_gross_profit: 200 },
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows.find((row) => row.code === "P1").margin, 30);
  assert.equal(rows.find((row) => row.classType === "Class A").cogs, 400);
});

test("collectibles roll up open sales and retain the latest non-voided payment", () => {
  const rows = collectibleSummary([
    { customer_id: "c1", customer_name: "ABC", sale_date: "2026-09-10", outstanding_balance: 500 },
    { customer_id: "c1", customer_name: "ABC", sale_date: "2026-09-08", outstanding_balance: 250 },
  ], [
    { customer_id: "c1", payment_date: "2026-09-11", amount: 100 },
    { customer_id: "c1", payment_date: "2026-09-12", amount: 50, voided_at: "2026-09-12T01:00:00Z" },
  ]);
  assert.equal(rows[0].outstanding, 750);
  assert.equal(rows[0].oldestUnpaid, "2026-09-08");
  assert.equal(rows[0].openSales, 2);
  assert.equal(rows[0].lastPayment.payment_date, "2026-09-11");
});

test("DCR totals and inclusive date checks are deterministic", () => {
  assert.deepEqual(dcrSummary([{ cash_collected: 500, gcash_collected: 100, bank_collected: 50, cash_paid_expenses: 25, expected_cash_remittance: 475, actual_cash_remittance: 470, difference: -5 }]), {
    reportCount: 1, cash: 500, gcash: 100, bank: 50, expenses: 25, expected: 475, actual: 470, difference: -5,
  });
  assert.equal(inDateRange("2026-09-01", { start: "2026-09-01", end: "2026-09-30" }), true);
  assert.equal(inDateRange("2026-10-01", { start: "2026-09-01", end: "2026-09-30" }), false);
});

test("hosted reporting service applies inclusive database date filters", async () => {
  const client = recordingClient();
  const range = { start: "2026-09-01", end: "2026-09-30" };
  const result = await loadHostedReports("org-1", range, client);
  assert.deepEqual(result, { sales: [], expenses: [], payments: [], allPayments: [], plantSales: [], productSales: [], dcrs: [], collectibles: [], warehouseStock: [], salesmanStock: [], transfers: [] });

  const expected = new Map([
    ["sales", "sale_date"],
    ["expenses", "expense_date"],
    ["sales_by_plant", "sale_date"],
    ["daily_cash_reports", "report_date"],
    ["inventory_movements", "effective_date"],
  ]);
  for (const [table, column] of expected) {
    const query = client.queries.find((item) => item.table === table);
    assert.ok(query, `${table} query exists`);
    assert.ok(query.steps.some((step) => step[0] === "gte" && step[1] === column && step[2] === range.start));
    assert.ok(query.steps.some((step) => step[0] === "lte" && step[1] === column && step[2] === range.end));
  }
  const paymentQueries = client.queries.filter((item) => item.table === "payments");
  assert.equal(paymentQueries.length, 2);
  assert.ok(paymentQueries.some((query) => query.steps.some((step) => step[0] === "gte" && step[1] === "payment_date")));
});
