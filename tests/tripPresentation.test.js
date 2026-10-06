import test from "node:test";
import assert from "node:assert/strict";
import { displayProductCategory, isByProduct, productLabel, tripAcquisitionCost } from "../src/utils/business.js";
import { groupTripProducts } from "../src/utils/tripPresentation.js";
import { normalizeHostedTrips } from "../src/utils/hostedDashboard.js";

const line = (name, category, originalQty, costPerKg, extra = {}) => ({ name, category, originalQty, costPerKg, acquisitionType: "Purchased", ...extra });

test("Plant Trip categories reconcile the historical ST-000018 stock-in figures", () => {
  const products = [
    line("Whole Dressed Chicken", "Whole Chicken", 254.2, 135, { sizeCode: "C1", bags: 12, headCount: 240 }),
    line("Whole Dressed Chicken", "Whole Chicken", 273.5, 152, { sizeCode: "D1" }),
    line("Whole Dressed Chicken", "Whole Chicken", 847.5, 152, { sizeCode: "G" }),
    line("Whole Dressed Chicken", "Whole Chicken", 294.9, 152, { sizeCode: "H" }),
    line("Whole Dressed Chicken", "Whole Chicken", 187.7, 150, { sizeCode: "I" }),
    line("Head", "By-products", 50, 20),
    line("Feet", "By-products", 90, 40),
    line("Liver", "By-products", 61, 140),
    line("Gizzard", "By-products", 30, 135),
    line("Small Intestine", "By-products", 40, 40),
    line("Large Intestine", "By-products", 20, 80),
    line("Proven", "By-products", 11, 100),
    line("Crops", "By-products", 10, 53),
    line("Trachea", "By-products", 11, 36),
  ];
  const groups = groupTripProducts(products);
  assert.equal(groups.main.rows.length, 5);
  assert.equal(groups.byproducts.rows.length, 9);
  assert.equal(groups.main.kilos, 1857.8);
  assert.equal(groups.main.cost, 277688.8);
  assert.equal(groups.byproducts.kilos, 323);
  assert.equal(groups.byproducts.cost, 22416);
  assert.equal(groups.main.kilos + groups.byproducts.kilos, 2180.8);
  assert.equal(groups.main.cost + groups.byproducts.cost, tripAcquisitionCost({ products }));
  assert.equal(products[0].headCount, 240);
  assert.equal(products[0].bags, 12);
  assert.equal(products[1].headCount ?? "Not recorded", "Not recorded");
  assert.match(productLabel(products[0].name, products[0].sizeCode), /C1/);
});

test("configured other products share the main group with Warehouse while by-products stay separate", () => {
  const categories = ["whole_chicken", "other", "by_product"].map(displayProductCategory);
  assert.deepEqual(categories, ["Whole Chicken", "Other", "By-products"]);
  const products = [line("JUMBO", categories[1], 25, 160), line("HEART", categories[2], 4, 70)];
  const groups = groupTripProducts(products);
  assert.deepEqual(groups.main.rows.map((row) => row.name), ["JUMBO"]);
  assert.deepEqual(groups.byproducts.rows.map((row) => row.name), ["HEART"]);
  assert.equal(isByProduct({ category: displayProductCategory("other") }), false);
  assert.equal(isByProduct({ category: displayProductCategory("by_product") }), true);
});

test("hosted historical coded and uncoded lines preserve category, heads, bags, and cost", () => {
  const [trip] = normalizeHostedTrips({
    trips: [{ id: "trip", plant_id: "plant", trip_number: "ST-000018", trip_date: "2026-10-03" }],
    lines: [
      { stock_trip_id: "trip", plant_product_id: "p1", code_id: "code", quantity_kg: 10, cost_per_kg: 135, bags: 2, head_count: 16 },
      { stock_trip_id: "trip", plant_product_id: "p2", quantity_kg: 3, cost_per_kg: 40, bags: null, head_count: null },
      { stock_trip_id: "trip", plant_product_id: "p3", quantity_kg: 0, cost_per_kg: 0, acquisition_type: "free_from_plant" },
    ],
    plantProducts: [{ id: "p1", product_id: "whole" }, { id: "p2", product_id: "byproduct" }, { id: "p3", product_id: "other" }],
    products: [{ id: "whole", name: "Whole Dressed Chicken", category: "whole_chicken" }, { id: "byproduct", name: "HEART", category: "by_product" }, { id: "other", name: "JUMBO", category: "other" }],
    plants: [{ id: "plant", name: "MANOK PINOY" }],
    codes: [{ id: "code", code: "C1", display_name: "C1" }],
  });
  const groups = groupTripProducts(trip.products);
  assert.equal(trip.code, "ST-000018");
  assert.equal(groups.main.rows[0].sizeCode, "C1");
  assert.equal(groups.main.rows[0].headCount, 16);
  assert.equal(groups.main.rows[0].bags, 2);
  assert.equal(groups.byproducts.rows[0].headCount, null);
  assert.equal(groups.main.kilos, 10);
  assert.equal(groups.byproducts.kilos, 3);
  assert.equal(groups.main.cost, 1350);
  assert.equal(groups.byproducts.cost, 120);
  assert.equal(tripAcquisitionCost(trip), 1470);
});

test("single-category, empty, and free-from-plant Trips have independent totals", () => {
  const main = groupTripProducts([line("JUMBO", "Other", 8, 150)]);
  assert.equal(main.byproducts.rows.length, 0);
  assert.equal(main.byproducts.kilos, 0);
  const byproducts = groupTripProducts([line("HEART", "By-products", 5, 0, { acquisitionType: "Free from Plant" })]);
  assert.equal(byproducts.main.rows.length, 0);
  assert.equal(byproducts.byproducts.kilos, 5);
  assert.equal(byproducts.byproducts.cost, 0);
  assert.equal(groupTripProducts().main.rows.length, 0);
  assert.equal(groupTripProducts(null).byproducts.rows.length, 0);
  assert.equal(displayProductCategory(null), undefined);
  assert.equal(groupTripProducts([line("Whole Dressed Chicken", undefined, 2, 100)]).main.kilos, 2);
});
