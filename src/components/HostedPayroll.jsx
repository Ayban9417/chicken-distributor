import { useMemo, useState } from "react";
import { Banknote, CheckCircle2, History, Pencil, Plus, RefreshCw, Save } from "lucide-react";
import { Badge, Button, Field, inputClass, MoneyInput, ResponsiveTable, SectionHeader, StatCard, StatMini } from "./ui";
import { useRemote } from "../hooks/useRemote";
import { createPayrollPeriod, loadPayroll, savePayrollEntry } from "../services/payrollService";
import { readableError } from "../services/errors";
import { currency, shortDate } from "../utils/business";
import { attendanceForPeriod, payrollCalculation, validatePayroll } from "../utils/hostedPayroll";
import { formatDtrMinutes } from "../utils/hostedDtr";
import { OperationsCorrectionDialog } from "./OperationsCorrectionDialog";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
const freshPeriod = () => ({ start: `${today().slice(0, 8)}01`, end: today() });
const freshEntry = (periodId, userId = "") => ({ periodId, userId, hourlyRate: 85, overtimeHours: 0, overtimeRate: 110, allowances: 0, deductions: 0, notes: "", status: "draft" });
const tone = (status) => status === "paid" ? "green" : status === "reviewed" ? "blue" : "amber";

export function HostedPayroll({ organizationId, userId, role, onHistory }) {
  const owner = role === "owner_admin";
  const [epoch, setEpoch] = useState(0);
  const remote = useRemote(() => loadPayroll(organizationId, undefined, owner), `${organizationId}-${epoch}-${role}`);
  const [periodId, setPeriodId] = useState("");
  const [periodForm, setPeriodForm] = useState(null);
  const [entryForm, setEntryForm] = useState(null);
  const [correction, setCorrection] = useState(null);
  const [status, setStatus] = useState({ busy: false, error: "", notice: "" });
  const data = remote.data || { periods: [], entries: [], timeEntries: [], people: [], adjustments: [] };
  const selectedId = periodId || data.periods[0]?.id || "";
  const period = data.periods.find((row) => row.id === selectedId);
  const entries = data.entries.filter((row) => row.payroll_period_id === selectedId);
  const periodAdjustments = (data.adjustments || []).filter((row) =>
    entries.some((entry) => entry.id === row.payroll_entry_id));
  const attendance = entryForm && period ? attendanceForPeriod(data.timeEntries, entryForm.userId, period) : [];
  const totals = entryForm ? payrollCalculation(entryForm, attendance) : null;
  const periodTotals = useMemo(() => entries.reduce((sum, row) => ({ gross: sum.gross + Number(row.gross_pay), net: sum.net + Number(row.net_pay) }), { gross: 0, net: 0 }), [entries]);
  const approvedTotals = periodAdjustments.filter((row) => row.approval).reduce((sum, row) => ({
    gross: sum.gross + Number(row.gross_delta), net: sum.net + Number(row.net_delta),
  }), { gross: 0, net: 0 });
  const personName = (id) => data.people.find((person) => person.user_id === id)?.full_name || "Employee";
  const refresh = (notice) => { setEpoch((value) => value + 1); setStatus({ busy: false, error: "", notice }); };
  const fail = (reason) => setStatus({ busy: false, error: readableError(reason), notice: "" });

  async function addPeriod() {
    if (!periodForm.start || !periodForm.end || periodForm.start > periodForm.end) return setStatus({ busy: false, error: "Enter a valid pay period.", notice: "" });
    setStatus({ busy: true, error: "", notice: "" });
    try { const created = await createPayrollPeriod(organizationId, periodForm, userId); setPeriodId(created.id); setPeriodForm(null); refresh("Pay period created."); } catch (reason) { fail(reason); }
  }

  async function saveEntry() {
    const validation = validatePayroll(entryForm, totals);
    if (validation) return setStatus({ busy: false, error: validation, notice: "" });
    setStatus({ busy: true, error: "", notice: "" });
    try { await savePayrollEntry(entryForm, attendance); setEntryForm(null); refresh("Payroll entry saved."); } catch (reason) { fail(reason); }
  }

  return <div>
    <SectionHeader title="Payroll" eyebrow="Pay periods and DTR-based payroll" action={<div className="flex flex-wrap gap-2"><Button variant="secondary" aria-label="Refresh payroll" onClick={remote.refresh}><RefreshCw size={17} /></Button><Button onClick={() => { setPeriodForm(freshPeriod()); setEntryForm(null); }}><Plus size={17} />Pay Period</Button></div>} />
    <p className="mb-4 border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">Prototype payroll calculation — statutory deductions not yet implemented.</p>
    {owner && data.adjustmentsUnavailable && <p className="mb-4 border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">Payroll adjustment services are not configured. Protected corrections cannot be saved until the Phase 7 migration and function are available.</p>}
    {(status.error || remote.error) && <p role="alert" className="mb-4 border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-800">{status.error || remote.error}</p>}{status.notice && <p className="mb-4 border border-emerald-200 bg-emerald-50 p-3 font-semibold text-emerald-800">{status.notice}</p>}
    {periodForm && <section className="report-section"><h2 className="mb-4 text-lg font-bold">New Pay Period</h2><div className="grid gap-3 sm:grid-cols-2"><Field label="Period Start"><input type="date" className={inputClass()} value={periodForm.start} onInput={(event) => setPeriodForm({ ...periodForm, start: event.target.value })} /></Field><Field label="Period End"><input type="date" className={inputClass()} value={periodForm.end} onInput={(event) => setPeriodForm({ ...periodForm, end: event.target.value })} /></Field></div><div className="mt-4 flex gap-2"><Button disabled={status.busy} onClick={addPeriod}><Save size={17} />Create Period</Button><Button variant="ghost" onClick={() => setPeriodForm(null)}>Cancel</Button></div></section>}
    {!remote.loading && !data.periods.length ? <p className="report-section text-center text-slate-500">No pay periods configured.</p> : data.periods.length > 0 && <><section className="report-section"><div className="flex flex-wrap items-end justify-between gap-3"><Field label="Pay Period"><select className={inputClass()} value={selectedId} onChange={(event) => { setPeriodId(event.target.value); setEntryForm(null); }}>{data.periods.map((row) => <option key={row.id} value={row.id}>{shortDate(row.period_start)} - {shortDate(row.period_end)} / {row.status}</option>)}</select></Field>{period && <div className="flex flex-wrap items-center gap-2"><Badge tone={tone(period.status)}>{period.status}</Badge>{owner && period.status !== "paid" && period.status !== "voided" && <Button disabled={status.busy || !entries.length} onClick={() => setCorrection({ kind: "period", row: period })}><CheckCircle2 size={17} />Mark {period.status === "draft" ? "Reviewed" : "Paid"}</Button>}{owner && <Button variant="ghost" onClick={() => onHistory?.(period.id)}><History size={16} />Edit History</Button>}</div>}</div></section><div className="grid gap-3 sm:grid-cols-3"><StatCard label="Employees" value={entries.length} icon={Banknote} /><StatCard label="Gross Pay" value={currency(periodTotals.gross)} icon={Banknote} tone="blue" /><StatCard label="Net Pay" value={currency(periodTotals.net)} icon={Banknote} tone="green" /></div><div className="mt-5"><Button disabled={period?.status !== "draft"} onClick={() => setEntryForm(freshEntry(selectedId, data.people.find((person) => person.active)?.user_id))}><Plus size={17} />Payroll Entry</Button></div></>}
    {entryForm && period && <section className="report-section"><h2 className="mb-4 text-lg font-bold">New Payroll Entry</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Field label="Employee"><select className={inputClass()} value={entryForm.userId} onChange={(event) => setEntryForm({ ...entryForm, userId: event.target.value })}><option value="">Select Employee</option>{data.people.filter((person) => person.active || person.user_id === entryForm.userId).map((person) => <option key={person.user_id} value={person.user_id}>{person.full_name}</option>)}</select></Field>{[["Hourly Rate", "hourlyRate"], ["Overtime Hours", "overtimeHours"], ["Overtime Rate", "overtimeRate"], ["Allowances", "allowances"], ["Deductions", "deductions"]].map(([label, key]) => <Field key={key} label={label}>{key === "overtimeHours" ? <input type="number" min="0" step="0.01" className={inputClass()} value={entryForm[key]} onChange={(event) => setEntryForm({ ...entryForm, [key]: event.target.value })} /> : <MoneyInput value={entryForm[key]} onChange={(event) => setEntryForm({ ...entryForm, [key]: event.target.value })} />}</Field>)}</div><Field label="Notes"><input className={inputClass()} value={entryForm.notes} onChange={(event) => setEntryForm({ ...entryForm, notes: event.target.value })} /></Field>{totals && <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatMini label="DTR Days / Time" value={`${totals.days} / ${formatDtrMinutes(totals.regularMinutes)}`} /><StatMini label="Base Pay" value={currency(totals.basePay)} /><StatMini label="Overtime Pay" value={currency(totals.overtimePay)} /><StatMini label="Gross / Net" value={`${currency(totals.grossPay)} / ${currency(totals.netPay)}`} /></div>}<div className="mt-4 flex gap-2"><Button disabled={status.busy || period.status !== "draft"} onClick={saveEntry}><Save size={17} />Save Payroll</Button><Button variant="ghost" onClick={() => setEntryForm(null)}>Cancel</Button></div></section>}
    {!!period && <section className="report-section"><h2 className="mb-4 text-lg font-bold">Payroll Entries</h2><ResponsiveTable columns={["Employee", "DTR Time", "Base Pay", "Overtime", "Allowances", "Deductions", "Gross", "Net", "Status", "Actions"]} rows={entries.map((row) => [personName(row.user_id), formatDtrMinutes(row.regular_minutes), currency(row.base_pay), `${formatDtrMinutes(row.overtime_minutes)} / ${currency(row.overtime_pay)}`, currency(row.allowances), currency(row.deductions), currency(row.gross_pay), currency(row.net_pay), <Badge tone={tone(row.status)}>{row.status}</Badge>, owner ? <div className="flex flex-wrap gap-1"><Button variant="ghost" onClick={() => setCorrection({ kind: period.status === "draft" ? "entry" : "adjustment", row })}><Pencil size={16} />{period.status === "draft" ? "Edit" : "Adjustment"}</Button><Button variant="ghost" onClick={() => onHistory?.(row.id)}><History size={16} />History</Button></div> : "-"])} /></section>}
    {owner && !!period && <section className="report-section"><h2 className="mb-4 text-lg font-bold">Payroll Adjustments</h2><p className="mb-3 text-sm text-slate-600">Original payroll is unchanged. Approved adjustments: {currency(approvedTotals.gross)} gross / {currency(approvedTotals.net)} net. Adjusted totals: {currency(periodTotals.gross + approvedTotals.gross)} gross / {currency(periodTotals.net + approvedTotals.net)} net.</p><ResponsiveTable columns={["Employee", "Gross Change", "Net Change", "Notes", "Status", "Actions"]} rows={periodAdjustments.map((row) => [personName(entries.find((entry) => entry.id === row.payroll_entry_id)?.user_id), currency(row.gross_delta), currency(row.net_delta), row.notes, <Badge tone={row.approval ? "green" : "amber"}>{row.approval ? "Approved" : "Pending"}</Badge>, <div className="flex flex-wrap gap-1">{!row.approval && <Button variant="ghost" onClick={() => setCorrection({ kind: "approval", row })}><CheckCircle2 size={16} />Approve</Button>}<Button variant="ghost" onClick={() => onHistory?.(row.payroll_entry_id)}><History size={16} />History</Button></div>])} /></section>}
    {correction && <OperationsCorrectionDialog module="payroll" kind={correction.kind} organizationId={organizationId} row={correction.row} onClose={() => setCorrection(null)} onSaved={() => { setCorrection(null); refresh("Payroll correction saved and audited."); }} />}
  </div>;
}
