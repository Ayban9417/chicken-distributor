import { requireSupabase } from "../lib/supabaseClient.js";
import { loadHostedFinanceParity } from "./financeParityService.js";

const roleValue = (role) => ({
  "Owner / Admin": "owner_admin",
  Agent: "salesman",
  "Legacy / Deprecated": "cashier",
  Warehouse: "warehouse",
  "Payroll Admin": "payroll_admin",
})[role] || role;

function fail(result) {
  if (result.error) throw result.error;
  return result.data;
}

export function loadHostedAdministration(organizationId) {
  return loadHostedFinanceParity(organizationId);
}

export async function updateHostedMembership(organizationId, user, client = requireSupabase()) {
  const role = roleValue(user.role);
  if (role === "cashier" && user.active !== false) throw new Error("Assign a current operational role before activating this membership.");
  const current = fail(await client.from("organization_memberships").select("id, role, active").eq("organization_id", organizationId).eq("user_id", user.id).single());
  if (current.role === "owner_admin" && current.active && (role !== "owner_admin" || user.active === false)) {
    const owners = fail(await client.from("organization_memberships").select("id").eq("organization_id", organizationId).eq("role", "owner_admin").eq("active", true));
    if ((owners || []).length <= 1) throw new Error("Keep at least one active Owner / Admin.");
  }
  return fail(await client.from("organization_memberships").update({ role, active: user.active !== false }).eq("id", current.id).select("*").single());
}

export async function setHostedCustomerActive(customerId, active, client = requireSupabase()) {
  return fail(await client.from("customers").update({ active }).eq("id", customerId).select("*").single());
}
