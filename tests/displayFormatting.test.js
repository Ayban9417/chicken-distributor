import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { currency } from "../src/utils/business.js";
import { editableMoneyText, moneyInputText } from "../src/utils/currency.js";

test("peso amounts use two decimals without binary floating-point formatting", () => {
  for (const [input, expected] of [[400, "₱400.00"], ["400.", "₱400.00"], [1500, "₱1,500.00"], [188.5, "₱188.50"], [-188.5, "-₱188.50"], [189.25, "₱189.25"], [0, "₱0.00"], ["1.005", "₱1.01"]]) {
    assert.equal(currency(input), expected);
  }
  assert.equal(moneyInputText(1500), "1,500.00");
  assert.equal(moneyInputText(""), "");
});

test("currency editing accepts partial decimals and rejects negatives or invalid characters", () => {
  for (const value of ["400.", "188.5", "1,500.00", ".", "0", ""]) assert.notEqual(editableMoneyText(value), null);
  assert.equal(editableMoneyText("1,500.00"), "1500.00");
  assert.equal(editableMoneyText("."), "0.");
  for (const value of ["-1", "12.345", "hello", "12a", "1..2"]) assert.equal(editableMoneyText(value), null);
});

test("shared money field renders an inside prefix and keeps stored values separate", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { Field, MoneyInput } = await vite.ssrLoadModule("/src/components/ui.jsx");
    const html = renderToStaticMarkup(createElement(Field, { label: "Selling Price/kg" }, createElement(MoneyInput, { value: 400, onChange() {} })));
    assert.match(html, /aria-hidden="true"[^>]*>₱<\/span>/);
    assert.match(html, /value="400\.00"/);
    assert.doesNotMatch(html, /value="₱400\.00"/);
    const reference = renderToStaticMarkup(createElement(Field, { label: "GCash Reference Number" }, createElement("input", { value: "AbC123", readOnly: true })));
    assert.match(reference, /data-preserve-case="true"/);
  } finally {
    await vite.close();
  }
});

test("labels and uppercase presentation leave credential and identifier input case intact", () => {
  const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
  const plants = readFileSync(new URL("../src/components/LivePlantManagement.jsx", import.meta.url), "utf8");
  const localPlants = readFileSync(new URL("../src/components/PlantManagement.jsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(css, /#root \{ text-transform: uppercase; \}/);
  assert.match(css, /input\[type="password"\]/);
  assert.match(css, /input\[autocomplete="username"\]/);
  assert.match(css, /input\[data-preserve-case="true"\]/);
  assert.doesNotMatch(plants + localPlants, /Operational Code/);
  assert.match(plants + localPlants, /Description/);
  assert.doesNotMatch(app, /Total Acquisition Cost|Original Acquisition Cost/);
  assert.match(app, /Total Purchase Cost/);
  assert.match(app, /Cost\/kg/);
});
