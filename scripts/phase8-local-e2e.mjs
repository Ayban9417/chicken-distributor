import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_ANON_KEY;
const serviceKey = process.env.LOCAL_SERVICE_ROLE_KEY;
assert(url && anonKey && serviceKey, "Local Supabase URL and keys are required");
const endpoint = new URL(url);
assert(["127.0.0.1", "localhost"].includes(endpoint.hostname), "Refusing a non-local Supabase project");
assert(endpoint.port === "54321", "Refusing an unexpected local Supabase port");
const timedFetch = (input, init = {}) => fetch(input, { ...init, signal: AbortSignal.timeout(20_000) });

const orgId = "10000000-0000-4000-8000-000000000001";
const plantId = "20000000-0000-4000-8000-000000000001";
const productId = "30000000-0000-4000-8000-000000000002";
const plantProductId = "40000000-0000-4000-8000-000000000002";
const admin = createClient(url, serviceKey, {
  global: { fetch: timedFetch }, auth: { persistSession: false, autoRefreshToken: false },
});
const password = randomBytes(20).toString("base64url");
const suffix = randomUUID().slice(0, 8);
const tripId = randomUUID();
const lineId = randomUUID();
const lotId = randomUUID();
const originalReference = `P8-${suffix}`;

async function result(promise, label) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function createActor(name, role, active = true) {
  const email = `phase8-${name}-${suffix}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data?.user) throw new Error(`${name} Auth creation: ${error?.message || "no user"}`);
  const id = data.user.id;
  await result(admin.from("profiles").insert({ id, full_name: `Phase 8 ${name}`, username: `phase8.${name}.${suffix}` }), `${name} profile`);
  await result(admin.from("organization_memberships").insert({ organization_id: orgId, user_id: id, role, active }), `${name} membership`);
  const client = createClient(url, anonKey, {
    global: { fetch: timedFetch }, auth: { persistSession: false, autoRefreshToken: false },
  });
  const session = await result(client.auth.signInWithPassword({ email, password }), `${name} login`);
  assert.equal(session.user.id, id);
  return { id, client, token: session.session.access_token };
}

async function edge(actor, action, changes, extras = {}) {
  const response = await fetch(`${url}/functions/v1/admin-stock-trip-correction`, {
    method: "POST",
    headers: { apikey: anonKey, Authorization: `Bearer ${actor.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action, organizationId: orgId, tripId, changes, ...extras }),
    signal: AbortSignal.timeout(20_000),
  });
  return { status: response.status, body: await response.json() };
}

const owner = await createActor("owner", "owner_admin");
const salesman = await createActor("salesman", "salesman");
const inactive = await createActor("inactive", "owner_admin", false);
const rateActor = await createActor("rate", "owner_admin");

await result(admin.from("stock_trips").insert({
  id: tripId, organization_id: orgId, plant_id: plantId, trip_number: `ST-${suffix}`,
  trip_date: "2026-01-01", reference_number: originalReference, status: "received",
  client_request_id: randomUUID(), created_by: owner.id,
}), "synthetic Trip");
await result(admin.from("stock_trip_lines").insert({
  id: lineId, stock_trip_id: tripId, plant_product_id: plantProductId, quantity_kg: 10,
  acquisition_type: "purchased", cost_per_kg: 40, bags: 1, head_count: 10,
}), "synthetic Trip line");
await result(admin.from("inventory_lots").insert({
  id: lotId, organization_id: orgId, stock_trip_line_id: lineId, plant_id: plantId,
  product_id: productId, cost_per_kg: 40, original_quantity_kg: 10,
}), "synthetic lot");
await result(admin.from("inventory_movements").insert({
  organization_id: orgId, inventory_lot_id: lotId, movement_type: "stock_in", quantity_kg: 10,
  from_location_type: "plant", to_location_type: "warehouse", reference_type: "stock_trip",
  reference_id: tripId, reference_line_id: lineId, effective_date: "2026-01-01", created_by: owner.id,
}), "synthetic movement");

const changes = {
  tripDate: "2026-01-02", reference: originalReference, notes: "Phase 8 correction",
  lines: [{ id: lineId, quantityKg: 12, costPerKg: 42, bags: 2, headCount: 12 }],
};
const preview = await edge(owner, "preview", changes);
assert.equal(preview.status, 200, JSON.stringify(preview.body));
assert.equal(preview.body.preview.eligible, true);
assert.equal((await edge(salesman, "preview", changes)).status, 403);
assert.equal((await edge(inactive, "preview", changes)).status, 403);
const otherOrg = await fetch(`${url}/functions/v1/admin-stock-trip-correction`, {
  method: "POST", headers: { apikey: anonKey, Authorization: `Bearer ${owner.token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ action: "preview", organizationId: randomUUID(), tripId, changes }),
  signal: AbortSignal.timeout(20_000),
});
assert.equal(otherOrg.status, 403);

const requestId = randomUUID();
const apply = (actor, pass, reason, versionToken, id = requestId, proposed = changes) => edge(actor, "apply", proposed, {
  password: pass, reason, versionToken, requestId: id,
});
assert.equal((await apply(owner, "incorrect-password", "Phase 8 stock correction", preview.body.preview.versionToken)).status, 401);
assert.equal((await apply(salesman, password, "Phase 8 stock correction", preview.body.preview.versionToken)).status, 403);
assert.equal((await apply(owner, password, "", preview.body.preview.versionToken)).status, 400);
const applied = await apply(owner, password, "Phase 8 stock correction", preview.body.preview.versionToken);
assert.equal(applied.status, 200, JSON.stringify(applied.body));
assert(applied.body.correction?.correctionId);

const trip = await result(admin.from("stock_trips").select("id,reference_number,trip_date").eq("id", tripId).single(), "corrected Trip");
assert.equal(trip.id, tripId);
assert.equal(trip.reference_number, originalReference);
assert.equal(trip.trip_date, "2026-01-02");
const line = await result(admin.from("stock_trip_lines").select("quantity_kg,cost_per_kg,bags,head_count").eq("id", lineId).single(), "corrected line");
assert.equal(Number(line.quantity_kg), 12);
assert.equal(Number(line.cost_per_kg), 42);
const lot = await result(admin.from("inventory_lots").select("original_quantity_kg,cost_per_kg").eq("id", lotId).single(), "corrected lot");
assert.equal(Number(lot.original_quantity_kg), 12);
assert.equal(Number(lot.cost_per_kg), 42);
const history = await result(owner.client.from("transaction_corrections").select("id,transaction_id,original_values,applied_values,reason").eq("transaction_id", tripId), "Owner edit history");
assert.equal(history.length, 1);
assert.equal(history[0].id, applied.body.correction.correctionId);
assert.equal(history[0].reason, "Phase 8 stock correction");
const deniedHistory = await result(salesman.client.from("transaction_corrections").select("id").eq("transaction_id", tripId), "Salesman edit history");
assert.equal(deniedHistory.length, 0);
const stale = await apply(owner, password, "Phase 8 stock correction", preview.body.preview.versionToken);
assert.equal(stale.status, 409, JSON.stringify(stale.body));

const nextChanges = { ...changes, notes: "Phase 8 second correction" };
const fresh = await edge(owner, "preview", nextChanges);
assert.equal(fresh.status, 200);
assert.equal(fresh.body.preview.eligible, true);
assert.equal((await apply(owner, password, "Phase 8 second correction", fresh.body.preview.versionToken, requestId, nextChanges)).status, 409);
for (let attempt = 0; attempt < 6; attempt++) {
  const denied = await apply(rateActor, "incorrect-password", "Phase 8 rate limit check", fresh.body.preview.versionToken, randomUUID(), nextChanges);
  assert.equal(denied.status, attempt < 5 ? 401 : 429);
}
assert.equal((await apply(rateActor, password, "Phase 8 rate limit check", fresh.body.preview.versionToken, randomUUID(), nextChanges)).status, 429);
const remaining = await result(admin.from("transaction_corrections").select("id").eq("transaction_id", tripId), "final correction count");
assert.equal(remaining.length, 1);

console.log("Local Auth -> Edge -> RPC -> audit passed: Owner correction, role denials, password, version, replay, rate limit, and inventory reconciliation.");
