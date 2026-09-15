import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const organizationId = process.env.HOSTED_QA_ORGANIZATION_ID;
const credentials = {
  owner: [process.env.HOSTED_QA_OWNER_EMAIL, process.env.HOSTED_QA_OWNER_PASSWORD],
  warehouse: [process.env.HOSTED_QA_WAREHOUSE_EMAIL, process.env.HOSTED_QA_WAREHOUSE_PASSWORD],
  salesmanA: [process.env.HOSTED_QA_SALESMAN_A_EMAIL, process.env.HOSTED_QA_SALESMAN_A_PASSWORD],
  salesmanB: [process.env.HOSTED_QA_SALESMAN_B_EMAIL, process.env.HOSTED_QA_SALESMAN_B_PASSWORD],
};

function localEnvironment() {
  return Object.fromEntries(readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    }));
}

const local = localEnvironment();
const url = local.VITE_SUPABASE_URL;
const anonKey = local.VITE_SUPABASE_ANON_KEY;
assert.ok(url && anonKey && organizationId, "Hosted QA configuration is required");
for (const [role, pair] of Object.entries(credentials)) assert.ok(pair.every(Boolean), `${role} QA credentials are required`);

async function login(role) {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: credentials[role][0], password: credentials[role][1] });
  assert.ifError(error);
  assert.ok(data.user?.id, `${role} signed in`);
  return { client, userId: data.user.id };
}

function rows(result, label) {
  assert.ifError(result.error);
  return result.data || [];
}

function denied(result, label) {
  assert.ok(result.error || (result.data || []).length === 0, `${label} must be denied by RLS`);
}

function expectedError(result, pattern, label) {
  assert.ok(result.error, `${label} must fail`);
  assert.match(result.error.message, pattern, label);
}

const owner = await login("owner");
const plants = rows(await owner.client.from("plants").select("id, name").eq("organization_id", organizationId), "owner plants");
assert.ok(plants.length > 0, "owner can view Plant configuration");
const customer = rows(await owner.client.from("customers").select("id").eq("organization_id", organizationId).eq("name", "Parity Two Bistro"), "acceptance customer")[0];
assert.ok(customer, "acceptance customer exists");

const warehouse = await login("warehouse");
assert.ok(rows(await warehouse.client.from("warehouse_stock_summary").select("inventory_lot_id, available_quantity_kg").eq("organization_id", organizationId), "warehouse stock").length > 0, "warehouse can view Warehouse stock");
denied(await warehouse.client.from("plants").update({ name: plants[0].name }).eq("id", plants[0].id).select("id"), "warehouse Plant configuration update");
assert.equal(rows(await warehouse.client.from("payroll_entries").select("id"), "warehouse payroll").length, 0, "warehouse cannot read payroll entries");
expectedError(await warehouse.client.rpc("create_stock_trip", {
  p_organization_id: organizationId,
  p_plant_id: plants[0].id,
  p_trip_date: new Date().toISOString().slice(0, 10),
  p_lines: [],
  p_client_request_id: crypto.randomUUID(),
  p_reference_number: "WAREHOUSE-DENIED",
  p_delivery_note: null,
  p_notes: null,
}), /owner|authorized/i, "warehouse Stock In");
expectedError(await warehouse.client.rpc("record_payment", {
  p_organization_id: organizationId,
  p_customer_id: customer.id,
  p_payment_date: new Date().toISOString().slice(0, 10),
  p_amount: 1,
  p_method: "cash",
  p_client_request_id: crypto.randomUUID(),
  p_salesman_user_id: null,
  p_reference_number: null,
  p_notes: "Expected Warehouse rejection",
  p_target_sale_id: null,
}), /authorized/i, "warehouse customer Payment");

const salesmanA = await login("salesmanA");
const salesmanB = await login("salesmanB");
const ownStock = rows(await salesmanA.client.from("salesman_stock_summary").select("inventory_lot_id, salesman_user_id, available_quantity_kg").eq("organization_id", organizationId), "salesman own stock");
assert.ok(ownStock.length > 0 && ownStock.every((row) => row.salesman_user_id === salesmanA.userId), "salesman sees only own assigned stock");
assert.equal(rows(await salesmanA.client.from("salesman_stock_summary").select("inventory_lot_id").eq("organization_id", organizationId).eq("salesman_user_id", salesmanB.userId), "other salesman stock").length, 0, "other salesman stock is hidden");
denied(await salesmanA.client.from("plants").update({ name: plants[0].name }).eq("id", plants[0].id).select("id"), "salesman Plant configuration update");

const sale = rows(await salesmanA.client.from("sales").select("id, customer_id, salesman_user_id, sale_date, trust_receipt_number, client_request_id").eq("organization_id", organizationId).eq("trust_receipt_number", "PARITY2-TR-002"), "sale replay source")[0];
const saleLine = rows(await salesmanA.client.from("sale_lines").select("inventory_lot_id, quantity_kg, selling_price_per_kg").eq("sale_id", sale.id), "sale replay line")[0];
const saleArgs = {
  p_organization_id: organizationId,
  p_customer_id: sale.customer_id,
  p_salesman_user_id: salesmanA.userId,
  p_sale_date: sale.sale_date,
  p_trust_receipt_number: sale.trust_receipt_number,
  p_lines: [{ inventory_lot_id: saleLine.inventory_lot_id, quantity_kg: Number(saleLine.quantity_kg), selling_price_per_kg: Number(saleLine.selling_price_per_kg) }],
  p_client_request_id: sale.client_request_id,
  p_sales_deductions: 0,
  p_notes: null,
  p_initial_payment: null,
};
const replay = await salesmanA.client.rpc("create_sale", saleArgs);
assert.ifError(replay.error);
assert.equal(replay.data.idempotent_replay, true, "double-submitted sale is idempotent");

expectedError(await salesmanA.client.rpc("create_sale", { ...saleArgs, p_client_request_id: crypto.randomUUID() }), /duplicate|trust receipt|unique/i, "duplicate Trust Receipt");
expectedError(await salesmanA.client.rpc("create_sale", { ...saleArgs, p_trust_receipt_number: `QA-INSUFFICIENT-${Date.now()}`, p_client_request_id: crypto.randomUUID(), p_lines: [{ ...saleArgs.p_lines[0], quantity_kg: 999 }] }), /insufficient salesman stock/i, "insufficient salesman stock");
expectedError(await salesmanA.client.rpc("create_sale", { ...saleArgs, p_trust_receipt_number: `QA-OTHER-${Date.now()}`, p_client_request_id: crypto.randomUUID(), p_salesman_user_id: salesmanB.userId }), /not authorized/i, "selling another salesman's stock");

const movementPayload = {
  organization_id: organizationId,
  inventory_lot_id: saleLine.inventory_lot_id,
  movement_type: "salesman_to_salesman",
  quantity_kg: 0.001,
  from_location_type: "salesman",
  from_salesman_user_id: salesmanA.userId,
  to_location_type: "salesman",
  to_salesman_user_id: salesmanB.userId,
  reference_type: "hosted_role_check",
  reference_id: crypto.randomUUID(),
  reference_line_id: crypto.randomUUID(),
  effective_date: sale.sale_date,
  created_by: salesmanA.userId,
};
denied(await salesmanA.client.from("inventory_movements").insert(movementPayload).select("id"), "salesman arbitrary inventory movement");

const dcr = rows(await salesmanA.client.from("daily_cash_reports").select("*").eq("organization_id", organizationId).eq("salesman_user_id", salesmanA.userId), "salesman DCR")[0];
const dcrReplay = await salesmanA.client.rpc("submit_dcr", {
  p_organization_id: organizationId,
  p_salesman_user_id: salesmanA.userId,
  p_report_date: dcr.report_date,
  p_actual_cash_remittance: Number(dcr.actual_cash_remittance),
  p_client_request_id: dcr.client_request_id,
  p_explanation: dcr.explanation,
});
assert.ifError(dcrReplay.error);
assert.equal(dcrReplay.data.idempotent_replay, true, "locked DCR replay is idempotent");

console.log("Hosted role verification passed: owner_admin, warehouse, salesman");
console.log("Expected RLS denials passed: Warehouse Stock In/Payment, Plant writes, payroll visibility, cross-salesman stock, arbitrary inventory movements");
console.log("Hosted integrity passed: duplicate TR, insufficient stock, Sale/DCR idempotency");
