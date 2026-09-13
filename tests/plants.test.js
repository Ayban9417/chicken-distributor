import test from "node:test";
import assert from "node:assert/strict";
import { initialPlantConfigs, activeProducts, activeCodes, stockLine, stockSnapshot, validatePlantStock, validatePlant, isReferenced, configureProduct } from "../src/utils/plants.js";
import { initialTrips, initialMovements, initialOuts, demoToday } from "./fixtures/historicalDemo.js";
import { getInventoryRows, getAvailableQty, getOutLineFinancials, periodOutFinancials, isWholeChicken } from "../src/utils/business.js";
import { validateStock, validateSale } from "../src/utils/operations.js";

const config = () => structuredClone(initialPlantConfigs);
const formFor = (plant, product = plant.products[0], code = "") => ({ plantId: plant.id, plant: plant.name, date: demoToday, products: [{ ...stockLine(product), sizeCode: code, bags: 4, qty: 100, costPerKg: 142 }] });
test("Bounty is coded; Magnolia is uncoded; product lists are independently configured", () => {
  const [bounty, magnolia, other] = config();
  assert.deepEqual(activeCodes(bounty.products[0]).map((c) => c.displayName), ["P1", "P2", "G"]);
  assert.equal(magnolia.products[0].usesSizeCodes, false);
  other.products = other.products.filter((p) => p.productName !== "Liver");
  assert.ok(activeProducts(bounty).some((p) => p.productName === "Liver"));
  assert.ok(!activeProducts(other).some((p) => p.productName === "Liver"));
});
test("intake enforces active plant, product, configured code and free allowance", () => {
  const [plant, uncoded] = config();
  const form = formFor(plant);
  assert.match(validatePlantStock(form, plant), /Size\/Code/);
  for (const code of ["P-1", "p1", "P01", "unexpected"]) assert.ok(validatePlantStock({ ...form, products: [{ ...form.products[0], sizeCode: code }] }, plant));
  form.products[0].sizeCode = "P1";
  assert.equal(validatePlantStock(form, plant), ""); assert.equal(validateStock(form), "");
  assert.equal(validatePlantStock(formFor(uncoded), uncoded), "");
  assert.ok(validatePlantStock(formFor(uncoded, uncoded.products[0], "P1"), uncoded));
  plant.products[0].allowsFreeFromPlant = false; form.products[0].acquisitionType = "Free from Plant";
  assert.match(validatePlantStock(form, plant), /not allowed/);
  plant.products[0].active = false; assert.match(validatePlantStock(form, plant), /active product/);
  plant.active = false; assert.match(validatePlantStock(form, plant), /active plant/);
});
test("arbitrary operational codes and separate display labels are supported", () => {
  const [plant] = config();
  plant.products[0].sizeCodes = ["Small", "Medium", "Large"].map((name, i) => ({ id: "code-" + i, displayName: name, active: true }));
  assert.equal(validatePlant(plant, []), "");
  const form = formFor(plant, plant.products[0], "code-1");
  assert.equal(validatePlantStock(form, plant), "");
  assert.equal(stockSnapshot(form.products[0], plant).sizeCode, "code-1");
  assert.equal(stockSnapshot(form.products[0], plant).sizeCodeLabel, "Medium");
  plant.products[0].sizeCodes[1].id = " code-0 "; assert.match(validatePlant(plant, []), /unique/);
  plant.products[0].sizeCodes[1].id = ""; assert.ok(validatePlant(plant, []));
  plant.products[0].sizeCodes = []; assert.match(validatePlant(plant, []), /active code/);
});
test("coded and uncoded sales deduct exact sources and calculate their own costs", () => {
  const [coded, uncoded] = config();
  const lines = [formFor(coded, coded.products[0], "P1").products[0], { ...formFor(coded, coded.products[0], "G").products[0], costPerKg: 150 }];
  const trips = [{ id: "coded", plantId: coded.id, plant: coded.name, date: demoToday, products: lines.map((l) => stockSnapshot(l, coded)) },
    { id: "uncoded", plantId: uncoded.id, plant: uncoded.name, date: demoToday, products: [stockSnapshot({ ...formFor(uncoded).products[0], costPerKg: 146 }, uncoded)] }];
  const groups = trips.map((t) => ({ tripId: t.id, plant: t.plant, tripDate: t.date, lines: [{ product: "Whole Dressed Chicken", sizeCode: t.id === "coded" ? "G" : "", qty: 10, price: 184 }] }));
  assert.equal(validateSale(groups, trips, [], demoToday), "");
  const movements = groups.map((g) => ({ tripId: g.tripId, product: g.lines[0].product, sizeCode: g.lines[0].sizeCode, qty: -10, type: "OUT" }));
  assert.equal(getAvailableQty(trips, movements, "coded", "Whole Dressed Chicken", "G"), 90);
  assert.equal(getAvailableQty(trips, movements, "coded", "Whole Dressed Chicken", "P1"), 100);
  assert.equal(getAvailableQty(trips, movements, "uncoded", "Whole Dressed Chicken", ""), 90);
  const financial = getOutLineFinancials({ groups }, trips);
  assert.deepEqual(financial.map((l) => l.cogs), [1500, 1460]);
  assert.deepEqual(financial.map((l) => l.grossProfit), [340, 380]);
});
test("deactivating/renaming configuration never mutates historical stock, sales or costs", () => {
  const before = JSON.stringify({ initialTrips, initialOuts, initialMovements });
  const rows = getInventoryRows(initialTrips, initialMovements);
  const finance = periodOutFinancials(initialOuts, initialTrips, { start: "2026-08-31", end: demoToday });
  const [plant] = config(); const product = plant.products[0]; const code = product.sizeCodes[2];
  assert.equal(isReferenced(initialTrips, plant), true);
  assert.equal(isReferenced(initialTrips, plant, product, code), true);
  assert.equal(isReferenced(initialTrips, plant, plant.products.find((p) => p.productName === "Feet")), true);
  code.active = false; code.displayName = "Giant"; product.active = false; plant.active = false; plant.name = "Renamed Bounty";
  assert.equal(isReferenced(initialTrips, plant, product, code), true);
  assert.deepEqual(getInventoryRows(initialTrips, initialMovements), rows);
  assert.deepEqual(periodOutFinancials(initialOuts, initialTrips, { start: "2026-08-31", end: demoToday }), finance);
  assert.equal(JSON.stringify({ initialTrips, initialOuts, initialMovements }), before);
});
test("stable product/code IDs protect new receipt history after display-name edits", () => {
  const [plant] = config(); const product = plant.products[0]; const code = product.sizeCodes[2];
  const trip = { id: "new", plantId: plant.id, plant: plant.name, products: [stockSnapshot(formFor(plant, product, code.id).products[0], plant)] };
  product.productName = "Whole Chicken"; code.displayName = "Large";
  assert.equal(isReferenced([trip], plant, product, code), true);
  assert.equal(trip.products[0].name, "Whole Dressed Chicken"); assert.equal(trip.products[0].sizeCode, "G");
  assert.equal(stockSnapshot(formFor(plant, product, code.id).products[0], plant).sizeCode, "G");
  assert.equal(stockSnapshot(formFor(plant, product, code.id).products[0], plant).sizeCodeLabel, "Large");
  const custom = configureProduct({ productId: "custom", productName: "Fresh Chicken", category: "Whole Chicken" });
  assert.equal(isWholeChicken(stockSnapshot(formFor({ ...plant, products: [custom] }, custom).products[0], { ...plant, products: [custom] })), true);
});
test("unused products/codes can be removed, referenced legacy records are protected", () => {
  const [plant] = config();
  assert.equal(isReferenced(initialTrips, plant, { productId: "new", productName: "Unused" }), false);
  assert.equal(isReferenced(initialTrips, plant, plant.products[0], { id: "P3" }), false);
  for (const p of plant.products) assert.equal(isReferenced(initialTrips, plant, p), true);
});
