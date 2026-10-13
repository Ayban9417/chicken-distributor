import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { tripReferenceLabel } from "../src/utils/business.js";
import { loadHostedSales } from "../src/services/salesParityService.js";
import { loadHostedSalesmanInventory } from "../src/services/inventoryParityService.js";

const stock = {
  inventory_lot_id: "lot-1", stock_trip_id: "trip-1", trip_number: "ST-000042",
  trip_date: "2026-10-13", plant_name: "Bounty", product_name: "Whole Dressed Chicken",
  category: "whole_chicken", product_code: "P1", available_quantity_kg: 12,
  cost_per_kg: 142, inventory_cost_value: 1704, salesman_user_id: "salesman-1",
};

function salesmanClient(reference = "Ref-aB42") {
  return {
    rpc: async () => ({ data: { stock: [stock], lots: [], movements: [], people: [], customers: [], prices: [], products: [], sales: [], ledger: [] }, error: null }),
    from: (table) => ({
      select() { return this; },
      eq() { return this; },
      in() { return this; },
      then(resolve) { resolve({ data: table === "stock_trips" ? [{ id: "trip-1", reference_number: reference }] : [], error: null }); },
    }),
  };
}

test("Trip display uses the entered reference and never falls back to an internal ST number", () => {
  assert.equal(tripReferenceLabel({ reference: "  Ref-aB42  ", code: "ST-000042" }), "Ref-aB42");
  assert.equal(tripReferenceLabel({ tripReference: "Ref-aB42", tripCode: "ST-000042" }), "Ref-aB42");
  assert.equal(tripReferenceLabel({ trip_reference: "Ref-aB42", trip_number: "ST-000042" }), "Ref-aB42");
  assert.equal(tripReferenceLabel({ code: "ST-000042" }), "Not recorded");
});

test("hosted Sales and Salesman Inventory retain the exact reference for a shared Trip", async () => {
  const client = salesmanClient();
  const sales = await loadHostedSales("org-1", client, "salesman-1");
  const inventory = await loadHostedSalesmanInventory("org-1", client, "salesman-1");
  assert.equal(sales.trips[0].reference, "Ref-aB42");
  assert.equal(sales.trips[0].code, "ST-000042");
  assert.equal(inventory.rows[0].tripReference, "Ref-aB42");
  assert.equal(inventory.rows[0].remainingQty, 12);
});

test("Inventory and Salesman views render reference labels without exposing ST numbers", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { InventoryOverview } = await vite.ssrLoadModule("/src/components/InventoryOverview.jsx");
    const { SalesmanInventory } = await vite.ssrLoadModule("/src/components/InventoryFlow.jsx");
    const row = {
      id: "lot-1", tripId: "trip-1", tripDate: "2026-10-13", tripCode: "ST-000042",
      tripReference: "Ref-aB42", plant: "Bounty", product: "Whole Dressed Chicken",
      category: "Whole Chicken", sizeCode: "P1", originalQty: 12, warehouseQty: 0,
      salesmanQty: 12, soldQty: 0, remainingQty: 12, inventoryCostValue: 1704,
      costPerKg: 142, reconciliationDelta: 0,
    };
    const overview = renderToStaticMarkup(createElement(InventoryOverview, { rows: [row], initialPlant: "Bounty" }));
    assert.match(overview, /Ref-aB42/);
    assert.doesNotMatch(overview, /ST-000042/);
    const assigned = renderToStaticMarkup(createElement(SalesmanInventory, {
      hostedRows: [{ ...row, salesmanId: "salesman-1", assignedQty: 12, totalOut: 0 }],
      users: [{ id: "salesman-1", name: "Juan", role: "Agent", active: true }],
      initialSalesmanId: "salesman-1", showReceipts: false,
    }));
    assert.match(assigned, /Ref-aB42/);
    assert.doesNotMatch(assigned, /ST-000042/);
  } finally {
    await vite.close();
  }
});
