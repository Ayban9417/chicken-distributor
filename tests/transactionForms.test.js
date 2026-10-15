import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { freshPaymentTransaction, freshSaleTransaction } from "../src/utils/transactionForms.js";

test("a new Sale clears transaction details but retains the assigned Salesman", () => {
  const next = freshSaleTransaction("2026-10-15", "salesman-1");
  assert.equal(next.customerId, "");
  assert.equal(next.trustReceipt, "");
  assert.equal(next.saleDate, "2026-10-15");
  assert.equal(next.saleAgent, "salesman-1");
  assert.deepEqual(next.salePayment, {
    enabled: false, amount: "", method: "Cash", reference: "", bank: "", notes: "",
  });
});

test("a new Payment clears the previous customer, method, bank, reference, notes and allocations", () => {
  const next = freshPaymentTransaction("salesman-1", "2026-10-15");
  assert.deepEqual(next, {
    agentId: "salesman-1", customerId: "", amount: "", method: "Cash",
    date: "2026-10-15", reference: "", bank: "", notes: "",
    manual: false, allocations: [],
  });
  next.allocations.push({ saleId: "sale-1", amount: 20 });
  assert.deepEqual(freshPaymentTransaction("salesman-1", "2026-10-15").allocations, []);
});

test("a customer deep link prefills only the initial Payment form", () => {
  assert.equal(freshPaymentTransaction("salesman-1", "2026-10-15", "customer-1").customerId, "customer-1");
  assert.equal(freshPaymentTransaction("salesman-1", "2026-10-15").customerId, "");
});

test("Owner/Admin and Salesman forms render without a preselected customer", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { OutOrders, Collections } = await vite.ssrLoadModule("/src/App.jsx");
    const customers = [{ id: "customer-1", name: "QA Customer", active: true, pricing: {}, paymentType: "Cash" }];
    const users = [{ id: "salesman-1", name: "QA Salesman", role: "Agent", active: true }];
    for (const salesmanId of ["", "salesman-1"]) {
      const sale = renderToStaticMarkup(createElement(OutOrders, {
        customers, trips: [], outs: [], ledgerEntries: [], currentDate: "2026-10-15",
        initialSalesmanId: salesmanId, canSelectSalesman: !salesmanId,
      }));
      assert.match(sale, /<option value="" disabled="" selected="">Select Customer<\/option>/);
      assert.doesNotMatch(sale, /value="QA-RESET-A"/);
      const payment = renderToStaticMarkup(createElement(Collections, {
        customers, users, ledgerEntries: [], collections: [], expenses: [],
        currentDate: "2026-10-15", initialSalesmanId: salesmanId, canSelectSalesman: !salesmanId,
      }));
      assert.match(payment, /<option value="" disabled="" selected="">Select Customer<\/option>/);
      assert.match(payment, /<option selected="">Cash<\/option>/);
    }
  } finally {
    await vite.close();
  }
});
