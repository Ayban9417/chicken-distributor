import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildTimeEntryPayload, calculateDtrMinutes, formatDtrMinutes, attendanceState, timeEntryForm, validateTimeEntry } from "../src/utils/hostedDtr.js";
import { loadDtrEntries, timeInNow, timeOutNow } from "../src/services/dtrService.js";

function recordingClient() {
  const queries = [];
  class Query {
    constructor(table) { this.table = table; this.steps = []; queries.push(this); }
    select(value) { this.steps.push(["select", value]); return this; }
    eq(column, value) { this.steps.push(["eq", column, value]); return this; }
    gte(column, value) { this.steps.push(["gte", column, value]); return this; }
    lte(column, value) { this.steps.push(["lte", column, value]); return this; }
    order(column, value) { this.steps.push(["order", column, value]); return this; }
    then(resolve) { resolve({ data: [], error: null }); }
  }
  return { queries, from: (table) => new Query(table) };
}

test("DTR duration subtracts breaks and formats hours and minutes", () => {
  assert.equal(calculateDtrMinutes("08:03", "17:12", 60), 489);
  assert.equal(formatDtrMinutes(489), "8h 9m");
  assert.equal(calculateDtrMinutes("08:00", "", 0), null);
});

test("DTR payload keeps exact employee, date, clock times, and break", () => {
  assert.deepEqual(buildTimeEntryPayload("org-1", { userId: "user-1", date: "2026-09-14", timeIn: "08:03", timeOut: "17:12", breakMinutes: "60" }), {
    organization_id: "org-1", user_id: "user-1", work_date: "2026-09-14", time_in: "08:03", time_out: "17:12", break_minutes: 60,
  });
  assert.deepEqual(timeEntryForm({ id: "dtr-1", user_id: "user-1", work_date: "2026-09-14", time_in: "08:03:00", time_out: "17:12:00", break_minutes: 60 }), {
    id: "dtr-1", userId: "user-1", date: "2026-09-14", timeIn: "08:03", timeOut: "17:12", breakMinutes: "60", correctionReason: "",
  });
  assert.equal(buildTimeEntryPayload("org-1", { id: "dtr-1", userId: "user-1", date: "2026-09-14", timeIn: "08:03", timeOut: "17:12", breakMinutes: "60", correctionReason: "Route delay correction" }).correction_reason, "Route delay correction");
});

test("Salesman attendance state covers Time In, active work, and completion", () => {
  assert.equal(attendanceState(null), "not_timed_in");
  assert.equal(attendanceState({ time_out: null }), "working");
  assert.equal(attendanceState({ time_out: "17:12:00" }), "completed");
});

test("Time In and Time Out RPCs accept no client timestamp or employee identity", async () => {
  const calls = [];
  const client = { rpc: async (name, args) => { calls.push([name, args]); return { data: { id: "dtr-1" }, error: null }; } };
  await timeInNow("org-1", client);
  await timeOutNow("org-1", client);
  assert.deepEqual(calls, [
    ["time_in_now", { p_organization_id: "org-1" }],
    ["time_out_now", { p_organization_id: "org-1" }],
  ]);
});

test("attendance migration enforces server time, idempotency, self scope, and audited corrections", () => {
  const migration = readFileSync("supabase/migrations/20260916135900_salesman_attendance_clock.sql", "utf8");
  assert.match(migration, /clock_timestamp\(\)/);
  assert.match(migration, /timezone\('Asia\/Manila'/);
  assert.match(migration, /v_actor uuid := auth\.uid\(\)/);
  assert.match(migration, /idempotent_replay', true/);
  assert.match(migration, /Time In is required before Time Out/);
  assert.match(migration, /time_entries_insert[\s\S]*owner_admin[\s\S]*payroll_admin/);
  assert.match(migration, /A correction reason is required/);
  assert.match(migration, /insert into public\.audit_events/);
  assert.doesNotMatch(migration, /p_time_in|p_time_out|p_user_id/);
});

test("DTR validation rejects invalid shifts, breaks, and duplicate employee dates", () => {
  const base = { userId: "user-1", date: "2026-09-14", timeIn: "08:00", timeOut: "17:00", breakMinutes: "60" };
  assert.equal(validateTimeEntry(base), "");
  assert.match(validateTimeEntry({ ...base, timeOut: "07:59" }), /Time Out/);
  assert.match(validateTimeEntry({ ...base, breakMinutes: "600" }), /shift length/);
  assert.match(validateTimeEntry(base, [{ id: "existing", user_id: "user-1", work_date: "2026-09-14" }]), /one DTR entry/i);
});

test("hosted DTR service applies inclusive date and employee filters", async () => {
  const client = recordingClient();
  await loadDtrEntries("org-1", { start: "2026-09-01", end: "2026-09-30" }, "user-1", client);
  const query = client.queries[0];
  assert.ok(query.steps.some((step) => step[0] === "gte" && step[1] === "work_date" && step[2] === "2026-09-01"));
  assert.ok(query.steps.some((step) => step[0] === "lte" && step[1] === "work_date" && step[2] === "2026-09-30"));
  assert.ok(query.steps.some((step) => step[0] === "eq" && step[1] === "user_id" && step[2] === "user-1"));
});
