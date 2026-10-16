import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { applyPaymentCorrection, paymentCorrectionChanges, previewPaymentCorrection } from "../src/services/paymentCorrectionService.js";

const organizationId = "f5000000-0000-4000-8000-000000000001";
const paymentId = "f5000000-0000-4000-8000-000000000061";

test("Payment changes retain identity and distinguish FIFO from explicit allocation", () => {
  const draft = { paymentDate: "2026-01-04", customerId: "customer-1", amount: "120.50",
    method: "gcash", referenceNumber: "GC-QA-1", bankName: "", notes: "Corrected",
    allocationMode: "manual", allocations: [{ saleId: "sale-1", amount: "70.25" },
      { saleId: "sale-2", amount: "50.25" }, { saleId: "sale-3", amount: "0" }] };
  assert.deepEqual(paymentCorrectionChanges(draft), {
    paymentDate: "2026-01-04", customerId: "customer-1", amount: 120.5,
    method: "gcash", referenceNumber: "GC-QA-1", bankName: "", notes: "Corrected",
    allocationMode: "manual", allocations: [{ saleId: "sale-1", amount: 70.25 },
      { saleId: "sale-2", amount: 50.25 }],
  });
  assert.deepEqual(paymentCorrectionChanges({ ...draft, allocationMode: "fifo" }).allocations, []);
});

test("preview carries no password and apply uses the dedicated function and version", async () => {
  const calls = [];
  const client = { functions: { async invoke(name, options) {
    calls.push({ name, body: options.body });
    return { data: options.body.action === "preview" ? { preview: { eligible: true } }
      : { correction: { correctionId: "fixture" } }, error: null };
  } } };
  const changes = { paymentDate: "2026-01-04", customerId: "customer-1", amount: 100,
    method: "bank", referenceNumber: "", bankName: "BDO", notes: "", allocationMode: "preserve", allocations: [] };
  await previewPaymentCorrection(organizationId, paymentId, changes, client);
  await applyPaymentCorrection(organizationId, paymentId, changes, "fixture-password", "Correct QA payment",
    "request-id", "version", client);
  assert.deepEqual(calls[0], { name: "admin-payment-correction",
    body: { action: "preview", organizationId, paymentId, changes } });
  assert.deepEqual(calls[1].body, { action: "apply", organizationId, paymentId, changes,
    password: "fixture-password", reason: "Correct QA payment", requestId: "request-id", versionToken: "version" });
});

test("Payment correction migration guards allocations, settlement, DCRs and atomic writes", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261016175246_admin_payment_corrections.sql", import.meta.url), "utf8");
  for (const name of ["private.inspect_payment_correction", "public.preview_payment_correction", "public.apply_payment_correction"])
    assert.ok(sql.includes(`create function ${name}(`));
  for (const guard of ["Finalized or verified Payment", "submitted DCR", "Duplicate Sale allocations",
    "Allocation exceeds the selected Sale open balance", "Payment exceeds eligible Customer open balances",
    "negative Customer balance", "private.assert_correction_request", "for update",
    "transaction_corrections", "audit_events", "private.refresh_sale_status"])
    assert.ok(sql.includes(guard), `${guard} guard is present`);
  assert.match(sql, /grant execute on function public\.apply_payment_correction[^;]+to service_role/i);
  assert.doesNotMatch(sql, /grant execute on function public\.apply_payment_correction[^;]+to authenticated/i);
  assert.doesNotMatch(sql, /grant (update|delete) on (public\.)?(payments|payment_allocations|sales)/i);
});

test("Payment Edge Function reuses password and rate-limit guard without logging credentials", async () => {
  const edge = await readFile(new URL("../supabase/functions/admin-payment-correction/index.ts", import.meta.url), "utf8");
  assert.match(edge, /authorizeAdminCorrection\(/);
  assert.match(edge, /userClient\.rpc\("preview_payment_correction"/);
  assert.match(edge, /adminClient\.rpc\("apply_payment_correction"/);
  assert.doesNotMatch(edge, /console\.(log|error)|localStorage|sessionStorage/);
});

test("Payment edit/history actions are Owner-only and preserve the existing record form", async () => {
  const [hosted, app, dialog] = await Promise.all([
    readFile(new URL("../src/components/HostedParityScreens.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/PaymentCorrectionDialog.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(hosted, /onEditPayment=\{role === "owner_admin" \? setEditPayment : undefined\}/);
  assert.match(hosted, /onViewPaymentHistory=\{role === "owner_admin"/);
  assert.match(app, /onEditPayment && <section className="report-section mt-5"/);
  assert.match(dialog, /reviewRequired=\{dirty \|\| !preview \|\| !baselineVersion\}/);
  assert.match(dialog, /allocationMode: "preserve"/);
});
