import { requireSupabase } from "../lib/supabaseClient.js";
import { buildPayrollEntryPayload } from "../utils/hostedPayroll.js";

const fail = (result) => { if (result.error) throw result.error; return result.data || []; };

export async function loadPayroll(organizationId, client = requireSupabase(), owner = false) {
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
  let adjustments = [];
  let adjustmentsUnavailable = false;
  if (owner) {
    const result = await client.from("payroll_adjustment_requests").select("*")
      .eq("organization_id", organizationId).order("created_at", { ascending: false });
    if (result.error && ["42P01", "PGRST205"].includes(result.error.code)) adjustmentsUnavailable = true;
    else {
      adjustments = fail(result);
      if (adjustments.length) {
        const approvalResult = await client.from("payroll_adjustment_approvals").select("*")
          .in("adjustment_id", adjustments.map((row) => row.id));
        const approvals = fail(approvalResult);
        adjustments = adjustments.map((row) => ({ ...row,
          approval: approvals.find((approval) => approval.adjustment_id === row.id) || null }));
      }
    }
  }
  return { periods, entries: fail(entryResult), timeEntries, people, adjustments, adjustmentsUnavailable };
}

export async function createPayrollPeriod(organizationId, values, createdBy, client = requireSupabase()) {
  return fail(await client.from("payroll_periods").insert({ organization_id: organizationId, period_start: values.start, period_end: values.end, status: "draft", created_by: createdBy }).select("*").single());
}

export async function savePayrollEntry(values, attendance, client = requireSupabase()) {
  if (values.id) throw new Error("Historical payroll edits require Owner/Admin correction authorization.");
  const payload = buildPayrollEntryPayload(values, attendance);
  let result = await client.from("payroll_entries").insert(payload).select("*").single();
  if (["42703", "PGRST204"].includes(result.error?.code)) {
    const { hourly_rate, overtime_rate, notes, ...legacyPayload } = payload;
    result = await client.from("payroll_entries").insert(legacyPayload).select("*").single();
  }
  return fail(result);
}

export async function setPayrollPeriodStatus(periodId, status, client = requireSupabase()) {
  throw new Error("Payroll period finalization requires Owner/Admin correction authorization.");
}
