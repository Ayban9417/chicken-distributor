import { useEffect, useState } from "react";
import { Eye, RefreshCw } from "lucide-react";
import { loadCorrectionAdministrators, loadCorrectionHistory, isMissingCorrectionLedger } from "../services/correctionHistoryService";
import { currency, kg } from "../utils/business";
import { Badge, Button, Drawer, Field, inputClass, ResponsiveTable, SectionHeader } from "./ui";

const emptyFilters = { module: "", dateFrom: "", dateTo: "", reference: "", adminUserId: "" };
const modules = ["stock_in", "warehouse_transfer", "salesman_transfer", "sale", "payment", "expense", "dcr", "dtr", "payroll", "truck"];
const humanize = (value) => String(value || "").replaceAll("_", " ");
const displayValue = (key, value) => {
  if (value == null || value === "") return "-";
  if (typeof value === "number" && /(amount|cost|price|sales|profit|balance|pay|deduction)/i.test(key)) return currency(value);
  if (typeof value === "number" && /(kg|quantity)/i.test(key)) return kg(value);
  if (value?.acquisitionValueDelta != null) return `${value.product}: ${currency(value.acquisitionValueBefore)} to ${currency(value.acquisitionValueAfter)} (${currency(value.acquisitionValueDelta)} change)`;
  if (value?.warehouseDeltaKg != null) return `${value.product}: ${value.beforeKg} KG to ${value.afterKg} KG (${value.warehouseDeltaKg} KG change)`;
  if (value?.type && value?.id) return `${humanize(value.type)} / ${value.id}`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

export function TransactionEditHistory({ organizationId, role, transactionId = "", onClearTrip }) {
  const [filters, setFilters] = useState(emptyFilters);
  const [applied, setApplied] = useState(emptyFilters);
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({ loading: true, rows: [], admins: [], hasMore: false, error: "", unavailable: false });
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (role !== "owner_admin") return;
    let active = true;
    setState((current) => ({ ...current, loading: true, error: "" }));
    Promise.all([loadCorrectionHistory(organizationId, { ...applied, transactionId }), loadCorrectionAdministrators(organizationId)])
      .then(([history, admins]) => { if (active) setState({ loading: false, rows: history.rows, admins, hasMore: history.hasMore, error: "", unavailable: false }); })
      .catch((error) => { if (active) setState((current) => ({ ...current, loading: false, rows: [], hasMore: false, unavailable: isMissingCorrectionLedger(error), error: isMissingCorrectionLedger(error) ? "Transaction edit history is available after its database migration is applied." : (error?.message || "History could not be loaded.") })); });
    return () => { active = false; };
  }, [organizationId, role, applied, transactionId, refreshKey]);

  if (role !== "owner_admin") return <p role="alert" className="p-4 font-semibold text-rose-700">Owner / Admin access is required.</p>;
  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  return <div>
    <SectionHeader title="Transaction Edit History" action={<Button variant="secondary" aria-label="Refresh history" title="Refresh history" onClick={() => setRefreshKey((value) => value + 1)}><RefreshCw size={17} />Refresh</Button>} />
    {transactionId && <div className="mb-4 flex flex-wrap items-center gap-3 border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900"><span>Showing corrections for one transaction.</span><Button variant="secondary" onClick={onClearTrip}>Show All History</Button></div>}
    <section className="report-section mb-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Field label="Module"><select className={inputClass()} value={filters.module} onChange={(event) => update("module", event.target.value)}><option value="">All Modules</option>{modules.map((module) => <option key={module} value={module}>{humanize(module)}</option>)}</select></Field>
      <Field label="From Date"><input type="date" className={inputClass()} value={filters.dateFrom} onChange={(event) => update("dateFrom", event.target.value)} /></Field>
      <Field label="To Date"><input type="date" className={inputClass()} value={filters.dateTo} onChange={(event) => update("dateTo", event.target.value)} /></Field>
      <Field label="Transaction Reference"><input className={inputClass()} value={filters.reference} onChange={(event) => update("reference", event.target.value)} /></Field>
      <Field label="Administrator"><select className={inputClass()} value={filters.adminUserId} onChange={(event) => update("adminUserId", event.target.value)}><option value="">All Administrators</option>{state.admins.map((admin) => <option key={admin.id} value={admin.id}>{admin.full_name}</option>)}</select></Field>
    </div><div className="mt-3 flex gap-2"><Button onClick={() => setApplied({ ...filters })}>Apply Filters</Button><Button variant="secondary" onClick={() => { setFilters(emptyFilters); setApplied(emptyFilters); }}>Clear</Button></div></section>
    {state.error && <p role="alert" className={`border p-4 text-sm font-semibold ${state.unavailable ? "border-amber-200 bg-amber-50 text-amber-900" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{state.error}</p>}
    {state.loading ? <p className="py-8 text-center text-slate-500">Loading transaction history...</p> : !state.error && <section className="report-section"><ResponsiveTable columns={["Date / Time", "Module", "Transaction Reference", "Edited By", "Reason", "Status", "Affected", "Details"]} rows={state.rows.map((row) => [new Date(row.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" }), humanize(row.module), row.transaction_reference, row.admin_name, row.reason, <Badge tone={row.status === "applied" ? "green" : "amber"}>{row.status}</Badge>, row.affected_record_ids.length, <Button variant="ghost" aria-label={`View correction ${row.id}`} title="View correction" onClick={() => setDetail(row)}><Eye size={17} /></Button>])} />{state.hasMore && <p className="mt-3 text-sm text-slate-500">Showing the newest 100 matching entries. Narrow the filters to find older entries.</p>}</section>}
    {detail && <Drawer title="Correction Details" onClose={() => setDetail(null)}><div className="space-y-5 text-sm"><dl className="grid grid-cols-2 gap-3"><dt className="text-slate-500">Correction ID</dt><dd className="break-all normal-case font-semibold">{detail.id}</dd><dt className="text-slate-500">Transaction</dt><dd className="font-semibold">{detail.transaction_reference}</dd><dt className="text-slate-500">Action</dt><dd className="font-semibold">{humanize(detail.correction_action)}</dd><dt className="text-slate-500">Reason</dt><dd className="font-semibold">{detail.reason}</dd></dl><ValueSection title="Original Values" data={detail.original_values} /><ValueSection title="Proposed Values" data={detail.proposed_values} /><ValueSection title="Applied Values" data={detail.applied_values} /><ValueSection title="Affected Records" data={detail.affected_record_ids} /><ValueSection title="Inventory Adjustments" data={detail.inventory_adjustments} /><ValueSection title="Financial Adjustments" data={detail.financial_adjustments} /></div></Drawer>}
  </div>;
}

function ValueSection({ title, data }) {
  const lines = Array.isArray(data?.lines) ? data.lines : [];
  const rows = Array.isArray(data) ? data.map((value, index) => [String(index + 1), value]) : Object.entries(data || {}).filter(([key]) => key !== "lines");
  return <section className="border-t border-slate-200 pt-3"><h2 className="mb-2 font-bold">{title}</h2>{rows.length ? <dl className="space-y-2">{rows.map(([key, value]) => <div key={key} className="grid grid-cols-2 gap-3"><dt className="text-slate-500">{humanize(key)}</dt><dd className="break-words font-semibold">{displayValue(key, value)}</dd></div>)}</dl> : !lines.length && <p className="text-slate-500">None</p>}{lines.length > 0 && <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="text-slate-500"><th className="p-2">Product</th><th className="p-2">Quantity KG</th><th className="p-2">Cost/KG</th><th className="p-2">Bags</th><th className="p-2">Heads</th></tr></thead><tbody>{lines.map((line) => <tr key={line.id} className="border-t border-slate-100"><td className="p-2 font-semibold">{line.product}</td><td className="p-2 whitespace-nowrap">{Number(line.quantityKg).toLocaleString("en-PH", { maximumFractionDigits: 3 })} KG</td><td className="p-2 whitespace-nowrap">{currency(line.costPerKg)}</td><td className="p-2">{line.bags ?? "-"}</td><td className="p-2">{line.headCount ?? "-"}</td></tr>)}</tbody></table></div>}</section>;
}
