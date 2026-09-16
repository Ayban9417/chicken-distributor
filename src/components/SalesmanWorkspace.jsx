import { useMemo, useState } from "react";
import { Banknote, Clock3, PackageCheck, ReceiptText, RefreshCw, WalletCards } from "lucide-react";
import { Badge, Button, Field, inputClass, MoneyInput, ResponsiveTable, SectionHeader, StatCard, StatMini } from "./ui";
import { useRemote } from "../hooks/useRemote";
import { loadHostedFinanceParity, recordHostedExpense } from "../services/financeParityService";
import { loadHostedSalesmanInventory } from "../services/inventoryParityService";
import { loadDtrEntries, timeInNow, timeOutNow } from "../services/dtrService";
import { readableError } from "../services/errors";
import { buildDcr, currency, kg, shortDate } from "../utils/business";
import { businessWeek, collectibleRows, inRange, sum } from "../utils/operations";
import { attendanceHistoryStatus, attendanceState, formatDtrMinutes, shortTime } from "../utils/hostedDtr";

const categories = ["Fuel", "Parking", "Delivery Expense", "Toll", "Meals", "Repairs", "Other"];
export const manilaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());

const timeLabel = (value) => {
  const clock = shortTime(value);
  if (!clock) return "-";
  const [hour, minute] = clock.split(":").map(Number);
  return new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit" }).format(new Date(2000, 0, 1, hour, minute));
};

const normalizedAttendance = (row) => row && ({
  id: row.id,
  date: row.work_date || row.date,
  timeIn: row.time_in || row.timeIn,
  timeOut: row.time_out || row.timeOut,
  totalMinutes: row.total_minutes ?? (row.timeIn && row.timeOut ? Math.max(0, (Number(row.timeOut.slice(0, 2)) * 60 + Number(row.timeOut.slice(3, 5))) - (Number(row.timeIn.slice(0, 2)) * 60 + Number(row.timeIn.slice(3, 5))) - Number(row.breakMinutes || 0)) : null),
});

export function SalesmanAttendance({ entry, busy = false, error = "", onTimeIn, onTimeOut, compact = false }) {
  const record = normalizedAttendance(entry);
  const status = attendanceState(record && { time_out: record.timeOut });
  const title = status === "not_timed_in" ? "NOT TIMED IN" : status === "working" ? "WORKING" : "COMPLETED";
  return <section className={compact ? "rounded-lg border border-slate-200 bg-white p-4 shadow-sm" : "report-section"}>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-extrabold uppercase">My Attendance</h2><Badge tone={status === "completed" ? "green" : status === "working" ? "amber" : "slate"}>{title}</Badge></div>
    {error && <p role="alert" className="mb-3 border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</p>}
    {record && <div className="mb-4 grid gap-3 sm:grid-cols-3"><StatMini label="Time In" value={timeLabel(record.timeIn)} /><StatMini label="Time Out" value={timeLabel(record.timeOut)} /><StatMini label="Total" value={formatDtrMinutes(record.totalMinutes)} /></div>}
    {status === "not_timed_in" && <Button className="w-full sm:w-auto" disabled={busy} onClick={onTimeIn}><Clock3 size={18} />{busy ? "Recording..." : "Time In Now"}</Button>}
    {status === "working" && <Button className="w-full sm:w-auto" disabled={busy} onClick={onTimeOut}><Clock3 size={18} />{busy ? "Recording..." : "Time Out Now"}</Button>}
  </section>;
}

function SalesmanDashboardView({ name, userId, state, inventoryRows, attendance, date, busy, attendanceError, onTimeIn, onTimeOut, onNavigate }) {
  const todayRange = { start: date, end: date };
  const week = businessWeek(date);
  const own = (rows) => (rows || []).filter((row) => row.agentId === userId);
  const sales = own(state.outs);
  const collections = own(state.collections);
  const expenses = own(state.expenses);
  const dcr = buildDcr({ collections, expenses, customers: state.customers || [], agentId: userId, date });
  const locked = (state.dcrs || []).find((row) => row.agentId === userId && row.date === date);
  const currentAttendance = (attendance || []).map(normalizedAttendance).find((row) => row.date === date);
  const ownInventory = (inventoryRows || []).filter((row) => !row.salesmanId || row.salesmanId === userId);
  const whole = ownInventory.filter((row) => row.category === "Whole Chicken");
  const byproducts = ownInventory.filter((row) => row.category !== "Whole Chicken");
  const relevantRefs = new Set(sales.map((row) => row.ref || row.trustReceipt));
  const scopedLedger = (state.ledgerEntries || []).filter((row) => row.agentId === userId || relevantRefs.has(row.ref));
  const collectibles = collectibleRows(state.customers || [], scopedLedger, collections);
  const daySales = sales.filter((row) => inRange(row.date, todayRange));
  const weekSales = sales.filter((row) => inRange(row.date, week));
  const weekCollections = collections.filter((row) => inRange(row.date, week));
  const weekExpenses = expenses.filter((row) => inRange(row.date, week));
  return <div>
    <SectionHeader title={`Good day, ${name || "Salesman"}`} eyebrow="Today" />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="My Sales" value={currency(sum(daySales, "total"))} icon={ReceiptText} />
      <StatCard label="My Collections" value={currency(dcr.totals.total)} icon={WalletCards} tone="green" />
      <StatCard label="My Expenses" value={currency(dcr.expenseTotals.total)} icon={Banknote} tone="red" />
      <StatCard label="Cash to Remit" value={currency(dcr.expectedCashRemittance)} detail="Cash only, less approved cash-paid expenses" icon={Banknote} tone="amber" />
    </div>
    <div className="mt-5"><SalesmanAttendance compact entry={currentAttendance} busy={busy} error={attendanceError} onTimeIn={onTimeIn} onTimeOut={onTimeOut} /></div>
    <section className="report-section"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-extrabold uppercase">My Inventory</h2><Button variant="secondary" onClick={() => onNavigate("inventory")}>Open Inventory</Button></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatMini label="Whole Chicken Remaining" value={kg(sum(whole, "remainingQty"))} /><StatMini label="By-products Remaining" value={kg(sum(byproducts, "remainingQty"))} /><StatMini label="Assigned Stock" value={kg(sum(ownInventory, "assignedQty"))} /><StatMini label="Sold-out Items" value={ownInventory.filter((row) => Number(row.remainingQty) === 0).length} /></div></section>
    <section className="report-section"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-extrabold uppercase">My Collections</h2><Button variant="secondary" onClick={() => onNavigate("collectibles")}>Open Collectibles</Button></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatMini label="Cash" value={currency(dcr.totals.Cash)} /><StatMini label="GCash" value={currency(dcr.totals.GCash)} /><StatMini label="Bank" value={currency(dcr.totals["Bank Deposit"])} /><StatMini label="Outstanding Collectibles" value={currency(sum(collectibles, "balance"))} /></div></section>
    <section className="report-section"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-extrabold uppercase">My DCR</h2><Badge tone={locked ? "green" : "amber"}>{locked ? "LOCKED" : "NOT SUBMITTED"}</Badge></div><div className="grid gap-3 sm:grid-cols-3"><StatMini label="Expected Cash" value={currency(locked?.expected ?? dcr.expectedCashRemittance)} /><StatMini label="Actual Cash" value={locked ? currency(locked.actual) : "Pending"} /><StatMini label="Short / Over" value={locked ? currency(locked.difference) : "Pending"} /></div><Button className="mt-4" variant="secondary" onClick={() => onNavigate("dcr")}>Open My DCR</Button></section>
    <section className="report-section"><h2 className="mb-4 text-lg font-extrabold uppercase">This Week</h2><div className="grid gap-3 sm:grid-cols-3"><StatMini label="My Sales" value={currency(sum(weekSales, "total"))} /><StatMini label="My Collections" value={currency(sum(weekCollections, "amount"))} /><StatMini label="My Expenses" value={currency(sum(weekExpenses, "amount"))} /></div></section>
  </div>;
}

export function HostedSalesmanDashboard({ organizationId, userId, name, epoch = 0, onChanged, onNavigate }) {
  const date = manilaToday();
  const [action, setAction] = useState({ busy: false, error: "" });
  const remote = useRemote(async () => {
    const [finance, inventory, attendance] = await Promise.all([
      loadHostedFinanceParity(organizationId),
      loadHostedSalesmanInventory(organizationId),
      loadDtrEntries(organizationId, { start: date, end: date }, userId),
    ]);
    return { finance, inventory, attendance };
  }, `${organizationId}-${userId}-${date}-${epoch}`);
  const clock = async (operation) => {
    setAction({ busy: true, error: "" });
    try {
      await operation(organizationId);
      await remote.refresh();
      onChanged?.();
    } catch (reason) {
      setAction({ busy: false, error: readableError(reason) });
      return;
    }
    setAction({ busy: false, error: "" });
  };
  if (!remote.data) return <p className="py-12 text-center text-slate-500">{remote.error || "Loading your workspace..."}</p>;
  return <SalesmanDashboardView name={name} userId={userId} state={remote.data.finance} inventoryRows={remote.data.inventory.rows} attendance={remote.data.attendance} date={date} busy={action.busy} attendanceError={action.error || remote.error} onTimeIn={() => clock(timeInNow)} onTimeOut={() => clock(timeOutNow)} onNavigate={onNavigate} />;
}

export function LocalSalesmanDashboard({ name, userId, state, inventoryRows, attendance, date, onTimeIn, onTimeOut, onNavigate }) {
  return <SalesmanDashboardView name={name} userId={userId} state={state} inventoryRows={inventoryRows} attendance={attendance} date={date} onTimeIn={onTimeIn} onTimeOut={onTimeOut} onNavigate={onNavigate} />;
}

function AttendanceHistory({ entries }) {
  const rows = (entries || []).map(normalizedAttendance).sort((a, b) => b.date.localeCompare(a.date));
  const today = manilaToday();
  return <ResponsiveTable columns={["Date", "Time In", "Time Out", "Total Hours", "Status"]} rows={rows.map((row) => {
    const status = attendanceHistoryStatus(row, today);
    return [shortDate(row.date), timeLabel(row.timeIn), timeLabel(row.timeOut), formatDtrMinutes(row.totalMinutes), <Badge tone={status === "COMPLETED" ? "green" : "amber"}>{status}</Badge>];
  })} />;
}

export function HostedSalesmanDtr({ organizationId, userId, epoch = 0, onChanged }) {
  const date = manilaToday();
  const [action, setAction] = useState({ busy: false, error: "" });
  const range = useMemo(() => ({ start: `${date.slice(0, 8)}01`, end: date }), [date]);
  const remote = useRemote(() => loadDtrEntries(organizationId, range, userId), `${organizationId}-${userId}-${epoch}-${range.start}`);
  const clock = async (operation) => {
    setAction({ busy: true, error: "" });
    try { await operation(organizationId); await remote.refresh(); onChanged?.(); setAction({ busy: false, error: "" }); }
    catch (reason) { setAction({ busy: false, error: readableError(reason) }); }
  };
  const todayEntry = (remote.data || []).find((row) => row.work_date === date);
  return <div><SectionHeader title="My DTR" eyebrow="Server-recorded attendance" action={<Button variant="secondary" aria-label="Refresh attendance" onClick={remote.refresh}><RefreshCw size={17} /></Button>} />
    <SalesmanAttendance entry={todayEntry} busy={action.busy} error={action.error || remote.error} onTimeIn={() => clock(timeInNow)} onTimeOut={() => clock(timeOutNow)} />
    <section className="report-section"><h2 className="mb-4 text-lg font-extrabold uppercase">My Attendance History</h2>{remote.loading && !remote.data ? <p className="py-8 text-center text-slate-500">Loading attendance...</p> : <AttendanceHistory entries={remote.data || []} />}</section>
  </div>;
}

export function LocalSalesmanDtr({ userId, attendance, date, onTimeIn, onTimeOut }) {
  const entries = (attendance || []).filter((row) => row.employeeId === userId);
  const todayEntry = entries.find((row) => row.date === date);
  return <div><SectionHeader title="My DTR" eyebrow="Local demo attendance" /><SalesmanAttendance entry={todayEntry} onTimeIn={onTimeIn} onTimeOut={onTimeOut} /><section className="report-section"><h2 className="mb-4 text-lg font-extrabold uppercase">My Attendance History</h2><AttendanceHistory entries={entries} /></section></div>;
}

export function SalesmanExpenses({ userId, users, expenses, date, busy = false, onRecord }) {
  const [form, setForm] = useState({ date, category: "Fuel", amount: "", notes: "", source: "Cash Collection" });
  const [error, setError] = useState("");
  const own = (expenses || []).filter((row) => row.agentId === userId).sort((a, b) => b.date.localeCompare(a.date));
  const submit = async () => {
    if (!form.date || !Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0) return setError("Enter a date and positive expense amount.");
    setError("");
    const saved = await onRecord({ agentId: userId, date: form.date, category: form.category, amount: Number(form.amount), description: form.notes, source: form.source, status: "Approved" });
    if (saved !== false) setForm((current) => ({ ...current, amount: "", notes: "" }));
  };
  return <div><SectionHeader title="Expenses" eyebrow="My operational expenses" />
    {error && <p role="alert" className="mb-4 border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-800">{error}</p>}
    <section className="rounded-lg border border-slate-200 bg-white p-4"><div className="grid gap-3 sm:grid-cols-2"><Field label="Date"><input className={inputClass()} type="date" value={form.date} onInput={(event) => setForm({ ...form, date: event.target.value })} /></Field><Field label="Category"><select className={inputClass()} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></Field><Field label="Amount"><MoneyInput value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></Field><Field label="Payment Source"><select className={inputClass()} value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })}><option>Cash Collection</option><option>Personal Cash</option><option>Other</option></select></Field></div><Field label="Notes"><textarea className={`${inputClass()} mt-3 min-h-20 py-3`} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field><Button className="mt-4 w-full sm:w-auto" disabled={busy} onClick={submit}><ReceiptText size={17} />{busy ? "Recording..." : "Record Expense"}</Button></section>
    <section className="report-section"><h2 className="mb-4 text-lg font-extrabold uppercase">Recent Expenses</h2><ResponsiveTable columns={["Date", "Category", "Payment Source", "Status", "Amount", "Notes"]} rows={own.map((row) => [shortDate(row.date), row.category, row.source, row.status, currency(row.amount), row.description || "-"])} /></section>
  </div>;
}

export function HostedSalesmanExpenses({ organizationId, userId, epoch = 0, onChanged }) {
  const [localEpoch, setLocalEpoch] = useState(0);
  const [status, setStatus] = useState({ busy: false, error: "", notice: "" });
  const remote = useRemote(() => loadHostedFinanceParity(organizationId), `${organizationId}-${userId}-${epoch}-${localEpoch}`);
  const record = async (values) => {
    setStatus({ busy: true, error: "", notice: "" });
    try {
      await recordHostedExpense(organizationId, values, userId);
      setStatus({ busy: false, error: "", notice: "Expense recorded." });
      setLocalEpoch((value) => value + 1); onChanged?.(); return true;
    } catch (reason) { setStatus({ busy: false, error: readableError(reason), notice: "" }); return false; }
  };
  if (!remote.data) return <p className="py-12 text-center text-slate-500">{remote.error || "Loading expenses..."}</p>;
  return <>{status.error && <p role="alert" className="mb-4 border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-800">{status.error}</p>}{status.notice && <p role="status" className="mb-4 border border-emerald-200 bg-emerald-50 p-3 font-semibold text-emerald-800">{status.notice}</p>}<SalesmanExpenses userId={userId} users={remote.data.users} expenses={remote.data.expenses} date={manilaToday()} busy={status.busy} onRecord={record} /></>;
}
