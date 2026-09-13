import test from "node:test";
import assert from "node:assert/strict";
import { attendanceForPeriod, buildPayrollEntryPayload, payrollCalculation, payrollEntryForm, validatePayroll } from "../src/utils/hostedPayroll.js";

const period = { id: "period-1", period_start: "2026-09-01", period_end: "2026-09-15" };
const attendance = [
  { user_id: "user-1", work_date: "2026-09-01", total_minutes: 480 },
  { user_id: "user-1", work_date: "2026-09-02", total_minutes: 450 },
  { user_id: "user-2", work_date: "2026-09-01", total_minutes: 500 },
];

test("payroll derives regular days and minutes from the selected DTR period", () => {
  const rows = attendanceForPeriod(attendance, "user-1", period);
  assert.equal(rows.length, 2);
  const totals = payrollCalculation({ hourlyRate: 100, overtimeHours: 2, overtimeRate: 125, allowances: 500, deductions: 250 }, rows);
  assert.deepEqual(totals, { days: 2, regularMinutes: 930, overtimeMinutes: 120, basePay: 1550, overtimePay: 250, allowances: 500, deductions: 250, grossPay: 2300, netPay: 2050 });
});

test("payroll payload satisfies persisted gross and net constraints", () => {
  const rows = attendanceForPeriod(attendance, "user-1", period);
  const payload = buildPayrollEntryPayload({ periodId: period.id, userId: "user-1", hourlyRate: 100, overtimeHours: 2, overtimeRate: 125, allowances: 500, deductions: 250 }, rows);
  assert.equal(payload.gross_pay, payload.base_pay + payload.overtime_pay + payload.allowances);
  assert.equal(payload.net_pay, payload.gross_pay - payload.deductions);
  assert.equal(payload.status, "draft");
});

test("payroll validation requires DTR time and a nonnegative net", () => {
  const values = { periodId: period.id, userId: "user-1", hourlyRate: 100, overtimeHours: 0, overtimeRate: 0, allowances: 0, deductions: 0 };
  assert.match(validatePayroll(values, payrollCalculation(values, [])), /no completed DTR/i);
  const rows = attendanceForPeriod(attendance, "user-1", period);
  assert.match(validatePayroll({ ...values, deductions: 9999 }, payrollCalculation({ ...values, deductions: 9999 }, rows)), /Deductions/);
});

test("persisted payroll entries restore editable rate inputs", () => {
  assert.deepEqual(payrollEntryForm({ id: "entry-1", payroll_period_id: period.id, user_id: "user-1", base_pay: 1600, regular_minutes: 960, overtime_minutes: 120, overtime_pay: 250, allowances: 0, deductions: 0, status: "draft" }), {
    id: "entry-1", periodId: period.id, userId: "user-1", hourlyRate: 100, overtimeHours: 2, overtimeRate: 125, allowances: 0, deductions: 0, status: "draft",
  });
});
