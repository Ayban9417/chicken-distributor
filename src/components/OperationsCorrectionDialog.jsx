import { useEffect, useState } from "react";
import { CorrectionDialog } from "./CorrectionDialog";
import { Field, inputClass, NumericInput } from "./ui";
import { applyOperationsCorrection, previewOperationsCorrection } from "../services/operationsCorrectionService";

const specs = {
  dtr: {
    entry: [
      ["workDate", "Work Date", "date"], ["timeIn", "Time In", "time"],
      ["timeOut", "Time Out", "time"], ["breakMinutes", "Break Minutes", "number"],
      ["attendanceStatus", "Attendance Status", "select", ["present", "late", "absent", "leave"]],
      ["attendanceNotes", "Attendance Notes", "text"],
    ],
  },
  payroll: {
    entry: [
      ["hourlyRate", "Hourly Rate", "number"], ["overtimeHours", "Overtime Hours", "number"],
      ["overtimeRate", "Overtime Rate", "number"], ["allowances", "Allowances", "number"],
      ["deductions", "Deductions", "number"], ["notes", "Notes", "text"],
    ],
    period: [["status", "New Status", "select", ["reviewed", "paid"]]],
    adjustment: [["grossDelta", "Gross Adjustment", "number"],
      ["netDelta", "Net Adjustment", "number"], ["notes", "Adjustment Notes", "text"]],
    approval: [],
  },
  truck: {
    truck: [
      ["unitName", "Unit Name", "text"], ["plateNumber", "Plate Number", "text"],
      ["makeModel", "Make / Model", "text"], ["mileage", "Current Mileage", "number"],
      ["ltoExpiry", "LTO Expiry", "date"], ["active", "Active", "select", ["true", "false"]],
    ],
    renewal: [["date", "Renewal Date", "date"], ["notes", "Notes", "text"]],
    maintenance: [
      ["type", "Maintenance Type", "text"], ["date", "Service Date", "date"],
      ["mileage", "Mileage", "number"], ["nextDueDate", "Next Due Date", "date"],
      ["nextDueMileage", "Next Due Mileage", "number"], ["notes", "Notes", "text"],
    ],
  },
};

function initialDraft(module, kind, row) {
  if (module === "dtr") return { workDate: row.work_date, timeIn: row.time_in?.slice(0, 5) || "",
    timeOut: row.time_out?.slice(0, 5) || "", breakMinutes: String(row.break_minutes || 0),
    attendanceStatus: row.attendance_status || "present", attendanceNotes: row.attendance_notes || "" };
  if (module === "payroll" && kind === "period") return { status: row.status === "draft" ? "reviewed" : "paid" };
  if (module === "payroll" && kind === "adjustment") return { grossDelta: "", netDelta: "", notes: "" };
  if (module === "payroll" && kind === "approval") return {};
  if (module === "payroll") return {
    hourlyRate: String(row.hourly_rate ?? (row.regular_minutes ? Number(row.base_pay) * 60 / row.regular_minutes : 0)),
    overtimeHours: String(Number(row.overtime_minutes || 0) / 60),
    overtimeRate: String(row.overtime_rate ?? (row.overtime_minutes ? Number(row.overtime_pay) * 60 / row.overtime_minutes : 0)),
    allowances: String(row.allowances), deductions: String(row.deductions), notes: row.notes || "",
  };
  if (kind === "truck") return { unitName: row.unit_name, plateNumber: row.plate_number,
    makeModel: row.make_model, mileage: String(row.current_mileage),
    ltoExpiry: row.lto_registration_expiry || "", active: String(row.active) };
  if (kind === "renewal") return { date: row.renewal_date, notes: row.notes || "" };
  return { type: row.maintenance_type, date: row.service_date, mileage: String(row.mileage),
    nextDueDate: row.next_due_date || "", nextDueMileage: row.next_due_mileage == null ? "" : String(row.next_due_mileage),
    notes: row.notes || "" };
}

function changesFor(module, kind, draft) {
  if (module === "dtr") return { ...draft, breakMinutes: Number(draft.breakMinutes),
    timeIn: draft.timeIn || null, timeOut: draft.timeOut || null };
  if (module === "payroll" && kind === "period") return { status: draft.status };
  if (module === "payroll" && kind === "adjustment") return {
    grossDelta: Number(draft.grossDelta), netDelta: Number(draft.netDelta), notes: draft.notes.trim() };
  if (module === "payroll" && kind === "approval") return {};
  if (module === "payroll") return { hourlyRate: Number(draft.hourlyRate),
    overtimeHours: Number(draft.overtimeHours), overtimeRate: Number(draft.overtimeRate),
    allowances: Number(draft.allowances), deductions: Number(draft.deductions), notes: draft.notes.trim() };
  if (kind === "truck") return { unitName: draft.unitName.trim(), plateNumber: draft.plateNumber.trim(),
    makeModel: draft.makeModel.trim(), mileage: Number(draft.mileage),
    ltoExpiry: draft.ltoExpiry || null, active: draft.active === "true" };
  if (kind === "renewal") return { date: draft.date, notes: draft.notes.trim() };
  return { type: draft.type.trim(), date: draft.date, mileage: Number(draft.mileage),
    nextDueDate: draft.nextDueDate || null,
    nextDueMileage: draft.nextDueMileage === "" ? null : Number(draft.nextDueMileage), notes: draft.notes.trim() };
}

export function OperationsCorrectionDialog({ module, kind, organizationId, row, onClose, onSaved,
  localMode = false }) {
  const [draft, setDraft] = useState(() => initialDraft(module, kind, row));
  const [preview, setPreview] = useState(null);
  const [baseline, setBaseline] = useState("");
  const [dirty, setDirty] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState(localMode
    ? "Secure correction services are unavailable in local demo mode. Saving is disabled." : "");
  useEffect(() => {
    if (localMode) { setError("Secure correction services are unavailable in local demo mode. Saving is disabled."); return; }
    let active = true;
    previewOperationsCorrection(module, kind, organizationId, row.id, changesFor(module, kind, draft))
      .then((result) => { if (active) { setPreview(result); setBaseline(result.versionToken); } })
      .catch((problem) => { if (active) setError(problem?.message || "Correction services are not configured."); });
    return () => { active = false; };
    // Opening preview is intentionally fetched once; edited values require Review Changes.
  }, [module, kind, organizationId, row.id, localMode]);
  const update = (field, value) => {
    setDraft((current) => field === "attendanceStatus" && ["absent", "leave"].includes(value)
      ? { ...current, attendanceStatus: value, timeIn: "", timeOut: "", breakMinutes: "0" }
      : { ...current, [field]: value });
    setDirty(true); setError("");
  };
  async function review() {
    setReviewing(true); setError("");
    try {
      const result = await previewOperationsCorrection(module, kind, organizationId, row.id,
        changesFor(module, kind, draft));
      if (baseline && baseline !== result.versionToken) {
        setPreview(null); setError("The record changed after you opened it. Close and reopen before correcting.");
      } else { setPreview(result); setBaseline(result.versionToken); setDirty(false); }
    } catch (problem) { setError(problem?.message || "Unable to review this correction."); }
    finally { setReviewing(false); }
  }
  const fields = specs[module][kind];
  const editor = <div className="grid gap-3 sm:grid-cols-2">{fields.map(([key, label, type, options]) =>
    <Field key={key} label={label}>{type === "select" ?
      <select className={inputClass()} value={draft[key]} onChange={(event) => update(key, event.target.value)}>
        {options.map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}
      </select> : type === "number" ? <NumericInput className={inputClass()} step={key === "breakMinutes" ? "1" : "any"}
        allowNegative={module === "payroll" && kind === "adjustment"} value={draft[key]} onChange={(event) => update(key, event.target.value)} />
      : <input className={inputClass()} type={type} value={draft[key]} onChange={(event) => update(key, event.target.value)} />}</Field>)}</div>;
  const shown = !dirty && !error && preview ? preview : {
    originalValues: preview?.originalValues || initialDraft(module, kind, row),
    proposedValues: changesFor(module, kind, draft),
    blockedReasons: [error || "Review changes against the current database before confirming."],
    affectedRecords: [], eligible: false, versionToken: "",
  };
  return <CorrectionDialog title={`Correct ${module === "dtr" ? "DTR" : module === "payroll" ? "Payroll" : "Truck"} ${kind}`}
    preview={shown} editor={<>{error && <p role="alert" className="mb-3 border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}{editor}</>}
    onReview={localMode ? undefined : review} reviewing={reviewing}
    reviewRequired={dirty || !preview || !baseline || Boolean(error)} onClose={onClose}
    onConfirm={async ({ reason, password, requestId, versionToken }) => {
      await applyOperationsCorrection(module, kind, organizationId, row.id,
        changesFor(module, kind, draft), password, reason, requestId, versionToken);
      onSaved();
    }} />;
}
