import { requireSupabase } from "../lib/supabaseClient.js";
import { buildTimeEntryPayload } from "../utils/hostedDtr.js";

const fail = (result) => {
  if (result.error) throw result.error;
  return result.data || [];
};

export async function loadDtrPeople(organizationId, client = requireSupabase()) {
  const memberships = fail(await client.from("organization_memberships").select("user_id, role, active").eq("organization_id", organizationId));
  if (!memberships.length) return [];
  const profiles = fail(await client.from("profiles").select("id, full_name, active").in("id", memberships.map((row) => row.user_id)));
  return memberships.map((membership) => ({ ...membership, ...profiles.find((profile) => profile.id === membership.user_id) })).filter((person) => person.id);
}

export async function loadDtrEntries(organizationId, range, employeeId = "", client = requireSupabase()) {
  let query = client.from("time_entries").select("*").eq("organization_id", organizationId).gte("work_date", range.start).lte("work_date", range.end);
  if (employeeId) query = query.eq("user_id", employeeId);
  return fail(await query.order("work_date", { ascending: false }).order("time_in", { ascending: false }));
}

export async function saveTimeEntry(organizationId, values, client = requireSupabase()) {
  const payload = buildTimeEntryPayload(organizationId, values);
  const result = values.id
    ? await client.from("time_entries").update(payload).eq("id", values.id).eq("organization_id", organizationId).select("*").single()
    : await client.from("time_entries").insert(payload).select("*").single();
  return fail(result);
}
