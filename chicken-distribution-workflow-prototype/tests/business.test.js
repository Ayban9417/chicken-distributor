import test from "node:test";
import assert from "node:assert/strict";
import * as demo from "./fixtures/historicalDemo.js";
import { getInventoryRows, getAcquisitionCost, getAvailableQty, periodOutFinancials, allocateOldestFirst, customerBalance, tripAcquisitionCost, buildDcr, money } from "../src/utils/business.js";
import { validateStock, validateSale, validatePayment, salePaymentStatus, collectibleRows, periodSummary, businessWeek, previousPeriod, attendanceHours, payrollTotals, truckAlerts } from "../src/utils/operations.js";

const state = { trips: demo.initialTrips, outs: demo.initialOuts, movements: demo.initialMovements, collections: demo.initialCollections, expenses: demo.initialExpenses, ledgerEntries: demo.initialLedgerEntries };
const range = businessWeek(demo.demoToday);
test("demo sales, inventory movements and ledger charges reconcile exactly", () => {
  for (const out of state.outs) {
    assert.equal(money(out.groups.flatMap((group) => group.lines).reduce((total, line) => total + money(line.qty * line.price), 0)), out.total);
    assert.equal(state.ledgerEntries.find((entry) => entry.outId === out.id).charge, out.total);
    for (const group of out.groups) for (const line of group.lines) {
      assert.equal(state.movements.filter((item) => item.outId === out.id && item.tripId === group.tripId && item.product === line.product && item.sizeCode === line.sizeCode).reduce((total, item) => total - item.qty, 0), line.qty);
    }
  }
  for (const payment of state.collections) {
    assert.equal(money(payment.allocations.reduce((total, item) => total + item.amount, 0)), payment.amount);
    assert.equal(state.ledgerEntries.find((entry) => entry.ref === payment.ref).payment, payment.amount);
  }
});
test("all trip products have acquisition metadata and fictional costs", () => {
  for (const trip of state.trips) for (const item of trip.products) {
    assert.ok(typeof item.sizeCode === "string");
    assert.ok(["Purchased", "Free from Plant"].includes(item.acquisitionType));
    assert.ok(item.acquisitionType === "Free from Plant" ? item.costPerKg === 0 : item.costPerKg > 0);
  }
  assert.equal(tripAcquisitionCost(state.trips.find((trip) => trip.id === "trip-bty-0831")), 232424);
  assert.equal(tripAcquisitionCost(state.trips.find((trip) => trip.id === "trip-mag-0902")), 273911);
});
test("size code costs and balances never fall back to another code", () => {
  assert.equal(getAcquisitionCost(state.trips, "trip-bty-0831", "Whole Dressed Chicken", "P1"), 142);
  assert.equal(getAcquisitionCost(state.trips, "trip-bty-0831", "Whole Dressed Chicken", "P2"), 146);
  assert.equal(getAvailableQty(state.trips, state.movements, "trip-bty-0831", "Whole Dressed Chicken", "P1"), 0);
  assert.equal(getAvailableQty(state.trips, state.movements, "trip-bty-0831", "Whole Dressed Chicken", "P2"), 440);
});
test("sold-out lines remain and free stock has zero inventory cost", () => {
  const rows = getInventoryRows(state.trips, state.movements);
  assert.equal(rows.length, state.trips.reduce((total, trip) => total + trip.products.length, 0));
  const sold = rows.find((row) => row.tripId === "trip-bty-0831" && row.sizeCode === "P1");
  assert.equal(sold.remainingQty, 0); assert.equal(sold.totalOut, 600);
  assert.ok(rows.every((row) => row.remainingQty >= 0));
  assert.ok(rows.filter((row) => row.acquisitionType === "Free from Plant").every((row) => row.costPerKg === 0 && row.inventoryCostValue === 0));
});
test("period finances derive only from transactions, including free products", () => {
  const summary = periodSummary(state, range);
  assert.equal(summary.grossSales, 228135); assert.equal(summary.cogs, 172850);
  assert.equal(summary.expenseTotal, 3900); assert.equal(summary.profitEstimate, 51385);
  assert.equal(summary.paymentTotal, 203625);
  assert.equal(money(summary.opening + summary.newCreditSales - summary.paymentsApplied), summary.closing);
  assert.equal(summary.closing, 114496);
  const free = summary.lines.filter((line) => line.acquisitionType === "Free from Plant");
  assert.ok(free.length > 0 && free.every((line) => line.cogs === 0 && line.grossProfit === line.revenue));
});
test("custom date ranges and equal prior periods change every period metric", () => {
  assert.deepEqual(range, { start: "2026-08-31", end: "2026-09-06" });
  assert.deepEqual(previousPeriod({ start: "2026-09-02", end: "2026-09-03" }), { start: "2026-08-31", end: "2026-09-01" });
  const oneDay = periodSummary(state, { start: demo.demoToday, end: demo.demoToday });
  assert.equal(oneDay.grossSales, 32520); assert.equal(oneDay.paymentTotal, 60000);
  assert.equal(oneDay.trips.length, 1); assert.equal(oneDay.wholeKg, 160); assert.equal(oneDay.expenseTotal, 3550);
  const empty = periodSummary(state, { start: "2027-01-01", end: "2027-01-02" });
  for (const key of ["grossSales", "cogs", "expenseTotal", "profitEstimate", "paymentTotal", "wholeKg", "byproductKg"]) assert.equal(empty[key], 0);
  assert.equal(empty.lines.length, 0); assert.equal(empty.trips.length, 0);
});
test("new stock updates trip count, bags, plant breakdown and stock costs without altering COGS", () => {
  const trip = { id: "test-trip", plant: "Magnolia", date: demo.demoToday, products: [{ name: "Whole Dressed Chicken", sizeCode: "P1", bags: 3, originalQty: 75, costPerKg: 149, acquisitionType: "Purchased" }, { name: "Feet", sizeCode: "", bags: 1, originalQty: 12, costPerKg: 0, acquisitionType: "Free from Plant" }] };
  const summary = periodSummary({ ...state, trips: [...state.trips, trip] }, range);
  assert.equal(summary.trips.length, 4); assert.equal(summary.trips.filter((item) => item.plant === "Magnolia").length, 2);
  assert.equal(tripAcquisitionCost(trip), 11175); assert.equal(summary.cogs, 172850);
  assert.equal(getInventoryRows([trip], []).reduce((total, item) => total + item.remainingQty, 0), 87);
});
test("single, multiple and third origins validate; duplicate source requests are combined", () => {
  const line = { product: "Whole Dressed Chicken", sizeCode: "P1", qty: 100, price: 184 };
  const first = { tripId: "trip-bty-0906", lines: [line] };
  assert.equal(validateSale([first], state.trips, state.movements, demo.demoToday), "");
  const second = { tripId: "trip-mag-0902", lines: [{ ...line, qty: 50 }] };
  const third = { tripId: "trip-bty-0831", lines: [{ ...line, sizeCode: "G", qty: 20 }] };
  assert.equal(validateSale([first, second, third], state.trips, state.movements, demo.demoToday), "");
  assert.match(validateSale([first, first, first], state.trips, state.movements, demo.demoToday), /Insufficient/);
  assert.match(validateSale([{ ...first, lines: [{ ...line, sizeCode: "Missing" }] }], state.trips, state.movements, demo.demoToday), /exact/);
  assert.match(validateSale([first], state.trips, state.movements, "2026-09-01"), /Trip date/);
  const movements = [...state.movements, { tripId: first.tripId, product: line.product, sizeCode: line.sizeCode, qty: -100, type: "OUT" }];
  assert.equal(getAvailableQty(state.trips, movements, first.tripId, line.product, "P1"), 100);
  assert.equal(getAvailableQty(state.trips, movements, first.tripId, line.product, "P2"), 280);
});
test("stock validation requires unique codes, independent bags/KG and acquisition cost", () => {
  const item = { name: "Whole Dressed Chicken", sizeCode: "P1", bags: 2, qty: 65, costPerKg: 142, acquisitionType: "Purchased" };
  const form = { plant: "Bounty", date: demo.demoToday, products: [item, { ...item, sizeCode: "P2", costPerKg: 146 }] };
  assert.equal(validateStock(form), "");
  assert.match(validateStock({ ...form, products: [item, { ...item, sizeCode: "p1" }] }), /unique/);
  assert.match(validateStock({ ...form, products: [{ ...item, costPerKg: "" }] }), /cost/);
  assert.equal(validateStock({ ...form, products: [{ ...item, acquisitionType: "Free from Plant", costPerKg: 0 }] }), "");
});
test("partial payments use FIFO, become Paid, and never create revenue", () => {
  let ledger = [{ customerId: "test", date: "2026-09-01", ref: "A", charge: 50000, payment: 0 }, { customerId: "test", date: "2026-09-02", ref: "B", charge: 10000, payment: 0 }];
  for (const [index, amount] of [20000, 15000, 15000].entries()) {
    const allocations = allocateOldestFirst(ledger, "test", amount, demo.demoToday);
    assert.equal(allocations[0].invoiceRef, "A");
    ledger.push({ customerId: "test", date: demo.demoToday, ref: "P" + index, charge: 0, payment: amount, allocations });
    assert.equal(salePaymentStatus(ledger, "A"), index < 2 ? "Partially Paid" : "Paid");
  }
  assert.equal(customerBalance(ledger, "test"), 10000);
  assert.equal(allocateOldestFirst(ledger, "test", 10000)[0].invoiceRef, "B");
  assert.equal(ledger.reduce((total, item) => total + item.charge, 0), 60000);
  assert.equal(allocateOldestFirst(ledger, "test", 100, "2026-08-31").length, 0);
});
test("payment validation rejects missing references, overpayments and invoice over-allocation", () => {
  const p = { customerId: "cust-abc", amount: 1000, date: demo.demoToday, method: "Cash", reference: "", bank: "BDO" };
  const allocations = allocateOldestFirst(state.ledgerEntries, p.customerId, p.amount, p.date);
  assert.equal(validatePayment(p, state.ledgerEntries, allocations), "");
  for (const method of ["GCash", "Bank Deposit"]) {
    assert.match(validatePayment({ ...p, method }, state.ledgerEntries, allocations), /Reference/);
    assert.equal(validatePayment({ ...p, method, reference: "REF-123" }, state.ledgerEntries, allocations), "");
  }
  assert.match(validatePayment({ ...p, amount: 999999 }, state.ledgerEntries, allocations), /full payment/);
  assert.match(validatePayment(p, state.ledgerEntries, [{ invoiceRef: "SALE-1048", amount: 1000 }]), /balance/);
});
test("collectibles exclude paid customers and prioritize the oldest unpaid sale", () => {
  const rows = collectibleRows(demo.initialCustomers, state.ledgerEntries, state.collections);
  assert.deepEqual(rows.map((row) => row.id), ["cust-rkm", "cust-abc", "cust-jj"]);
  assert.ok(rows.every((row) => row.balance > 0));
});
test("DCR excludes electronic payments and unapproved/personal expenses from physical cash", () => {
  const result = buildDcr({ ...state, customers: demo.initialCustomers, agentId: "agent-pedro", date: demo.demoToday });
  assert.equal(result.totals.Cash, 20000); assert.equal(result.totals.GCash, 15000);
  assert.equal(result.expectedCashRemittance, 17500);
  const extra = buildDcr({ ...state, expenses: [...state.expenses, { date: demo.demoToday, agentId: "agent-pedro", amount: 900, source: "Personal Cash", status: "Approved", category: "Fuel" }, { date: demo.demoToday, agentId: "agent-pedro", amount: 900, source: "Cash Collection", status: "Pending", category: "Fuel" }], customers: demo.initialCustomers, agentId: "agent-pedro", date: demo.demoToday });
  assert.equal(extra.expectedCashRemittance, 17500);
  assert.equal(demo.initialDcrs[0].diff, -1000);
  assert.equal(demo.initialDcrs[0].actual, 16500);
});
test("DTR hours feed payroll and reviewed totals can be held as a snapshot", () => {
  assert.equal(attendanceHours({ timeIn: "08:03", timeOut: "17:12", breakMinutes: 60 }), 8.15);
  const draft = demo.initialPayroll[0];
  const totals = payrollTotals(draft, demo.initialAttendance);
  assert.equal(totals.days, 3); assert.equal(totals.gross, 2578.25); assert.equal(totals.net, 2478.25);
  const updated = payrollTotals(draft, [...demo.initialAttendance, { employeeId: draft.employeeId, date: "2026-09-04", timeIn: "08:00", timeOut: "17:00", breakMinutes: 60 }]);
  assert.equal(money(updated.gross - totals.gross), 680);
});
test("truck reminders cover date and mileage thresholds", () => {
  assert.deepEqual(truckAlerts(demo.initialTrucks[0], demo.demoToday, demo.truckRules), ["LTO Renewal Due Soon", "Oil Change Due Soon"]);
  assert.deepEqual(truckAlerts(demo.initialTrucks[1], demo.demoToday, demo.truckRules), ["LTO Expired", "Oil Change Overdue"]);
});
