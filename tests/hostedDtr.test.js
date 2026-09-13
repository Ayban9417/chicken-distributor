import test from "node:test";
import assert from "node:assert/strict";
import { buildTimeEntryPayload, calculateDtrMinutes, formatDtrMinutes, timeEntryForm, validateTimeEntry } from "../src/utils/hostedDtr.js";
import { loadDtrEntries } from "../src/services/dtrService.js";

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
    id: "dtr-1", userId: "user-1", date: "2026-09-14", timeIn: "08:03", timeOut: "17:12", breakMinutes: "60",
  });
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
