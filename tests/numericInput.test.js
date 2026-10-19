import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { numericDecimals, numericDraft, numericPlaceholder } from "../src/utils/numericInput.js";
import { stockLine } from "../src/utils/plants.js";

test("numeric drafts preserve partial decimal input without making empty zero", () => {
  for (const value of ["", "0", "0.", "125.", "125.50", "125.500", ".5"]) {
    assert.equal(numericDraft(value), value);
  }
  for (const value of ["-1", "1e3", "1,200", "12a", "1..2"]) {
    assert.equal(numericDraft(value), null);
  }
  assert.equal(numericDraft("-125.50", { allowNegative: true }), "-125.50");
  assert.equal(numericDraft("12.5", { integer: true }), null);
  assert.equal(numericDraft("12", { integer: true }), "12");
  assert.equal(numericDraft("125.", { maxDecimals: 2 }), "125.");
  assert.equal(numericDraft("125.50", { maxDecimals: 2 }), "125.50");
  assert.equal(numericDraft("125.500", { maxDecimals: 2 }), null);
  assert.equal(numericDecimals("0.001"), 3);
  assert.equal(numericPlaceholder("1"), "0");
  assert.equal(numericPlaceholder("0.001"), "0.00");
  assert.equal(stockLine({ productId: "p1", productName: "Whole Dressed Chicken" }).qty, "");
});

test("new numeric inputs are blank while saved zero stays visible", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { NumericInput, MoneyInput } = await vite.ssrLoadModule("/src/components/ui.jsx");
    assert.match(renderToStaticMarkup(createElement(NumericInput, { value: "", step: "0.001" })), /placeholder="0\.00"[^>]*value=""/);
    assert.match(renderToStaticMarkup(createElement(NumericInput, { value: 0, step: "1" })), /placeholder="0"[^>]*value="0"/);
    assert.match(renderToStaticMarkup(createElement(MoneyInput, { value: "" })), /placeholder="0\.00"[^>]*value=""/);
    assert.match(renderToStaticMarkup(createElement(MoneyInput, { value: 0 })), /placeholder="0\.00"[^>]*value="0\.00"/);
  } finally {
    await vite.close();
  }
});
