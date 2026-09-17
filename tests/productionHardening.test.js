import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { readableError } from "../src/services/errors.js";
import { buildExpenseArgs } from "../src/services/operationsService.js";
import { loadSalesmanWorkspaceData } from "../src/services/salesmanDataService.js";

const migrationUrl = new URL("../supabase/migrations/20260916151519_harden_production_release_candidate.sql", import.meta.url);
const loginFunctionUrl = new URL("../supabase/functions/username-login/index.ts", import.meta.url);
const accountFunctionUrl = new URL("../supabase/functions/manage-salesman-account/index.ts", import.meta.url);

test("Salesman workspace uses the dedicated safe RPC and normalizes missing arrays", async () => {
  const calls = [];
  const client = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: { stock: [{ inventory_lot_id: "lot-1", available_quantity_kg: 12 }] }, error: null };
    },
  };

  const data = await loadSalesmanWorkspaceData("org-1", client);
  assert.deepEqual(calls, [{ name: "get_salesman_workspace", args: { p_organization_id: "org-1" } }]);
  assert.equal(data.stock.length, 1);
  assert.deepEqual(data.sales, []);
  assert.equal(JSON.stringify(data).includes("cost_per_kg"), false);
});

test("Expense command carries a stable backend idempotency key", () => {
  assert.deepEqual(buildExpenseArgs("org-1", {
    salesmanId: "sales-1",
    date: "2026-09-16",
    category: " Fuel ",
    amount: "75.50",
    source: "cash_collection",
    description: " Route fuel ",
    status: "approved",
  }, "request-1"), {
    p_organization_id: "org-1",
    p_salesman_user_id: "sales-1",
    p_expense_date: "2026-09-16",
    p_category: "Fuel",
    p_amount: 75.5,
    p_payment_source: "cash_collection",
    p_client_request_id: "request-1",
    p_description: "Route fuel",
    p_approval_status: "approved",
  });
});

test("production error mapping hides raw database diagnostics", () => {
  assert.equal(readableError({ message: "relation private.secret_table does not exist", details: "SQLSTATE 42P01" }), "The request could not be completed.");
  assert.equal(readableError({ message: "duplicate key violates sales_org_trust_receipt_key" }), "Trust Receipt Number already exists.");
  assert.equal(readableError({ message: "JWT expired" }), "Your session expired. Sign in again.");
});

test("release migration removes Salesman cost access and adds safe audited commands", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create function api\.get_salesman_workspace/i);
  assert.match(sql, /Salesman-safe read model/i);
  assert.match(sql, /drop policy if exists sales_select/i);
  assert.match(sql, /array\['owner_admin'\]/i);
  assert.match(sql, /create function api\.record_expense/i);
  assert.match(sql, /expenses_org_request_key/i);
  assert.match(sql, /audit_release_candidate_change/i);
  assert.doesNotMatch(sql.match(/create function api\.get_salesman_workspace[\s\S]*?\$\$;/i)?.[0] || "", /cost_per_kg|gross_profit|total_cogs|inventory_cost_value/i);
});

test("Edge Functions enforce origin checks and server-side login throttling", async () => {
  const [login, account] = await Promise.all([
    readFile(loginFunctionUrl, "utf8"),
    readFile(accountFunctionUrl, "utf8"),
  ]);
  assert.match(login, /consume_login_rate_limit/);
  assert.match(login, /Too many attempts/);
  assert.match(login, /ALLOWED_ORIGINS/);
  assert.match(account, /ALLOWED_ORIGINS/);
  assert.doesNotMatch(account, /return error\?\.message/);
});
