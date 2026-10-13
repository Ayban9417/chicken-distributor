import test from "node:test";
import assert from "node:assert/strict";
import { displayProductCategory, isByProduct, productLabel, tripAcquisitionCost } from "../src/utils/business.js";
import { groupTripProducts, tripKilograms, wholeChickenLineLabel } from "../src/utils/tripPresentation.js";
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
  assert.equal(groups.whole.rows.length, 5);
  assert.equal(groups.byproducts.rows.length, 9);
  assert.equal(groups.whole.kilos, 1857.8);
  assert.equal(groups.whole.cost, 277688.8);
  assert.equal(groups.byproducts.kilos, 323);
  assert.equal(groups.byproducts.cost, 22416);
  assert.equal(groups.whole.kilos + groups.byproducts.kilos, groups.grand.kilos);
  assert.equal(groups.whole.cost + groups.byproducts.cost, groups.grand.cost);
  assert.equal(groups.grand.cost, tripAcquisitionCost({ products }));
  assert.equal(groups.other.rows.length, 0);
  assert.equal(products[0].headCount, 240);
  assert.equal(products[0].bags, 12);
  assert.equal(products[1].headCount ?? "Not recorded", "Not recorded");
  assert.match(productLabel(products[0].name, products[0].sizeCode), /C1/);
});

test("configured Other products keep their own subtotal while by-products stay separate", () => {
  const categories = ["whole_chicken", "other", "by_product"].map(displayProductCategory);
  assert.deepEqual(categories, ["Whole Chicken", "Other", "By-products"]);
  const products = [line("JUMBO", categories[1], 25, 160), line("HEART", categories[2], 4, 70)];
  const groups = groupTripProducts(products);
  assert.deepEqual(groups.other.rows.map((row) => row.name), ["JUMBO"]);
  assert.deepEqual(groups.byproducts.rows.map((row) => row.name), ["HEART"]);
  assert.equal(groups.whole.kilos, 0);
  assert.equal(groups.grand.kilos, groups.other.kilos + groups.byproducts.kilos);
  assert.equal(groups.grand.cost, groups.other.cost + groups.byproducts.cost);
  assert.equal(isByProduct({ category: displayProductCategory("other") }), false);
  assert.equal(isByProduct({ category: displayProductCategory("by_product") }), true);
});

test("hosted historical coded and uncoded lines preserve category, heads, bags, and cost", () => {
  const [trip] = normalizeHostedTrips({
    trips: [{ id: "trip", plant_id: "plant", trip_number: "ST-000018", reference_number: "0482", trip_date: "2026-10-03" }],
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
  assert.equal(trip.reference, "0482");
  assert.equal(groups.whole.rows[0].sizeCode, "C1");
  assert.equal(groups.whole.rows[0].headCount, 16);
  assert.equal(groups.whole.rows[0].bags, 2);
  assert.equal(groups.byproducts.rows[0].headCount, null);
  assert.equal(groups.whole.kilos, 10);
  assert.equal(groups.byproducts.kilos, 3);
  assert.equal(groups.whole.cost, 1350);
  assert.equal(groups.byproducts.cost, 120);
  assert.equal(groups.grand.kilos, 13);
  assert.equal(groups.grand.cost, 1470);
  assert.equal(tripAcquisitionCost(trip), 1470);
});

test("single-category, empty, and free-from-plant Trips have independent totals", () => {
  const other = groupTripProducts([line("JUMBO", "Other", 8, 150)]);
  assert.equal(other.byproducts.rows.length, 0);
  assert.equal(other.byproducts.kilos, 0);
  assert.equal(other.other.kilos, 8);
  const byproducts = groupTripProducts([line("HEART", "By-products", 5, 0, { acquisitionType: "Free from Plant" })]);
  assert.equal(byproducts.whole.rows.length, 0);
  assert.equal(byproducts.byproducts.kilos, 5);
  assert.equal(byproducts.byproducts.cost, 0);
  assert.equal(groupTripProducts().whole.rows.length, 0);
  assert.equal(groupTripProducts(null).byproducts.rows.length, 0);
  assert.equal(displayProductCategory(null), undefined);
  assert.equal(groupTripProducts([line("Whole Dressed Chicken", undefined, 2, 100)]).whole.kilos, 2);
});

test("Whole Chicken rows show only their configured code with a readable uncoded fallback", () => {
  assert.equal(wholeChickenLineLabel(line("Whole Dressed Chicken", "Whole Chicken", 2, 100, { sizeCode: "D1", sizeCodeLabel: "Description" })), "D1");
  assert.equal(wholeChickenLineLabel(line("Whole Dressed Chicken", "Whole Chicken", 2, 100)), "Whole Dressed Chicken");
  assert.equal(wholeChickenLineLabel(line("Whole Dressed Chicken", "Whole Chicken", 2, 100, { classType: "A" })), "A");
  assert.equal(tripKilograms(1.235), "1.235 kg");
});

test("dynamic Plant categories partition each Trip line exactly once", () => {
  const products = [
    line("Whole Bird", "Whole Chicken", 1.125, 142, { sizeCode: "CUSTOM-7" }),
    line("HEART", "By-products", 2.25, 70),
    line("JUMBO", "Other", 3.5, 90),
  ];
  const groups = groupTripProducts(products);
  assert.equal(groups.whole.rows[0].sizeCode, "CUSTOM-7");
  assert.equal(groups.whole.kilos + groups.byproducts.kilos + groups.other.kilos, groups.grand.kilos);
  assert.equal(groups.whole.cost + groups.byproducts.cost + groups.other.cost, groups.grand.cost);
  assert.equal(groups.grand.kilos, 6.875);
});
