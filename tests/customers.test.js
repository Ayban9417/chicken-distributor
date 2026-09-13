import test from "node:test";
import assert from "node:assert/strict";
import { initialCustomers, initialOuts, initialCollections, initialLedgerEntries, initialTrips } from "./fixtures/historicalDemo.js";
import { emptyCustomer, normalizeCustomer, customerRecord, validateCustomer, duplicateCustomers, matchesCustomer, hasCustomerHistory, availableCredit, exceedsCredit, customerPermissions } from "../src/utils/customers.js";
import { customerBalance, customerPrice, allocateOldestFirst, getAcquisitionCost } from "../src/utils/business.js";
import { collectibleRows } from "../src/utils/operations.js";

test("existing customer identities, pricing and balances survive normalization", () => {
  for (const old of initialCustomers) {
    const next = normalizeCustomer(old);
    assert.equal(next.id, old.id); assert.deepEqual(next.pricing, old.pricing);
    assert.equal(next.active, true); assert.equal(customerBalance(initialLedgerEntries, next.id), customerBalance(initialLedgerEntries, old.id));
    assert.equal(customerPrice(next, "Whole Dressed Chicken"), customerPrice(old, "Whole Dressed Chicken"));
  }
});
test("full and quick creation share numeric money normalization and validation", () => {
  const draft = { ...emptyCustomer(), name: " Golden Chicken House ", paymentType: "Cash / Credit", creditLimit: "100000", pricing: { Liver: "123.5", Feet: "", Head: "0" }, paymentDays: "7" };
  assert.equal(validateCustomer(draft), "");
  const record = customerRecord(draft);
  assert.equal(record.name, "Golden Chicken House"); assert.equal(record.creditLimit, 100000); assert.equal(record.paymentDays, 7);
  assert.deepEqual(record.pricing, { Liver: 123.5, Head: 0 });
  assert.equal(customerPrice(record, "Head"), 0); assert.equal(customerPrice(record, "Feet"), 98);
  assert.equal(customerRecord({ ...emptyCustomer(), name: "Cash customer" }).creditLimit, null);
  for (const patch of [{ name: " " }, { creditLimit: -1 }, { creditLimit: "NaN" }, { paymentDays: 1.5 }, { pricing: { Liver: -1 } }]) assert.ok(validateCustomer({ ...draft, ...patch }));
});
test("duplicate detection includes inactive customers, normalized names and Philippine mobile formats", () => {
  const existing = { ...emptyCustomer(), id: "gold", name: "Golden Chicken House", mobile: "0917 123 4567", active: false };
  assert.equal(duplicateCustomers([existing], { ...emptyCustomer(), name: " GOLDEN  chicken-house " }).length, 1);
  assert.equal(duplicateCustomers([existing], { ...emptyCustomer(), name: "Another Name", mobile: "+63 9171234567" }).length, 1);
  assert.equal(duplicateCustomers([existing], { ...existing }).length, 0);
  assert.equal(duplicateCustomers([existing], { ...emptyCustomer(), name: "Different" }).length, 0);
});
test("consistent case-insensitive customer search covers names, contacts and mobiles", () => {
  const c = { name: "Golden Chicken House", contactPerson: "Juan Dela Cruz", mobile: "0917 123 4567" };
  for (const query of ["golden", "CHICKEN", "dela CRUZ", "0917123", "+63 917 123 4567", ""]) assert.equal(matchesCustomer(c, query), true);
  assert.equal(matchesCustomer(c, "Missing"), false);
});
test("new customer sale, partial FIFO payments, credit and collectibles derive from one ledger", () => {
  const c = { ...customerRecord({ ...emptyCustomer(), name: "Golden Chicken House", paymentType: "Cash / Credit", creditLimit: 100000 }), id: "gold" };
  const ledger = []; const collections = [];
  assert.equal(customerBalance(ledger, c.id), 0); assert.equal(collectibleRows([c], ledger, collections).length, 0);
  ledger.push({ id: "charge", customerId: c.id, ref: "SALE-TEST", date: "2026-09-06", charge: 50000, payment: 0, trustReceipt: "TR-GOLDEN" });
  assert.equal(collectibleRows([c], ledger, collections)[0].balance, 50000);
  assert.equal(availableCredit(c, ledger), 50000); assert.equal(exceedsCredit(c, ledger, 50001), true);
  for (const amount of [20000, 30000]) {
    const allocations = allocateOldestFirst(ledger, c.id, amount, "2026-09-06");
    ledger.push({ customerId: c.id, ref: "PAY-" + amount, date: "2026-09-06", charge: 0, payment: amount, allocations });
    collections.push({ customerId: c.id, date: "2026-09-06", amount });
    if (amount === 20000) { assert.equal(customerBalance(ledger, c.id), 30000); assert.equal(availableCredit(c, ledger), 70000); assert.equal(collectibleRows([c], ledger, collections)[0].balance, 30000); }
  }
  assert.equal(customerBalance(ledger, c.id), 0); assert.equal(availableCredit(c, ledger), 100000); assert.equal(collectibleRows([c], ledger, collections).length, 0); assert.equal(ledger.length, 3);
  assert.equal(hasCustomerHistory(c.id, { ledgerEntries: ledger }), true);
});
test("historical customers cannot be deleted; editing selling prices never changes acquisition costs", () => {
  const state = { outs: initialOuts, collections: initialCollections, ledgerEntries: initialLedgerEntries };
  for (const c of initialCustomers) assert.equal(hasCustomerHistory(c.id, state), true);
  assert.equal(hasCustomerHistory("unused", state), false);
  const cost = getAcquisitionCost(initialTrips, "trip-bty-0906", "Whole Dressed Chicken", "P1");
  const edited = { ...normalizeCustomer(initialCustomers[0]), active: false, pricing: { "Whole Dressed Chicken": 200 } };
  assert.equal(customerPrice(edited, "Whole Dressed Chicken"), 200); assert.equal(getAcquisitionCost(initialTrips, "trip-bty-0906", "Whole Dressed Chicken", "P1"), cost);
  assert.equal(customerPermissions.Agent.manage, false); assert.equal(customerPermissions.Agent.quickAdd, true); assert.equal(customerPermissions.Cashier.quickAdd, false);
});
