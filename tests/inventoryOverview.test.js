import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildHostedInventoryOverviewRows } from "../src/services/inventoryParityService.js";
import { buildLocalInventoryOverviewRows, filterInventoryRows, groupInventoryByTrip, inventoryPlantSummaries, summarizeInventoryRows } from "../src/utils/inventoryOverview.js";

const stock = (overrides) => ({
  id: `${overrides.tripId}|${overrides.product}|${overrides.sizeCode || ""}|${overrides.classType || ""}`,
  tripId: overrides.tripId,
  tripDate: overrides.tripDate,
  tripCode: overrides.tripCode,
  plant: overrides.plant,
  product: overrides.product,
  category: overrides.category,
  sizeCode: overrides.sizeCode || "",
  sizeCodeLabel: overrides.sizeCodeLabel || "",
  classType: overrides.classType || "",
  classTypeLabel: overrides.classTypeLabel || "",
  bags: overrides.bags ?? null,
  headCount: overrides.headCount ?? null,
  acquisitionType: "Purchased",
  originalQty: overrides.originalQty,
  adjustments: 0,
  totalOut: overrides.totalOut || 0,
  remainingQty: overrides.originalQty - (overrides.totalOut || 0),
  costPerKg: overrides.costPerKg || 100,
  inventoryCostValue: 0,
  history: [{ id: `stock-${overrides.tripId}-${overrides.product}`, type: "Stock In", ref: overrides.tripCode, qty: overrides.originalQty, at: `${overrides.tripDate}T08:00:00` }],
});

const inventoryRows = [
  stock({ tripId: "fk-1", tripDate: "2026-09-15", tripCode: "ST-FK-1", plant: "Fkidz", product: "Whole Dressed Chicken", category: "Whole Chicken", sizeCode: "C1", sizeCodeLabel: "Cat1", originalQty: 500, totalOut: 100, bags: 25, costPerKg: 130 }),
  stock({ tripId: "fk-1", tripDate: "2026-09-15", tripCode: "ST-FK-1", plant: "Fkidz", product: "Head", category: "By-products", originalQty: 10, totalOut: 10, headCount: 120, costPerKg: 20 }),
  stock({ tripId: "bt-1", tripDate: "2026-09-14", tripCode: "ST-BT-1", plant: "Bounty", product: "Whole Dressed Chicken", category: "Whole Chicken", sizeCode: "P1", classType: "A", classTypeLabel: "Premium", originalQty: 200, costPerKg: 142 }),
  stock({ tripId: "mg-1", tripDate: "2026-09-13", tripCode: "ST-MG-1", plant: "Magnolia", product: "Small Intestine", category: "By-products", originalQty: 50, costPerKg: 45 }),
  stock({ tripId: "mg-1", tripDate: "2026-09-13", tripCode: "ST-MG-1", plant: "Magnolia", product: "Large Intestine", category: "By-products", originalQty: 30, costPerKg: 48 }),
];
const receivingTransfers = [
  { id: "rr-1", receipt: "RR-000123", date: "2026-09-15", toSalesmanId: "juan", tripId: "fk-1", product: "Whole Dressed Chicken", sizeCode: "C1", classType: "", qty: 300 },
  { id: "rr-2", receipt: "RR-000124", date: "2026-09-15", toSalesmanId: "juan", tripId: "fk-1", product: "Head", sizeCode: "", classType: "", qty: 10 },
];
const salesmanTransfers = [{ id: "tf-1", receipt: "TF-000044", date: "2026-09-15", fromSalesmanId: "juan", toSalesmanId: "pedro", tripId: "fk-1", product: "Whole Dressed Chicken", sizeCode: "C1", classType: "", qty: 50 }];
const movements = [
  { id: "sale-1", ref: "TR-10239", at: "2026-09-15T12:00:00", type: "OUT", agentId: "juan", tripId: "fk-1", product: "Whole Dressed Chicken", sizeCode: "C1", classType: "", qty: -100 },
  { id: "sale-2", ref: "TR-10240", at: "2026-09-15T13:00:00", type: "OUT", agentId: "juan", tripId: "fk-1", product: "Head", sizeCode: "", classType: "", qty: -10 },
];
const users = [{ id: "juan", name: "Juan Cruz", role: "Agent", active: true }, { id: "pedro", name: "Pedro Reyes", role: "Agent", active: true }];

test("Plant-first inventory keeps three Plants separate and preserves Plant-specific configuration", () => {
  const rows = buildLocalInventoryOverviewRows({ inventoryRows, receivingTransfers, salesmanTransfers, movements, users });
  assert.deepEqual(inventoryPlantSummaries(rows).map((item) => item.plant), ["Bounty", "Fkidz", "Magnolia"]);
  assert.deepEqual(filterInventoryRows(rows, { plant: "Fkidz" }).map((row) => row.plant), ["Fkidz", "Fkidz"]);
  assert.deepEqual(filterInventoryRows(rows, { plant: "Bounty" }).map((row) => [row.sizeCode, row.classType]), [["P1", "A"]]);
  assert.deepEqual(filterInventoryRows(rows, { plant: "Magnolia" }).map((row) => [row.product, row.sizeCode]), [["Small Intestine", ""], ["Large Intestine", ""]]);
  assert.equal(inventoryPlantSummaries(rows, "mag")[0].plant, "Magnolia");
});

test("local company inventory reconciles warehouse, Salesman, sold, and remaining quantities", () => {
  const rows = buildLocalInventoryOverviewRows({ inventoryRows, receivingTransfers, salesmanTransfers, movements, users });
  const c1 = rows.find((row) => row.plant === "Fkidz" && row.sizeCode === "C1");
  assert.deepEqual([c1.originalQty, c1.warehouseQty, c1.salesmanQty, c1.soldQty, c1.remainingQty, c1.reconciliationDelta], [500, 200, 200, 100, 400, 0]);
  assert.ok(c1.history.some((movement) => movement.ref === "RR-000123"));
  assert.ok(c1.history.some((movement) => movement.ref === "TF-000044"));
  assert.equal(c1.inventoryCostValue, 52000);
  assert.deepEqual(summarizeInventoryRows(rows.filter((row) => row.plant === "Fkidz")), {
    originalQty: 510, warehouseQty: 200, salesmanQty: 200, soldQty: 110, remainingQty: 400, inventoryCostValue: 52000, wholeChickenQty: 400, byProductQty: 0,
  });
});

test("trip and product filters retain sold-out historical rows", () => {
  const rows = buildLocalInventoryOverviewRows({ inventoryRows, receivingTransfers, salesmanTransfers, movements, users });
  const soldOut = filterInventoryRows(rows, { plant: "Fkidz", tripId: "fk-1", productMode: "By-products" });
  assert.equal(soldOut.length, 1);
  assert.equal(soldOut[0].product, "Head");
  assert.equal(soldOut[0].remainingQty, 0);
  assert.deepEqual(groupInventoryByTrip(filterInventoryRows(rows, { plant: "Fkidz" })).map((group) => group.tripCode), ["ST-FK-1"]);
});

test("hosted inventory mapping derives sold stock and movement references from authoritative movements", () => {
  const rows = buildHostedInventoryOverviewRows({
    warehouseStock: [{ inventory_lot_id: "lot-1", stock_trip_line_id: "line-1", stock_trip_id: "trip-1", trip_date: "2026-09-15", trip_number: "ST-FK-1", plant_name: "Fkidz", product_name: "Whole Dressed Chicken", category: "whole_chicken", code_id: "code-1", class_type_id: "class-1", product_code: "C1", class_type: "A", original_quantity_kg: 500, available_quantity_kg: 200, cost_per_kg: 130 }],
    salesmanStock: [{ inventory_lot_id: "lot-1", salesman_user_id: "juan", available_quantity_kg: 150 }, { inventory_lot_id: "lot-1", salesman_user_id: "pedro", available_quantity_kg: 50 }],
    movements: [
      { id: "m1", inventory_lot_id: "lot-1", movement_type: "stock_in", quantity_kg: 500, reference_type: "stock_trip", reference_id: "trip-1", effective_date: "2026-09-15" },
      { id: "m2", inventory_lot_id: "lot-1", movement_type: "warehouse_to_salesman", quantity_kg: 300, to_salesman_user_id: "juan", reference_type: "receiving_receipt", reference_id: "rr-1", effective_date: "2026-09-15" },
      { id: "m3", inventory_lot_id: "lot-1", movement_type: "salesman_to_salesman", quantity_kg: 50, from_salesman_user_id: "juan", to_salesman_user_id: "pedro", reference_type: "transfer_receipt", reference_id: "tf-1", effective_date: "2026-09-15" },
      { id: "m4", inventory_lot_id: "lot-1", movement_type: "sale", quantity_kg: 100, from_salesman_user_id: "juan", reference_type: "sale", reference_id: "sale-1", effective_date: "2026-09-15" },
    ],
    tripLines: [{ id: "line-1", bags: 25, head_count: null, acquisition_type: "purchased" }],
    codes: [{ id: "code-1", code: "C1", display_name: "Cat1" }],
    classes: [{ id: "class-1", class_type: "A", display_name: "Premium" }],
    people: [{ user_id: "juan", full_name: "Juan Cruz" }, { user_id: "pedro", full_name: "Pedro Reyes" }],
    receivingReceipts: [{ id: "rr-1", receipt_number: "RR-000123" }],
    transferReceipts: [{ id: "tf-1", receipt_number: "TF-000044" }],
    sales: [{ id: "sale-1", trust_receipt_number: "TR-10239" }],
  });
  const row = rows[0];
  assert.deepEqual([row.originalQty, row.warehouseQty, row.salesmanQty, row.soldQty, row.remainingQty, row.reconciliationDelta], [500, 200, 200, 100, 400, 0]);
  assert.deepEqual([row.sizeCodeLabel, row.classTypeLabel, row.bags], ["Cat1", "Premium", 25]);
  assert.deepEqual(row.history.map((movement) => movement.ref), ["ST-FK-1", "RR-000123", "TF-000044", "TR-10239"]);
});

test("the routed shared Inventory presentation retains original Plant-first controls", () => {
  const component = readFileSync("src/components/InventoryOverview.jsx", "utf8");
  const localApp = readFileSync("src/App.jsx", "utf8");
  const hostedApp = readFileSync("src/SupabaseApp.jsx", "utf8");
  for (const text of ["Search Plant", "Back to Plants", "View All Trips", "Whole Dressed Chicken", "By-products", "SOLD OUT", "View Movements"]) assert.match(component, new RegExp(text));
  assert.match(localApp, /inventory: demoRole === "Owner \/ Admin"[\s\S]*?<InventoryOverview/);
  assert.match(hostedApp, /inventory: role === "owner_admin"[\s\S]*?<HostedCompanyInventoryScreen/);
  assert.match(localApp, /"salesman-inventory": <SalesmanInventory/);
  assert.match(hostedApp, /"salesman-inventory": <HostedInventoryScreen/);
});
