import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { applySaleCorrection, previewSaleCorrection, saleCorrectionChanges } from "../src/services/saleCorrectionService.js";
import { buildHostedInventoryOverviewRows } from "../src/services/inventoryParityService.js";

const organizationId = "f4000000-0000-4000-8000-000000000001";
const saleId = "f4000000-0000-4000-8000-000000000061";
const lotId = "f4000000-0000-4000-8000-000000000041";
const lineId = "f4000000-0000-4000-8000-000000000062";

test("Sale correction payload preserves existing line identity and separate sale price", () => {
  assert.deepEqual(saleCorrectionChanges({
    saleDate: "2026-01-05", customerId: "customer-2", trustReceiptNumber: "TR-88",
    salesDeductions: "10.25", notes: "Corrected", lines: [
      { id: lineId, lotId, quantityKg: "12.125", pricePerKg: "151.50" },
    ],
  }), {
    saleDate: "2026-01-05", customerId: "customer-2", trustReceiptNumber: "TR-88",
    salesDeductions: 10.25, notes: "Corrected", lines: [
      { id: lineId, lotId, quantityKg: 12.125, pricePerKg: 151.5 },
    ],
  });
});

test("Sale preview sends no password, while apply uses the dedicated service and version", async () => {
  const calls = [];
  const client = { functions: { async invoke(name, options) {
    calls.push({ name, body: options.body });
    return { data: options.body.action === "preview" ? { preview: { eligible: false } } : { correction: { correctionId: "qa" } }, error: null };
  } } };
  const changes = { saleDate: "2026-01-05", customerId: "customer-2", trustReceiptNumber: "TR-88",
    salesDeductions: 0, notes: "", lines: [{ id: lineId, lotId, quantityKg: 12, pricePerKg: 150 }] };
  await previewSaleCorrection(organizationId, saleId, changes, client);
  await applySaleCorrection(organizationId, saleId, changes, "fixture-only-password", "Correct a test Sale",
    "request-id", "version", client);
  assert.equal(calls[0].name, "admin-sale-correction");
  assert.equal(calls[0].body.action, "preview");
  assert.equal(calls[0].body.password, undefined);
  assert.deepEqual(calls[1].body, { action: "apply", organizationId, saleId, changes,
    password: "fixture-only-password", reason: "Correct a test Sale", requestId: "request-id", versionToken: "version" });
});

test("reversed and replacement Sale movements reconcile sold KG without inflating stock-in", () => {
  const movement = (movement_type, quantity_kg, from_location_type, to_location_type) => ({
    id: `${movement_type}-${quantity_kg}`, inventory_lot_id: lotId, movement_type,
    quantity_kg, from_location_type, to_location_type,
    ...(movement_type.startsWith("adjustment") ? { reference_type: "transaction_correction", reference_id: "correction-1" } : {}),
  });
  const rows = buildHostedInventoryOverviewRows({
    warehouseStock: [{ inventory_lot_id: lotId, stock_trip_id: "trip-1", stock_trip_line_id: "trip-line-1",
      original_quantity_kg: 100, available_quantity_kg: 50, cost_per_kg: 140, plant_name: "QA Plant",
      product_name: "Chicken", category: "whole_chicken" }],
    salesmanStock: [{ inventory_lot_id: lotId, available_quantity_kg: 35 }],
    movements: [movement("stock_in", 100, "plant", "warehouse"),
      movement("warehouse_to_salesman", 50, "warehouse", "salesman"),
      movement("sale", 20, "salesman", "customer"),
      movement("adjustment_in", 20, "customer", "salesman"),
      movement("adjustment_out", 15, "salesman", "customer")],
  });
  assert.equal(rows[0].soldQty, 15);
  assert.equal(rows[0].remainingQty, 85);
  assert.equal(rows[0].adjustments, 0);
  assert.equal(rows[0].reconciliationDelta, 0);
  assert.equal(rows[0].history.filter((item) => item.ref === "Correction correction-1").length, 2);
});

test("migration limits correction to unpaid, unallocated Sales and service-only atomic RPC", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261016162602_admin_sale_corrections.sql", import.meta.url), "utf8");
  for (const name of ["private.inspect_sale_correction", "public.preview_sale_correction", "public.apply_sale_correction"])
    assert.match(sql, new RegExp(`create function ${name.replace(".", "\\.")}\\(`));
  for (const guard of ["Only unpaid Sales", "Payment allocations", "submitted DCR", "Trust Receipt number is already used",
    "Insufficient Salesman stock", "downstream movements", "negative Customer balance",
    "private.assert_correction_request", "for update", "transaction_corrections", "audit_events",
    "adjustment_in", "adjustment_out"]) assert.ok(sql.includes(guard), `${guard} guard is present`);
  assert.match(sql, /grant execute on function public\.apply_sale_correction[^;]+to service_role/i);
  assert.doesNotMatch(sql, /grant execute on function public\.apply_sale_correction[^;]+to authenticated/i);
  assert.doesNotMatch(sql, /grant (update|delete) on (public\.)?(sales|sale_lines|payments|inventory_movements)/i);
});

test("Sale Edge Function reuses password verification and never logs credentials", async () => {
  const edge = await readFile(new URL("../supabase/functions/admin-sale-correction/index.ts", import.meta.url), "utf8");
  assert.match(edge, /authorizeAdminCorrection\(/);
  assert.match(edge, /userClient\.rpc\("preview_sale_correction"/);
  assert.match(edge, /adminClient\.rpc\("apply_sale_correction"/);
  assert.doesNotMatch(edge, /console\.(log|error)|localStorage|sessionStorage/);
});

test("existing Sale actions are Owner-only and local correction cannot submit", async () => {
  const [hosted, local, shared] = await Promise.all([
    readFile(new URL("../src/components/HostedParityScreens.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/CorrectionDialog.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(hosted, /onEditSale=\{role === "owner_admin" \? setEditSale : undefined\}/);
  assert.match(hosted, /onViewSaleHistory=\{role === "owner_admin"/);
  assert.match(local, /Secure Sale correction services are not configured in local demo mode/);
  assert.match(local, /reviewRequired onClose=\{\(\) => setEditSale\(null\)\}/);
  assert.match(shared, /reviewRequired \|\| !preview\?\.eligible/);
});
