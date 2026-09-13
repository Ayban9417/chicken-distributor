const number = (value) => Number(value || 0);
const money = (value) => Math.round((number(value) + Number.EPSILON) * 100) / 100;

export function attendanceForPeriod(rows, userId, period) {
  return rows.filter((row) => row.user_id === userId && row.work_date >= period.period_start && row.work_date <= period.period_end && row.total_minutes != null);
}

export function payrollCalculation(values, attendance = []) {
  const regularMinutes = attendance.reduce((sum, row) => sum + number(row.total_minutes), 0);
  const days = new Set(attendance.map((row) => row.work_date)).size;
  const overtimeMinutes = Math.round(number(values.overtimeHours) * 60);
  const basePay = money(regularMinutes / 60 * number(values.hourlyRate));
  const overtimePay = money(overtimeMinutes / 60 * number(values.overtimeRate));
  const allowances = money(values.allowances);
  const deductions = money(values.deductions);
  const grossPay = money(basePay + overtimePay + allowances);
  return { days, regularMinutes, overtimeMinutes, basePay, overtimePay, allowances, deductions, grossPay, netPay: money(grossPay - deductions) };
}

export function buildPayrollEntryPayload(values, attendance = []) {
  const totals = payrollCalculation(values, attendance);
  return {
    payroll_period_id: values.periodId,
    user_id: values.userId,
    base_pay: totals.basePay,
    regular_minutes: totals.regularMinutes,
    overtime_minutes: totals.overtimeMinutes,
    overtime_pay: totals.overtimePay,
    allowances: totals.allowances,
    deductions: totals.deductions,
    gross_pay: totals.grossPay,
    net_pay: totals.netPay,
    status: values.status || "draft",
  };
}

export function payrollEntryForm(entry) {
  const regularHours = number(entry.regular_minutes) / 60;
  const overtimeHours = number(entry.overtime_minutes) / 60;
  return {
    id: entry.id,
    periodId: entry.payroll_period_id,
    userId: entry.user_id,
    hourlyRate: regularHours ? money(number(entry.base_pay) / regularHours) : 0,
    overtimeHours,
    overtimeRate: overtimeHours ? money(number(entry.overtime_pay) / overtimeHours) : 0,
    allowances: number(entry.allowances),
    deductions: number(entry.deductions),
    status: entry.status,
  };
}

export function validatePayroll(values, totals) {
  if (!values.periodId || !values.userId) return "Select a pay period and employee.";
  for (const field of ["hourlyRate", "overtimeHours", "overtimeRate", "allowances", "deductions"]) {
    if (!Number.isFinite(Number(values[field])) || Number(values[field]) < 0) return "Payroll amounts and hours must be nonnegative numbers.";
  }
  if (!totals.regularMinutes) return "This employee has no completed DTR time in the pay period.";
  if (totals.netPay < 0) return "Deductions cannot exceed gross pay.";
  return "";
}
