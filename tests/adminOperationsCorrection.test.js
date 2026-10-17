import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { applyOperationsCorrection, previewOperationsCorrection } from "../src/services/operationsCorrectionService.js";
import { saveTimeEntry } from "../src/services/dtrService.js";
import { savePayrollEntry } from "../src/services/payrollService.js";
import { recordTruckMaintenance, saveTruck } from "../src/services/truckService.js";

const organizationId = "f7000000-0000-4000-8000-000000000001";
const transactionId = "f7000000-0000-4000-8000-000000000101";

test("Phase 7 previews omit passwords and applies use only the narrow Edge Function", async () => {
  const calls = [];
  const client = { functions: { async invoke(name, { body }) {
    calls.push({ name, body });
    return { data: body.action === "preview" ? { preview: { eligible: true } }
      : { correction: { correctionId: "qa" } }, error: null };
  } } };
  const changes = { workDate: "2026-10-01", timeIn: "09:00", timeOut: "17:00",
    breakMinutes: 60, attendanceStatus: "present", attendanceNotes: "Corrected" };
  await previewOperationsCorrection("dtr", "entry", organizationId, transactionId, changes, client);
  await applyOperationsCorrection("dtr", "entry", organizationId, transactionId, changes,
    "synthetic-password", "Correct QA attendance", "request-1", "version-1", client);
  assert.equal(calls[0].name, "admin-operations-correction");
  assert.equal(calls[0].body.password, undefined);
  assert.deepEqual(calls[1].body, { action: "apply", module: "dtr", kind: "entry",
    organizationId, transactionId, changes, password: "synthetic-password",
    reason: "Correct QA attendance", requestId: "request-1", versionToken: "version-1" });
});

test("Edge authorization is Owner-only, reuses password/rate-limit guard, and has no generic mutation path", async () => {
  const edge = await readFile(new URL("../supabase/functions/admin-operations-correction/index.ts", import.meta.url), "utf8");
  assert.match(edge, /authorizeAdminCorrection\(/);
  assert.match(edge, /preview_\$\{prefix\}_correction/);
  assert.match(edge, /apply_\$\{prefix\}_correction/);
  assert.match(edge, /payroll: \["entry", "period", "adjustment", "approval"\]/);
  assert.doesNotMatch(edge, /console\.(log|error)|localStorage|sessionStorage/);
  assert.doesNotMatch(edge, /password\s*:/);
});

test("migration narrows direct writes and makes payroll adjustments append-only", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261017060229_admin_dtr_payroll_truck_corrections.sql", import.meta.url), "utf8");
  for (const name of ["dtr", "payroll", "truck"]) {
    assert.ok(sql.includes(`create function public.preview_${name}_correction(`));
    assert.ok(sql.includes(`create function public.apply_${name}_correction(`));
  }
  for (const guard of ["private.assert_correction_request", "for update", "transaction_corrections",
    "audit_events", "revoke update, delete", "payroll_adjustment_requests_immutable",
    "payroll_adjustment_approvals_immutable", "requested_by=p_actor_user_id",
    "guard_phase7_attendance_insert", "record_truck_mileage",
    "time_in is not null and time_out is null", "if not found or v_entry.time_in is null"])
    assert.ok(sql.includes(guard), `${guard} is present`);
  const serviceGrant = sql.match(/grant execute on function public\.apply_dtr_correction[^;]+to service_role/i)?.[0] || "";
  for (const name of ["apply_dtr_correction", "apply_payroll_correction", "apply_truck_correction"])
    assert.ok(serviceGrant.includes(name), `${name} is service-only`);
  assert.doesNotMatch(sql, /grant (update|delete) on public\.(payroll_entries|time_entries|trucks)/i);
});

test("hosted actions are Owner-only; dialog requires a preview and preserves local disabled state", async () => {
  const [dtr, payroll, trucks, dialog, app] = await Promise.all([
    readFile(new URL("../src/components/HostedDtr.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/HostedPayroll.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/HostedTrucks.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/OperationsCorrectionDialog.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/SupabaseApp.jsx", import.meta.url), "utf8"),
  ]);
  for (const screen of [dtr, payroll, trucks]) {
    assert.match(screen, /role === "owner_admin"/);
    assert.match(screen, /onHistory/);
  }
  assert.match(dialog, /Secure correction services are unavailable in local demo mode/);
  assert.match(dialog, /reviewRequired=\{dirty \|\| !preview \|\| !baseline \|\| Boolean\(error\)\}/);
  assert.match(dialog, /sm:grid-cols-2/);
  assert.match(app, /onHistory=\{\(id\) => navigate\("transaction-history", id\)\}/);
});

test("legacy services refuse direct historical DTR, Payroll and Truck writes", async () => {
  const client = { from() { throw new Error("Direct update must never be reached"); } };
  await assert.rejects(saveTimeEntry(organizationId, { id: transactionId }, client), /correction authorization/);
  await assert.rejects(savePayrollEntry({ id: transactionId }, [], client), /correction authorization/);
  await assert.rejects(saveTruck(organizationId, { id: transactionId }, client), /correction authorization/);
});

test("new maintenance delegates mileage atomically when Phase 7 is configured", async () => {
  const calls = [];
  const client = { from(table) { return {
    select() { calls.push([table, "select"]); return this; },
    limit() { return Promise.resolve({ data: [], error: null }); },
    insert(payload) { calls.push([table, "insert", payload]); return this; },
    single() { return Promise.resolve({ data: { id: "maintenance-1" }, error: null }); },
  }; } };
  await recordTruckMaintenance(organizationId, transactionId,
    { type: "Oil Change", date: "2026-10-01", mileage: "1200", nextDueDate: "", nextDueMileage: "", notes: "QA" },
    "actor-1", client);
  assert.ok(calls.some(([table, operation]) => table === "truck_maintenance" && operation === "insert"));
  assert.ok(!calls.some(([table]) => table === "trucks"), "new migration handles mileage inside the insert transaction");
});

test("migration-free DEV keeps its existing maintenance mileage flow", async () => {
  const calls = [];
  const client = { from(table) { return {
    select() { calls.push([table, "select"]); return this; },
    limit() { return Promise.resolve({ data: null, error: { code: "42703" } }); },
    insert(payload) { calls.push([table, "insert", payload]); return this; },
    update(payload) { calls.push([table, "update", payload]); return this; },
    eq() { return this; },
    single() { return Promise.resolve({ data: { id: table }, error: null }); },
  }; } };
  await recordTruckMaintenance(organizationId, transactionId,
    { type: "Oil Change", date: "2026-10-01", mileage: "1200", nextDueDate: "", nextDueMileage: "", notes: "QA" },
    "actor-1", client);
  assert.ok(calls.some(([table, operation]) => table === "trucks" && operation === "update"));
});

test("DTR, Payroll and Truck correction dialogs render responsively but cannot save in local mode", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { OperationsCorrectionDialog } = await vite.ssrLoadModule("/src/components/OperationsCorrectionDialog.jsx");
    const fixtures = [
      ["dtr", "entry", { id: transactionId, work_date: "2026-10-01", time_in: "08:00:00",
        time_out: "17:00:00", break_minutes: 60 }],
      ["payroll", "entry", { id: transactionId, hourly_rate: 100, overtime_rate: 125,
        overtime_minutes: 0, allowances: 0, deductions: 0 }],
      ["truck", "maintenance", { id: transactionId, maintenance_type: "Oil Change",
        service_date: "2026-10-01", mileage: 1000, next_due_date: null, next_due_mileage: null }],
    ];
    for (const [module, kind, row] of fixtures) {
      const html = renderToStaticMarkup(createElement(OperationsCorrectionDialog,
        { module, kind, row, organizationId, localMode: true, onClose() {}, onSaved() {} }));
      assert.match(html, /sm:grid-cols-2/);
      assert.match(html, /Current Password/);
      assert.match(html, /Confirm Correction/);
      assert.match(html, /disabled=""/);
      assert.match(html, /Saving is disabled/);
    }
  } finally { await vite.close(); }
});
