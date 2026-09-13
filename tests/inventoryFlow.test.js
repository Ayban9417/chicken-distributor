import test from "node:test";
import assert from "node:assert/strict";
import { initialTrips, initialPlantConfigs, cleanOperationalData, truckRules } from "../src/data/demoData.js";
import { getAcquisitionCost, getInventoryRows, money } from "../src/utils/business.js";
import { companyStockTotals, getSalesmanAvailableQty, getWarehouseAvailableQty, nextReceipt, salesmanInventoryRows, warehouseRows } from "../src/utils/inventoryFlow.js";
import { addMonths, duplicateTrustReceipt, truckAlerts, validateSale, validateStock } from "../src/utils/operations.js";
import { stockLine, stockSnapshot } from "../src/utils/plants.js";

const rows = getInventoryRows(initialTrips, []);
const transfer = { receipt: "RR-000001", toSalesmanId: "agent-pedro", tripId: "trip-fkidz-0913", plant: "Fkidz", product: "Whole Dressed Chicken", sizeCode: "C1", classType: "", qty: 100, costPerKg: 130 };

test("Fkidz configuration and opening Warehouse stock calculate exact totals", () => {
  const plant = initialPlantConfigs.find((item) => item.name === "Fkidz");
  assert.ok(plant.active); assert.equal(plant.shortCode, "FKIDZ");
  assert.deepEqual(plant.products[0].sizeCodes.map(({ id, displayName }) => [id, displayName]), [["C1", "Cat1"], ["H", "Happy Dog"], ["I", "India"], ["CB", "Class B"]]);
  assert.deepEqual(rows.filter((row) => row.product === "Whole Dressed Chicken").map((row) => row.remainingQty), [539.9, 785.5, 446.2, 481]);
  assert.equal(money(rows.filter((row) => row.category === "Whole Chicken").reduce((sum, row) => sum + row.originalQty, 0)), 2252.6);
  assert.equal(rows.filter((row) => row.category !== "Whole Chicken").reduce((sum, row) => sum + row.originalQty, 0), 400);
  assert.equal(rows.reduce((sum, row) => sum + row.originalAcquisitionCost, 0), 352048);
  assert.equal(rows.find((row) => row.product === "Head").bags, null);
  assert.equal(rows.find((row) => row.product === "Head").headCount, null);
});

test("Warehouse receiving and Salesman transfer preserve quantity and cost basis", () => {
  const second = { ...transfer, receipt: "TF-000001", fromSalesmanId: "agent-pedro", toSalesmanId: "agent-maria", qty: 25 };
  assert.equal(getWarehouseAvailableQty(initialTrips, [], [transfer], transfer.tripId, transfer.product, transfer.sizeCode), 439.9);
  assert.equal(getSalesmanAvailableQty([transfer], [second], [], "agent-pedro", transfer.tripId, transfer.product, transfer.sizeCode), 75);
  assert.equal(getSalesmanAvailableQty([transfer], [second], [], "agent-maria", transfer.tripId, transfer.product, transfer.sizeCode), 25);
  const totals = companyStockTotals(rows, [transfer], [second], [], ["agent-pedro", "agent-maria"]);
  assert.deepEqual(totals, { warehouse: 2552.6, assigned: 100, company: 2652.6 });
  assert.equal(salesmanInventoryRows(rows, [transfer], [second], [], "agent-maria")[0].costPerKg, 130);
  assert.equal(salesmanInventoryRows(rows, [transfer], [second], [], "agent-maria")[0].totalOut, 0);
  assert.equal(nextReceipt("RR", [{ receipt: "RR-000002" }, { receipt: "RR-000009" }]), "RR-000010");
});

test("Sales validate and deduct only the selected Salesman's exact code", () => {
  const groups = [{ tripId: transfer.tripId, lines: [{ product: transfer.product, sizeCode: "C1", classType: "", qty: 50, price: 190 }] }];
  assert.equal(validateSale(groups, initialTrips, [], "2026-09-13", "agent-pedro", [transfer], []), "");
  assert.equal(validateSale([{ ...groups[0], lines: [{ ...groups[0].lines[0], sizeCode: "H" }] }], initialTrips, [], "2026-09-13", "agent-pedro", [transfer], []), "Insufficient Salesman Inventory");
  const saleMovement = [{ tripId: transfer.tripId, product: transfer.product, sizeCode: "C1", classType: "", agentId: "agent-pedro", type: "OUT", qty: -50 }];
  assert.equal(getSalesmanAvailableQty([transfer], [], saleMovement, "agent-pedro", transfer.tripId, transfer.product, "C1"), 50);
  assert.equal(getWarehouseAvailableQty(initialTrips, saleMovement, [transfer], transfer.tripId, transfer.product, "C1"), 439.9);
  assert.equal(getAcquisitionCost(initialTrips, transfer.tripId, transfer.product, "C1"), 130);
  assert.equal(duplicateTrustReceipt([{ id: "sale-1", ref: "SALE-1301", trustReceipt: "TR-001284" }], " tr-001284 ").ref, "SALE-1301");
  assert.equal(duplicateTrustReceipt([{ id: "sale-1", trustReceipt: "TR-001284" }], "TR-001284", "sale-1"), null);
});

test("Class Type and independent Head bags/count snapshot without deriving values", () => {
  const plant = structuredClone(initialPlantConfigs.find((item) => item.name === "Fkidz"));
  const whole = plant.products[0]; whole.usesClassTypes = true; whole.classTypes = [{ id: "A", displayName: "Premium", active: true }];
  const line = { ...stockLine(whole), sizeCode: "C1", classType: "A", qty: 10, costPerKg: 130, bags: 2 };
  const snapshot = stockSnapshot(line, plant);
  assert.deepEqual([snapshot.sizeCode, snapshot.sizeCodeLabel, snapshot.classType, snapshot.classTypeLabel], ["C1", "Cat1", "A", "Premium"]);
  const head = plant.products.find((item) => item.productName === "Head");
  const headSnapshot = stockSnapshot({ ...stockLine(head), qty: 62.5, costPerKg: 20, bags: 5, headCount: 138 }, plant);
  assert.deepEqual([headSnapshot.bags, headSnapshot.headCount, headSnapshot.originalQty], [5, 138, 62.5]);
  assert.equal(validateStock({ date: "2026-09-13", plant: "Fkidz", products: [{ ...line }, { ...stockLine(head), qty: 62.5, costPerKg: 20, bags: 5, headCount: 138 }] }), "");
  assert.deepEqual(cleanOperationalData().receivingTransfers, []);
});

test("Truck Renewal follows an independent three-month calendar cycle", () => {
  assert.equal(addMonths("2026-06-13", 3), "2026-09-13");
  assert.equal(addMonths("2026-11-30", 3), "2027-02-28");
  assert.ok(truckAlerts({ lastRenewalDate: "2026-06-13", mileage: 0, nextOilMileage: "" }, "2026-09-13", truckRules).includes("Truck Renewal Due"));
  assert.ok(truckAlerts({ lastRenewalDate: "2026-06-01", mileage: 0, nextOilMileage: "" }, "2026-09-13", truckRules).includes("Truck Renewal Overdue"));
});
