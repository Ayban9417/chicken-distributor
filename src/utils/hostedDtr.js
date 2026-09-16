const clockMinutes = (value) => {
  if (!value) return null;
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
};

export const shortTime = (value) => value ? value.slice(0, 5) : "";

export function calculateDtrMinutes(timeIn, timeOut, breakMinutes = 0) {
  const start = clockMinutes(timeIn);
  const end = clockMinutes(timeOut);
  if (start == null || end == null) return null;
  return Math.max(0, end - start - Number(breakMinutes || 0));
}

export function formatDtrMinutes(value) {
  if (value == null) return "-";
  const minutes = Number(value || 0);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function validateTimeEntry(values, entries = []) {
  if (!values.userId || !values.date || !values.timeIn) return "Enter an employee, date, and Time In.";
  const breakMinutes = Number(values.breakMinutes);
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0) return "Break minutes must be a nonnegative whole number.";
  if (values.timeOut) {
    const start = clockMinutes(values.timeIn);
    const end = clockMinutes(values.timeOut);
    if (start == null || end == null || end < start) return "Time Out must be the same as or later than Time In.";
    if (breakMinutes > end - start) return "Break minutes cannot exceed the shift length.";
  }
  const duplicate = entries.some((row) => row.id !== values.id && row.user_id === values.userId && row.work_date === values.date);
  return duplicate ? "Only one DTR entry is allowed per employee and date." : "";
}

export const buildTimeEntryPayload = (organizationId, values) => ({
  organization_id: organizationId,
  user_id: values.userId,
  work_date: values.date,
  time_in: shortTime(values.timeIn),
  time_out: values.timeOut ? shortTime(values.timeOut) : null,
  break_minutes: Number(values.breakMinutes || 0),
  ...(values.id ? { correction_reason: values.correctionReason?.trim() || null } : {}),
});

export const timeEntryForm = (row) => ({
  id: row.id,
  userId: row.user_id,
  date: row.work_date,
  timeIn: shortTime(row.time_in),
  timeOut: shortTime(row.time_out),
  breakMinutes: String(row.break_minutes || 0),
  correctionReason: "",
});

export function attendanceState(entry) {
  if (!entry) return "not_timed_in";
  return entry.time_out ? "completed" : "working";
}

export function attendanceHistoryStatus(entry, today) {
  if (entry.timeOut) return "COMPLETED";
  return entry.date === today ? "WORKING" : "INCOMPLETE";
}
