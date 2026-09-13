import { money, stockKey, getTripProduct, getAvailableQty, invoiceBalances, customerBalance, periodOutFinancials, buildDcr, isWholeChicken } from "./business.js";
import { getSalesmanAvailableQty } from "./inventoryFlow.js";

export const inRange = (date, range) => Boolean(date && range.start && range.end && date >= range.start && date <= range.end);
export const sum = (items, key) => money(items.reduce((total, item) => total + Number(typeof key === "function" ? key(item) : item[key] || 0), 0));
export function addDays(date, days) {
  const value = new Date(date + "T00:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function addMonths(date, months) {
  if (!date) return "";
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, lastDay))).toISOString().slice(0, 10);
}
export function businessWeek(date) {
  const day = new Date(date + "T00:00:00Z").getUTCDay();
  const start = addDays(date, -(day === 0 ? 6 : day - 1));
  return { start, end: addDays(start, 6) };
}
export function previousPeriod(range) {
  const days = Math.round((new Date(range.end) - new Date(range.start)) / 86400000) + 1;
  return { start: addDays(range.start, -days), end: addDays(range.start, -1) };
}
export function validateSale(groups, trips, movements, date, salesmanId = "", receivingTransfers = [], salesmanTransfers = []) {
  const requested = new Map();
  if (!date || !groups.length) return "Select a sale date and inventory source.";
  for (const group of groups) {
    const trip = trips.find((item) => item.id === group.tripId);
    if (!trip || trip.date > date) return "Trip date must be on or before the sale date.";
    if (!group.lines.some((line) => Number(line.qty) > 0)) return "Add products to each origin or remove the empty optional group.";
    for (const line of group.lines) {
      if (!Number.isFinite(Number(line.qty)) || Number(line.qty) < 0 || !Number.isFinite(Number(line.price)) || Number(line.price) < 0) return "KG and selling price must be valid nonnegative numbers.";
      if (Number(line.qty) === 0) continue;
      if (!getTripProduct(trips, group.tripId, line.product, line.sizeCode, line.classType)) return "Select an exact product, size/code and class type.";
      const key = stockKey(group.tripId, line.product, line.sizeCode, line.classType);
      const quantity = money((requested.get(key) || 0) + Number(line.qty));
      const available = salesmanId ? getSalesmanAvailableQty(receivingTransfers, salesmanTransfers, movements, salesmanId, group.tripId, line.product, line.sizeCode, line.classType) : getAvailableQty(trips, movements, group.tripId, line.product, line.sizeCode, line.classType);
      if (quantity > available) return salesmanId ? "Insufficient Salesman Inventory" : "Insufficient stock across the selected lines. Check Plant, Trip, Size/Code and Class Type.";
      requested.set(key, quantity);
    }
  }
  return "";
}
export function duplicateTrustReceipt(outs, trustReceipt, editingId = "") {
  const normalized = String(trustReceipt || "").trim().toLowerCase();
  return normalized ? outs.find((out) => out.id !== editingId && String(out.trustReceipt || "").trim().toLowerCase() === normalized) || null : null;
}
export function validateStock(form) {
  if (!form.date || !form.plant || !form.products.length) return "Select a plant, date and at least one stock line.";
  const seen = new Set();
  for (const line of form.products) {
    const key = stockKey("", line.name, (line.sizeCode || "").trim().toUpperCase(), (line.classType || "").trim().toUpperCase());
    if (seen.has(key)) return "Each Product + Size/Code + Class Type must be unique within a Trip.";
    seen.add(key);
    if (!line.name || !Number.isFinite(Number(line.qty)) || Number(line.qty) <= 0) return "Enter positive KG for every stock line.";
    if (line.bags != null && line.bags !== "" && (!Number.isInteger(Number(line.bags)) || Number(line.bags) < 0)) return "Enter a whole, nonnegative bag count.";
    if (line.headCount != null && line.headCount !== "" && (!Number.isInteger(Number(line.headCount)) || Number(line.headCount) < 0)) return "Enter a whole, nonnegative head count.";
    if (line.acquisitionType !== "Free from Plant" && (line.costPerKg === "" || !Number.isFinite(Number(line.costPerKg)) || Number(line.costPerKg) <= 0)) return "Purchased stock requires a positive acquisition cost.";
  }
  return "";
}
export function validatePayment(payment, ledger, allocations) {
  const amount = Number(payment.amount);
  if (!payment.date || !Number.isFinite(amount) || amount <= 0) return "Enter a date and positive payment amount.";
  if (payment.method !== "Cash" && !payment.reference.trim()) return "Reference Number is required for electronic payments.";
  if (payment.method === "Bank Deposit" && !payment.bank.trim()) return "Enter the bank name.";
  const invoices = invoiceBalances(ledger, payment.customerId);
  const seen = new Set();
  for (const allocation of allocations) {
    const invoice = invoices.find((item) => item.ref === allocation.invoiceRef);
    if (!invoice || invoice.date > payment.date || allocation.amount <= 0 || allocation.amount > invoice.balance || seen.has(allocation.invoiceRef)) return "Allocation exceeds an eligible invoice balance.";
    seen.add(allocation.invoiceRef);
  }
  if (money(sum(allocations, "amount")) !== money(amount)) return "Allocate the full payment to outstanding sales. Customer advances are not enabled.";
  return "";
}
export function salePaymentStatus(ledger, ref) {
  const charge = ledger.find((entry) => entry.ref === ref && entry.charge > 0)?.charge || 0;
  const paid = sum(ledger, (entry) => sum((entry.allocations || []).filter((item) => item.invoiceRef === ref), "amount"));
  return paid >= charge ? "Paid" : paid > 0 ? "Partially Paid" : "Unpaid";
}
export function collectibleRows(customers, ledger, collections) {
  return customers.map((customer) => {
    const invoices = invoiceBalances(ledger, customer.id);
    const payments = collections.filter((item) => item.customerId === customer.id).sort((a, b) => b.date.localeCompare(a.date));
    return { ...customer, balance: money(customerBalance(ledger, customer.id)), oldest: invoices[0]?.date, openSales: invoices.length, lastPayment: payments[0]?.date };
  }).filter((item) => item.balance > 0).sort((a, b) => (a.oldest || "").localeCompare(b.oldest || "") || a.name.localeCompare(b.name));
}
export function periodSummary({ outs, trips, expenses, collections, ledgerEntries }, range) {
  const financial = periodOutFinancials(outs, trips, range);
  const payments = collections.filter((item) => inRange(item.date, range));
  const recordedExpenses = expenses.filter((item) => inRange(item.date, range));
  const entries = ledgerEntries.filter((item) => inRange(item.date, range));
  const opening = sum(ledgerEntries.filter((item) => item.date < range.start), (item) => Number(item.charge || 0) - Number(item.payment || 0));
  const newCreditSales = sum(entries, "charge");
  const paymentsApplied = sum(entries, "payment");
  const newReceivables = sum(entries.filter((entry) => entry.charge > 0), (entry) => Math.max(0, entry.charge - sum(entries, (payment) => sum((payment.allocations || []).filter((allocation) => allocation.invoiceRef === entry.ref), "amount"))));
  const expenseTotal = sum(recordedExpenses, "amount");
  const days = [];
  if (range.start && range.end && range.start <= range.end) {
    // Group by month for long ranges to keep the working chart usable.
    const monthly = (new Date(range.end) - new Date(range.start)) / 86400000 > 62;
    const map = new Map();
    for (let date = range.start; date <= range.end; date = addDays(date, 1)) {
      const key = monthly ? date.slice(0, 7) : date;
      if (!map.has(key)) map.set(key, { date: key, sales: 0, payments: 0 });
    }
    outs.filter((out) => inRange(out.date, range)).forEach((out) => { map.get(monthly ? out.date.slice(0, 7) : out.date).sales += out.total; });
    payments.forEach((payment) => { map.get(monthly ? payment.date.slice(0, 7) : payment.date).payments += payment.amount; });
    days.push(...map.values());
  }
  return { ...financial, expenseTotal, profitEstimate: money(financial.netSales - financial.cogs - expenseTotal),
    payments, recordedExpenses, paymentTotal: sum(payments, "amount"),
    methods: Object.fromEntries(["Cash", "GCash", "Bank Deposit"].map((method) => [method, sum(payments.filter((item) => item.method === method), "amount")])),
    opening, newCreditSales, newReceivables, paymentsApplied, closing: money(opening + newCreditSales - paymentsApplied),
    trips: trips.filter((trip) => inRange(trip.date, range)), days,
    wholeKg: sum(financial.lines.filter(isWholeChicken), "qty"),
    byproductKg: sum(financial.lines.filter((line) => !isWholeChicken(line)), "qty"),
  };
}
export function attendanceHours(record) {
  if (!record.timeIn || !record.timeOut) return 0;
  const minutes = (time) => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };
  return Math.max(0, (minutes(record.timeOut) - minutes(record.timeIn) - Number(record.breakMinutes || 0)) / 60);
}
export function payrollTotals(payroll, attendance) {
  const records = attendance.filter((item) => item.employeeId === payroll.employeeId && inRange(item.date, payroll) && item.timeOut);
  const hours = records.reduce((total, item) => total + attendanceHours(item), 0);
  const gross = money(hours * Number(payroll.rate) + Number(payroll.overtimeHours) * Number(payroll.overtimeRate) + Number(payroll.allowances));
  return { hours, days: records.length, gross, net: money(gross - Number(payroll.deductions)) };
}
export function truckAlerts(truck, date, rules) {
  const alerts = [];
  const days = (due) => Math.ceil((new Date(due) - new Date(date)) / 86400000);
  if (truck.ltoExpiry && days(truck.ltoExpiry) < 0) alerts.push("LTO Expired");
  else if (truck.ltoExpiry && days(truck.ltoExpiry) <= rules.ltoDays) alerts.push("LTO Renewal Due Soon");
  const renewalDue = truck.nextRenewalDate || addMonths(truck.lastRenewalDate, rules.renewalMonths || 3);
  if (renewalDue && days(renewalDue) < 0) alerts.push("Truck Renewal Overdue");
  else if (renewalDue && days(renewalDue) === 0) alerts.push("Truck Renewal Due");
  else if (renewalDue && days(renewalDue) <= (rules.renewalSoonDays || 30)) alerts.push("Truck Renewal Due Soon");
  const kmLeft = truck.nextOilMileage === "" ? Infinity : Number(truck.nextOilMileage) - Number(truck.mileage);
  const daysLeft = truck.nextOilDate ? days(truck.nextOilDate) : Infinity;
  if (kmLeft <= 0 || daysLeft < 0) alerts.push("Oil Change Overdue");
  else if (kmLeft <= rules.oilSoonKm || daysLeft <= rules.oilSoonDays) alerts.push("Oil Change Due Soon");
  return alerts;
}
export function agentPeriodRows(users, state, range) {
  return users.filter((user) => user.role === "Agent" || [state.outs, state.collections, state.expenses, state.dcrs].some((rows) => rows.some((row) => row.agentId === user.id && inRange(row.date, range)))).map((user) => {
    const dates = [...new Set([...state.collections, ...state.expenses, ...state.outs, ...state.dcrs].filter((item) => item.agentId === user.id && inRange(item.date, range)).map((item) => item.date))];
    const reports = dates.map((date) => buildDcr({ ...state, agentId: user.id, date }));
    const locked = state.dcrs.filter((item) => item.agentId === user.id && inRange(item.date, range));
    return { ...user, sales: sum(state.outs.filter((out) => out.agentId === user.id && inRange(out.date, range)), "total"),
      payments: sum(reports, (item) => item.totals.total), cash: sum(reports, (item) => item.totals.Cash),
      gcash: sum(reports, (item) => item.totals.GCash), bank: sum(reports, (item) => item.totals["Bank Deposit"]),
      expenses: sum(reports, (item) => item.expenseTotals.total), expected: sum(reports, "expectedCashRemittance"),
      actual: locked.length ? sum(locked, "actual") : null,
      discrepancies: state.discrepancies.filter((item) => item.agentId === user.id && inRange(item.date, range) && item.status !== "Resolved").length };
  });
}
