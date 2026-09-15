import test from "node:test";
import assert from "node:assert/strict";
import * as demo from "../src/data/demoData.js";
import { emptySalePayment, validateSalePayment, saleFinancialEvents, paymentAtSaleStatus } from "../src/utils/salePayment.js";
import { buildDcr, customerBalance, allocateOldestFirst, getInventoryRows } from "../src/utils/business.js";
import { periodSummary, salePaymentStatus, collectibleRows } from "../src/utils/operations.js";

let sequence = 0;
const uid = (prefix) => prefix + "-test-" + ++sequence;
const customer = { id: "test-customer", name: "Golden Chicken House", active: true, pricing: {}, paymentType: "Credit", creditLimit: 100000 };
const trip = { id: "test-trip", plant: "Bounty", date: demo.demoToday, products: [{ name: "Whole Dressed Chicken", sizeCode: "P1", originalQty: 1000, costPerKg: 142 }] };
const sale = { id: "sale-test", ref: "SALE-TEST", trustReceipt: "TR-001", date: demo.demoToday, customerId: customer.id, agentId: "agent-pedro", total: 50000,
  groups: [{ plant: "Bounty", tripId: trip.id, tripDate: trip.date, lines: [{ product: "Whole Dressed Chicken", sizeCode: "P1", qty: 200, price: 250 }] }] };
const payment = (amount, method = "Cash", reference = "") => ({ ...emptySalePayment(), enabled: true, amount, method, reference });

test("runtime startup contains only Fkidz stock while reset is operationally clean", () => {
  for (const [name, value] of Object.entries(demo)) if (name.startsWith("initial") && !["initialPlantConfigs", "initialTrips"].includes(name)) assert.deepEqual(value, [], name);
  assert.deepEqual(demo.initialTrips.map((item) => item.plant), ["Fkidz"]);
  const clean = demo.cleanOperationalData(); const another = demo.cleanOperationalData(); clean.trips.push(trip);
  assert.equal(another.trips.length, 0);
  assert.ok(demo.users.some((u) => u.active && u.role === "Owner / Admin"));
  assert.ok(demo.users.some((u) => u.active && u.role === "Agent"));
  assert.equal(demo.users.some((u) => u.role === "Cashier"), false);
  assert.deepEqual(demo.initialPlantConfigs.find((p) => p.name === "Bounty").products[0].sizeCodes.map((c) => c.displayName), ["P1", "P2", "G"]);
  assert.equal(demo.initialPlantConfigs.find((p) => p.name === "Fkidz").shortCode, "FKIDZ");
  const state = { ...another, users: demo.users };
  assert.equal(getInventoryRows(state.trips, state.movements).length, 0);
  const summary = periodSummary(state, { start: demo.demoToday, end: demo.demoToday });
  for (const key of ["grossSales", "cogs", "expenseTotal", "profitEstimate", "paymentTotal", "newReceivables", "closing", "wholeKg", "byproductKg"]) assert.equal(summary[key], 0, key);
});

for (const [label, input, balance, method] of [
  ["No payment", emptySalePayment(), 50000, "Cash"],
  ["Explicit zero", payment(0), 50000, "Cash"],
  ["Partial Cash", payment(20000), 30000, "Cash"],
  ["Full Cash", payment(50000), 0, "Cash"],
  ["Partial GCash", payment(20000, "GCash", "GC-001"), 30000, "GCash"],
  ["Partial Bank", payment(20000, "Bank Deposit", "BANK-001"), 30000, "Bank Deposit"],
]) test(label + ": separate sale/payment events reconcile across every financial view", () => {
  const result = saleFinancialEvents(sale, input, "PAY-TEST", uid);
  const paid = 50000 - balance;
  const state = { ...demo.cleanOperationalData(), customers: [customer], trips: [trip], outs: [sale], ledgerEntries: result.entries, collections: result.collection ? [result.collection] : [] };
  assert.equal(result.entries[0].charge, 50000); assert.equal(sale.total, 50000);
  assert.equal(result.entries.length, paid ? 2 : 1); assert.equal(customerBalance(result.entries, customer.id), balance);
  assert.equal(salePaymentStatus(result.entries, sale.ref).toUpperCase(), paymentAtSaleStatus(50000, paid));
  const rows = collectibleRows([customer], result.entries, state.collections);
  assert.equal(rows.length, balance ? 1 : 0); if (balance) assert.equal(rows[0].balance, balance);
  const dcr = buildDcr({ ...state, agentId: sale.agentId, date: sale.date });
  assert.equal(dcr.totals[method], paid); assert.equal(dcr.expectedCashRemittance, method === "Cash" ? paid : 0);
  const summary = periodSummary(state, { start: sale.date, end: sale.date });
  assert.equal(summary.grossSales, 50000); assert.equal(summary.cogs, 28400); assert.equal(summary.paymentTotal, paid);
  assert.equal(summary.newReceivables, balance); assert.equal(summary.closing, balance);
  assert.equal(Boolean(result.discrepancy), method === "Bank Deposit");
  if (paid) { assert.equal(result.collection.agentId, sale.agentId); assert.equal(result.collection.date, sale.date); assert.deepEqual(result.collection.allocations, [{ invoiceRef: sale.ref, amount: paid }]); }
});

test("overpayment, invalid amounts and missing electronic references are blocked", () => {
  assert.equal(validateSalePayment(payment(60000), 50000), "Payment cannot exceed Sale Total.");
  assert.throws(() => saleFinancialEvents(sale, payment(60000), "PAY", uid), /cannot exceed/);
  for (const amount of [-1, Infinity, NaN, "bad"]) assert.match(validateSalePayment(payment(amount), 50000), /valid nonnegative/);
  for (const method of ["GCash", "Bank Deposit"]) { assert.match(validateSalePayment(payment(20000, method, "  "), 50000), /Reference Number/); assert.equal(validateSalePayment(payment(20000, method, "REF"), 50000), ""); }
  assert.equal(validateSalePayment({ ...payment(60000), enabled: false }, 50000), "");
});

test("initial payment targets its sale while later payments retain FIFO", () => {
  const oldCharge = { id: "old", ref: "SALE-OLD", customerId: customer.id, date: "2026-09-05", charge: 10000, payment: 0 };
  const initial = saleFinancialEvents(sale, payment(20000), "PAY-INITIAL", uid);
  const ledger = [oldCharge, ...initial.entries];
  assert.equal(customerBalance(ledger, customer.id), 40000);
  assert.equal(salePaymentStatus(ledger, "SALE-OLD"), "Unpaid");
  assert.deepEqual(allocateOldestFirst(ledger, customer.id, 15000, sale.date), [{ invoiceRef: "SALE-OLD", amount: 10000 }, { invoiceRef: sale.ref, amount: 5000 }]);
  const onlyNew = [...initial.entries];
  for (const amount of [15000, 15000]) onlyNew.push({ id: uid("led"), ref: uid("PAY"), customerId: customer.id, date: sale.date, charge: 0, payment: amount, allocations: allocateOldestFirst(onlyNew, customer.id, amount, sale.date) });
  assert.equal(customerBalance(onlyNew, customer.id), 0); assert.equal(salePaymentStatus(onlyNew, sale.ref), "Paid");
});
