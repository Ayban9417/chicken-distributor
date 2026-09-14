import { useState } from "react";
import { Plus, Pencil, Trash2, Clock, Check, Gauge, Wrench, Save } from "lucide-react";
import { Badge, Button, DateRange, Field, inputClass, MoneyInput, ResponsiveTable, SectionHeader, StatMini } from "./ui";
import { currency, shortDate } from "../utils/business";
import { addMonths, attendanceHours, businessWeek, inRange, payrollTotals, truckAlerts } from "../utils/operations";
import { demoToday, truckRules } from "../data/demoData";

const uid = (prefix) => prefix + "-" + crypto.randomUUID();
const activeUsers = (users) => users.filter((user) => user.active);
function Actions({ onSave, onCancel, disabled }) {
  return <div className="mt-4 flex flex-wrap gap-2"><Button onClick={onSave} disabled={disabled}><Save size={17} />Save</Button><Button variant="secondary" onClick={onCancel}>Cancel</Button></div>;
}
function Editor({ title, children }) {
  return <section className="report-section"><h2 className="mb-4 text-lg font-bold">{title}</h2>{children}</section>;
}
function EmployeeSelect({ users, value, onChange }) {
  return <Field label="Employee"><select className={inputClass()} value={value} onChange={(e) => onChange(e.target.value)}>{users.map((user) => <option key={user.id} value={user.id}>{user.name}{user.active ? "" : " (Inactive)"}</option>)}</select></Field>;
}
export function Administration({ state, setUsers, addAudit, pushToast, onSaveUser, onToggleUser, onDeleteUser, canProvision = true, canEditNames = true, provisioningNotice = "" }) {
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const roles = ["Owner / Admin", "Agent", "Cashier", "Warehouse", "Payroll Admin"];
  const historical = (user) => [state.outs || [], state.collections || [], state.expenses || [], state.dcrs || []].some((records) => records.some((item) => item.agentId === user.id)) ||
    (state.auditLog || []).some((item) => item.userId === user.id || item.actor === user.name) ||
    (state.attendance || []).some((item) => item.employeeId === user.id) || (state.payroll || []).some((item) => item.employeeId === user.id);
  const lastOwner = (user) => user.active && user.role === "Owner / Admin" && state.users.filter((item) => item.active && item.role === "Owner / Admin").length === 1;
  async function save() {
    if (!editing.name.trim()) return setError("Enter a user name.");
    const old = state.users.find((item) => item.id === editing.id);
    if (old && lastOwner(old) && (!editing.active || editing.role !== "Owner / Admin")) return setError("Keep at least one active Owner / Admin.");
    const user = { ...editing, name: editing.name.trim(), id: editing.id || uid("user") };
    if (onSaveUser) {
      setBusy(true);
      try {
        const saved = await onSaveUser(user, old);
        if (!saved) return;
        setEditing(null); setError(""); pushToast?.("User saved");
      } catch (reason) {
        setError(reason?.message || "Unable to save user.");
      } finally {
        setBusy(false);
      }
      return;
    }
    setUsers((items) => old ? items.map((item) => item.id === user.id ? user : item) : [...items, user]);
    addAudit((old ? "Edited user " : "Added user ") + user.name, "Owner / Admin");
    setEditing(null); setError(""); pushToast("User saved");
  }
  async function remove(user) {
    if (historical(user) || lastOwner(user)) return;
    if (onDeleteUser) {
      setBusy(true);
      try { await onDeleteUser(user); } catch (reason) { setError(reason?.message || "Unable to delete user."); } finally { setBusy(false); }
      return;
    }
    setUsers((items) => items.filter((item) => item.id !== user.id));
    addAudit("Deleted unused demo user " + user.name, "Owner / Admin");
    pushToast("Unused demo user deleted");
  }
  return <>
    <SectionHeader title="Administration" action={<Button disabled={!canProvision || busy} title={!canProvision ? "User provisioning requires a secure admin-side action." : ""} onClick={() => { setError(""); setEditing({ name: "", role: "Agent", active: true }); }}><Plus size={17} />Add User</Button>} />
    {provisioningNotice && <p className="mb-4 border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{provisioningNotice}</p>}
    {editing && <Editor title={editing.id ? "Edit User" : "Add User"}><div className="grid gap-3 sm:grid-cols-3">
      <Field label="Name"><input disabled={!canEditNames && Boolean(editing.id)} className={inputClass()} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
      <Field label="Role"><select className={inputClass()} value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })}>{roles.map((role) => <option key={role} value={role}>{role === "Agent" ? "Salesman" : role}</option>)}</select></Field>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />Active</label>
    </div>{error && <p role="alert" className="mt-3 text-rose-700">{error}</p>}<Actions onSave={save} onCancel={() => setEditing(null)} disabled={busy} /></Editor>}
    {!editing && error && <p role="alert" className="mb-4 text-rose-700">{error}</p>}
    <ResponsiveTable columns={["User", "Role", "Status", "Actions"]} rows={state.users.map((user) => [user.name, user.role === "Agent" ? "Salesman / DCR" : user.role, <Badge tone={user.active ? "green" : "slate"}>{user.active ? "Active" : "Inactive"}</Badge>,
      <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { setError(""); setEditing({ ...user }); }}><Pencil size={16} />Edit</Button>
        <Button variant="secondary" disabled={busy || lastOwner(user)} onClick={async () => { if (onToggleUser) { setBusy(true); setError(""); try { await onToggleUser(user); } catch (reason) { setError(reason?.message || "Unable to update user."); } finally { setBusy(false); } return; } setUsers((items) => items.map((item) => item.id === user.id ? { ...item, active: !item.active } : item)); addAudit((user.active ? "Deactivated " : "Activated ") + user.name, "Owner / Admin"); }}>{user.active ? "Deactivate" : "Activate"}</Button>
        <Button variant="ghost" aria-label={"Delete " + user.name} title={historical(user) ? "Historical records: deactivate this user instead." : "Delete unused user"} disabled={historical(user) || lastOwner(user)} onClick={() => remove(user)}><Trash2 size={17} /></Button>
        {historical(user) && <span className="basis-full text-sm text-slate-500">Historical records retained; deactivate instead of deleting.</span>}
      </div>])} />
    <Editor title="Audit Log"><ResponsiveTable columns={["Date / Time", "User", "Activity"]} rows={state.auditLog.map((item) => [new Date(item.at).toLocaleString("en-PH"), item.actor, item.action])} /></Editor>
  </>;
}
export function Dtr({ users, attendance, setAttendance, pushToast, addAudit }) {
  const [range, setRange] = useState({ start: demoToday, end: demoToday });
  const [employee, setEmployee] = useState("All");
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [clockEmployee, setClockEmployee] = useState(activeUsers(users).find((user) => user.role === "Agent")?.id || users[0]?.id || "");
  const [clockTime, setClockTime] = useState("08:00");
  const records = attendance.filter((item) => inRange(item.date, range) && (employee === "All" || item.employeeId === employee));
  const current = attendance.find((item) => item.employeeId === clockEmployee && item.date === demoToday);
  function save(record) {
    const duplicate = attendance.some((item) => item.id !== record.id && item.employeeId === record.employeeId && item.date === record.date);
    if (!record.employeeId || !record.date || !record.timeIn || duplicate) return setError("Enter employee, date and Time In. One record per employee/day.");
    const minutes = (time) => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };
    if (Number(record.breakMinutes) < 0 || (record.timeOut && (record.timeOut <= record.timeIn || minutes(record.timeOut) - minutes(record.timeIn) < Number(record.breakMinutes)))) return setError("Time Out must follow Time In, with a valid break within the shift.");
    const item = { ...record, id: record.id || uid("dtr"), breakMinutes: Number(record.breakMinutes) };
    setAttendance((items) => record.id ? items.map((row) => row.id === item.id ? item : row) : [...items, item]);
    setEditing(null); setError(""); addAudit("Updated DTR for " + users.find((user) => user.id === item.employeeId)?.name, "Owner / Admin"); pushToast("DTR saved");
  }
  return <>
    <SectionHeader title="DTR" action={<Button onClick={() => { setError(""); setEditing({ employeeId: clockEmployee, date: demoToday, timeIn: "08:00", timeOut: "17:00", breakMinutes: 60 }); }}><Plus size={17} />Manual Entry</Button>} />
    <div className="flex flex-wrap items-end gap-3"><DateRange range={range} setRange={setRange} /><Button variant="secondary" onClick={() => setRange({ start: demoToday, end: demoToday })}>Today</Button>
      <Field label="Employee Filter"><select className={inputClass()} value={employee} onChange={(e) => setEmployee(e.target.value)}><option>All</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></Field></div>
    <Editor title={"Attendance / " + shortDate(demoToday)}><div className="flex flex-wrap items-end gap-3">
      <EmployeeSelect users={activeUsers(users)} value={clockEmployee} onChange={setClockEmployee} />
      <Field label="Time"><input className={inputClass()} type="time" value={clockTime} onInput={(e) => setClockTime(e.target.value)} /></Field>
      <Button disabled={Boolean(current) || !clockTime} onClick={() => save({ employeeId: clockEmployee, date: demoToday, timeIn: clockTime, timeOut: "", breakMinutes: 0 })}><Clock size={17} />Time In</Button>
      <Button variant="secondary" disabled={!current || Boolean(current.timeOut) || !clockTime} onClick={() => save({ ...current, timeOut: clockTime })}><Clock size={17} />Time Out</Button>
    </div></Editor>
    {error && <p role="alert" className="my-3 text-rose-700">{error}</p>}
    {editing && <Editor title="Manual Entry / Edit (Admin)"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <EmployeeSelect users={users.filter((user) => user.active || user.id === editing.employeeId)} value={editing.employeeId} onChange={(employeeId) => setEditing({ ...editing, employeeId })} />
      <Field label="Date"><input className={inputClass()} type="date" value={editing.date} onInput={(e) => setEditing({ ...editing, date: e.target.value })} /></Field>
      {["timeIn", "timeOut"].map((key) => <Field key={key} label={key === "timeIn" ? "Time In" : "Time Out"}><input className={inputClass()} type="time" value={editing[key]} onInput={(e) => setEditing({ ...editing, [key]: e.target.value })} /></Field>)}
      <Field label="Break (Minutes)"><input className={inputClass()} type="number" min="0" value={editing.breakMinutes} onChange={(e) => setEditing({ ...editing, breakMinutes: e.target.value })} /></Field>
    </div><Actions onSave={() => save(editing)} onCancel={() => setEditing(null)} /></Editor>}
    <ResponsiveTable columns={["Employee", "Date", "Time In", "Time Out", "Break", "Total Hours", "Status", "Actions"]} rows={records.map((item) => [
      users.find((user) => user.id === item.employeeId)?.name, shortDate(item.date), item.timeIn, item.timeOut || "-", item.breakMinutes + " min",
      attendanceHours(item).toFixed(2), <Badge tone={item.timeOut ? "green" : "amber"}>{item.timeOut ? "Complete" : "Clocked In"}</Badge>,
      <Button variant="ghost" onClick={() => { setError(""); setEditing({ ...item }); }}><Pencil size={16} />Edit</Button>,
    ])} />
  </>;
}
export function Payroll({ users, attendance, payroll, setPayroll, pushToast, addAudit }) {
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const fresh = () => ({ employeeId: activeUsers(users).find((user) => user.role === "Agent")?.id || users[0]?.id || "", ...businessWeek(demoToday), rate: 85, overtimeHours: 0, overtimeRate: 110, allowances: 0, deductions: 0, status: "Draft" });
  function save() {
    if (!editing.start || !editing.end || editing.start > editing.end || ["rate", "overtimeHours", "overtimeRate", "allowances", "deductions"].some((key) => editing[key] === "" || !Number.isFinite(Number(editing[key])) || Number(editing[key]) < 0)) return setError("Enter a valid period and nonnegative payroll amounts.");
    if (payroll.some((item) => item.id !== editing.id && item.employeeId === editing.employeeId && item.start <= editing.end && item.end >= editing.start)) return setError("This employee already has a payroll period overlapping these dates.");
    const totals = payrollTotals(editing, attendance);
    if (totals.net < 0) return setError("Deductions cannot exceed gross pay.");
    const item = { ...editing, id: editing.id || uid("payroll") };
    setPayroll((items) => editing.id ? items.map((row) => row.id === item.id ? item : row) : [...items, item]);
    setEditing(null); setError(""); addAudit("Saved payroll draft", "Owner / Admin"); pushToast("Payroll saved");
  }
  function advance(record) {
    const totals = record.snapshot || payrollTotals(record, attendance);
    if (totals.net < 0 || !totals.hours) return pushToast("Complete DTR hours and check deductions before review.");
    const status = record.status === "Draft" ? "Reviewed" : "Paid";
    setPayroll((items) => items.map((item) => item.id === record.id ? { ...item, status, snapshot: totals } : item));
    addAudit("Payroll " + status + " for " + users.find((user) => user.id === record.employeeId)?.name, "Owner / Admin");
  }
  return <>
    <SectionHeader title="Payroll" action={<Button onClick={() => { setError(""); setEditing(fresh()); }}><Plus size={17} />New Pay Period</Button>} />
    <p className="mb-4 text-sm text-slate-500">Demo payroll estimate. Statutory contributions and tax are not calculated. Regular hours come from completed DTR records; enter only additional overtime hours.</p>
    {editing && <Editor title="Payroll Draft"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <EmployeeSelect users={users.filter((user) => user.active || user.id === editing.employeeId)} value={editing.employeeId} onChange={(employeeId) => setEditing({ ...editing, employeeId })} />
      {["start", "end"].map((key) => <Field key={key} label={key === "start" ? "Period Start" : "Period End"}><input className={inputClass()} type="date" value={editing[key]} onInput={(e) => setEditing({ ...editing, [key]: e.target.value })} /></Field>)}
      {[["rate", "Hourly Rate"], ["overtimeRate", "Overtime Rate"], ["allowances", "Allowances"], ["deductions", "Deductions"]].map(([key, label]) => <Field key={key} label={label}><MoneyInput value={editing[key]} onChange={(e) => setEditing({ ...editing, [key]: e.target.value })} /></Field>)}
      <Field label="Additional Overtime Hours"><input className={inputClass()} type="number" min="0" value={editing.overtimeHours} onChange={(e) => setEditing({ ...editing, overtimeHours: Number(e.target.value) })} /></Field>
    </div><div className="mt-4 grid gap-3 sm:grid-cols-3"><StatMini label="DTR Hours" value={payrollTotals(editing, attendance).hours.toFixed(2)} /><StatMini label="Gross Pay" value={currency(payrollTotals(editing, attendance).gross)} /><StatMini label="Net Pay" value={currency(payrollTotals(editing, attendance).net)} /></div>
    {error && <p role="alert" className="mt-3 text-rose-700">{error}</p>}<Actions onSave={save} onCancel={() => setEditing(null)} /></Editor>}
    <ResponsiveTable columns={["Employee", "Pay Period", "Hourly Rate", "Days / Hours", "Overtime", "Allowances", "Deductions", "Gross Pay", "Net Pay", "Status", "Actions"]} rows={payroll.map((record) => {
      const totals = record.snapshot || payrollTotals(record, attendance);
      return [users.find((user) => user.id === record.employeeId)?.name, shortDate(record.start) + " to " + shortDate(record.end), currency(record.rate), totals.days + " / " + totals.hours.toFixed(2), record.overtimeHours + " h", currency(record.allowances), currency(record.deductions), currency(totals.gross), currency(totals.net), <Badge tone={record.status === "Paid" ? "green" : "amber"}>{record.status}</Badge>,
        <div className="flex flex-wrap gap-2">{record.status === "Draft" && <Button variant="secondary" onClick={() => { setError(""); setEditing({ ...record }); }}><Pencil size={16} />Edit</Button>}{record.status !== "Paid" && <Button onClick={() => advance(record)}><Check size={16} />{record.status === "Draft" ? "Review" : "Mark Paid"}</Button>}{record.status === "Reviewed" && <Button variant="ghost" onClick={() => setPayroll((items) => items.map((item) => item.id === record.id ? { ...item, status: "Draft", snapshot: null } : item))}>Reopen Draft</Button>}</div>];
    })} />
  </>;
}
export function Trucks({ trucks, setTrucks, pushToast, addAudit }) {
  const [editing, setEditing] = useState(null);
  const [service, setService] = useState(null);
  const [error, setError] = useState("");
  const fresh = { unit: "", plate: "", model: "", mileage: 0, ltoExpiry: "", lastRenewalDate: "", nextRenewalDate: "", lastOilDate: "", lastOilMileage: 0, nextOilDate: "", nextOilMileage: "", status: "Active", notes: "" };
  function save() {
    const old = trucks.find((truck) => truck.id === editing.id);
    if (!editing.unit.trim() || !editing.plate.trim() || !editing.model.trim() || !editing.ltoExpiry) return setError("Enter unit, plate, make/model and LTO expiry.");
    if (trucks.some((truck) => truck.id !== editing.id && truck.plate.toLowerCase().replaceAll(" ", "") === editing.plate.toLowerCase().replaceAll(" ", ""))) return setError("This plate number already exists.");
    if (["mileage", "lastOilMileage", "nextOilMileage"].some((key) => editing[key] !== "" && (!Number.isFinite(Number(editing[key])) || Number(editing[key]) < 0)) || Number(editing.mileage) < Number(editing.lastOilMileage) || (old && Number(editing.mileage) < Number(old.mileage))) return setError("Mileage must be nonnegative and cannot move backwards.");
    if (editing.lastOilDate > demoToday || (editing.nextOilDate && editing.lastOilDate && editing.nextOilDate <= editing.lastOilDate)) return setError("Check oil change dates.");
    if (editing.lastRenewalDate && editing.lastRenewalDate > demoToday) return setError("Last Truck Renewal cannot be after the business date.");
    const item = { ...editing, id: editing.id || uid("truck"), plate: editing.plate.trim().toUpperCase(), nextRenewalDate: addMonths(editing.lastRenewalDate, truckRules.renewalMonths) };
    setTrucks((items) => old ? items.map((truck) => truck.id === item.id ? item : truck) : [...items, item]);
    setEditing(null); setError(""); addAudit("Saved truck " + item.unit, "Owner / Admin"); pushToast("Truck saved");
  }
  function saveService() {
    const truck = trucks.find((item) => item.id === service.id);
    if (service.mileage === "" || !Number.isFinite(Number(service.mileage)) || Number(service.mileage) < Number(truck.mileage)) return setError("New mileage cannot be less than the current mileage.");
    if (service.mode === "oil" && (!service.date || service.date > demoToday || service.date < truck.lastOilDate)) return setError("Enter a valid oil change date on or before the business date.");
    const next = new Date((service.date || demoToday) + "T00:00:00Z"); next.setUTCMonth(next.getUTCMonth() + truckRules.oilIntervalMonths);
    const patch = service.mode === "oil" ? { mileage: Number(service.mileage), lastOilMileage: Number(service.mileage), lastOilDate: service.date, nextOilMileage: Number(service.mileage) + truckRules.oilIntervalKm, nextOilDate: next.toISOString().slice(0, 10) } : { mileage: Number(service.mileage) };
    setTrucks((items) => items.map((item) => item.id === service.id ? { ...item, ...patch } : item));
    addAudit((service.mode === "oil" ? "Recorded oil change: " : "Updated mileage: ") + truck.unit, "Owner / Admin");
    setService(null); setError(""); pushToast("Truck updated");
  }
  return <>
    <SectionHeader title="Trucks" action={<Button onClick={() => { setError(""); setEditing({ ...fresh }); setService(null); }}><Plus size={17} />Add Truck</Button>} />
    {!trucks.length && <p className="mb-4 text-slate-500">No trucks configured.</p>}
    {error && <p role="alert" className="mb-4 text-rose-700">{error}</p>}
    {editing && <Editor title={editing.id ? "Edit Truck" : "Add Truck"}><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[["unit", "Unit Name / Truck Number", "text"], ["plate", "Plate Number", "text"], ["model", "Make / Model", "text"], ["mileage", "Current Mileage", "number"], ["ltoExpiry", "LTO Registration Expiry", "date"], ["lastRenewalDate", "Last Truck Renewal", "date"], ["lastOilDate", "Last Oil Change Date", "date"], ["lastOilMileage", "Last Oil Change Mileage", "number"], ["nextOilDate", "Next Oil Change Date", "date"], ["nextOilMileage", "Next Oil Change Mileage", "number"]].map(([key, label, type]) => <Field key={key} label={label}><input className={inputClass()} type={type} min={type === "number" ? 0 : undefined} value={editing[key]} onInput={(e) => setEditing({ ...editing, [key]: e.target.value })} /></Field>)}
      <Field label="Next Truck Renewal (+3 Months)"><input className={inputClass()} type="date" disabled value={addMonths(editing.lastRenewalDate, truckRules.renewalMonths)} /></Field>
      <Field label="Status"><select className={inputClass()} value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>{["Active", "Maintenance", "Inactive"].map((status) => <option key={status}>{status}</option>)}</select></Field>
      <Field label="Notes"><textarea className={inputClass()} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></Field>
    </div><Actions onSave={save} onCancel={() => setEditing(null)} /></Editor>}
    {service && <Editor title={service.mode === "oil" ? "Record Oil Change" : "Update Mileage"}><div className="grid gap-3 sm:grid-cols-2">
      <Field label="Current Mileage"><input className={inputClass()} type="number" min="0" value={service.mileage} onChange={(e) => setService({ ...service, mileage: e.target.value })} /></Field>
      {service.mode === "oil" && <Field label="Oil Change Date"><input className={inputClass()} type="date" value={service.date} onInput={(e) => setService({ ...service, date: e.target.value })} /></Field>}
    </div><Actions onSave={saveService} onCancel={() => setService(null)} /></Editor>}
    <div className="grid gap-4 xl:grid-cols-2">{trucks.map((truck) => <article key={truck.id} className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-xl font-bold">{truck.unit}</h2><p className="text-slate-500">{truck.plate} / {truck.model}</p></div><Badge>{truck.status}</Badge></div>
      <div className="my-3 flex flex-wrap gap-2">{truckAlerts(truck, demoToday, truckRules).map((alert) => <Badge key={alert} tone={alert.includes("Expired") || alert.includes("Overdue") ? "red" : "amber"}>{alert}</Badge>)}</div>
      <div className="grid grid-cols-2 gap-3">{[["Current Mileage", Number(truck.mileage).toLocaleString() + " km"], ["LTO Expiry", shortDate(truck.ltoExpiry)], ["Renewal Frequency", "Every 3 Months"], ["Last Truck Renewal", shortDate(truck.lastRenewalDate)], ["Next Truck Renewal", shortDate(truck.nextRenewalDate || addMonths(truck.lastRenewalDate, truckRules.renewalMonths))], ["Last Oil Change", (truck.lastOilDate ? shortDate(truck.lastOilDate) : "-") + " / " + Number(truck.lastOilMileage).toLocaleString() + " km"], ["Next Oil Change", (truck.nextOilDate ? shortDate(truck.nextOilDate) : "-") + " / " + (truck.nextOilMileage === "" ? "-" : Number(truck.nextOilMileage).toLocaleString() + " km")]].map(([label, value]) => <StatMini key={label} label={label} value={value} />)}</div>
      <p className="my-3 text-sm text-slate-500">{truck.notes}</p>
      <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { setError(""); setEditing({ ...truck }); setService(null); }}><Pencil size={16} />Edit</Button><Button variant="secondary" onClick={() => { setError(""); setEditing(null); setService({ id: truck.id, mileage: truck.mileage, mode: "mileage" }); }}><Gauge size={16} />Update Mileage</Button><Button onClick={() => { setError(""); setEditing(null); setService({ id: truck.id, date: demoToday, mileage: truck.mileage, mode: "oil" }); }}><Wrench size={16} />Record Oil Change</Button></div>
    </article>)}</div>
  </>;
}
