import { useMemo, useState } from "react";
import { Banknote, CheckCircle2, Pencil, Plus, RefreshCw, Save } from "lucide-react";
import { Badge, Button, Field, inputClass, ResponsiveTable, SectionHeader, StatCard, StatMini } from "./ui";
import { useRemote } from "../hooks/useRemote";
import { createPayrollPeriod, loadPayroll, savePayrollEntry, setPayrollPeriodStatus } from "../services/payrollService";
import { readableError } from "../services/errors";
import { currency, shortDate } from "../utils/business";
import { attendanceForPeriod, payrollCalculation, payrollEntryForm, validatePayroll } from "../utils/hostedPayroll";
import { formatDtrMinutes } from "../utils/hostedDtr";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
const freshPeriod = () => ({ start: `${today().slice(0, 8)}01`, end: today() });
const freshEntry = (periodId, userId = "") => ({ periodId, userId, hourlyRate: 85, overtimeHours: 0, overtimeRate: 110, allowances: 0, deductions: 0, status: "draft" });
const tone = (status) => status === "paid" ? "green" : status === "reviewed" ? "blue" : "amber";

export function HostedPayroll({ organizationId, userId }) {
  const [epoch, setEpoch] = useState(0);
  const remote = useRemote(() => loadPayroll(organizationId), `${organizationId}-${epoch}`);
  const [periodId, setPeriodId] = useState("");
  const [periodForm, setPeriodForm] = useState(null);
  const [entryForm, setEntryForm] = useState(null);
  const [status, setStatus] = useState({ busy: false, error: "", notice: "" });
  const data = remote.data || { periods: [], entries: [], timeEntries: [], people: [] };
  const selectedId = periodId || data.periods[0]?.id || "";
  const period = data.periods.find((row) => row.id === selectedId);
  const entries = data.entries.filter((row) => row.payroll_period_id === selectedId);
  const attendance = entryForm && period ? attendanceForPeriod(data.timeEntries, entryForm.userId, period) : [];
  const totals = entryForm ? payrollCalculation(entryForm, attendance) : null;
  const periodTotals = useMemo(() => entries.reduce((sum, row) => ({ gross: sum.gross + Number(row.gross_pay), net: sum.net + Number(row.net_pay) }), { gross: 0, net: 0 }), [entries]);
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

  async function advance() {
    const next = period.status === "draft" ? "reviewed" : "paid";
    setStatus({ busy: true, error: "", notice: "" });
    try { await setPayrollPeriodStatus(period.id, next); refresh(`Pay period marked ${next}.`); } catch (reason) { fail(reason); }
  }

  return <div>
    <SectionHeader title="Payroll" eyebrow="Pay periods and DTR-based payroll" action={<div className="flex flex-wrap gap-2"><Button variant="secondary" aria-label="Refresh payroll" onClick={remote.refresh}><RefreshCw size={17} /></Button><Button onClick={() => { setPeriodForm(freshPeriod()); setEntryForm(null); }}><Plus size={17} />Pay Period</Button></div>} />
    <p className="mb-4 border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">Prototype payroll calculation — statutory deductions not yet implemented.</p>
    {(status.error || remote.error) && <p role="alert" className="mb-4 border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-800">{status.error || remote.error}</p>}{status.notice && <p className="mb-4 border border-emerald-200 bg-emerald-50 p-3 font-semibold text-emerald-800">{status.notice}</p>}
    {periodForm && <section className="report-section"><h2 className="mb-4 text-lg font-bold">New Pay Period</h2><div className="grid gap-3 sm:grid-cols-2"><Field label="Period Start"><input type="date" className={inputClass()} value={periodForm.start} onInput={(event) => setPeriodForm({ ...periodForm, start: event.target.value })} /></Field><Field label="Period End"><input type="date" className={inputClass()} value={periodForm.end} onInput={(event) => setPeriodForm({ ...periodForm, end: event.target.value })} /></Field></div><div className="mt-4 flex gap-2"><Button disabled={status.busy} onClick={addPeriod}><Save size={17} />Create Period</Button><Button variant="ghost" onClick={() => setPeriodForm(null)}>Cancel</Button></div></section>}
    {!remote.loading && !data.periods.length ? <p className="report-section text-center text-slate-500">No pay periods configured.</p> : data.periods.length > 0 && <><section className="report-section"><div className="flex flex-wrap items-end justify-between gap-3"><Field label="Pay Period"><select className={inputClass()} value={selectedId} onChange={(event) => { setPeriodId(event.target.value); setEntryForm(null); }}>{data.periods.map((row) => <option key={row.id} value={row.id}>{shortDate(row.period_start)} - {shortDate(row.period_end)} / {row.status}</option>)}</select></Field>{period && <div className="flex items-center gap-2"><Badge tone={tone(period.status)}>{period.status}</Badge>{period.status !== "paid" && period.status !== "voided" && <Button disabled={status.busy || !entries.length} onClick={advance}><CheckCircle2 size={17} />Mark {period.status === "draft" ? "Reviewed" : "Paid"}</Button>}</div>}</div></section><div className="grid gap-3 sm:grid-cols-3"><StatCard label="Employees" value={entries.length} icon={Banknote} /><StatCard label="Gross Pay" value={currency(periodTotals.gross)} icon={Banknote} tone="blue" /><StatCard label="Net Pay" value={currency(periodTotals.net)} icon={Banknote} tone="green" /></div><div className="mt-5"><Button disabled={period?.status !== "draft"} onClick={() => setEntryForm(freshEntry(selectedId, data.people.find((person) => person.active)?.user_id))}><Plus size={17} />Payroll Entry</Button></div></>}
    {entryForm && period && <section className="report-section"><h2 className="mb-4 text-lg font-bold">{entryForm.id ? "Edit Payroll Entry" : "New Payroll Entry"}</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Field label="Employee"><select disabled={Boolean(entryForm.id)} className={inputClass()} value={entryForm.userId} onChange={(event) => setEntryForm({ ...entryForm, userId: event.target.value })}><option value="">Select Employee</option>{data.people.filter((person) => person.active || person.user_id === entryForm.userId).map((person) => <option key={person.user_id} value={person.user_id}>{person.full_name}</option>)}</select></Field>{[["Hourly Rate", "hourlyRate"], ["Overtime Hours", "overtimeHours"], ["Overtime Rate", "overtimeRate"], ["Allowances", "allowances"], ["Deductions", "deductions"]].map(([label, key]) => <Field key={key} label={label}><input type="number" min="0" step="0.01" className={inputClass()} value={entryForm[key]} onChange={(event) => setEntryForm({ ...entryForm, [key]: event.target.value })} /></Field>)}</div>{totals && <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatMini label="DTR Days / Time" value={`${totals.days} / ${formatDtrMinutes(totals.regularMinutes)}`} /><StatMini label="Base Pay" value={currency(totals.basePay)} /><StatMini label="Overtime Pay" value={currency(totals.overtimePay)} /><StatMini label="Gross / Net" value={`${currency(totals.grossPay)} / ${currency(totals.netPay)}`} /></div>}<div className="mt-4 flex gap-2"><Button disabled={status.busy || period.status !== "draft"} onClick={saveEntry}><Save size={17} />Save Payroll</Button><Button variant="ghost" onClick={() => setEntryForm(null)}>Cancel</Button></div></section>}
    {!!period && <section className="report-section"><h2 className="mb-4 text-lg font-bold">Payroll Entries</h2><ResponsiveTable columns={["Employee", "DTR Time", "Base Pay", "Overtime", "Allowances", "Deductions", "Gross", "Net", "Status", "Actions"]} rows={entries.map((row) => [personName(row.user_id), formatDtrMinutes(row.regular_minutes), currency(row.base_pay), `${formatDtrMinutes(row.overtime_minutes)} / ${currency(row.overtime_pay)}`, currency(row.allowances), currency(row.deductions), currency(row.gross_pay), currency(row.net_pay), <Badge tone={tone(row.status)}>{row.status}</Badge>, <Button variant="ghost" disabled={period.status !== "draft"} onClick={() => setEntryForm(payrollEntryForm(row))}><Pencil size={16} />Edit</Button>])} /></section>}
  </div>;
}
