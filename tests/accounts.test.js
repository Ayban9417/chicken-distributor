import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSalesmanAccount, resetSalesmanPassword, setSalesmanAccountActive, updateSalesmanAccount } from "../src/services/accountService.js";
import { changeOwnPassword, signIn } from "../src/services/authService.js";
import { confirmedPasswordError, normalizeUsername, passwordError, usernameError } from "../src/utils/accounts.js";

const organizationId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";

function functionClient(response = { data: { account: { id: userId } }, error: null }) {
  const calls = [];
  return {
    calls,
    functions: {
      async invoke(name, options) {
        calls.push({ type: "function", name, options });
        return response;
      },
    },
    auth: {
      async setSession(tokens) {
        calls.push({ type: "setSession", tokens });
        return { data: { session: tokens }, error: null };
      },
      async updateUser(values) {
        calls.push({ type: "updateUser", values });
        return { data: {}, error: null };
      },
    },
    async rpc(name, args) {
      calls.push({ type: "rpc", name, args });
      return { data: true, error: null };
    },
  };
}

test("usernames normalize consistently and password validation stays client-safe", () => {
  assert.equal(normalizeUsername("  Pedro.Santos  "), "pedro.santos");
  assert.equal(usernameError("salesman01"), "");
  assert.match(usernameError("bad name"), /lowercase letters/);
  assert.match(passwordError("short"), /8 characters/);
  assert.match(confirmedPasswordError("abcdefgh", "abcdefghx"), /do not match/);
});

test("username login exchanges only username/password for session tokens", async () => {
  const client = functionClient({ data: { access_token: "access", refresh_token: "refresh" }, error: null });
  await signIn("  Salesman01 ", "Temporary1!", client);
  assert.deepEqual(client.calls[0], {
    type: "function",
    name: "username-login",
    options: { body: { username: "salesman01", password: "Temporary1!" } },
  });
  assert.deepEqual(client.calls[1], { type: "setSession", tokens: { access_token: "access", refresh_token: "refresh" } });
  assert.equal(JSON.stringify(client.calls).includes("email"), false);
});

test("username login keeps invalid account details generic", async () => {
  const client = functionClient({ data: null, error: new Error("function failed") });
  await assert.rejects(() => signIn("missing", "Incorrect1!", client), /Username or password is incorrect/);
});

test("Salesman account requests never accept a browser-supplied role", async () => {
  const client = functionClient();
  await createSalesmanAccount(organizationId, { fullName: "Pedro Santos", username: "Pedro.Santos", password: "Temporary1!", confirmPassword: "Temporary1!", role: "owner_admin" }, client);
  await updateSalesmanAccount(organizationId, { id: userId, name: "Pedro S.", username: "pedro.santos", role: "Owner / Admin" }, client);
  await setSalesmanAccountActive(organizationId, userId, false, client);
  await resetSalesmanPassword(organizationId, userId, { password: "Replacement1!", confirmPassword: "Replacement1!" }, client);
  const bodies = client.calls.filter((call) => call.type === "function").map((call) => call.options.body);
  assert.deepEqual(bodies.map((body) => body.action), ["create", "update", "set_active", "reset_password"]);
  assert.equal(bodies.some((body) => Object.hasOwn(body, "role")), false);
  assert.equal(bodies[0].username, "pedro.santos");
});

test("own password change validates current password through Auth and clears only its flag", async () => {
  const client = functionClient();
  await changeOwnPassword({ currentPassword: "Current1!", newPassword: "Replacement1!" }, client);
  assert.deepEqual(client.calls, [
    { type: "updateUser", values: { password: "Replacement1!", current_password: "Current1!" } },
    { type: "rpc", name: "complete_own_password_change", args: undefined },
  ]);
});

test("Edge Function sources enforce the account security boundary", () => {
  const login = readFileSync("supabase/functions/username-login/index.ts", "utf8");
  const management = readFileSync("supabase/functions/manage-salesman-account/index.ts", "utf8");
  const migration = readFileSync("supabase/migrations/20260915074952_secure_username_account_management.sql", "utf8");
  const config = readFileSync("supabase/config.toml", "utf8");
  assert.match(login, /Username or password is incorrect/);
  assert.doesNotMatch(login, /console\.(log|error)/);
  assert.match(management, /role", "owner_admin"/);
  assert.match(management, /provision_salesman_account/);
  assert.doesNotMatch(management, /body\.role/);
  assert.doesNotMatch(management, /console\.(log|error)/);
  assert.match(migration, /values \(p_organization_id, p_user_id, 'salesman', true\)/);
  assert.match(migration, /revoke all on function public\.provision_salesman_account.*authenticated/);
  assert.match(config, /\[functions\.username-login\][\s\S]*verify_jwt = false/);
  assert.match(config, /\[functions\.manage-salesman-account\][\s\S]*verify_jwt = true/);
});

test("account screens expose username workflows without email or role assignment", () => {
  const authScreen = readFileSync("src/components/AuthScreen.jsx", "utf8");
  const salesmanAccounts = readFileSync("src/components/SalesmanAccounts.jsx", "utf8");
  assert.match(authScreen, /Field label="Username"/);
  assert.doesNotMatch(authScreen, /Field label="Email"/);
  assert.match(salesmanAccounts, /title="Salesman Accounts"/);
  assert.match(salesmanAccounts, /Add Salesman/);
  assert.doesNotMatch(salesmanAccounts, /Field label="Role"/);
});

test("password USER_UPDATED events preserve the password-change completion state", () => {
  const context = readFileSync("src/context/AppContext.jsx", "utf8");
  const authService = readFileSync("src/services/authService.js", "utf8");
  assert.match(authService, /callback\(session, event\)/);
  assert.match(context, /if \(event === "USER_UPDATED"\) \{\s*setSession\(nextSession\);\s*return;/);
});
