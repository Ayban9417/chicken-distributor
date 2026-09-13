import test from "node:test";
import assert from "node:assert/strict";
import { compareInventoryProducts, compareInventoryTrips } from "../src/utils/inventory.js";
import { getInventoryRows, getAvailableQty, stockKey } from "../src/utils/business.js";
import { initialPlantConfigs, stockLine, stockSnapshot } from "../src/utils/plants.js";
import { cleanOperationalData } from "../src/data/demoData.js";

const receive = (plant, entries, id) => ({
  id, plantId: plant.id, plant: plant.name, date: "2026-09-06",
  products: entries.map(([name, code, qty, cost]) => {
    const product = plant.products.find((item) => item.productName === name);
    return stockSnapshot({ ...stockLine(product), sizeCode: code, qty, bags: 1, costPerKg: cost }, plant);
  }),
});

test("Inventory sorts multiple by-products without the removed demo products list", () => {
  const trip = receive(initialPlantConfigs[0], [["Feet", "", 20, 62], ["Liver", "", 10, 88], ["Gizzard", "", 5, 112]], "bounty");
  const rows = getInventoryRows([trip], []);
  const original = structuredClone(rows);
  assert.deepEqual([...rows].sort(compareInventoryProducts).map((row) => row.product), ["Liver", "Gizzard", "Feet"]);
  assert.deepEqual(rows, original);
  assert.equal(rows.reduce((sum, row) => sum + row.remainingQty, 0), 35);
  assert.equal(rows.reduce((sum, row) => sum + row.inventoryCostValue, 0), 2680);
});

test("coded, uncoded and sold-out stock retains exact trip/product/code quantities and costs", () => {
  const trips = [receive(initialPlantConfigs[0], [["Whole Dressed Chicken", "P2", 40, 144], ["Whole Dressed Chicken", "P1", 30, 142], ["Whole Dressed Chicken", "G", 10, 146], ["Feet", "", 20, 62]], "bounty"),
    receive(initialPlantConfigs[1], [["Whole Dressed Chicken", "", 50, 146]], "magnolia")];
  const movements = [{ id: "sold-p1", tripId: "bounty", product: "Whole Dressed Chicken", sizeCode: "P1", type: "OUT", qty: -30 },
    { id: "sold-magnolia", tripId: "magnolia", product: "Whole Dressed Chicken", type: "OUT", qty: -10 }];
  const rows = getInventoryRows(trips, movements).sort(compareInventoryProducts);
  assert.equal(rows.length, 5);
  assert.equal(new Set(rows.map((row) => row.id)).size, 5);
  const row = (trip, code) => rows.find((item) => item.id === stockKey(trip, "Whole Dressed Chicken", code));
  assert.equal(row("bounty", "P1").remainingQty, 0);
  assert.equal(row("bounty", "P1").inventoryCostValue, 0);
  assert.equal(row("bounty", "P1").history[1].id, "sold-p1");
  assert.equal(row("bounty", "P2").remainingQty, 40);
  assert.equal(row("bounty", "G").remainingQty, 10);
  assert.equal(row("magnolia", "").remainingQty, 40);
  assert.equal(row("magnolia", "").inventoryCostValue, 5840);
  assert.equal(rows.reduce((sum, item) => sum + item.inventoryCostValue, 0), 14300);
});

test("missing/null codes and optional trip labels are sortable without live plant configuration", () => {
  const trips = ["legacy-a", "legacy-b"].map((id) => ({ id, plant: "Historical Plant", products: [
    { name: "Whole Dressed Chicken", sizeCode: id === "legacy-a" ? null : undefined, originalQty: 10, costPerKg: 142 },
    { name: "Custom Product", originalQty: 5, costPerKg: 50 },
  ] }));
  const rows = getInventoryRows(trips, []);
  assert.equal(getAvailableQty(trips, [], "legacy-a", "Whole Dressed Chicken", null), 10);
  assert.equal(rows[0].costPerKg, 142);
  assert.equal(rows[0].inventoryCostValue, 1420);
  assert.equal(rows[0].bags, null);
  assert.deepEqual([...rows].sort(compareInventoryTrips).map((row) => row.tripId), ["legacy-a", "legacy-a", "legacy-b", "legacy-b"]);
  assert.equal(compareInventoryProducts({ product: "Custom Product", sizeCode: null }, { product: "Custom Product" }), 0);
  assert.ok(compareInventoryProducts({ product: "Whole Dressed Chicken", sizeCode: "P2" }, { product: "Whole Dressed Chicken", sizeCode: "P10" }) < 0);
  assert.ok(compareInventoryProducts({ product: "Liver" }, { product: "Custom Product" }) < 0);
  assert.ok(compareInventoryProducts({ product: "Custom A" }, { product: "Custom B" }) < 0);
});

test("clean/reset inventory has no stock rows or sample fallback", () => {
  const state = cleanOperationalData();
  assert.deepEqual(getInventoryRows(state.trips, state.movements).sort(compareInventoryProducts), []);
});
