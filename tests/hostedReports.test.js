import test from "node:test";
import assert from "node:assert/strict";
import { collectibleSummary, dcrSummary, financialSummary, inDateRange, salesByPlant, salesByProduct, tripBagSummary } from "../src/utils/hostedReports.js";
import { loadHostedReports } from "../src/services/reportingService.js";
import { loadHostedDashboard } from "../src/services/dashboardService.js";
import { activityDays, customerSales, normalizeHostedTrips } from "../src/utils/hostedDashboard.js";
import { normalizePlantConfiguration, stockInValuesFromPrototype } from "../src/services/plantsParityService.js";

function recordingClient(dataByTable = {}) {
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
    then(resolve) { resolve({ data: dataByTable[this.table] || [], error: null }); }
  }
  return { queries, from: (table) => new Query(table) };
}

test("trip bag summary preserves recorded bags when other products do not use bags", () => {
  assert.equal(tripBagSummary([{ bags: 10 }, { bags: null }]), "10 recorded");
  assert.equal(tripBagSummary([{ bags: 10 }, { bags: 2 }]), 12);
  assert.equal(tripBagSummary([{ bags: null }, { bags: undefined }]), "Not recorded");
});

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

test("hosted inventory report reads acquisition type from the stock trip line", async () => {
  const client = recordingClient({
    warehouse_stock_summary: [{ inventory_lot_id: "lot-1", available_quantity_kg: 4 }],
    inventory_lots: [{ id: "lot-1", stock_trip_line_id: "line-1", original_quantity_kg: 10 }],
    stock_trip_lines: [{ id: "line-1", stock_trip_id: "trip-1", acquisition_type: "free_from_plant" }],
    stock_trips: [{ id: "trip-1", trip_number: "ST-001", trip_date: "2026-09-14" }],
  });
  const result = await loadHostedReports("org-1", { start: "2026-09-01", end: "2026-09-30" }, client);
  assert.equal(result.warehouseStock[0].acquisition_type, "free_from_plant");
  assert.equal(result.warehouseStock[0].original_quantity_kg, 10);
  const lotProjection = client.queries.find((query) => query.table === "inventory_lots" && query.steps.some((step) => step[0] === "select" && step[1].includes("original_quantity_kg")));
  assert.ok(lotProjection);
  assert.equal(lotProjection.steps[0][1].includes("acquisition_type"), false);
});

test("hosted Dashboard normalizes coded, uncoded, and sold-out Trip products", () => {
  const trips = normalizeHostedTrips({
    trips: [
      { id: "t1", plant_id: "b", trip_number: "ST-001", trip_date: "2026-09-14" },
      { id: "t2", plant_id: "m", trip_number: "ST-002", trip_date: "2026-09-15" },
    ],
    lines: [
      { id: "l1", stock_trip_id: "t1", plant_product_id: "pp1", code_id: "p1", quantity_kg: 100, bags: 5, acquisition_type: "purchased", cost_per_kg: 142 },
      { id: "l2", stock_trip_id: "t2", plant_product_id: "pp2", code_id: null, quantity_kg: 20, bags: null, acquisition_type: "free_from_plant", cost_per_kg: 0 },
    ],
    plantProducts: [{ id: "pp1", product_id: "whole" }, { id: "pp2", product_id: "liver" }],
    products: [{ id: "whole", name: "Whole Dressed Chicken", category: "whole_chicken" }, { id: "liver", name: "Liver", category: "by_product" }],
    plants: [{ id: "b", name: "Bounty" }, { id: "m", name: "Magnolia" }],
    warehouseStock: [{ stock_trip_id: "t1", available_quantity_kg: 0 }, { stock_trip_id: "t2", available_quantity_kg: 8 }],
    salesmanStock: [],
  });

  assert.equal(trips[0].products[0].category, "Whole Chicken");
  assert.equal(trips[0].remainingQty, 0);
  assert.equal(trips[1].products[0].acquisitionType, "Free from Plant");
  assert.equal(trips[1].products[0].costPerKg, 0);
  assert.equal(trips[1].remainingQty, 8);
});

test("hosted Dashboard activity and customer profitability derive from transaction records", () => {
  const range = { start: "2026-09-14", end: "2026-09-16" };
  assert.deepEqual(activityDays(range, [
    { sale_date: "2026-09-14", net_sales: 1000 },
    { sale_date: "2026-09-14", net_sales: 500 },
  ], [{ payment_date: "2026-09-15", amount: 700 }]), [
    { date: "2026-09-14", sales: 1500, payments: 0 },
    { date: "2026-09-15", sales: 0, payments: 700 },
    { date: "2026-09-16", sales: 0, payments: 0 },
  ]);
  assert.deepEqual(customerSales([
    { customer_id: "c1", net_sales: 1500, total_cogs: 1000, gross_profit: 500 },
    { customer_id: "c1", net_sales: 500, total_cogs: 300, gross_profit: 200 },
  ], [{ id: "c1", name: "ABC Restaurant" }]), [{ key: "ABC Restaurant", revenue: 2000, cogs: 1300, profit: 700 }]);
});

test("hosted Dashboard service requests current, previous, and today's Trips", async () => {
  const client = recordingClient();
  const range = { start: "2026-09-14", end: "2026-09-20" };
  const result = await loadHostedDashboard("org-1", range, "2026-09-14", client);

  assert.equal(result.trips.length, 0);
  assert.equal(result.previousTrips.length, 0);
  assert.equal(result.todayTrips.length, 0);
  const tripQueries = client.queries.filter((item) => item.table === "stock_trips");
  assert.equal(tripQueries.length, 3);
  assert.ok(tripQueries.some((query) => query.steps.some((step) => step[0] === "gte" && step[2] === "2026-09-07")));
  assert.ok(tripQueries.some((query) => query.steps.some((step) => step[0] === "gte" && step[2] === "2026-09-14") && query.steps.some((step) => step[0] === "lte" && step[2] === "2026-09-14")));
});

test("Plants parity adapter keeps display codes separate from backend identities", () => {
  const [plant] = normalizePlantConfiguration({ plants: [{ id: "p", name: "Fkidz", short_code: "FK", active: true, products: [{ id: "pp", product_id: "whole", active: true, uses_size_codes: true, uses_class_types: false, uses_bags: true, uses_head_count: false, allows_free_from_plant: true, product: { name: "Whole Dressed Chicken", category: "whole_chicken" }, codes: [{ id: "code-uuid", code: "C1", display_name: "Cat1", active: true }], classTypes: [] }] }] });
  assert.equal(plant.products[0].sizeCodes[0].id, "C1");
  assert.equal(plant.products[0].sizeCodes[0].backendId, "code-uuid");
  const values = stockInValuesFromPrototype({ plantId: "p", date: "2026-09-14", products: [{ productId: "pp", codeId: "code-uuid", classTypeId: "", bags: 2, headCount: null, originalQty: 10, acquisitionType: "Purchased", costPerKg: 142 }] });
  assert.equal(values.lines[0].plantProductId, "pp");
  assert.equal(values.lines[0].codeId, "code-uuid");
  assert.equal(values.lines[0].quantity, 10);
});
