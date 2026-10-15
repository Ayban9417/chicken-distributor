import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { authorizeAdminCorrection, CorrectionAuthorizationError } from "../supabase/functions/_shared/adminCorrectionAuthorization.js";
import { buildCorrectionPreview } from "../src/utils/correctionPreview.js";
import { isMissingCorrectionLedger, loadCorrectionHistory } from "../src/services/correctionHistoryService.js";
import { canAccessScreen } from "../src/lib/roleAccess.js";

const org = "f1000000-0000-4000-8000-000000000001";
const actor = "f1000000-0000-4000-8000-000000000101";

function authClients({ role = "owner_admin", profileActive = true, passwordCorrect = true, rateAllowed = true } = {}) {
  const calls = { password: [], rpc: [], auth: [] };
  const userClient = { auth: { async getUser(token) { calls.auth.push(token); return { data: { user: { id: actor } }, error: null }; } } };
  const adminClient = {
    from(table) {
      return {
        select() { return this; }, eq() { return this; },
        async maybeSingle() { return { data: table === "profiles" ? (profileActive ? { id: actor } : null) : (role === "owner_admin" ? { id: actor } : null), error: null }; },
      };
    },
    auth: { admin: { async getUserById() { return { data: { user: { email: "internal@test.invalid" } }, error: null }; } } },
    async rpc(name, args) { calls.rpc.push({ name, args }); return { data: name === "consume_login_rate_limit" ? rateAllowed : null, error: null }; },
  };
  const verifierClient = { auth: { async signInWithPassword(values) { calls.password.push(values); return passwordCorrect ? { data: { user: { id: actor } }, error: null } : { data: null, error: { message: "Wrong password" } }; } } };
  return { calls, userClient, adminClient, verifierClient };
}

const request = (clients, password = "sample-current-password") => ({ authorization: "Bearer test-token", organizationId: org, password, ...clients });

test("active Owner is verified against the caller's current password for this request", async () => {
  const clients = authClients();
  assert.deepEqual(await authorizeAdminCorrection(request(clients)), { actorUserId: actor, organizationId: org });
  assert.deepEqual(clients.calls.auth, ["test-token"]);
  assert.equal(clients.calls.password.length, 1);
  assert.deepEqual(clients.calls.rpc.map((entry) => entry.name), ["consume_login_rate_limit", "clear_login_rate_limit"]);
  assert.equal(clients.calls.rpc[0].args.p_max_attempts, 5);
  assert.equal(clients.calls.rpc[0].args.p_window_seconds, 900);
  assert.match(clients.calls.rpc[0].args.p_identifier_hash, /^[a-f0-9]{64}$/);
});

test("Salesman is denied before password verification", async () => {
  const clients = authClients({ role: "salesman" });
  await assert.rejects(authorizeAdminCorrection(request(clients)), (error) => error instanceof CorrectionAuthorizationError && error.status === 403);
  assert.equal(clients.calls.password.length, 0);
  assert.equal(clients.calls.rpc.length, 0);
});

test("inactive profile is denied before password verification", async () => {
  const clients = authClients({ profileActive: false });
  await assert.rejects(authorizeAdminCorrection(request(clients)), (error) => error.status === 403);
  assert.equal(clients.calls.password.length, 0);
});

test("incorrect password and rate-limited attempts fail without clearing the counter", async () => {
  const wrong = authClients({ passwordCorrect: false });
  await assert.rejects(authorizeAdminCorrection(request(wrong, "incorrect")), (error) => error.status === 401);
  assert.deepEqual(wrong.calls.rpc.map((entry) => entry.name), ["consume_login_rate_limit"]);
  const limited = authClients({ rateAllowed: false });
  await assert.rejects(authorizeAdminCorrection(request(limited)), (error) => error.status === 429);
  assert.equal(limited.calls.password.length, 0);
});

test("missing password and missing bearer token are rejected", async () => {
  const clients = authClients();
  await assert.rejects(authorizeAdminCorrection(request(clients, "")), (error) => error.status === 400);
  await assert.rejects(authorizeAdminCorrection({ ...request(clients), authorization: "" }), (error) => error.status === 401);
  assert.equal(clients.calls.auth.length, 0);
});

test("preview blocks missing versions and redacts nested secrets", () => {
  const preview = buildCorrectionPreview({ originalValues: { amount: 100, nested: { currentPassword: "not-real", items: [{ apiKey: "not-real" }] } }, proposedValues: { amount: 90 }, affectedRecords: [{ id: "one", sessionToken: "not-real" }] });
  assert.equal(preview.eligible, false);
  assert.equal(preview.originalValues.nested.currentPassword, "[REDACTED]");
  assert.equal(preview.originalValues.nested.items[0].apiKey, "[REDACTED]");
  assert.equal(preview.affectedRecords[0].sessionToken, "[REDACTED]");
  assert.equal(buildCorrectionPreview({ versionToken: "current-v1" }).eligible, true);
});

test("history route is Owner-only and missing migration is a recoverable state", () => {
  assert.equal(canAccessScreen("owner_admin", "transaction-history"), true);
  assert.equal(canAccessScreen("salesman", "transaction-history"), false);
  assert.equal(canAccessScreen("warehouse", "transaction-history"), false);
  assert.equal(isMissingCorrectionLedger({ code: "PGRST205" }), true);
});

test("history query applies organization and filters, then resolves administrator names", async () => {
  const calls = [];
  const records = [{ id: "entry-1", admin_user_id: actor, affected_record_ids: [] }];
  const client = { from(table) {
    const query = {
      select(value) { calls.push([table, "select", value]); return this; },
      eq(key, value) { calls.push([table, "eq", key, value]); return this; },
      gte(key, value) { calls.push([table, "gte", key, value]); return this; },
      lt(key, value) { calls.push([table, "lt", key, value]); return this; },
      ilike(key, value) { calls.push([table, "ilike", key, value]); return this; },
      order(key, options) { calls.push([table, "order", key, options]); return this; },
      limit(value) { calls.push([table, "limit", value]); return this; },
      in(key, value) { calls.push([table, "in", key, value]); return this; },
      then(resolve) { resolve({ data: table === "profiles" ? [{ id: actor, full_name: "QA Admin" }] : records, error: null }); },
    };
    return query;
  } };
  const result = await loadCorrectionHistory(org, { module: "sale", dateFrom: "2026-10-01", dateTo: "2026-10-02", reference: " TR-001 ", adminUserId: actor }, client);
  assert.equal(result.rows[0].admin_name, "QA Admin");
  assert.deepEqual(calls.filter((call) => call[1] === "eq"), [["transaction_corrections", "eq", "organization_id", org], ["transaction_corrections", "eq", "module", "sale"], ["transaction_corrections", "eq", "admin_user_id", actor]]);
  assert.ok(calls.some((call) => call[1] === "gte" && call[3] === "2026-09-30T16:00:00.000Z"));
  assert.ok(calls.some((call) => call[1] === "lt" && call[3] === "2026-10-02T16:00:00.000Z"));
  assert.ok(calls.some((call) => call[1] === "ilike" && call[3] === "%TR-001%"));
});

test("migration guards replay, stale version, RLS, immutability, and sensitive snapshots", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261015074217_admin_transaction_correction_foundation.sql", import.meta.url), "utf8");
  assert.match(sql, /unique \(organization_id, request_id\)/i);
  assert.match(sql, /p_expected_version <> p_current_version/i);
  assert.match(sql, /m\.role = 'owner_admin' and m\.active/i);
  assert.match(sql, /before update or delete on public\.transaction_corrections/i);
  assert.match(sql, /for select to authenticated[\s\S]*?private\.has_org_role\(organization_id, array\['owner_admin'\]\)/i);
  assert.match(sql, /revoke all on public\.transaction_corrections from public, anon, authenticated, service_role/i);
  assert.match(sql, /private\.redact_correction_json\(new\.original_values\)/i);
  assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]* to authenticated/i);
});

test("dialog and history UI have responsive controls, password input, and no operational edit wiring", async () => {
  const [dialog, history, app, authorizer] = await Promise.all([
    readFile(new URL("../src/components/CorrectionDialog.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/TransactionEditHistory.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/SupabaseApp.jsx", import.meta.url), "utf8"),
    readFile(new URL("../supabase/functions/_shared/adminCorrectionAuthorization.js", import.meta.url), "utf8"),
  ]);
  assert.match(dialog, /type="password" autoComplete="current-password"/);
  assert.match(dialog, /grid gap-3 sm:grid-cols-2/);
  assert.match(dialog, /overflow-x-auto/);
  assert.match(history, /grid gap-3 sm:grid-cols-2 xl:grid-cols-5/);
  assert.match(history, /role !== "owner_admin"/);
  assert.match(app, /transaction-history.*TransactionEditHistory/);
  assert.doesNotMatch(app, /CorrectionDialog/);
  assert.doesNotMatch(authorizer, /console\.(log|error)|localStorage|sessionStorage/);
});
