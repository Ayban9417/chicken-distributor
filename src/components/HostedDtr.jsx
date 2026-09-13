import { useState } from "react";
import { Clock3, Pencil, Plus, RefreshCw, Save } from "lucide-react";
import { Badge, Button, DateRange, Field, inputClass, ResponsiveTable, SectionHeader, StatCard } from "./ui";
import { useRemote } from "../hooks/useRemote";
import { loadDtrEntries, loadDtrPeople, saveTimeEntry } from "../services/dtrService";
import { readableError } from "../services/errors";
import { shortDate } from "../utils/business";
import { calculateDtrMinutes, formatDtrMinutes, shortTime, timeEntryForm, validateTimeEntry } from "../utils/hostedDtr";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
const monthStart = () => `${today().slice(0, 8)}01`;
const freshEntry = (userId) => ({ userId, date: today(), timeIn: "08:00", timeOut: "17:00", breakMinutes: "60" });

export function HostedDtr({ organizationId, userId, role }) {
  const admin = role === "owner_admin" || role === "payroll_admin";
  const [range, setRange] = useState({ start: monthStart(), end: today() });
  const [employeeId, setEmployeeId] = useState(admin ? "" : userId);
  const [epoch, setEpoch] = useState(0);
  const [editing, setEditing] = useState(null);
  const [status, setStatus] = useState({ busy: false, error: "", notice: "" });
  const people = useRemote(() => loadDtrPeople(organizationId), organizationId);
  const entries = useRemote(() => loadDtrEntries(organizationId, range, admin ? employeeId : userId), `${organizationId}-${range.start}-${range.end}-${admin ? employeeId : userId}-${epoch}`);
  const records = entries.data || [];
  const personName = (id) => (people.data || []).find((person) => person.user_id === id)?.full_name || "Employee";
  const completeMinutes = records.reduce((sum, row) => sum + Number(row.total_minutes || 0), 0);

  async function submit() {
    const error = validateTimeEntry(editing, records);
    if (error) return setStatus({ busy: false, error, notice: "" });
    setStatus({ busy: true, error: "", notice: "" });
    try {
      await saveTimeEntry(organizationId, editing);
      setEditing(null);
      setStatus({ busy: false, error: "", notice: "DTR entry saved." });
      setEpoch((value) => value + 1);
    } catch (reason) {
      const duplicate = reason?.code === "23505" ? "Only one DTR entry is allowed per employee and date." : readableError(reason);
      setStatus({ busy: false, error: duplicate, notice: "" });
    }
  }

  const startNew = () => {
    const defaultUser = admin ? employeeId || (people.data || []).find((person) => person.active)?.user_id || "" : userId;
    setEditing(freshEntry(defaultUser));
    setStatus({ busy: false, error: "", notice: "" });
  };

  return <div>
    <SectionHeader title="DTR" eyebrow="Hosted attendance" action={<div className="flex flex-wrap gap-2"><Button variant="secondary" aria-label="Refresh DTR" title="Refresh DTR" onClick={entries.refresh}><RefreshCw size={17} /></Button><Button onClick={startNew}><Plus size={17} />New Entry</Button></div>} />
    {(status.error || entries.error || people.error) && <p role="alert" className="mb-4 border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-800">{status.error || entries.error || people.error}</p>}
    {status.notice && <p className="mb-4 border border-emerald-200 bg-emerald-50 p-3 font-semibold text-emerald-800">{status.notice}</p>}
    <div className="grid gap-3 sm:grid-cols-3"><StatCard label="Entries" value={records.length} icon={Clock3} /><StatCard label="Completed Time" value={formatDtrMinutes(completeMinutes)} icon={Clock3} tone="green" /><StatCard label="Open Entries" value={records.filter((row) => !row.time_out).length} icon={Clock3} tone="amber" /></div>
    <section className="report-section mt-5"><div className="flex flex-wrap items-end gap-3"><DateRange range={range} setRange={setRange} />{admin && <Field label="Employee"><select className={inputClass()} value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}><option value="">All Employees</option>{(people.data || []).map((person) => <option key={person.user_id} value={person.user_id}>{person.full_name}{person.active ? "" : " (Inactive)"}</option>)}</select></Field>}</div></section>
    {editing && <section className="report-section"><h2 className="mb-4 text-lg font-bold">{editing.id ? "Edit DTR Entry" : "New DTR Entry"}</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{admin ? <Field label="Employee"><select className={inputClass()} value={editing.userId} onChange={(event) => setEditing({ ...editing, userId: event.target.value })}><option value="">Select Employee</option>{(people.data || []).filter((person) => person.active || person.user_id === editing.userId).map((person) => <option key={person.user_id} value={person.user_id}>{person.full_name}</option>)}</select></Field> : <Field label="Employee"><input className={inputClass()} disabled value={personName(userId)} /></Field>}<Field label="Date"><input className={inputClass()} type="date" max={today()} value={editing.date} onInput={(event) => setEditing({ ...editing, date: event.target.value })} /></Field><Field label="Time In"><input className={inputClass()} type="time" step="60" value={editing.timeIn} onInput={(event) => setEditing({ ...editing, timeIn: event.target.value })} /></Field><Field label="Time Out (Optional)"><input className={inputClass()} type="time" step="60" value={editing.timeOut} onInput={(event) => setEditing({ ...editing, timeOut: event.target.value })} /></Field><Field label="Break (Minutes)"><input className={inputClass()} type="number" min="0" step="1" value={editing.breakMinutes} onChange={(event) => setEditing({ ...editing, breakMinutes: event.target.value })} /></Field></div><p className="mt-3 text-sm font-semibold text-slate-600">Calculated time: {formatDtrMinutes(calculateDtrMinutes(editing.timeIn, editing.timeOut, editing.breakMinutes))}</p><div className="mt-4 flex flex-wrap gap-2"><Button disabled={status.busy} onClick={submit}><Save size={17} />{status.busy ? "Saving..." : "Save Entry"}</Button><Button variant="ghost" disabled={status.busy} onClick={() => setEditing(null)}>Cancel</Button></div></section>}
    <section className="report-section"><h2 className="mb-4 text-lg font-bold">Attendance Records</h2>{entries.loading && !entries.data ? <p className="py-8 text-center text-slate-500">Loading hosted DTR records...</p> : <ResponsiveTable columns={["Employee", "Date", "Time In", "Time Out", "Break", "Total", "Status", "Actions"]} rows={records.map((row) => [personName(row.user_id), shortDate(row.work_date), shortTime(row.time_in), shortTime(row.time_out) || "-", `${row.break_minutes} min`, formatDtrMinutes(row.total_minutes), <Badge tone={row.time_out ? "green" : "amber"}>{row.time_out ? "Complete" : "Clocked In"}</Badge>, <Button variant="ghost" onClick={() => { setEditing(timeEntryForm(row)); setStatus({ busy: false, error: "", notice: "" }); }}><Pencil size={16} />Edit</Button>])} />}</section>
  </div>;
}
