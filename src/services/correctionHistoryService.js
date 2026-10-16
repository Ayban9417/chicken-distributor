import { requireSupabase } from "../lib/supabaseClient.js";

const fail = (result) => { if (result.error) throw result.error; return result.data || []; };
const localDay = (date) => new Date(`${date}T00:00:00+08:00`).toISOString();
const nextDay = (date) => new Date(new Date(localDay(date)).getTime() + 86_400_000).toISOString();

export async function loadCorrectionHistory(organizationId, filters = {}, client = requireSupabase()) {
  let query = client.from("transaction_corrections").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(101);
  if (filters.module) query = query.eq("module", filters.module);
  if (filters.dateFrom) query = query.gte("created_at", localDay(filters.dateFrom));
  if (filters.dateTo) query = query.lt("created_at", nextDay(filters.dateTo));
  if (filters.reference?.trim()) query = query.ilike("transaction_reference", `%${filters.reference.trim()}%`);
  if (filters.adminUserId) query = query.eq("admin_user_id", filters.adminUserId);
  if (filters.transactionId) query = query.eq("transaction_id", filters.transactionId);
  const rows = fail(await query);
  const ids = [...new Set(rows.map((row) => row.admin_user_id))];
  const profiles = ids.length ? fail(await client.from("profiles").select("id, full_name").in("id", ids)) : [];
  const names = new Map(profiles.map((profile) => [profile.id, profile.full_name]));
  return { rows: rows.slice(0, 100).map((row) => ({ ...row, admin_name: names.get(row.admin_user_id) || "Unknown Admin" })), hasMore: rows.length > 100 };
}

export async function loadCorrectionAdministrators(organizationId, client = requireSupabase()) {
  const memberships = fail(await client.from("organization_memberships").select("user_id").eq("organization_id", organizationId).eq("role", "owner_admin"));
  const ids = [...new Set(memberships.map((row) => row.user_id))];
  return ids.length ? fail(await client.from("profiles").select("id, full_name").in("id", ids)) : [];
}

export function isMissingCorrectionLedger(error) {
  return error?.code === "42P01" || error?.code === "PGRST205" || /transaction_corrections.*schema cache/i.test(error?.message || "");
}
