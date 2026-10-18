import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { withRowLockBarrier } from "./local-lock-barrier.mjs";

const url = process.env.LOCAL_SUPABASE_URL;
const anonKey = process.env.LOCAL_ANON_KEY;
const serviceKey = process.env.LOCAL_SERVICE_ROLE_KEY;
assert(url && anonKey && serviceKey, "Local Supabase URL and keys are required");
const endpoint = new URL(url);
assert(["127.0.0.1", "localhost"].includes(endpoint.hostname), "Refusing a non-local Supabase project");
assert(endpoint.port === "54321", "Refusing an unexpected local Supabase port");
const timedFetch = (input, init = {}) => fetch(input, { ...init, signal: AbortSignal.timeout(20_000) });

const orgId = randomUUID();
const plantId = randomUUID();
const productId = randomUUID();
const plantProductId = randomUUID();
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
  try {
    const { data, error } = await promise;
    if (error) throw error;
    return data;
  } catch (error) {
    throw new Error(`${label}: ${error.message}`, { cause: error });
  }
}

async function createActor(name, role, active = true) {
  const email = `phase8-${name}-${suffix}@example.invalid`;
  const data = await result(admin.auth.admin.createUser({ email, password, email_confirm: true }), `${name} Auth creation`);
  if (!data?.user) throw new Error(`${name} Auth creation: no user`);
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

await result(admin.from("organizations").insert({
  id: orgId, name: `Phase 8 Local QA ${suffix}`, slug: `phase8-${suffix}`,
}), "synthetic organization");
await result(admin.from("plants").insert({
  id: plantId, organization_id: orgId, name: "Phase 8 Plant", short_code: "P8",
}), "synthetic Plant");
await result(admin.from("products").insert({
  id: productId, organization_id: orgId, name: "Phase 8 Chicken", category: "whole_chicken",
}), "synthetic Product");
await result(admin.from("plant_products").insert({
  id: plantProductId, plant_id: plantId, product_id: productId,
  uses_bags: true, uses_head_count: true,
}), "synthetic Plant Product");

async function postFunction(name, actor, body) {
  try {
    const response = await fetch(`${url}/functions/v1/${name}`, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${actor.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    return { status: response.status, body: await response.json() };
  } catch (error) {
    throw new Error(`${name}: ${error.message}`, { cause: error });
  }
}
const edge = (actor, action, changes, extras = {}) => postFunction(
  "admin-stock-trip-correction", actor, { action, organizationId: orgId, tripId, changes, ...extras },
);

const owner = await createActor("owner", "owner_admin");
const coOwner = await createActor("co-owner", "owner_admin");
const salesman = await createActor("salesman", "salesman");
const secondSalesman = await createActor("second-salesman", "salesman");
const thirdSalesman = await createActor("third-salesman", "salesman");
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
  const denied = attempt % 2 === 0
    ? await apply(rateActor, "incorrect-password", "Phase 8 rate limit check", fresh.body.preview.versionToken, randomUUID(), nextChanges)
    : await postFunction("admin-transfer-correction", rateActor, {
      action: "apply", module: "warehouse_transfer", organizationId: orgId, receiptId: randomUUID(),
      changes: {}, password: "incorrect-password", reason: "Phase 8 rate limit check",
      versionToken: fresh.body.preview.versionToken, requestId: randomUUID(),
    });
  assert.equal(denied.status, attempt < 5 ? 401 : 429, `attempt ${attempt}: ${JSON.stringify(denied.body)}`);
  assert(!JSON.stringify(denied.body).includes("incorrect-password"));
}
const lockedAcrossEndpoints = await postFunction("admin-transfer-correction", rateActor, {
  action: "apply", module: "warehouse_transfer", organizationId: orgId, receiptId: randomUUID(),
  changes: {}, password, reason: "Phase 8 rate limit check",
  versionToken: fresh.body.preview.versionToken, requestId: randomUUID(),
});
assert.equal(lockedAcrossEndpoints.status, 429);
const remaining = await result(admin.from("transaction_corrections").select("id").eq("transaction_id", tripId), "final correction count");
assert.equal(remaining.length, 1);

const movementBefore = await result(admin.from("inventory_movements").select("id").eq("inventory_lot_id", lotId), "movement count before concurrency");
const concurrentRequestId = randomUUID();
const simultaneous = await withRowLockBarrier("stock_trips", tripId, "Two Admins / same Trip", [
  () => apply(owner, password, "Phase 8 second correction", fresh.body.preview.versionToken, concurrentRequestId, nextChanges),
  () => apply(coOwner, password, "Phase 8 second correction", fresh.body.preview.versionToken, concurrentRequestId, nextChanges),
]);
assert.deepEqual(simultaneous.map((item) => item.status).sort(), [200, 409], JSON.stringify(simultaneous));
const finalCorrections = await result(admin.from("transaction_corrections").select("id").eq("transaction_id", tripId), "final correction count");
assert.equal(finalCorrections.length, 2);
const movementAfter = await result(admin.from("inventory_movements").select("id").eq("inventory_lot_id", lotId), "movement count after concurrency");
assert.equal(movementAfter.length, movementBefore.length);

const secondTripId = randomUUID();
const secondLineId = randomUUID();
const secondLotId = randomUUID();
await result(admin.from("stock_trips").insert({
  id: secondTripId, organization_id: orgId, plant_id: plantId, trip_number: `ST-P8-${suffix}-2`,
  trip_date: "2026-01-01", reference_number: `P8-${suffix}-2`, status: "received",
  client_request_id: randomUUID(), created_by: owner.id,
}), "second synthetic Trip");
await result(admin.from("stock_trip_lines").insert({
  id: secondLineId, stock_trip_id: secondTripId, plant_product_id: plantProductId,
  quantity_kg: 20, acquisition_type: "purchased", cost_per_kg: 40,
}), "second synthetic Trip line");
await result(admin.from("inventory_lots").insert({
  id: secondLotId, organization_id: orgId, stock_trip_line_id: secondLineId,
  plant_id: plantId, product_id: productId, cost_per_kg: 40, original_quantity_kg: 20,
}), "second synthetic lot");
await result(admin.from("inventory_movements").insert({
  organization_id: orgId, inventory_lot_id: secondLotId, movement_type: "stock_in", quantity_kg: 20,
  from_location_type: "plant", to_location_type: "warehouse", reference_type: "stock_trip",
  reference_id: secondTripId, reference_line_id: secondLineId,
  effective_date: "2026-01-01", created_by: owner.id,
}), "second stock-in movement");

const rrId = randomUUID();
const rrLineId = randomUUID();
await result(admin.from("receiving_receipts").insert({
  id: rrId, organization_id: orgId, receipt_number: `RR-P8-${suffix}`,
  salesman_user_id: salesman.id, effective_date: "2026-01-04", notes: "Original RR",
  client_request_id: randomUUID(), created_by: owner.id,
}), "synthetic RR");
await result(admin.from("receiving_receipt_lines").insert({
  id: rrLineId, receipt_id: rrId, inventory_lot_id: lotId, quantity_kg: 4,
}), "synthetic RR line");
await result(admin.from("inventory_movements").insert({
  organization_id: orgId, inventory_lot_id: lotId, movement_type: "warehouse_to_salesman",
  quantity_kg: 4, from_location_type: "warehouse", to_location_type: "salesman",
  to_salesman_user_id: salesman.id, reference_type: "receiving_receipt",
  reference_id: rrId, reference_line_id: rrLineId, effective_date: "2026-01-04", created_by: owner.id,
}), "synthetic RR movement");
const rrChanges = {
  effectiveDate: "2026-01-05", toSalesmanId: thirdSalesman.id,
  lotId: secondLotId, quantityKg: 5, notes: "Corrected RR",
};
const transfer = (actor, module, action, receiptId, proposed, extras = {}) => postFunction(
  "admin-transfer-correction", actor,
  { module, action, organizationId: orgId, receiptId, changes: proposed, ...extras },
);
const rrPreview = await transfer(owner, "warehouse_transfer", "preview", rrId, rrChanges);
assert.equal(rrPreview.status, 200, JSON.stringify(rrPreview.body));
assert.equal(rrPreview.body.preview.eligible, true);
assert.equal((await transfer(salesman, "warehouse_transfer", "preview", rrId, rrChanges)).status, 403);
const rrApply = await transfer(owner, "warehouse_transfer", "apply", rrId, rrChanges, {
  password, reason: "Phase 8 receiving correction", versionToken: rrPreview.body.preview.versionToken,
  requestId: randomUUID(),
});
assert.equal(rrApply.status, 200, JSON.stringify(rrApply.body));
const rrLine = await result(admin.from("receiving_receipt_lines").select("inventory_lot_id,quantity_kg").eq("id", rrLineId).single(), "corrected RR line");
assert.equal(rrLine.inventory_lot_id, secondLotId);
assert.equal(Number(rrLine.quantity_kg), 5);
assert.equal((await result(admin.from("transaction_corrections").select("id").eq("transaction_id", rrId), "RR history")).length, 1);

const tfId = randomUUID();
const tfLineId = randomUUID();
const transferDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
await result(admin.from("transfer_receipts").insert({
  id: tfId, organization_id: orgId, receipt_number: `TF-P8-${suffix}`,
  from_salesman_user_id: thirdSalesman.id, to_salesman_user_id: salesman.id,
  effective_date: transferDate, notes: "Original TF", client_request_id: randomUUID(), created_by: owner.id,
}), "synthetic TF");
await result(admin.from("transfer_receipt_lines").insert({
  id: tfLineId, receipt_id: tfId, inventory_lot_id: secondLotId, quantity_kg: 2,
}), "synthetic TF line");
await result(admin.from("inventory_movements").insert({
  organization_id: orgId, inventory_lot_id: secondLotId, movement_type: "salesman_to_salesman",
  quantity_kg: 2, from_location_type: "salesman", from_salesman_user_id: thirdSalesman.id,
  to_location_type: "salesman", to_salesman_user_id: salesman.id,
  reference_type: "transfer_receipt", reference_id: tfId, reference_line_id: tfLineId,
  effective_date: transferDate, created_by: owner.id,
}), "synthetic TF movement");
const tfChanges = {
  effectiveDate: transferDate, fromSalesmanId: thirdSalesman.id,
  toSalesmanId: secondSalesman.id, lotId: secondLotId, quantityKg: 3, notes: "Corrected TF",
};
const tfPreview = await transfer(owner, "salesman_transfer", "preview", tfId, tfChanges);
assert.equal(tfPreview.status, 200, JSON.stringify(tfPreview.body));
assert.equal(tfPreview.body.preview.eligible, true, JSON.stringify(tfPreview.body.preview.blockedReasons));
const tfApply = await transfer(owner, "salesman_transfer", "apply", tfId, tfChanges, {
  password, reason: "Phase 8 transfer correction", versionToken: tfPreview.body.preview.versionToken,
  requestId: randomUUID(),
});
assert.equal(tfApply.status, 200, JSON.stringify(tfApply.body));
const tfLine = await result(admin.from("transfer_receipt_lines").select("quantity_kg").eq("id", tfLineId).single(), "corrected TF line");
assert.equal(Number(tfLine.quantity_kg), 3);
assert.equal((await result(admin.from("transaction_corrections").select("id").eq("transaction_id", tfId), "TF history")).length, 1);

const customerId = randomUUID();
await result(admin.from("customers").insert({
  id: customerId, organization_id: orgId, name: `Phase 8 Customer ${suffix}`,
}), "synthetic Customer");
const saleId = randomUUID();
const saleLineId = randomUUID();
await result(admin.from("sales").insert({
  id: saleId, organization_id: orgId, trust_receipt_number: `TR-P8-${suffix}`,
  customer_id: customerId, salesman_user_id: secondSalesman.id, sale_date: transferDate,
  subtotal: 50, gross_sales: 50, net_sales: 50, total_cogs: 40,
  client_request_id: randomUUID(), created_by: owner.id,
}), "synthetic Sale");
await result(admin.from("sale_lines").insert({
  id: saleLineId, sale_id: saleId, inventory_lot_id: secondLotId, product_id: productId,
  quantity_kg: 1, selling_price_per_kg: 50, acquisition_cost_per_kg: 40,
  line_sales: 50, line_cogs: 40,
}), "synthetic Sale line");
await result(admin.from("inventory_movements").insert({
  organization_id: orgId, inventory_lot_id: secondLotId, movement_type: "sale", quantity_kg: 1,
  from_location_type: "salesman", from_salesman_user_id: secondSalesman.id,
  to_location_type: "customer", reference_type: "sale", reference_id: saleId,
  reference_line_id: saleLineId, effective_date: transferDate, created_by: owner.id,
}), "synthetic Sale movement");
const saleChanges = {
  saleDate: transferDate, customerId, trustReceiptNumber: `TR-P8-C-${suffix}`,
  salesDeductions: 0, notes: "Corrected Sale",
  lines: [{ id: saleLineId, lotId: secondLotId, quantityKg: 2, pricePerKg: 60 }],
};
const saleAction = (actor, action, changes, extras = {}) => postFunction(
  "admin-sale-correction", actor,
  { action, organizationId: orgId, saleId, changes, ...extras },
);
const salePreview = await saleAction(owner, "preview", saleChanges);
assert.equal(salePreview.status, 200, JSON.stringify(salePreview.body));
assert.equal(salePreview.body.preview.eligible, true, JSON.stringify(salePreview.body.preview.blockedReasons));
assert.equal((await saleAction(salesman, "preview", saleChanges)).status, 403);
const saleApply = await saleAction(owner, "apply", saleChanges, {
  password, reason: "Phase 8 Sale correction", versionToken: salePreview.body.preview.versionToken,
  requestId: randomUUID(),
});
assert.equal(saleApply.status, 200, JSON.stringify(saleApply.body));
const correctedSale = await result(admin.from("sales").select("id,net_sales,total_cogs").eq("id", saleId).single(), "corrected Sale");
assert.equal(correctedSale.id, saleId);
assert.equal(Number(correctedSale.net_sales), 120);
assert.equal(Number(correctedSale.total_cogs), 80);
assert.equal((await result(admin.from("transaction_corrections").select("id").eq("transaction_id", saleId), "Sale history")).length, 1);

const paymentId = randomUUID();
await result(admin.from("payments").insert({
  id: paymentId, organization_id: orgId, payment_number: `PAY-P8-${suffix}`,
  customer_id: customerId, salesman_user_id: secondSalesman.id, payment_date: transferDate,
  amount: 40, method: "cash", verification_status: "not_required",
  client_request_id: randomUUID(), created_by: owner.id,
}), "synthetic Payment");
await result(admin.from("payment_allocations").insert({
  payment_id: paymentId, sale_id: saleId, amount: 40,
}), "synthetic Payment allocation");
const paymentChanges = {
  paymentDate: transferDate, customerId, amount: 50, method: "gcash",
  referenceNumber: `GC-P8-${suffix}`, bankName: "", notes: "Corrected Payment",
  allocationMode: "fifo", allocations: [],
};
const paymentAction = (actor, action, changes, extras = {}) => postFunction(
  "admin-payment-correction", actor,
  { action, organizationId: orgId, paymentId, changes, ...extras },
);
const paymentPreview = await paymentAction(owner, "preview", paymentChanges);
assert.equal(paymentPreview.status, 200, JSON.stringify(paymentPreview.body));
assert.equal(paymentPreview.body.preview.eligible, true, JSON.stringify(paymentPreview.body.preview.blockedReasons));
assert.equal((await paymentAction(salesman, "preview", paymentChanges)).status, 403);
const paymentApply = await paymentAction(owner, "apply", paymentChanges, {
  password, reason: "Phase 8 Payment correction", versionToken: paymentPreview.body.preview.versionToken,
  requestId: randomUUID(),
});
assert.equal(paymentApply.status, 200, JSON.stringify(paymentApply.body));
const correctedPayment = await result(admin.from("payments").select("id,amount,method,reference_number").eq("id", paymentId).single(), "corrected Payment");
assert.equal(correctedPayment.id, paymentId);
assert.equal(Number(correctedPayment.amount), 50);
assert.equal(correctedPayment.method, "gcash");
const allocations = await result(admin.from("payment_allocations").select("amount").eq("payment_id", paymentId), "corrected allocations");
assert.equal(allocations.reduce((sum, row) => sum + Number(row.amount), 0), 50);
const balance = await result(admin.from("customer_balances").select("outstanding_balance").eq("customer_id", customerId).single(), "Customer balance");
assert.equal(Number(balance.outstanding_balance), 70);
assert.equal((await result(admin.from("transaction_corrections").select("id").eq("transaction_id", paymentId), "Payment history")).length, 1);

const financeCustomerId = randomUUID();
await result(admin.from("customers").insert({
  id: financeCustomerId, organization_id: orgId, name: `Phase 8 Finance ${suffix}`,
}), "Finance Customer");
await result(admin.from("payments").insert({
  organization_id: orgId, payment_number: `PAY-P8-CASH-${suffix}`,
  customer_id: financeCustomerId, salesman_user_id: salesman.id, payment_date: transferDate,
  amount: 100, method: "cash", verification_status: "not_required",
  client_request_id: randomUUID(), created_by: owner.id,
}), "synthetic cash collection");
const expenseId = randomUUID();
await result(admin.from("expenses").insert({
  id: expenseId, organization_id: orgId, salesman_user_id: salesman.id,
  expense_date: transferDate, category: "Fuel", amount: 20,
  payment_source: "cash_collection", approval_status: "approved",
  created_by: owner.id, client_request_id: randomUUID(),
}), "synthetic Expense");
const dcrId = randomUUID();
await result(admin.from("daily_cash_reports").insert({
  id: dcrId, organization_id: orgId, salesman_user_id: salesman.id,
  report_date: transferDate, status: "locked", cash_collected: 100,
  gcash_collected: 0, bank_collected: 0, cash_paid_expenses: 20,
  expected_cash_remittance: 80, actual_cash_remittance: 80, difference: 0,
  source_snapshot: { cash: 100, gcash: 0, bank: 0, cash_paid_expenses: 20 },
  client_request_id: randomUUID(), locked_at: new Date().toISOString(),
}), "synthetic locked DCR");
const financeAction = (actor, module, action, transactionId, changes, extras = {}) => postFunction(
  "admin-finance-correction", actor,
  { module, action, organizationId: orgId, transactionId, changes, ...extras },
);
const expenseChanges = {
  expenseDate: transferDate, salesmanUserId: salesman.id,
  category: "Fuel", amount: 25, description: "Corrected fuel receipt",
  approvalStatus: "approved",
};
const expensePreview = await financeAction(owner, "expense", "preview", expenseId, expenseChanges);
assert.equal(expensePreview.status, 200, JSON.stringify(expensePreview.body));
assert.equal(expensePreview.body.preview.eligible, true, JSON.stringify(expensePreview.body.preview.blockedReasons));
assert.equal((await financeAction(salesman, "expense", "preview", expenseId, expenseChanges)).status, 403);
const expenseApply = await financeAction(owner, "expense", "apply", expenseId, expenseChanges, {
  password, reason: "Phase 8 Expense correction", versionToken: expensePreview.body.preview.versionToken,
  requestId: randomUUID(),
});
assert.equal(expenseApply.status, 200, JSON.stringify(expenseApply.body));
const correctedExpense = await result(admin.from("expenses").select("id,amount").eq("id", expenseId).single(), "corrected Expense");
assert.equal(Number(correctedExpense.amount), 25);
const originalDcr = await result(admin.from("daily_cash_reports").select("expected_cash_remittance").eq("id", dcrId).single(), "original DCR");
assert.equal(Number(originalDcr.expected_cash_remittance), 80);
assert.equal((await result(admin.from("dcr_amendments").select("id").eq("dcr_id", dcrId), "linked DCR amendment")).length, 1);
assert.equal((await result(admin.from("transaction_corrections").select("id").eq("transaction_id", expenseId), "Expense history")).length, 1);

const dcrChanges = {
  actualCashRemittance: 75, explanation: "Reconciled corrected fuel receipt",
  reconciliationNotes: "Reviewed cash slip",
};
const dcrPreview = await financeAction(owner, "dcr", "preview", dcrId, dcrChanges);
assert.equal(dcrPreview.status, 200, JSON.stringify(dcrPreview.body));
assert.equal(dcrPreview.body.preview.eligible, true, JSON.stringify(dcrPreview.body.preview.blockedReasons));
assert.equal((await financeAction(salesman, "dcr", "preview", dcrId, dcrChanges)).status, 403);
const dcrApply = await financeAction(owner, "dcr", "apply", dcrId, dcrChanges, {
  password, reason: "Phase 8 DCR amendment", versionToken: dcrPreview.body.preview.versionToken,
  requestId: randomUUID(),
});
assert.equal(dcrApply.status, 200, JSON.stringify(dcrApply.body));
assert.equal((await result(admin.from("dcr_amendments").select("id").eq("dcr_id", dcrId), "DCR amendment history")).length, 2);
assert.equal((await result(admin.from("transaction_corrections").select("id").eq("transaction_id", dcrId), "DCR edit history")).length, 2);
const concurrentDcrChanges = {
  actualCashRemittance: 74, explanation: "Second cash slip review",
  reconciliationNotes: "Two Admin race check",
};
const concurrentDcrPreview = await financeAction(owner, "dcr", "preview", dcrId, concurrentDcrChanges);
assert.equal(concurrentDcrPreview.status, 200, JSON.stringify(concurrentDcrPreview.body));
assert.equal(concurrentDcrPreview.body.preview.eligible, true);
const dcrRace = await withRowLockBarrier("daily_cash_reports", dcrId, "Two DCR amendments", [owner, coOwner].map((actor) => () => financeAction(
  actor, "dcr", "apply", dcrId, concurrentDcrChanges,
  { password, reason: "Phase 8 concurrent DCR check", versionToken: concurrentDcrPreview.body.preview.versionToken, requestId: randomUUID() },
)));
assert.deepEqual(dcrRace.map((item) => item.status).sort(), [200, 409], JSON.stringify(dcrRace));
assert.equal((await result(admin.from("dcr_amendments").select("id").eq("dcr_id", dcrId), "post-race DCR amendments")).length, 3);
assert.equal((await result(admin.from("transaction_corrections").select("id").eq("transaction_id", dcrId), "post-race DCR history")).length, 3);
assert.equal(Number((await result(admin.from("daily_cash_reports").select("actual_cash_remittance").eq("id", dcrId).single(), "locked DCR after race")).actual_cash_remittance), 80);

const operationsAction = (actor, module, kind, action, transactionId, changes, extras = {}) => postFunction(
  "admin-operations-correction", actor,
  { module, kind, action, organizationId: orgId, transactionId, changes, ...extras },
);
async function correctOperation(actor, module, kind, transactionId, changes, reason) {
  const preview = await operationsAction(actor, module, kind, "preview", transactionId, changes);
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.preview.eligible, true, JSON.stringify(preview.body.preview.blockedReasons));
  const applied = await operationsAction(actor, module, kind, "apply", transactionId, changes, {
    password, reason, versionToken: preview.body.preview.versionToken, requestId: randomUUID(),
  });
  assert.equal(applied.status, 200, JSON.stringify(applied.body));
  return applied.body.correction;
}

const dtrId = randomUUID();
await result(admin.from("time_entries").insert({
  id: dtrId, organization_id: orgId, user_id: salesman.id,
  work_date: "2026-01-05", time_in: "08:00", time_out: "17:00", break_minutes: 60,
}), "synthetic DTR");
const periodId = randomUUID();
const payrollId = randomUUID();
await result(admin.from("payroll_periods").insert({
  id: periodId, organization_id: orgId, period_start: "2026-01-01", period_end: "2026-01-15",
  status: "draft", created_by: owner.id,
}), "synthetic payroll period");
await result(admin.from("payroll_entries").insert({
  id: payrollId, payroll_period_id: periodId, user_id: salesman.id,
  hourly_rate: 100, overtime_rate: 125, base_pay: 800, regular_minutes: 480,
  overtime_minutes: 0, overtime_pay: 0, allowances: 0, deductions: 0,
  gross_pay: 800, net_pay: 800,
}), "synthetic payroll entry");
const dtrChanges = {
  workDate: "2026-01-05", timeIn: "09:00", timeOut: "17:00",
  breakMinutes: 60, attendanceStatus: "late", attendanceNotes: "QA shift",
};
assert.equal((await operationsAction(salesman, "dtr", "entry", "preview", dtrId, dtrChanges)).status, 403);
await correctOperation(owner, "dtr", "entry", dtrId, dtrChanges, "Phase 8 DTR correction");
const correctedDtr = await result(admin.from("time_entries").select("id,total_minutes").eq("id", dtrId).single(), "corrected DTR");
assert.equal(correctedDtr.id, dtrId);
assert.equal(Number(correctedDtr.total_minutes), 420);
const afterDtrPayroll = await result(admin.from("payroll_entries").select("base_pay").eq("id", payrollId).single(), "DTR payroll recalculation");
assert.equal(Number(afterDtrPayroll.base_pay), 700);

const payrollChanges = {
  hourlyRate: 120, overtimeHours: 0, overtimeRate: 125,
  allowances: 0, deductions: 0, notes: "QA rate",
};
assert.equal((await operationsAction(salesman, "payroll", "entry", "preview", payrollId, payrollChanges)).status, 403);
await correctOperation(owner, "payroll", "entry", payrollId, payrollChanges, "Phase 8 draft Payroll correction");
const correctedPayroll = await result(admin.from("payroll_entries").select("id,net_pay").eq("id", payrollId).single(), "corrected draft Payroll");
assert.equal(correctedPayroll.id, payrollId);
assert.equal(Number(correctedPayroll.net_pay), 840);
await correctOperation(owner, "payroll", "period", periodId, { status: "reviewed" }, "Phase 8 review Payroll");
await correctOperation(owner, "payroll", "adjustment", payrollId,
  { grossDelta: 25, netDelta: 25, notes: "QA supplement" }, "Phase 8 reviewed Payroll adjustment");
const reviewedRequest = await result(admin.from("payroll_adjustment_requests").select("id").eq("payroll_entry_id", payrollId).eq("period_status", "reviewed").single(), "reviewed adjustment request");
await correctOperation(owner, "payroll", "approval", reviewedRequest.id, {}, "Phase 8 reviewed adjustment approval");
await correctOperation(owner, "payroll", "period", periodId, { status: "paid" }, "Phase 8 mark Payroll paid");
await correctOperation(owner, "payroll", "adjustment", payrollId,
  { grossDelta: 15, netDelta: 15, notes: "Paid supplement" }, "Phase 8 paid Payroll adjustment");
const paidRequest = await result(admin.from("payroll_adjustment_requests").select("id").eq("payroll_entry_id", payrollId).eq("period_status", "paid").single(), "paid adjustment request");
const paidApprovalPreview = await operationsAction(owner, "payroll", "approval", "preview", paidRequest.id, {});
assert.equal(paidApprovalPreview.status, 200);
const selfApproval = await operationsAction(owner, "payroll", "approval", "apply", paidRequest.id, {}, {
  password, reason: "Phase 8 self approval denied", versionToken: paidApprovalPreview.body.preview.versionToken,
  requestId: randomUUID(),
});
assert.equal(selfApproval.status, 403, JSON.stringify(selfApproval.body));
await correctOperation(coOwner, "payroll", "approval", paidRequest.id, {}, "Phase 8 second Admin approval");
assert.equal((await result(admin.from("payroll_adjustment_approvals").select("id"), "adjustment approvals")).filter(Boolean).length >= 2, true);
const paidPayroll = await result(admin.from("payroll_entries").select("net_pay").eq("id", payrollId).single(), "immutable paid Payroll");
assert.equal(Number(paidPayroll.net_pay), 840);
await correctOperation(owner, "payroll", "adjustment", payrollId,
  { grossDelta: 7, netDelta: 7, notes: "Concurrent approval candidate" }, "Phase 8 concurrent Payroll request");
const paidRequests = await result(admin.from("payroll_adjustment_requests").select("id").eq("payroll_entry_id", payrollId).eq("period_status", "paid"), "paid Payroll requests");
const pendingRequest = paidRequests.find((request) => request.id !== paidRequest.id);
assert(pendingRequest);
const approvalRacePreview = await operationsAction(coOwner, "payroll", "approval", "preview", pendingRequest.id, {});
const adjustmentRaceChanges = { grossDelta: 8, netDelta: 8, notes: "Concurrent adjustment" };
const adjustmentRacePreview = await operationsAction(owner, "payroll", "adjustment", "preview", payrollId, adjustmentRaceChanges);
assert.equal(approvalRacePreview.body.preview.eligible, true, JSON.stringify(approvalRacePreview.body));
assert.equal(adjustmentRacePreview.body.preview.eligible, true, JSON.stringify(adjustmentRacePreview.body));
const payrollRace = await withRowLockBarrier("payroll_periods", periodId, "Payroll approval / adjustment", [
  () => operationsAction(coOwner, "payroll", "approval", "apply", pendingRequest.id, {}, {
    password, reason: "Phase 8 concurrent Payroll approval",
    versionToken: approvalRacePreview.body.preview.versionToken, requestId: randomUUID(),
  }),
  () => operationsAction(owner, "payroll", "adjustment", "apply", payrollId, adjustmentRaceChanges, {
    password, reason: "Phase 8 concurrent Payroll adjustment",
    versionToken: adjustmentRacePreview.body.preview.versionToken, requestId: randomUUID(),
  }),
]);
assert(payrollRace.every((item) => [200, 409].includes(item.status)), JSON.stringify(payrollRace));
assert(payrollRace.some((item) => item.status === 200), JSON.stringify(payrollRace));
const pendingApprovalRows = await result(admin.from("payroll_adjustment_approvals").select("id").eq("adjustment_id", pendingRequest.id), "concurrent Payroll approval rows");
assert.equal(pendingApprovalRows.length, payrollRace[0].status === 200 ? 1 : 0);
const immutablePaidPayroll = await result(admin.from("payroll_entries").select("net_pay").eq("id", payrollId).single(), "paid Payroll after race");
assert.equal(Number(immutablePaidPayroll.net_pay), 840);

const truckId = randomUUID();
await result(admin.from("trucks").insert({
  id: truckId, organization_id: orgId, unit_name: `QA Truck ${suffix}`,
  plate_number: `QA-${suffix}`, make_model: "Test Unit", current_mileage: 1000,
}), "synthetic Truck");
await result(admin.from("truck_maintenance").insert({
  truck_id: truckId, maintenance_type: "Oil Change", service_date: "2026-01-11",
  mileage: 1100, created_by: owner.id,
}), "synthetic maintenance");
const truckChanges = {
  unitName: `QA Truck ${suffix}`, plateNumber: `QA-${suffix}`,
  makeModel: "Test Unit", mileage: 1200, ltoExpiry: null, active: true,
};
assert.equal((await operationsAction(salesman, "truck", "truck", "preview", truckId, truckChanges)).status, 403);
await correctOperation(owner, "truck", "truck", truckId, truckChanges, "Phase 8 Truck correction");
const correctedTruck = await result(admin.from("trucks").select("id,current_mileage").eq("id", truckId).single(), "corrected Truck");
assert.equal(correctedTruck.id, truckId);
assert.equal(Number(correctedTruck.current_mileage), 1200);
for (const [module, id] of [["dtr", dtrId], ["payroll", payrollId], ["truck", truckId]]) {
  assert((await result(admin.from("transaction_corrections").select("id").eq("module", module).eq("transaction_id", id), `${module} history`)).length > 0);
}

const raceTripId = randomUUID();
const raceLineId = randomUUID();
const raceLotId = randomUUID();
const raceReference = `P8-RACE-${suffix}`;
await result(admin.from("stock_trips").insert({
  id: raceTripId, organization_id: orgId, plant_id: plantId, trip_number: `ST-RACE-${suffix}`,
  trip_date: "2026-01-01", reference_number: raceReference, status: "received",
  client_request_id: randomUUID(), created_by: owner.id,
}), "race Trip");
await result(admin.from("stock_trip_lines").insert({
  id: raceLineId, stock_trip_id: raceTripId, plant_product_id: plantProductId,
  quantity_kg: 20, acquisition_type: "purchased", cost_per_kg: 40,
}), "race Trip line");
await result(admin.from("inventory_lots").insert({
  id: raceLotId, organization_id: orgId, stock_trip_line_id: raceLineId,
  plant_id: plantId, product_id: productId, cost_per_kg: 40, original_quantity_kg: 20,
}), "race lot");
await result(admin.from("inventory_movements").insert({
  organization_id: orgId, inventory_lot_id: raceLotId, movement_type: "stock_in", quantity_kg: 20,
  from_location_type: "plant", to_location_type: "warehouse", reference_type: "stock_trip",
  reference_id: raceTripId, reference_line_id: raceLineId,
  effective_date: "2026-01-01", created_by: owner.id,
}), "race stock-in movement");
const raceStockChanges = {
  tripDate: "2026-01-01", reference: raceReference, notes: "Race stock correction",
  lines: [{ id: raceLineId, quantityKg: 15, costPerKg: 40, bags: null, headCount: null }],
};
const raceStockPreview = await edge(owner, "preview", raceStockChanges, { tripId: raceTripId });
assert.equal(raceStockPreview.status, 200, JSON.stringify(raceStockPreview.body));
assert.equal(raceStockPreview.body.preview.eligible, true, JSON.stringify(raceStockPreview.body.preview.blockedReasons));
const receivingRequestId = randomUUID();
const [raceStockApply, receivingResult] = await withRowLockBarrier("inventory_lots", raceLotId, "Stock In correction / Warehouse transfer", [
  () => edge(owner, "apply", raceStockChanges, {
    tripId: raceTripId, password, reason: "Phase 8 stock transfer race",
    versionToken: raceStockPreview.body.preview.versionToken, requestId: randomUUID(),
  }),
  () => owner.client.rpc("transfer_warehouse_to_salesman", {
    p_organization_id: orgId, p_salesman_user_id: salesman.id, p_effective_date: transferDate,
    p_lines: [{ inventory_lot_id: raceLotId, quantity_kg: 10 }],
    p_client_request_id: receivingRequestId, p_notes: "Race receiving",
  }),
]);
assert.equal(receivingResult.error, null, JSON.stringify(receivingResult.error));
assert([200, 409].includes(raceStockApply.status), JSON.stringify(raceStockApply));
const raceLot = await result(admin.from("inventory_lots").select("original_quantity_kg").eq("id", raceLotId).single(), "race lot balance");
const raceMovements = await result(admin.from("inventory_movements").select("quantity_kg,from_location_type,to_location_type").eq("inventory_lot_id", raceLotId), "race movements");
const warehouseKg = raceMovements.reduce((sum, movement) => sum
  + (movement.to_location_type === "warehouse" ? Number(movement.quantity_kg) : 0)
  - (movement.from_location_type === "warehouse" ? Number(movement.quantity_kg) : 0), 0);
assert.equal(warehouseKg, Number(raceLot.original_quantity_kg) - 10);
assert(warehouseKg >= 0);
assert.equal((await result(admin.from("transaction_corrections").select("id").eq("transaction_id", raceTripId), "race Stock In history")).length,
  raceStockApply.status === 200 ? 1 : 0);

const raceReceiptId = receivingResult.data.id;
const raceReceiptLine = await result(admin.from("receiving_receipt_lines").select("id").eq("receipt_id", raceReceiptId).single(), "race RR line");
const raceRrChanges = {
  effectiveDate: transferDate, toSalesmanId: salesman.id,
  lotId: raceLotId, quantityKg: 8, notes: "Race receiving correction",
};
const raceRrPreview = await transfer(owner, "warehouse_transfer", "preview", raceReceiptId, raceRrChanges);
assert.equal(raceRrPreview.status, 200, JSON.stringify(raceRrPreview.body));
assert.equal(raceRrPreview.body.preview.eligible, true, JSON.stringify(raceRrPreview.body.preview.blockedReasons));
const [raceRrApply, raceSale] = await withRowLockBarrier("inventory_lots", raceLotId, "RR correction / Sale", [
  () => transfer(owner, "warehouse_transfer", "apply", raceReceiptId, raceRrChanges, {
    password, reason: "Phase 8 transfer Sale race",
    versionToken: raceRrPreview.body.preview.versionToken, requestId: randomUUID(),
  }),
  () => owner.client.rpc("create_sale", {
    p_organization_id: orgId, p_customer_id: customerId, p_salesman_user_id: salesman.id,
    p_sale_date: transferDate, p_trust_receipt_number: `TR-RACE-${suffix}`,
    p_lines: [{ inventory_lot_id: raceLotId, quantity_kg: 6, selling_price_per_kg: 50 }],
    p_client_request_id: randomUUID(),
  }),
]);
assert.equal(raceSale.error, null, JSON.stringify(raceSale.error));
assert([200, 409].includes(raceRrApply.status), JSON.stringify(raceRrApply));
const correctedRaceRr = await result(admin.from("receiving_receipt_lines").select("quantity_kg").eq("id", raceReceiptLine.id).single(), "race RR custody");
const custodyMovements = await result(admin.from("inventory_movements").select("quantity_kg,from_location_type,from_salesman_user_id,to_location_type,to_salesman_user_id").eq("inventory_lot_id", raceLotId), "race custody movements");
const salesmanKg = custodyMovements.reduce((sum, movement) => sum
  + (movement.to_location_type === "salesman" && movement.to_salesman_user_id === salesman.id ? Number(movement.quantity_kg) : 0)
  - (movement.from_location_type === "salesman" && movement.from_salesman_user_id === salesman.id ? Number(movement.quantity_kg) : 0), 0);
assert.equal(salesmanKg, Number(correctedRaceRr.quantity_kg) - 6);
assert(salesmanKg >= 0);
assert.equal((await result(admin.from("transaction_corrections").select("id").eq("transaction_id", raceReceiptId), "race RR history")).length,
  raceRrApply.status === 200 ? 1 : 0);

const salePaymentRace = await result(owner.client.rpc("create_sale", {
  p_organization_id: orgId, p_customer_id: customerId, p_salesman_user_id: secondSalesman.id,
  p_sale_date: transferDate, p_trust_receipt_number: `TR-PAY-RACE-${suffix}`,
  p_lines: [{ inventory_lot_id: secondLotId, quantity_kg: 1, selling_price_per_kg: 50 }],
  p_client_request_id: randomUUID(),
}), "Sale for Payment race");
const salePaymentRaceId = salePaymentRace.id;
const salePaymentLine = await result(admin.from("sale_lines").select("id").eq("sale_id", salePaymentRaceId).single(), "Sale/Payment race line");
const salePaymentChanges = {
  saleDate: transferDate, customerId, trustReceiptNumber: `TR-PAY-C-${suffix}`,
  salesDeductions: 0, notes: "Concurrent Payment check",
  lines: [{ id: salePaymentLine.id, lotId: secondLotId, quantityKg: 1, pricePerKg: 50 }],
};
const salePaymentPreview = await saleAction(owner, "preview", salePaymentChanges, { saleId: salePaymentRaceId });
assert.equal(salePaymentPreview.status, 200, JSON.stringify(salePaymentPreview.body));
assert.equal(salePaymentPreview.body.preview.eligible, true, JSON.stringify(salePaymentPreview.body.preview.blockedReasons));
const [salePaymentCorrection, concurrentCollection] = await withRowLockBarrier("sales", salePaymentRaceId, "Sale correction / Payment", [
  () => saleAction(owner, "apply", salePaymentChanges, {
    saleId: salePaymentRaceId, password, reason: "Phase 8 Sale Payment race",
    versionToken: salePaymentPreview.body.preview.versionToken, requestId: randomUUID(),
  }),
  () => owner.client.rpc("record_payment", {
    p_organization_id: orgId, p_customer_id: customerId, p_payment_date: transferDate,
    p_amount: 20, p_method: "cash", p_client_request_id: randomUUID(),
    p_salesman_user_id: secondSalesman.id, p_target_sale_id: salePaymentRaceId,
  }),
]);
assert.equal(concurrentCollection.error, null, JSON.stringify(concurrentCollection.error));
assert([200, 409].includes(salePaymentCorrection.status), JSON.stringify(salePaymentCorrection));
const concurrentSale = await result(admin.from("sales").select("net_sales").eq("id", salePaymentRaceId).single(), "Sale after Payment race");
const concurrentAllocations = await result(admin.from("payment_allocations").select("amount").eq("sale_id", salePaymentRaceId), "Payment after Sale race");
assert.equal(Number(concurrentSale.net_sales), 50);
assert.equal(concurrentAllocations.reduce((sum, row) => sum + Number(row.amount), 0), 20);
assert.equal((await result(admin.from("transaction_corrections").select("id").eq("transaction_id", salePaymentRaceId), "Sale Payment race history")).length,
  salePaymentCorrection.status === 200 ? 1 : 0);

const paymentRaceChanges = { ...paymentChanges, amount: 60, notes: "Concurrent allocation check" };
const paymentRacePreview = await paymentAction(owner, "preview", paymentRaceChanges);
assert.equal(paymentRacePreview.status, 200, JSON.stringify(paymentRacePreview.body));
assert.equal(paymentRacePreview.body.preview.eligible, true, JSON.stringify(paymentRacePreview.body.preview.blockedReasons));
const [paymentCorrectionRace, allocationRace] = await withRowLockBarrier("sales", saleId, "Payment reallocation / Payment", [
  () => paymentAction(owner, "apply", paymentRaceChanges, {
    password, reason: "Phase 8 Payment allocation race",
    versionToken: paymentRacePreview.body.preview.versionToken, requestId: randomUUID(),
  }),
  () => owner.client.rpc("record_payment", {
    p_organization_id: orgId, p_customer_id: customerId, p_payment_date: transferDate,
    p_amount: 70, p_method: "cash", p_client_request_id: randomUUID(),
    p_salesman_user_id: secondSalesman.id, p_target_sale_id: saleId,
  }),
]);
assert.equal(Number(paymentCorrectionRace.status === 200) + Number(!allocationRace.error), 1,
  JSON.stringify({ paymentCorrectionRace, allocationError: allocationRace.error }));
const finalSaleAllocations = await result(admin.from("payment_allocations").select("amount").eq("sale_id", saleId), "final Sale allocations");
const totalAllocated = finalSaleAllocations.reduce((sum, row) => sum + Number(row.amount), 0);
assert(totalAllocated <= 120 && totalAllocated >= 0);
const finalPaymentAmount = await result(admin.from("payments").select("amount").eq("id", paymentId).single(), "post-race Payment");
assert.equal(Number(finalPaymentAmount.amount), paymentCorrectionRace.status === 200 ? 60 : 50);
assert.equal((await result(admin.from("transaction_corrections").select("id").eq("transaction_id", paymentId), "post-race Payment history")).length,
  paymentCorrectionRace.status === 200 ? 2 : 1);

const reallocationCustomerId = randomUUID();
const reallocationPaymentId = randomUUID();
const reallocationSaleIds = [randomUUID(), randomUUID(), randomUUID()];
await result(admin.from("customers").insert({
  id: reallocationCustomerId, organization_id: orgId, name: `Phase 8 Reallocation ${suffix}`,
}), "reallocation Customer");
await result(admin.from("sales").insert(reallocationSaleIds.map((id, index) => ({
  id, organization_id: orgId, trust_receipt_number: `TR-REALLOC-${suffix}-${index}`,
  customer_id: reallocationCustomerId, salesman_user_id: secondSalesman.id,
  sale_date: transferDate, subtotal: 100, gross_sales: 100, net_sales: 100, total_cogs: 0,
  client_request_id: randomUUID(), created_by: owner.id,
}))), "synthetic reallocation Sales");
await result(admin.from("payments").insert({
  id: reallocationPaymentId, organization_id: orgId, payment_number: `PAY-REALLOC-${suffix}`,
  customer_id: reallocationCustomerId, salesman_user_id: secondSalesman.id,
  payment_date: transferDate, amount: 20, method: "cash", verification_status: "not_required",
  client_request_id: randomUUID(), created_by: owner.id,
}), "reallocation Payment");
await result(admin.from("payment_allocations").insert({
  payment_id: reallocationPaymentId, sale_id: reallocationSaleIds[0], amount: 20,
}), "original reallocation target");
const reallocationChanges = reallocationSaleIds.slice(1).map((saleId, index) => ({
  paymentDate: transferDate, customerId: reallocationCustomerId, amount: 20,
  method: "cash", referenceNumber: "", bankName: "", notes: `Competing allocation ${index}`,
  allocationMode: "manual", allocations: [{ saleId, amount: 20 }],
}));
const reallocationPreviews = await Promise.all(reallocationChanges.map((changes) =>
  paymentAction(owner, "preview", changes, { paymentId: reallocationPaymentId })));
for (const preview of reallocationPreviews) {
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.preview.eligible, true, JSON.stringify(preview.body.preview.blockedReasons));
}
const reallocationResults = await withRowLockBarrier("payments", reallocationPaymentId, "Two competing Payment reallocations", [
  () => paymentAction(owner, "apply", reallocationChanges[0], {
    paymentId: reallocationPaymentId, password, reason: "Phase 8 first reallocation",
    versionToken: reallocationPreviews[0].body.preview.versionToken, requestId: randomUUID(),
  }),
  () => paymentAction(coOwner, "apply", reallocationChanges[1], {
    paymentId: reallocationPaymentId, password, reason: "Phase 8 second reallocation",
    versionToken: reallocationPreviews[1].body.preview.versionToken, requestId: randomUUID(),
  }),
]);
assert.deepEqual(reallocationResults.map((item) => item.status).sort(), [200, 409], JSON.stringify(reallocationResults));
const winningSaleId = reallocationSaleIds[reallocationResults[0].status === 200 ? 1 : 2];
const finalReallocation = await result(admin.from("payment_allocations").select("sale_id,amount")
  .eq("payment_id", reallocationPaymentId), "final reallocation");
assert.deepEqual(finalReallocation.map((item) => ({ sale_id: item.sale_id, amount: Number(item.amount) })),
  [{ sale_id: winningSaleId, amount: 20 }]);
assert.equal((await result(admin.from("transaction_corrections").select("id")
  .eq("transaction_id", reallocationPaymentId), "reallocation history")).length, 1);
const reallocationBalances = await result(admin.from("sales").select("id,net_sales")
  .in("id", reallocationSaleIds), "reallocation Sale totals");
assert(reallocationBalances.every((sale) => Number(sale.net_sales) === 100));

console.log("All ten module E2Es and eight controlled lock-barrier races passed locally with reconciled balances.");
