import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadCustomers } from "../src/services/operationsService.js";
import { saveHostedCustomer } from "../src/services/financeParityService.js";
import { deleteUnusedHostedCustomer } from "../src/services/protectedDeletionService.js";
import { hasCustomerHistory } from "../src/utils/customers.js";
import { canAccessScreen } from "../src/lib/roleAccess.js";

function recordingClient(responses = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, action: "", filters: [] };
      calls.push(call);
      const result = () => responses[`${table}.${call.action}`] || { data: [] };
      const query = {
        select(columns, options) { if (!call.action) call.action = "select"; call.columns = columns; call.options = options; return query; },
        insert(payload) { call.action = "insert"; call.payload = payload; return query; },
        update(payload) { call.action = "update"; call.payload = payload; return query; },
        delete() { call.action = "delete"; return query; },
        eq(key, value) { call.filters.push(["eq", key, value]); return query; },
        is(key, value) { call.filters.push(["is", key, value]); return query; },
        order(key) { call.filters.push(["order", key]); return query; },
        single() { return Promise.resolve(result()); },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return query;
    },
  };
}

test("hosted Administration imports the customer screen it renders", () => {
  const source = readFileSync(new URL("../src/components/HostedParityScreens.jsx", import.meta.url), "utf8");
  assert.match(source, /import\s*\{[^}]*CustomerManagement[^}]*\}\s*from\s*["']\.\/CustomerManagement["']/);
  assert.match(source, /<CustomerManagement\b/);
});

test("customer list query is scoped to the current organization", async () => {
  const client = recordingClient({ "customers.select": { data: [{ id: "c1", name: "QA" }] } });
  assert.equal((await loadCustomers("org-1", client)).length, 1);
  assert.deepEqual(client.calls[0].filters, [["eq", "organization_id", "org-1"], ["order", "name"]]);
});

test("hosted customer create and edit keep stable IDs and persist configured prices", async () => {
  const client = recordingClient({
    "customers.insert": { data: { id: "c1" } },
    "customers.update": { data: { id: "c1" } },
    "products.select": { data: [{ id: "p1", name: "Whole Dressed Chicken" }] },
    "customer_prices.select": { data: [] },
    "customer_prices.insert": { data: [{ id: "price-1" }] },
  });
  const record = { name: "QA", contactPerson: "", mobile: "", address: "", type: "Other", paymentType: "Cash", creditLimit: null, paymentDays: null, active: true, pricing: { "Whole Dressed Chicken": 188.5 } };
  assert.equal((await saveHostedCustomer("org-1", record, client)).id, "c1");
  const create = client.calls.find((call) => call.table === "customers" && call.action === "insert");
  assert.equal(create.payload.organization_id, "org-1");
  assert.equal(client.calls.find((call) => call.table === "customer_prices" && call.action === "insert").payload.selling_price_per_kg, 188.5);

  client.calls.length = 0;
  assert.equal((await saveHostedCustomer("org-1", { ...record, id: "c1", name: "QA Edited", pricing: { "Whole Dressed Chicken": 189.25 } }, client)).id, "c1");
  const edit = client.calls.find((call) => call.table === "customers" && call.action === "update");
  assert.deepEqual(edit.filters, [["eq", "id", "c1"]]);
  assert.equal(edit.payload.name, "QA Edited");
  assert.equal(client.calls.find((call) => call.table === "customer_prices" && call.action === "insert").payload.selling_price_per_kg, 189.25);
});

test("historical customers remain protected in the UI and atomic database function", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261006065752_protected_unused_customer_delete.sql", import.meta.url), "utf8");
  assert.match(sql, /for update/);
  assert.match(sql, /public\.sales where customer_id = p_customer_id/);
  assert.match(sql, /public\.payments where customer_id = p_customer_id/);
  assert.match(sql, /foreign_key_violation/);
  assert.match(sql, /Deactivate this customer instead/);
  assert.match(sql, /DELETE_UNUSED_CUSTOMER/);
  assert.match(sql, /grant execute on function public\.delete_unused_customer\([^;]+to service_role/);
  assert.doesNotMatch(sql, /grant delete on public\.(customers|customer_prices) to authenticated/i);
  for (const key of ["outs", "collections", "ledgerEntries"]) {
    assert.equal(hasCustomerHistory("c1", { [key]: [{ customerId: "c1" }] }), true);
  }
});

test("unused customer deletion requires the password-verified Edge Function", async () => {
  const calls = [];
  const client = { functions: { async invoke(name, options) { calls.push({ name, options }); return { data: { deletion: { customer_id: "c1" } } }; } } };
  const result = await deleteUnusedHostedCustomer("org-1", "c1", "password", "Mistaken entry", "request-1", client);
  assert.deepEqual(result, { customer_id: "c1" });
  assert.deepEqual(calls, [{ name: "admin-destructive-action", options: { body: {
    action: "delete_unused_customer", organizationId: "org-1", targetId: "c1", password: "password", reason: "Mistaken entry", requestId: "request-1",
  } } }]);
  const edgeSource = readFileSync(new URL("../supabase/functions/admin-destructive-action/index.ts", import.meta.url), "utf8");
  assert.match(edgeSource, /"delete_unused_customer"/);
  assert.match(edgeSource, /"p_customer_id"/);
});

test("Salesman cannot open Administration", () => {
  assert.equal(canAccessScreen("owner_admin", "admin"), true);
  assert.equal(canAccessScreen("salesman", "admin"), false);
});
