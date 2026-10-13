import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const plantConfigs = [{
  id: "plant",
  name: "Test Plant",
  shortCode: "TST",
  active: true,
  products: [{ productId: "whole", productName: "Whole Dressed Chicken", category: "Whole Chicken", active: true, usesSizeCodes: false }],
}];

test("Plant Trips render the entered reference, category totals, code-only row and grand total", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { Trips } = await vite.ssrLoadModule("/src/App.jsx");
    const trip = {
      id: "trip", plant: "Test Plant", date: "2026-10-03", code: "ST-000123", reference: "0482",
      products: [
        { name: "Whole Dressed Chicken", category: "Whole Chicken", sizeCode: "C1", sizeCodeLabel: "Cat 1", originalQty: 10, costPerKg: 142, acquisitionType: "Purchased" },
        { name: "Whole Dressed Chicken", category: "Whole Chicken", originalQty: 5, costPerKg: 146, acquisitionType: "Purchased" },
        { name: "Liver", category: "By-products", originalQty: 2, costPerKg: 88, acquisitionType: "Purchased" },
      ],
    };
    const html = renderToStaticMarkup(createElement(Trips, { trips: [trip], plantConfigs, currentDate: "2026-10-03" }));
    const summary = html.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/)?.[1];
    assert.ok(summary, "native summary keeps the Trip expandable");
    assert.match(html, /<details\b/);
    assert.match(summary, /grid-cols-1/);
    assert.doesNotMatch(summary, /(?:sm|md|lg|xl|2xl):grid-cols-/);
    assert.match(summary, /Trip Date[\s\S]*Oct 3, 2026/);
    assert.match(summary, /Reference Number[\s\S]*0482/);
    assert.match(summary, /Whole Dressed Chicken[\s\S]*15 kg/);
    assert.match(summary, /By-products[\s\S]*2 kg/);
    assert.doesNotMatch(summary, /ST-000123|2,326|Grand Total/);
    assert.match(html, /<th scope="col"[^>]*>Whole Dressed Chicken<\/th>/);
    assert.match(html, /<th scope="col"[^>]*>Product<\/th>/);
    assert.match(html, /<td[^>]*>C1<\/td>/);
    assert.match(html, /<td[^>]*>Whole Dressed Chicken<\/td>/);
    assert.doesNotMatch(html, /Whole Dressed Chicken \/ C1|Whole Dressed Chicken — C1/);
    assert.ok(html.indexOf("Grand Total") > html.indexOf("By-products"));
    assert.match(html, /Grand Total[\s\S]*Total Kilograms[\s\S]*17 kg[\s\S]*Total Cost/);

    const otherTrip = { ...trip, products: [...trip.products, { name: "JUMBO", category: "Other", originalQty: 1, costPerKg: 90, acquisitionType: "Purchased" }] };
    const otherHtml = renderToStaticMarkup(createElement(Trips, { trips: [otherTrip], plantConfigs, currentDate: "2026-10-03" }));
    assert.match(otherHtml, /Other Products[\s\S]*1 kg/);
    assert.match(otherHtml, /Grand Total[\s\S]*18 kg/);

    const wholeOnly = { ...trip, reference: "", products: [trip.products[0]] };
    const wholeOnlyHtml = renderToStaticMarkup(createElement(Trips, { trips: [wholeOnly], plantConfigs, currentDate: "2026-10-03" }));
    assert.match(wholeOnlyHtml, /No by-products recorded for this trip\.[\s\S]*Subtotal: 0 kg/);
  } finally {
    await vite.close();
  }
});
