import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { deleteHostedPlantProduct, deleteHostedStockTrip, protectedDeletionPayload } from "../src/services/protectedDeletionService.js";
import { configuredProductById, withoutConfiguredProduct } from "../src/utils/plantConfiguration.js";

const migrationUrl = new URL("../supabase/migrations/20261005032519_protected_admin_deletions.sql", import.meta.url);
const schemaGrantUrl = new URL("../supabase/migrations/20261005041135_grant_protected_deletion_private_schema.sql", import.meta.url);
const functionUrl = new URL("../supabase/functions/admin-destructive-action/index.ts", import.meta.url);
const configUrl = new URL("../supabase/config.toml", import.meta.url);
const dialogUrl = new URL("../src/components/DestructiveActionDialog.jsx", import.meta.url);
const tripsUrl = new URL("../src/components/HostedParityScreens.jsx", import.meta.url);
const plantsUrl = new URL("../src/components/LivePlantManagement.jsx", import.meta.url);

const ids = {
  organization: "10000000-0000-4000-8000-000000000001",
  target: "10000000-0000-4000-8000-000000000002",
  request: "10000000-0000-4000-8000-000000000003",
};

function functionClient(data = { deletion: { idempotent_replay: false } }, error = null) {
  const calls = [];
  return {
    calls,
    functions: {
      async invoke(name, options) {
        calls.push({ name, options });
        return { data, error };
      },
    },
  };
}

test("protected deletion payload keeps password only in the Edge Function request", () => {
  assert.deepEqual(protectedDeletionPayload("delete_stock_trip", ids.organization, ids.target, "current-password", "Wrong date", ids.request), {
    action: "delete_stock_trip",
    organizationId: ids.organization,
    targetId: ids.target,
    password: "current-password",
    reason: "Wrong date",
    requestId: ids.request,
  });
});

test("Trip and Plant Product services use the same protected Edge Function", async () => {
  const client = functionClient();
  await deleteHostedStockTrip(ids.organization, ids.target, "secret", "Duplicate Stock In", ids.request, client);
  await deleteHostedPlantProduct(ids.organization, ids.target, "secret", "Product added by mistake.", ids.request, client);
  assert.deepEqual(client.calls.map((call) => call.name), ["admin-destructive-action", "admin-destructive-action"]);
  assert.deepEqual(client.calls.map((call) => call.options.body.action), ["delete_stock_trip", "delete_plant_product"]);
  assert.equal(client.calls[0].options.body.requestId, ids.request);
  assert.equal(client.calls[1].options.body.requestId, ids.request);
});

test("protected deletion service returns recoverable safe Edge Function errors", async () => {
  const response = new Response(JSON.stringify({ error: "Current password is incorrect." }), { status: 401 });
  const client = functionClient(null, { context: response });
  await assert.rejects(
    deleteHostedStockTrip(ids.organization, ids.target, "wrong", "Wrong date", ids.request, client),
    /Current password is incorrect/,
  );
});

test("Edge Function reauthenticates the current active Owner without exposing internal email", async () => {
  const source = await readFile(functionUrl, "utf8");
  assert.match(source, /auth\.getUser\(\)/);
  assert.match(source, /role", "owner_admin"/);
  assert.match(source, /profiles"\)\.select\("id"\).*active/s);
  assert.match(source, /auth\.admin\.getUserById\(callerData\.user\.id\)/);
  assert.match(source, /signInWithPassword\(\{ email: internalEmail, password \}\)/);
  assert.match(source, /reauthenticated\.user\?\.id !== callerData\.user\.id/);
  assert.match(source, /Current password is incorrect/);
  assert.doesNotMatch(source, /console\.(log|error)|localStorage|sessionStorage/);
  assert.doesNotMatch(source, /email: internalEmail[^\n]*return|json\(\{[^}]*internalEmail/s);
});

test("destructive Edge Function requires JWT verification and exact origin handling", async () => {
  const [config, source] = await Promise.all([readFile(configUrl, "utf8"), readFile(functionUrl, "utf8")]);
  assert.match(config, /\[functions\.admin-destructive-action\][\s\S]*?verify_jwt = true/);
  assert.match(source, /ALLOWED_ORIGINS/);
  assert.match(source, /authorization\.startsWith\("Bearer "\)/);
  assert.match(source, /Cache-Control": "no-store"/);
});

test("migration makes deletion atomic, locked, audited, idempotent, and service-role only", async () => {
  const [sql, schemaGrant] = await Promise.all([readFile(migrationUrl, "utf8"), readFile(schemaGrantUrl, "utf8")]);
  assert.match(sql, /create or replace function private\.delete_unused_stock_trip/);
  assert.match(sql, /create or replace function private\.delete_unused_plant_product/);
  assert.match(sql, /for update of il/i);
  assert.match(sql, /movement_type <> 'stock_in'/);
  assert.match(sql, /receiving_receipt_lines/);
  assert.match(sql, /transfer_receipt_lines/);
  assert.match(sql, /sale_lines/);
  assert.match(sql, /discrepancies/);
  assert.match(sql, /DELETE_STOCK_TRIP/);
  assert.match(sql, /DELETE_PLANT_PRODUCT/);
  assert.match(sql, /idempotent_replay/);
  assert.match(sql, /revoke all on function public\.delete_unused_stock_trip[\s\S]*?authenticated/i);
  assert.match(sql, /grant execute on function public\.delete_unused_stock_trip[\s\S]*?service_role/i);
  assert.match(schemaGrant, /grant usage on schema private to service_role/i);
  assert.doesNotMatch(schemaGrant, /authenticated|anon/i);
  assert.doesNotMatch(sql, /on delete cascade/i);
  assert.doesNotMatch(sql, /p_password|password_hash|auth token|service_role_key/i);
});

test("RLS policy migration removes direct authenticated deletes while preserving configuration writes", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  for (const table of ["products", "plant_products", "product_codes", "product_class_types"]) {
    assert.match(sql, new RegExp(`drop policy if exists ${table}_write`, "i"));
  }
  assert.match(sql, /create policy plant_products_insert/);
  assert.match(sql, /create policy plant_products_update/);
  assert.doesNotMatch(sql, /create policy plant_products_delete/i);
});

test("responsive reusable dialog and owner screens expose secondary destructive actions", async () => {
  const [dialog, trips, plants] = await Promise.all([readFile(dialogUrl, "utf8"), readFile(tripsUrl, "utf8"), readFile(plantsUrl, "utf8")]);
  assert.match(dialog, /type="password"/);
  assert.match(dialog, /autoComplete="current-password"/);
  assert.match(dialog, /reasonRequired/);
  assert.match(dialog, /grid gap-3 sm:grid-cols-2/);
  assert.match(trips, /Delete Trip/);
  assert.match(trips, /role !== "owner_admin"/);
  assert.match(plants, /Delete Product/);
  assert.match(plants, /Product Active/);
  assert.match(plants, /onDelete\(link\.id\)/);
  assert.match(plants, /aria-label={`Delete \$\{link\.product\?\.name/);
});

test("configured Product deletion targets a stable Plant Product ID independently", () => {
  const products = [
    { id: "manok-pinoy-c1", product: { name: "C1" } },
    { id: "manok-pinoy-d1", product: { name: "D1" } },
    { id: "manok-pinoy-g", product: { name: "G" } },
  ];

  assert.equal(configuredProductById(products, "manok-pinoy-d1")?.product.name, "D1");
  assert.deepEqual(
    withoutConfiguredProduct(products, "manok-pinoy-d1").map((item) => item.product.name),
    ["C1", "G"],
  );
  assert.deepEqual(
    withoutConfiguredProduct(products, "manok-pinoy-c1").map((item) => item.product.name),
    ["D1", "G"],
  );
  assert.deepEqual(
    withoutConfiguredProduct(products, "manok-pinoy-g").map((item) => item.product.name),
    ["C1", "D1"],
  );
});
