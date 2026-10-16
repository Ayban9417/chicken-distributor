import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { applyStockTripCorrection, previewStockTripCorrection, stockTripCorrectionChanges } from "../src/services/stockTripCorrectionService.js";

const org = "f2000000-0000-4000-8000-000000000001";
const tripId = "f2000000-0000-4000-8000-000000000021";
const lineId = "f2000000-0000-4000-8000-000000000031";
const trip = {
  id: tripId, date: "2026-01-01", reference: "REF-QA-001", notes: "Original note", plant: "QA Plant", code: "ST-QA-001", corrected: false,
  products: [{ lineId, name: "Whole Dressed Chicken", originalQty: 100, costPerKg: 142, bags: 10, headCount: 100, usesBags: true, usesHeadCount: true, acquisitionType: "Purchased", category: "Whole Dressed Chicken" }],
};

test("correction payload retains exact Trip line identity and separate quantities and costs", () => {
  const changes = stockTripCorrectionChanges(trip, { date: "2026-01-02", reference: "REF-QA-NEW", notes: "Fixed", lines: {
    [lineId]: { quantityKg: "120.125", costPerKg: "145.50", bags: "12", headCount: "" },
  } });
  assert.deepEqual(changes, {
    tripDate: "2026-01-02", reference: "REF-QA-NEW", notes: "Fixed",
    lines: [{ id: lineId, quantityKg: 120.125, costPerKg: 145.5, bags: 12, headCount: null }],
  });
  assert.equal(changes.lines[0].id, trip.products[0].lineId);
});

test("preview is read-only, while apply carries password and reason to the dedicated Edge Function", async () => {
  const calls = [];
  const client = { functions: { async invoke(name, options) {
    calls.push({ name, body: options.body });
    return { data: options.body.action === "preview" ? { preview: { eligible: false } } : { correction: { correctionId: "qa-id" } }, error: null };
  } } };
  const changes = { tripDate: "2026-01-02", lines: [] };
  assert.deepEqual(await previewStockTripCorrection(org, tripId, changes, client), { eligible: false });
  assert.deepEqual(await applyStockTripCorrection(org, tripId, changes, "not-a-real-password", "Correct test Trip", "request-id", "version", client), { correctionId: "qa-id" });
  assert.equal(calls[0].name, "admin-stock-trip-correction");
  assert.equal(calls[0].body.password, undefined);
  assert.equal(calls[1].body.action, "apply");
  assert.equal(calls[1].body.reason, "Correct test Trip");
  assert.equal(calls[1].body.password, "not-a-real-password");
});

test("a correction service error is recoverable without echoing the request payload", async () => {
  const client = { functions: { async invoke() { return { data: null, error: { context: { clone: () => ({ json: async () => ({ error: "The Trip changed. Refresh the preview." }) }) } } }; } } };
  await assert.rejects(previewStockTripCorrection(org, tripId, {}, client), /Trip changed/);
});

test("SQL limits writes to a dedicated service-only RPC with locks, adjustment movements, and correction evidence", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261016085749_admin_stock_trip_corrections.sql", import.meta.url), "utf8");
  assert.match(sql, /create unique index stock_trips_org_reference_ci_key/i);
  assert.match(sql, /private\.has_org_role\(p_organization_id, array\['owner_admin'\]\)/i);
  assert.match(sql, /perform private\.assert_correction_actor\(p_organization_id, p_actor_user_id\)/i);
  assert.match(sql, /perform private\.assert_correction_request\(/i);
  assert.match(sql, /order by il\.id for update of il/i);
  assert.match(sql, /v_preview->>'versionToken'/i);
  assert.match(sql, /warehouse_to_salesman.*Warehouse-to-Salesman transfer/i);
  assert.match(sql, /v_receipts > 0 or v_transfers > 0 or v_sales > 0/i);
  assert.match(sql, /'adjustment_in' else 'adjustment_out'/i);
  assert.match(sql, /insert into public\.transaction_corrections/i);
  assert.match(sql, /insert into public\.audit_events/i);
  assert.match(sql, /grant execute on function public\.apply_stock_trip_correction[^;]+to service_role/i);
  assert.doesNotMatch(sql, /grant (update|delete) on public\.(stock_trips|stock_trip_lines|inventory_lots)/i);
});

test("Edge function uses the Phase 1 password guard and never logs or stores credentials", async () => {
  const edge = await readFile(new URL("../supabase/functions/admin-stock-trip-correction/index.ts", import.meta.url), "utf8");
  assert.match(edge, /authorizeAdminCorrection\(/);
  assert.match(edge, /adminClient\.rpc\("apply_stock_trip_correction"/);
  assert.match(edge, /preview_stock_trip_correction/);
  assert.doesNotMatch(edge, /console\.(log|error)|localStorage|sessionStorage/);
  assert.doesNotMatch(edge, /password.*(?:audit_events|transaction_corrections)/);
});

test("Plant Trip edit and history controls render only when the hosted callbacks are supplied", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { Trips, LocalStockTripCorrectionDialog } = await vite.ssrLoadModule("/src/App.jsx");
    const { StockTripCorrectionDialog } = await vite.ssrLoadModule("/src/components/StockTripCorrectionDialog.jsx");
    const props = { trips: [trip], setTrips() {}, plantConfigs: [], currentDate: "2026-10-16" };
    const local = renderToStaticMarkup(createElement(Trips, props));
    assert.doesNotMatch(local, />Edit<|View Edit History/);
    const hosted = renderToStaticMarkup(createElement(Trips, { ...props, onEditTrip() {}, onViewEditHistory() {} }));
    assert.match(hosted, />Edit</);
    assert.match(hosted, /<\/details>\s*<div[^>]*>.*?>Edit</s);
    assert.doesNotMatch(hosted, /View Edit History/);
    const corrected = renderToStaticMarkup(createElement(Trips, { ...props, trips: [{ ...trip, corrected: true }], onEditTrip() {}, onViewEditHistory() {} }));
    assert.match(corrected, /View Edit History/);
    const dialog = renderToStaticMarkup(createElement(StockTripCorrectionDialog, { organizationId: org, trip, onClose() {}, onSaved() {} }));
    assert.match(dialog, /Trip Date|TRIP DATE/);
    assert.match(dialog, /Cost\/KG|COST\/KG/);
    assert.match(dialog, /Reviewing\.\.\.|Review Changes/);
    assert.match(dialog, /type="password"/);
    assert.match(dialog, /Confirm Correction/);
    assert.match(dialog, /sm:grid-cols-2/);
    assert.match(dialog, /overflow-x-auto/);
    assert.match(dialog, /Bags Before \/ After/);
    const localDialog = renderToStaticMarkup(createElement(LocalStockTripCorrectionDialog, { trip, onClose() {} }));
    assert.match(localDialog, /Correction services are not configured in local demo mode/);
    assert.match(localDialog, /REF-QA-001/);
    assert.match(localDialog, /type="password"/);
    assert.match(localDialog, /Correction Reason/);
    assert.match(localDialog, /<button[^>]*disabled=""[^>]*>.*?Confirm Correction/s);
  } finally {
    await vite.close();
  }
});
