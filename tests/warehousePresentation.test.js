import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { getInventoryRows } from "../src/utils/business.js";
import { initialTrips } from "../src/data/demoData.js";
import { loadHostedWarehouse } from "../src/services/inventoryParityService.js";

const base = { tripId: "trip-1", tripDate: "2026-10-13", tripCode: "ST-000042", tripReference: "Ref-aB42", plant: "Bounty", transferredQty: 0, costPerKg: 142, bags: null, headCount: null };
const rows = [
  { ...base, id: "coded", product: "Whole Dressed Chicken", category: "Whole Chicken", sizeCode: "C1", originalQty: 10.125, warehouseAvailable: 10.125, bags: 4, headCount: 80 },
  { ...base, id: "uncoded", product: "Whole Dressed Chicken", category: "Whole Chicken", sizeCode: "", originalQty: 5, warehouseAvailable: 0 },
  { ...base, id: "liver", product: "Liver", category: "By-products", sizeCode: "", originalQty: 2, warehouseAvailable: 2 },
  { ...base, id: "other", product: "Other Product", category: "Other", sizeCode: "", originalQty: 3, warehouseAvailable: 3 },
];

test("Warehouse matches Plant Trip summary and retains exact stock columns", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { Warehouse } = await vite.ssrLoadModule("/src/components/InventoryFlow.jsx");
    const html = renderToStaticMarkup(createElement(Warehouse, { hostedRows: rows, hostedTotals: { warehouse: 15.125, assigned: 0, company: 15.125 }, users: [] }));
    const summary = html.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/)?.[1];
    assert.ok(summary);
    assert.match(summary, /Trip Date[\s\S]*Oct 13, 2026[\s\S]*Reference Number[\s\S]*Ref-aB42[\s\S]*Whole Dressed Chicken[\s\S]*15\.125 kg[\s\S]*By-products[\s\S]*2 kg[\s\S]*Other Products[\s\S]*3 kg/);
    assert.match(summary, /grid-cols-1/);
    assert.doesNotMatch(summary, /ST-000042/);
    assert.match(html, /Trip ST-000042 \/ Warehouse remaining: 15\.125 kg/);
    const wholeTable = html.match(/<table\b[\s\S]*?<\/table>/)?.[0];
    assert.ok(wholeTable);
    assert.match(wholeTable, /<th[^>]*>Whole Dressed Chicken<\/th>/);
    assert.match(wholeTable, />C1<\/button>/);
    assert.match(wholeTable, />Whole Dressed Chicken<\/button>/);
    assert.doesNotMatch(wholeTable, /Whole Dressed Chicken \/ C1/);
    assert.ok(wholeTable.indexOf("Cost/kg") < wholeTable.indexOf("Bags"));
    assert.ok(wholeTable.indexOf("Bags") < wholeTable.indexOf("Heads"));
    assert.match(wholeTable, /SOLD OUT/);
    assert.match(html, /<h3[^>]*>Other Products<\/h3>[\s\S]*Other Product/);
  } finally {
    await vite.close();
  }
});

test("local inventory retains the entered Trip reference", () => {
  const row = getInventoryRows(initialTrips, [])[0];
  assert.equal(row.tripReference, initialTrips[0].reference);
});

test("hosted Warehouse maps the exact stock Trip reference without changing balances", async () => {
  const data = {
    warehouse_stock_summary: [{ inventory_lot_id: "lot-1", stock_trip_id: "trip-1", trip_date: "2026-10-13", trip_number: "ST-000042", plant_name: "Bounty", product_name: "Whole Dressed Chicken", category: "whole_chicken", product_code: "C1", original_quantity_kg: 10.125, available_quantity_kg: 8.125, cost_per_kg: 142, inventory_cost_value: 1153.75 }],
    stock_trips: [{ id: "trip-1", reference_number: "Ref-aB42" }],
    inventory_lots: [{ id: "lot-1", stock_trip_line_id: "line-1" }],
    stock_trip_lines: [{ id: "line-1", bags: 4, head_count: 80 }],
  };
  const queries = [];
  class Query {
    constructor(table) { this.table = table; queries.push(table); }
    select() { return this; }
    eq() { return this; }
    in() { return this; }
    order() { return this; }
    then(resolve) { resolve({ data: data[this.table] || [], error: null }); }
  }
  const result = await loadHostedWarehouse("org-1", { from: (table) => new Query(table) });
  assert.ok(queries.includes("stock_trips"));
  assert.equal(result.rows[0].tripReference, "Ref-aB42");
  assert.equal(result.rows[0].warehouseAvailable, 8.125);
  assert.equal(result.rows[0].costPerKg, 142);
  assert.equal(result.rows[0].bags, 4);
  assert.equal(result.rows[0].headCount, 80);
});
