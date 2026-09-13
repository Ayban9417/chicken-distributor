import { useMemo, useState } from "react";
import { Banknote, ChartNoAxesCombined, ClipboardCheck, PackageCheck, RefreshCw, ShoppingCart, WalletCards } from "lucide-react";
import { Badge, Button, DateRange, ResponsiveTable, SectionHeader, StatCard, StatMini } from "./ui";
import { useRemote } from "../hooks/useRemote";
import { loadHostedReports } from "../services/reportingService";
import { collectibleSummary, dcrSummary, financialSummary, salesByPlant, salesByProduct, sumBy } from "../utils/hostedReports";
import { currency, kg, shortDate } from "../utils/business";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
const tabs = ["Overview", "Profitability", "Collectibles", "Stock", "Transfers", "DCR"];
const percent = (value) => `${Number(value || 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })}%`;
const identity = (row) => [row.product_name, row.product_code, row.class_type].filter(Boolean).join(" / ");

function ReportSection({ title, children }) {
  return <section className="report-section"><h2 className="mb-4 text-lg font-bold">{title}</h2>{children}</section>;
}

export function HostedReports({ organizationId, epoch = 0 }) {
  const [range, setRange] = useState({ start: today(), end: today() });
  const [tab, setTab] = useState("Overview");
  const remote = useRemote(() => loadHostedReports(organizationId, range), `${organizationId}-${epoch}-${range.start}-${range.end}`);
  const data = remote.data || { sales: [], expenses: [], payments: [], allPayments: [], plantSales: [], productSales: [], dcrs: [], collectibles: [], warehouseStock: [], salesmanStock: [], transfers: [] };
  const financial = useMemo(() => financialSummary(data.sales, data.expenses), [data.sales, data.expenses]);
  const plants = useMemo(() => salesByPlant(data.plantSales), [data.plantSales]);
  const products = useMemo(() => salesByProduct(data.productSales), [data.productSales]);
  const collectibles = useMemo(() => collectibleSummary(data.collectibles, data.allPayments), [data.collectibles, data.allPayments]);
  const dcr = useMemo(() => dcrSummary(data.dcrs), [data.dcrs]);

  return <div>
    <SectionHeader title="Reports" eyebrow="Hosted operational reporting" action={<div className="flex flex-wrap items-end gap-2"><DateRange range={range} setRange={setRange} /><Button variant="secondary" aria-label="Refresh reports" title="Refresh reports" onClick={remote.refresh}><RefreshCw size={17} /></Button></div>} />
    <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Report sections">{tabs.map((name) => <button key={name} type="button" onClick={() => setTab(name)} className={`min-h-11 shrink-0 border-b-2 px-3 text-sm font-bold ${tab === name ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-900"}`}>{name}</button>)}</nav>
    {remote.error && <p role="alert" className="border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-800">{remote.error}</p>}
    {remote.loading && !remote.data ? <p className="py-12 text-center text-slate-500">Loading hosted reports...</p> : <>
      {tab === "Overview" && <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Gross Sales" value={currency(financial.grossSales)} detail={`Net sales ${currency(financial.netSales)}`} icon={ShoppingCart} /><StatCard label="COGS" value={currency(financial.cogs)} icon={PackageCheck} tone="amber" /><StatCard label="Approved Expenses" value={currency(financial.expenses)} icon={Banknote} tone="red" /><StatCard label="Profit Estimate" value={currency(financial.profitEstimate)} detail="Net sales less COGS and approved expenses" icon={ChartNoAxesCombined} tone="green" /></div>
        <ReportSection title="Period Activity"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatMini label="Sales" value={data.sales.length} /><StatMini label="Payments" value={currency(sumBy(data.payments, "amount"))} /><StatMini label="Sales Deductions" value={currency(financial.salesDeductions)} /><StatMini label="DCRs" value={data.dcrs.length} /></div></ReportSection>
      </>}
      {tab === "Profitability" && <>
        <ReportSection title="Sales by Plant"><ResponsiveTable columns={["Plant", "Sales", "KG", "COGS", "Gross Profit"]} rows={plants.map((row) => [row.plantName, currency(row.sales), kg(row.quantityKg), currency(row.cogs), currency(row.grossProfit)])} footer={plants.length ? ["Total", currency(sumBy(plants, "sales")), kg(sumBy(plants, "quantityKg")), currency(sumBy(plants, "cogs")), currency(sumBy(plants, "grossProfit"))] : null} /></ReportSection>
        <ReportSection title="Sales by Product"><ResponsiveTable columns={["Product", "Code", "Class", "KG", "Sales", "COGS", "Gross Profit", "Margin"]} rows={products.map((row) => [row.productName, row.code, row.classType === "-" ? row.category : row.classType, kg(row.quantityKg), currency(row.sales), currency(row.cogs), currency(row.grossProfit), percent(row.margin)])} /></ReportSection>
      </>}
      {tab === "Collectibles" && <ReportSection title="Customer Collectibles"><div className="mb-4 grid gap-3 sm:grid-cols-3"><StatMini label="Customers with Balance" value={collectibles.length} /><StatMini label="Outstanding" value={currency(sumBy(collectibles, "outstanding"))} /><StatMini label="Open Sales" value={sumBy(collectibles, "openSales")} /></div><ResponsiveTable columns={["Customer", "Outstanding", "Oldest Unpaid", "Open Sales", "Last Payment"]} rows={collectibles.map((row) => [row.customerName, currency(row.outstanding), shortDate(row.oldestUnpaid), row.openSales, row.lastPayment ? `${shortDate(row.lastPayment.payment_date)} / ${currency(row.lastPayment.amount)}` : "-"])} /></ReportSection>}
      {tab === "Stock" && <>
        <ReportSection title="Warehouse Stock"><ResponsiveTable columns={["Plant", "Trip / Date", "Product / Code / Class", "Remaining"]} rows={data.warehouseStock.map((row) => [row.plant_name, `${row.trip_number} / ${shortDate(row.trip_date)}`, identity(row), kg(row.available_quantity_kg)])} /></ReportSection>
        <ReportSection title="Salesman Stock"><ResponsiveTable columns={["Salesman", "Plant", "Product / Code / Class", "Remaining"]} rows={data.salesmanStock.map((row) => [row.salesman_name, row.plant_name, identity(row), kg(row.available_quantity_kg)])} /></ReportSection>
      </>}
      {tab === "Transfers" && <ReportSection title="Transfer History"><ResponsiveTable columns={["Date", "Receipt", "From", "To", "Plant / Trip", "Product", "Quantity"]} rows={data.transfers.map((row) => [shortDate(row.effective_date), row.receipt_number, row.from_name, row.to_name, `${row.plant_name} / ${row.trip_number}`, identity(row), kg(row.quantity_kg)])} /></ReportSection>}
      {tab === "DCR" && <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Cash" value={currency(dcr.cash)} icon={Banknote} /><StatCard label="Electronic" value={currency(dcr.gcash + dcr.bank)} icon={WalletCards} /><StatCard label="Expected Remittance" value={currency(dcr.expected)} detail={`Expenses ${currency(dcr.expenses)}`} icon={ClipboardCheck} tone="amber" /><StatCard label="Difference" value={currency(dcr.difference)} detail={`Actual ${currency(dcr.actual)}`} icon={ChartNoAxesCombined} tone={dcr.difference === 0 ? "green" : "red"} /></div>
        <ReportSection title="Daily Cash Reports"><ResponsiveTable columns={["Salesman", "Date", "Cash", "GCash", "Bank", "Expenses", "Expected", "Actual", "Difference", "Status"]} rows={data.dcrs.map((row) => [row.salesman_name, shortDate(row.report_date), currency(row.cash_collected), currency(row.gcash_collected), currency(row.bank_collected), currency(row.cash_paid_expenses), currency(row.expected_cash_remittance), currency(row.actual_cash_remittance), currency(row.difference), <Badge tone={Number(row.difference) === 0 ? "green" : "red"}>{row.status}</Badge>])} /></ReportSection>
      </>}
    </>}
  </div>;
}
