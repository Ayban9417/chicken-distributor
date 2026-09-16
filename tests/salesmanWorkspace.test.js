import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { attendanceHistoryStatus } from "../src/utils/hostedDtr.js";

const navigation = readFileSync("src/components/ApplicationNavigation.jsx", "utf8");
const workspace = readFileSync("src/components/SalesmanWorkspace.jsx", "utf8");
const hostedApp = readFileSync("src/SupabaseApp.jsx", "utf8");
const inventory = readFileSync("src/components/InventoryFlow.jsx", "utf8");
const parity = readFileSync("src/components/HostedParityScreens.jsx", "utf8");

test("dedicated Salesman navigation exposes only field workflows", () => {
  const block = navigation.match(/export const salesmanNavigation = \[([\s\S]*?)\];/)?.[1] || "";
  for (const label of ["Dashboard", "My Inventory", "Sales", "Payments", "Collectibles", "Ledger", "Transfers", "Expenses", "My DCR", "My DTR"]) assert.match(block, new RegExp(`label: "${label}"`));
  for (const label of ["Plants", "Warehouse", "Reports", "Administration", "Payroll", "Trucks", "Salesman Inventory"]) assert.doesNotMatch(block, new RegExp(`label: "${label}"`));
});

test("Salesman dashboard contains operational metrics without owner financial metrics", () => {
  for (const label of ["My Sales", "My Collections", "My Expenses", "Cash to Remit", "My Attendance", "My Inventory", "My DCR", "This Week"]) assert.match(workspace, new RegExp(label));
  for (const label of ["Capital (Product Cost)", "Profit Estimate", "Gross Margin", "Inventory Value"]) assert.doesNotMatch(workspace, new RegExp(label));
});

test("hosted Salesman routes use dedicated dashboard, DTR, transfers, and expenses", () => {
  assert.match(hostedApp, /role === "salesman" \? salesmanNavigation/);
  assert.match(hostedApp, /HostedSalesmanDashboard/);
  assert.match(hostedApp, /HostedSalesmanDtr/);
  assert.match(hostedApp, /transfers: <HostedInventoryScreen/);
  assert.match(hostedApp, /expenses: <HostedSalesmanExpenses/);
});

test("My Inventory hides acquisition cost and retains sold-out status", () => {
  assert.match(hostedApp, /showTransferActions=\{false\} showReceipts=\{false\}/);
  assert.match(parity, /showCost=\{role === "owner_admin"\}/);
  assert.match(inventory, /SOLD OUT/);
  assert.match(inventory, /Sold KG/);
});

test("Salesman attendance UI has no employee selector or editable clock fields", () => {
  const dtrBlock = workspace.match(/export function HostedSalesmanDtr([\s\S]*?)export function LocalSalesmanDtr/)?.[1] || "";
  assert.match(dtrBlock, /timeInNow/);
  assert.match(dtrBlock, /timeOutNow/);
  assert.doesNotMatch(dtrBlock, /type="time"|Select Employee|employeeId/);
});

test("DTR history distinguishes today's active entry from an older incomplete entry", () => {
  assert.equal(attendanceHistoryStatus({ date: "2026-09-16", timeOut: "" }, "2026-09-16"), "WORKING");
  assert.equal(attendanceHistoryStatus({ date: "2026-09-15", timeOut: "" }, "2026-09-16"), "INCOMPLETE");
  assert.equal(attendanceHistoryStatus({ date: "2026-09-15", timeOut: "17:00" }, "2026-09-16"), "COMPLETED");
});
