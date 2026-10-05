import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const local = Object.fromEntries(readFileSync(".env.local", "utf8")
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));

const url = local.VITE_SUPABASE_URL;
const anonKey = local.VITE_SUPABASE_ANON_KEY;
const username = process.env.HOSTED_DELETE_QA_USERNAME;
const password = process.env.HOSTED_DELETE_QA_PASSWORD;
assert.ok(url && anonKey && username && password, "Hosted deletion QA configuration is required");

const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const login = await client.functions.invoke("username-login", { body: { username, password } });
assert.ifError(login.error);
assert.ok(login.data?.access_token && login.data?.refresh_token, "Owner login succeeds");
assert.ifError((await client.auth.setSession({ access_token: login.data.access_token, refresh_token: login.data.refresh_token })).error);

const { data: userData, error: userError } = await client.auth.getUser();
assert.ifError(userError);
const userId = userData.user.id;
const membership = await client.from("organization_memberships").select("organization_id, role, active").eq("user_id", userId).eq("active", true).single();
assert.ifError(membership.error);
assert.equal(membership.data.role, "owner_admin", "QA caller is Owner / Admin");
const organizationId = membership.data.organization_id;

async function functionError(error) {
  try {
    return (await error?.context?.clone?.().json())?.error || error?.message || "Unknown function error";
  } catch {
    return error?.message || "Unknown function error";
  }
}

async function deleteAction(action, targetId, suppliedPassword, reason, requestId) {
  const result = await client.functions.invoke("admin-destructive-action", {
    body: { action, organizationId, targetId, password: suppliedPassword, reason, requestId },
  });
  if (result.error) throw new Error(await functionError(result.error));
  if (result.data?.error) throw new Error(result.data.error);
  return result.data?.deletion;
}

async function rows(query, label) {
  const result = await query;
  assert.ifError(result.error, label);
  return result.data || [];
}

let safeTripId = null;
let safeTripRequestId = null;
let temporaryPlantProductId = null;
try {
  const plants = await rows(client.from("plants").select("id, name").eq("organization_id", organizationId).eq("active", true), "active Plants");
  const products = await rows(client.from("products").select("id, name").eq("organization_id", organizationId).eq("active", true), "active Products");
  const links = await rows(client.from("plant_products").select("id, plant_id, product_id, uses_size_codes, uses_class_types, active"), "Plant Products");
  assert.ok(plants.length && products.length && links.length, "Hosted Plant configuration exists");

  const staleQaTrips = await rows(client.from("stock_trips").select("id").eq("organization_id", organizationId).eq("notes", "Disposable protected deletion QA"), "stale deletion QA Trips");
  for (const trip of staleQaTrips) {
    await deleteAction("delete_stock_trip", trip.id, password, "Disposable hosted QA cleanup", crypto.randomUUID());
  }

  const safeLink = links.find((link) => link.active && !link.uses_size_codes && !link.uses_class_types);
  assert.ok(safeLink, "An uncoded active Product is available for disposable Stock In");
  safeTripRequestId = crypto.randomUUID();
  const safeTrip = await client.rpc("create_stock_trip", {
    p_organization_id: organizationId,
    p_plant_id: safeLink.plant_id,
    p_trip_date: new Date().toISOString().slice(0, 10),
    p_lines: [{ plant_product_id: safeLink.id, quantity_kg: 0.123, acquisition_type: "purchased", cost_per_kg: 1 }],
    p_client_request_id: safeTripRequestId,
    p_reference_number: `DELETE-QA-${Date.now()}`,
    p_delivery_note: null,
    p_notes: "Disposable protected deletion QA",
  });
  assert.ifError(safeTrip.error);
  safeTripId = safeTrip.data.id;

  await assert.rejects(
    deleteAction("delete_stock_trip", safeTripId, `${password}-wrong`, "Disposable hosted QA", crypto.randomUUID()),
    /Current password is incorrect/,
    "wrong current password is denied",
  );
  assert.equal((await rows(client.from("stock_trips").select("id").eq("id", safeTripId), "safe Trip after wrong password")).length, 1, "wrong password preserves Trip");

  const deleteRequestId = crypto.randomUUID();
  const deleted = await deleteAction("delete_stock_trip", safeTripId, password, "Disposable hosted QA", deleteRequestId);
  assert.equal(deleted.idempotent_replay, false, "safe Trip is deleted");
  assert.equal((await rows(client.from("stock_trips").select("id").eq("id", safeTripId), "deleted Trip")).length, 0, "Trip row is gone");
  assert.equal((await rows(client.from("stock_trip_lines").select("id").eq("stock_trip_id", safeTripId), "deleted Trip lines")).length, 0, "Trip lines are gone");
  assert.equal((await rows(client.from("audit_events").select("id").eq("entity_id", safeTripId).eq("action", "DELETE_STOCK_TRIP"), "Trip deletion audit")).length, 1, "Trip audit survives");
  const replay = await deleteAction("delete_stock_trip", safeTripId, password, "Disposable hosted QA", deleteRequestId);
  assert.equal(replay.idempotent_replay, true, "replayed Trip deletion is idempotent");
  safeTripId = null;

  const movement = (await rows(client.from("inventory_movements").select("inventory_lot_id").eq("organization_id", organizationId).neq("movement_type", "stock_in").limit(1), "historical movement"))[0];
  const historicalTripChecked = Boolean(movement);
  let protectedTripId;
  let usedPlantProductId;
  if (movement) {
    const lot = (await rows(client.from("inventory_lots").select("stock_trip_line_id").eq("id", movement.inventory_lot_id), "historical lot"))[0];
    const line = (await rows(client.from("stock_trip_lines").select("stock_trip_id, plant_product_id").eq("id", lot.stock_trip_line_id), "historical line"))[0];
    protectedTripId = line.stock_trip_id;
    usedPlantProductId = line.plant_product_id;
    await assert.rejects(
      deleteAction("delete_stock_trip", protectedTripId, password, "Blocked hosted QA", crypto.randomUUID()),
      /already been used in transactions/,
      "used Trip remains protected even with the correct password",
    );
  } else {
    const existingLine = (await rows(client.from("stock_trip_lines").select("stock_trip_id, plant_product_id").limit(1), "existing Stock-In line"))[0];
    assert.ok(existingLine, "existing Stock-In line is available for used Product QA");
    protectedTripId = existingLine.stock_trip_id;
    usedPlantProductId = existingLine.plant_product_id;
  }

  const candidate = products.flatMap((product) => plants.map((plant) => ({ product, plant })))
    .find(({ product, plant }) => !links.some((link) => link.product_id === product.id && link.plant_id === plant.id)
      && links.some((link) => link.product_id === product.id));
  assert.ok(candidate, "A cross-Plant Product pair is available for disposable configuration QA");
  const insertedLink = await client.from("plant_products").insert({
    plant_id: candidate.plant.id,
    product_id: candidate.product.id,
    uses_size_codes: true,
    uses_class_types: true,
    uses_bags: false,
    uses_head_count: false,
    allows_free_from_plant: true,
    active: true,
  }).select("id").single();
  assert.ifError(insertedLink.error);
  temporaryPlantProductId = insertedLink.data.id;
  const codeId = crypto.randomUUID();
  const classId = crypto.randomUUID();
  assert.ifError((await client.from("plant_product_codes").insert({ id: codeId, plant_product_id: temporaryPlantProductId, code: `QA-${Date.now()}`, display_name: "Disposable QA" })).error);
  assert.ifError((await client.from("plant_product_class_types").insert({ id: classId, plant_product_id: temporaryPlantProductId, class_type: `QA-${Date.now()}`, display_name: "Disposable QA" })).error);

  await assert.rejects(
    deleteAction("delete_plant_product", temporaryPlantProductId, `${password}-wrong`, "Product added by mistake.", crypto.randomUUID()),
    /Current password is incorrect/,
    "wrong password preserves Product configuration",
  );
  const productDelete = await deleteAction("delete_plant_product", temporaryPlantProductId, password, "Product added by mistake.", crypto.randomUUID());
  assert.equal(productDelete.idempotent_replay, false, "unused Product configuration is deleted");
  assert.equal((await rows(client.from("plant_product_codes").select("id").eq("id", codeId), "deleted code")).length, 0, "child code is cleaned up");
  assert.equal((await rows(client.from("plant_product_class_types").select("id").eq("id", classId), "deleted class")).length, 0, "child class is cleaned up");
  assert.equal((await rows(client.from("products").select("id").eq("id", candidate.product.id), "shared Product master")).length, 1, "shared Product master is preserved");
  assert.ok((await rows(client.from("plant_products").select("id").eq("product_id", candidate.product.id), "other Plant Product")).length >= 1, "other Plant configuration is preserved");
  temporaryPlantProductId = null;

  await assert.rejects(
    deleteAction("delete_plant_product", usedPlantProductId, password, "Product added by mistake.", crypto.randomUUID()),
    /transaction or inventory history/,
    "used Product configuration remains protected",
  );

  const bypass = await client.rpc("delete_unused_plant_product", {
    p_organization_id: organizationId,
    p_plant_product_id: usedPlantProductId,
    p_actor_user_id: userId,
    p_reason: "Direct browser bypass",
    p_request_id: crypto.randomUUID(),
  });
  assert.ok(bypass.error && /permission denied/i.test(bypass.error.message), "authenticated browser cannot call deletion RPC directly");

  const anonymous = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const anonymousDelete = await anonymous.functions.invoke("admin-destructive-action", { body: {
    action: "delete_stock_trip", organizationId, targetId: protectedTripId, password: "irrelevant", reason: "Anonymous bypass", requestId: crypto.randomUUID(),
  } });
  assert.ok(anonymousDelete.error || anonymousDelete.data?.error, "anonymous Edge Function call is denied");

  console.log(`Hosted protected deletion QA passed: reauthentication, safe delete, Product history block, Product cleanup, audit, replay, direct API and anonymous denials${historicalTripChecked ? ", Trip history block" : ""}`);
} finally {
  if (safeTripId) {
    await deleteAction("delete_stock_trip", safeTripId, password, "Disposable hosted QA cleanup", crypto.randomUUID()).catch(() => {});
  }
  if (temporaryPlantProductId) {
    await deleteAction("delete_plant_product", temporaryPlantProductId, password, "Product added by mistake.", crypto.randomUUID()).catch(() => {});
  }
  await client.auth.signOut();
}
