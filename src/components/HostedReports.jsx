import { useMemo, useState } from "react";
import { Banknote, ChartNoAxesCombined, ClipboardCheck, RefreshCw, WalletCards } from "lucide-react";
import { Badge, Button, DateRange, Field, inputClass, PlantName, ResponsiveTable, SectionHeader, StatCard, StatMini } from "./ui";
import { FinancialCards, TripSummary } from "./Reporting";
import { useRemote } from "../hooks/useRemote";
import { loadHostedDashboard } from "../services/dashboardService";
import { collectibleSummary, dcrSummary, financialSummary, salesByPlant, salesByProduct, sumBy } from "../utils/hostedReports";
import { businessWeek } from "../utils/operations";
import { currency, kg, shortDate } from "../utils/business";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
const reports = ["Weekly Business Report", "Sales", "Inventory", "Payments", "Collectibles", "Transfers", "Daily Cash Report"];
const identity = (row) => [row.product_name, row.product_code, row.class_type].filter(Boolean).join(" / ");
const titleMethod = (value) => ({ cash: "Cash", gcash: "GCash", bank: "Bank Deposit" })[value] || value;

function ReportSection({ title, children }) {
  return <section className="report-section"><h2 className="mb-4 text-lg font-bold">{title}</h2>{children}</section>;
}

function groupRows(rows, key, values) {
  const grouped = new Map();
  rows.forEach((row) => {
    const id = key(row);
    const item = grouped.get(id) || { key: id };
    values.forEach((value) => { item[value] = Number(item[value] || 0) + Number(row[value] || 0); });
    grouped.set(id, item);
  });
  return [...grouped.values()].sort((a, b) => Number(b.net_sales || b.line_sales || 0) - Number(a.net_sales || a.line_sales || 0));
}

export function HostedReports({ organizationId, epoch = 0 }) {
  const businessDate = today();
  const [range, setRange] = useState(() => businessWeek(businessDate));
  const [report, setReport] = useState("Weekly Business Report");
  const remote = useRemote(() => loadHostedDashboard(organizationId, range, businessDate), `${organizationId}-${epoch}-${range.start}-${range.end}`);
  const data = remote.data?.reports || { sales: [], expenses: [], payments: [], allPayments: [], plantSales: [], productSales: [], dcrs: [], collectibles: [], warehouseStock: [], salesmanStock: [], transfers: [] };
  const trips = remote.data?.trips || [];
  const previousTrips = remote.data?.previousTrips || [];
  const financial = useMemo(() => financialSummary(data.sales, data.expenses), [data.sales, data.expenses]);
  const plants = useMemo(() => salesByPlant(data.plantSales), [data.plantSales]);
  const products = useMemo(() => salesByProduct(data.productSales), [data.productSales]);
  const collectibles = useMemo(() => collectibleSummary(data.collectibles, data.allPayments), [data.collectibles, data.allPayments]);
  const dcr = useMemo(() => dcrSummary(data.dcrs), [data.dcrs]);
  const customers = useMemo(() => groupRows(data.sales, (row) => row.customer_name || "-", ["net_sales", "total_cogs", "gross_profit"]), [data.sales]);
  const productTotals = useMemo(() => groupRows(data.productSales, (row) => row.product_name || "-", ["quantity_kg", "line_sales", "line_cogs", "line_gross_profit"]), [data.productSales]);
  const stock = [...data.warehouseStock.map((row) => ({ ...row, location: "Warehouse" })), ...data.salesmanStock.map((row) => ({ ...row, location: row.salesman_name || "Salesman" }))];
  const all = report === "Weekly Business Report";
  const inventoryRows = trips.flatMap((trip) => trip.products.map((product) => ({ tripId: trip.id, remainingQty: product.remainingQty })));
  const grossMargin = financial.netSales ? (financial.netSales - financial.cogs) / financial.netSales * 100 : 0;

  return <div>
    <SectionHeader title="Reports" action={<div className="flex flex-wrap items-end gap-2"><DateRange range={range} setRange={setRange} /><Button variant="secondary" aria-label="Refresh reports" title="Refresh reports" onClick={remote.refresh}><RefreshCw size={17} /></Button></div>} />
    <Field label="Report"><select className={`${inputClass()} max-w-md`} value={report} onChange={(event) => setReport(event.target.value)}>{reports.map((name) => <option key={name}>{name}</option>)}</select></Field>
    {remote.error && <p role="alert" className="mt-4 border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-800">{remote.error} <button type="button" className="underline" onClick={remote.refresh}>Try again</button></p>}
    {remote.loading && !remote.data ? <p className="py-12 text-center text-slate-500">Loading hosted reports...</p> : <>
      {!data.sales.length && !data.payments.length && !data.expenses.length && !trips.length && <p className="mt-4 text-slate-500">No activity in the selected date range.</p>}
      {all && <ReportSection title="Financial Summary"><FinancialCards summary={{ ...financial, expenseTotal: financial.expenses, grossMargin }} /></ReportSection>}
      {all && <TripSummary trips={trips} previousTrips={previousTrips} inventoryRows={inventoryRows} />}
      {(all || report === "Sales") && <>
        <ReportSection title="Sales by Plant"><ResponsiveTable columns={["Plant", "KG Sold", "Sales", "Capital / Product Cost", "Gross Profit"]} rows={plants.map((row) => [<PlantName name={row.plantName} />, kg(row.quantityKg), currency(row.sales), currency(row.cogs), currency(row.grossProfit)])} /></ReportSection>
        <ReportSection title="Sales by Product"><ResponsiveTable columns={["Product", "KG Sold", "Sales", "Capital", "Gross Profit"]} rows={productTotals.map((row) => [row.key, kg(row.quantity_kg), currency(row.line_sales), currency(row.line_cogs), currency(row.line_gross_profit)])} /></ReportSection>
        <ReportSection title="Sales by Size / Code"><ResponsiveTable columns={["Product / Code", "KG Sold", "Sales", "Gross Profit"]} rows={products.filter((row) => row.code !== "-").map((row) => [[row.productName, row.code].join(" / "), kg(row.quantityKg), currency(row.sales), currency(row.grossProfit)])} /></ReportSection>
        <ReportSection title="Sales by Class Type"><ResponsiveTable columns={["Product / Class", "KG Sold", "Sales", "Gross Profit"]} rows={products.filter((row) => row.classType !== "-").map((row) => [[row.productName, row.classType].join(" / "), kg(row.quantityKg), currency(row.sales), currency(row.grossProfit)])} /></ReportSection>
        <ReportSection title="Sales by Customer"><ResponsiveTable columns={["Customer", "Sales", "Capital", "Gross Profit"]} rows={customers.map((row) => [row.key, currency(row.net_sales), currency(row.total_cogs), currency(row.gross_profit)])} /></ReportSection>
      </>}
      {(all || report === "Inventory") && <ReportSection title="Company Inventory">
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatMini label="Warehouse Stock" value={kg(sumBy(data.warehouseStock, "available_quantity_kg"))} /><StatMini label="Salesman Stock" value={kg(sumBy(data.salesmanStock, "available_quantity_kg"))} /><StatMini label="Inventory Value" value={currency(sumBy(stock, "inventory_cost_value"))} /><StatMini label="Free from Plant" value={kg(sumBy(stock.filter((row) => row.acquisition_type === "free_from_plant"), "available_quantity_kg"))} /></div>
        <ResponsiveTable columns={["Location", "Plant / Trip", "Product / Code / Class", "Remaining", "Inventory Value", "Acquisition / Status"]} rows={stock.map((row) => [row.location, `${row.plant_name} / ${row.trip_number} / ${shortDate(row.trip_date)}`, identity(row), kg(row.available_quantity_kg), currency(row.inventory_cost_value), `${row.acquisition_type === "free_from_plant" ? "Free from Plant" : "Purchased"}${Number(row.available_quantity_kg) === 0 ? " / SOLD OUT" : ""}`])} />
      </ReportSection>}
      {(all || report === "Payments") && <ReportSection title="Payments">
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Cash" value={currency(sumBy(data.payments.filter((row) => row.method === "cash"), "amount"))} icon={Banknote} /><StatCard label="GCash" value={currency(sumBy(data.payments.filter((row) => row.method === "gcash"), "amount"))} icon={WalletCards} /><StatCard label="Bank" value={currency(sumBy(data.payments.filter((row) => row.method === "bank"), "amount"))} icon={WalletCards} /><StatCard label="Total Payments" value={currency(sumBy(data.payments, "amount"))} icon={ClipboardCheck} tone="green" /></div>
        <ResponsiveTable columns={["Date", "Payment", "Method", "Reference", "Notes", "Amount"]} rows={data.payments.map((row) => [shortDate(row.payment_date), row.payment_number, titleMethod(row.method), row.reference_number || "-", row.notes || "-", currency(row.amount)])} />
      </ReportSection>}
      {(all || report === "Collectibles") && <ReportSection title="Collectibles">
        <div className="mb-4 grid gap-3 sm:grid-cols-3"><StatMini label="Customers with Balance" value={collectibles.length} /><StatMini label="Outstanding" value={currency(sumBy(collectibles, "outstanding"))} /><StatMini label="Open Sales" value={sumBy(collectibles, "openSales")} /></div>
        <ResponsiveTable columns={["Customer", "Outstanding", "Oldest Unpaid", "Open Sales", "Last Payment"]} rows={collectibles.map((row) => [row.customerName, currency(row.outstanding), shortDate(row.oldestUnpaid), row.openSales, row.lastPayment ? `${shortDate(row.lastPayment.payment_date)} / ${currency(row.lastPayment.amount)}` : "-"])} />
      </ReportSection>}
      {(all || report === "Transfers") && <ReportSection title="Receiving Receipts / Transfer Receipts"><ResponsiveTable columns={["Date", "Receipt", "From", "To", "Plant / Trip", "Product", "Quantity"]} rows={data.transfers.map((row) => [shortDate(row.effective_date), row.receipt_number, row.from_name, row.to_name, `${row.plant_name} / ${row.trip_number}`, identity(row), kg(row.quantity_kg)])} /></ReportSection>}
      {(all || report === "Daily Cash Report") && <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Cash" value={currency(dcr.cash)} icon={Banknote} /><StatCard label="GCash / Bank" value={currency(dcr.gcash + dcr.bank)} icon={WalletCards} /><StatCard label="Expected Cash" value={currency(dcr.expected)} detail={`Cash-paid expenses ${currency(dcr.expenses)}`} icon={ClipboardCheck} tone="amber" /><StatCard label="Short / Over" value={currency(dcr.difference)} detail={`Actual ${currency(dcr.actual)}`} icon={ChartNoAxesCombined} tone={dcr.difference === 0 ? "green" : "red"} /></div>
        <ReportSection title="Salesman Daily Cash Reports"><ResponsiveTable columns={["Salesman", "Date", "Cash", "GCash", "Bank", "Expenses", "Expected", "Actual", "Difference", "Status"]} rows={data.dcrs.map((row) => [row.salesman_name, shortDate(row.report_date), currency(row.cash_collected), currency(row.gcash_collected), currency(row.bank_collected), currency(row.cash_paid_expenses), currency(row.expected_cash_remittance), currency(row.actual_cash_remittance), currency(row.difference), <Badge tone={Number(row.difference) === 0 ? "green" : "red"}>{row.status === "locked" ? "LOCKED" : row.status}</Badge>])} /></ReportSection>
      </>}
    </>}
  </div>;
}
