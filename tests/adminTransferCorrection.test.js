import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { applyTransferCorrection, previewTransferCorrection, transferCorrectionChanges } from "../src/services/transferCorrectionService.js";

const org = "f3000000-0000-4000-8000-000000000001";
const receipt = {
  id: "f3000000-0000-4000-8000-000000000061", receipt: "RR-QA-1", date: "2026-01-02",
  fromSalesmanId: "f3000000-0000-4000-8000-000000000103",
  toSalesmanId: "f3000000-0000-4000-8000-000000000102",
  lotId: "f3000000-0000-4000-8000-000000000041", qty: 20, notes: "Original",
  tripId: "trip-1", tripReference: "QA-TRIP", plant: "QA Plant", product: "Whole Dressed Chicken",
};
const users = [
  { id: receipt.fromSalesmanId, name: "Sender", role: "Agent", active: true },
  { id: receipt.toSalesmanId, name: "Receiver", role: "Agent", active: true },
];
const lots = [{ id: receipt.lotId, lotId: receipt.lotId, tripId: receipt.tripId,
  plant: receipt.plant, tripReference: receipt.tripReference, product: receipt.product, warehouseAvailable: 80, remainingQty: 20, salesmanId: receipt.fromSalesmanId }];

test("RR and TF changes retain exact custody IDs, source lot, and quantity", () => {
  const draft = { date: "2026-01-03", fromSalesmanId: receipt.fromSalesmanId,
    toSalesmanId: receipt.toSalesmanId, lotId: receipt.lotId, qty: "25.125", notes: "Corrected" };
  assert.deepEqual(transferCorrectionChanges(draft, "warehouse_transfer"), {
    effectiveDate: draft.date, toSalesmanId: draft.toSalesmanId, lotId: draft.lotId,
    quantityKg: 25.125, notes: "Corrected",
  });
  assert.equal(transferCorrectionChanges(draft, "salesman_transfer").fromSalesmanId, draft.fromSalesmanId);
});

test("preview is read-only; apply sends password, reason, request ID and version to the narrow Edge Function", async () => {
  const calls = [];
  const client = { functions: { async invoke(name, options) {
    calls.push({ name, body: options.body });
    return { data: options.body.action === "preview" ? { preview: { eligible: false } } : { correction: { correctionId: "qa" } }, error: null };
  } } };
  const changes = transferCorrectionChanges({ date: receipt.date, fromSalesmanId: receipt.fromSalesmanId,
    toSalesmanId: receipt.toSalesmanId, lotId: receipt.lotId, qty: "20", notes: "Changed" }, "salesman_transfer");
  await previewTransferCorrection(org, receipt.id, "salesman_transfer", changes, client);
  await applyTransferCorrection(org, receipt.id, "salesman_transfer", changes, "fixture-only-password", "Correct test receipt", "qa-request", "version", client);
  assert.equal(calls[0].name, "admin-transfer-correction");
  assert.equal(calls[0].body.action, "preview");
  assert.equal(calls[0].body.password, undefined);
  assert.deepEqual(calls[1].body, { action: "apply", module: "salesman_transfer", organizationId: org,
    receiptId: receipt.id, changes, password: "fixture-only-password", reason: "Correct test receipt",
    requestId: "qa-request", versionToken: "version" });
});

test("migration narrows writes to service-only RPCs and rechecks locked custody", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261016093815_admin_transfer_corrections.sql", import.meta.url), "utf8");
  for (const name of ["preview_receiving_receipt_correction", "preview_transfer_receipt_correction",
    "apply_receiving_receipt_correction", "apply_transfer_receipt_correction"]) assert.match(sql, new RegExp(`create function public\\.${name}\\(`));
  assert.match(sql, /perform private\.assert_correction_request\(/);
  assert.match(sql, /for share of p, m/);
  assert.match(sql, /order by id for update/);
  assert.match(sql, /private\.custody_balance/);
  assert.match(sql, /later movements or Sales/);
  assert.match(sql, /Insufficient stock in the proposed source custody/);
  assert.match(sql, /insert into public\.transaction_corrections/);
  assert.match(sql, /insert into public\.audit_events/);
  assert.match(sql, /'adjustment_in'/);
  assert.match(sql, /'adjustment_out'/);
  assert.match(sql, /grant execute on function public\.apply_receiving_receipt_correction[^;]+to service_role/i);
  assert.match(sql, /grant execute on function public\.apply_transfer_receipt_correction[^;]+to service_role/i);
  assert.doesNotMatch(sql, /grant execute on function public\.apply_(receiving|transfer)_receipt_correction[^;]+to authenticated/i);
});

test("Edge Function reuses password verification and permits only the two receipt modules", async () => {
  const edge = await readFile(new URL("../supabase/functions/admin-transfer-correction/index.ts", import.meta.url), "utf8");
  assert.match(edge, /authorizeAdminCorrection\(/);
  assert.match(edge, /Object\.hasOwn\(rpc, module\)/);
  assert.match(edge, /adminClient\.rpc\(rpc\[module\]\.apply/);
  assert.match(edge, /userClient\.rpc\(rpc\[module\]\.preview/);
  assert.doesNotMatch(edge, /console\.(log|error)|localStorage|sessionStorage/);
});

test("existing receipt actions are opt-in and local correction dialogs cannot submit", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { Warehouse, SalesmanInventory } = await vite.ssrLoadModule("/src/components/InventoryFlow.jsx");
    const { TransferCorrectionDialog } = await vite.ssrLoadModule("/src/components/TransferCorrectionDialog.jsx");
    const warehouseProps = { inventoryRows: [], receivingTransfers: [receipt], users, currentDate: "2026-01-03" };
    assert.doesNotMatch(renderToStaticMarkup(createElement(Warehouse, warehouseProps)), />Edit</);
    assert.match(renderToStaticMarkup(createElement(Warehouse, { ...warehouseProps, onEditReceipt() {} })), />Edit</);
    const tfProps = { inventoryRows: [], salesmanTransfers: [receipt], users, currentDate: "2026-01-03" };
    assert.doesNotMatch(renderToStaticMarkup(createElement(SalesmanInventory, tfProps)), />Edit</);
    assert.match(renderToStaticMarkup(createElement(SalesmanInventory, { ...tfProps, onEditReceipt() {} })), />Edit</);
    for (const module of ["warehouse_transfer", "salesman_transfer"]) {
      const html = renderToStaticMarkup(createElement(TransferCorrectionDialog, {
        module, receipt, users, lots, localMode: true, onClose() {},
      }));
      assert.match(html, /Secure transfer correction services are not configured in local demo mode/);
      assert.match(html, /type="password"/);
      assert.match(html, /Correction Reason/);
      assert.match(html, /Confirm Correction/);
      assert.match(html, /disabled=""/);
      assert.match(html, /QA Plant \/ QA-TRIP \/ Whole Dressed Chicken/);
    }
  } finally { await vite.close(); }
});
