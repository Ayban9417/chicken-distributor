import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("customer editor offers extra phones and zero-priced customer products without legacy fields", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { CustomerEditor } = await vite.ssrLoadModule("/src/components/CustomerManagement.jsx");
    const html = renderToStaticMarkup(createElement(CustomerEditor, {
      customers: [], productNames: ["Whole Dressed Chicken"], onSave() {}, onClose() {}, onExisting() {},
    }));
    assert.match(html, /Add Another Phone Number/);
    assert.match(html, /Whole Dressed Chicken Selling Price\/kg/);
    assert.match(html, /placeholder="0\.00"[^>]*value=""/);
    assert.doesNotMatch(html, /Customer Type|Credit Limit|Default:/);
    const edited = renderToStaticMarkup(createElement(CustomerEditor, {
      customer: { id: "one", name: "Branch Store", contactPerson: "", mobile: "09171234567", additionalPhones: ["09181234567"], address: "", paymentType: "Cash", paymentDays: null, creditLimit: null, active: true, pricing: { "Whole Dressed Chicken": 0 } },
      customers: [], productNames: ["Whole Dressed Chicken"], onSave() {}, onClose() {}, onExisting() {},
    }));
    assert.match(edited, /Additional Phone 1/);
    assert.match(edited, /09181234567/);
    assert.match(edited, /value="0\.00"/);
  } finally {
    await vite.close();
  }
});

test("prepared migration keeps bank names separate and retains role and DCR protections", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261013120155_customer_phones_and_bank_names.sql", import.meta.url), "utf8");
  assert.match(sql, /add column additional_phones text\[\] not null default/);
  assert.match(sql, /add column bank_name text/);
  assert.match(sql, /payments_gcash_reference_check/);
  assert.match(sql, /create function api\.record_bank_payment/);
  assert.match(sql, /create function api\.create_sale_with_bank_payment/);
  assert.match(sql, /api\.record_payment\(/);
  assert.match(sql, /api\.create_sale\(/);
  assert.match(sql, /to_jsonb\(new\) - 'bank_name' - 'reference_number'/);
  assert.match(sql, /from public, anon/);
  assert.doesNotMatch(sql, /disable row level security|drop table public\.customers/i);
});
