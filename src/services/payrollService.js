import { requireSupabase } from "../lib/supabaseClient.js";
import { buildPayrollEntryPayload } from "../utils/hostedPayroll.js";

const fail = (result) => { if (result.error) throw result.error; return result.data || []; };

export async function loadPayroll(organizationId, client = requireSupabase()) {
  const [periodResult, membershipResult, timeResult] = await Promise.all([
    client.from("payroll_periods").select("*").eq("organization_id", organizationId).order("period_start", { ascending: false }),
    client.from("organization_memberships").select("user_id, role, active").eq("organization_id", organizationId),
    client.from("time_entries").select("*").eq("organization_id", organizationId).order("work_date", { ascending: false }),
  ]);
  const periods = fail(periodResult);
  const memberships = fail(membershipResult);
  const timeEntries = fail(timeResult);
  const [entryResult, profileResult] = await Promise.all([
    periods.length ? client.from("payroll_entries").select("*").in("payroll_period_id", periods.map((row) => row.id)) : Promise.resolve({ data: [], error: null }),
    memberships.length ? client.from("profiles").select("id, full_name, active").in("id", memberships.map((row) => row.user_id)) : Promise.resolve({ data: [], error: null }),
  ]);
  const profiles = fail(profileResult);
  const people = memberships.map((membership) => ({ ...membership, ...profiles.find((profile) => profile.id === membership.user_id) })).filter((person) => person.id);
  return { periods, entries: fail(entryResult), timeEntries, people };
}

export async function createPayrollPeriod(organizationId, values, createdBy, client = requireSupabase()) {
  return fail(await client.from("payroll_periods").insert({ organization_id: organizationId, period_start: values.start, period_end: values.end, status: "draft", created_by: createdBy }).select("*").single());
}

export async function savePayrollEntry(values, attendance, client = requireSupabase()) {
  const payload = buildPayrollEntryPayload(values, attendance);
  const result = values.id
    ? await client.from("payroll_entries").update(payload).eq("id", values.id).select("*").single()
    : await client.from("payroll_entries").insert(payload).select("*").single();
  return fail(result);
}

export async function setPayrollPeriodStatus(periodId, status, client = requireSupabase()) {
  const entries = await client.from("payroll_entries").update({ status }).eq("payroll_period_id", periodId);
  fail(entries);
  return fail(await client.from("payroll_periods").update({ status }).eq("id", periodId).select("*").single());
}
