import { useMemo, useState } from "react";
import { ArrowRight, Banknote, PackageCheck, ReceiptText, RefreshCw, Truck, WalletCards } from "lucide-react";
import { Badge, Button, DateRange, PlantName, ResponsiveTable, SectionHeader, StatCard, StatMini } from "./ui";
import { currency, kg, shortDate, productLabel, tripAcquisitionCost, getCustomerName, isWholeChicken } from "../utils/business";
import { businessWeek, previousPeriod, periodSummary, collectibleRows, sum, inRange, agentPeriodRows, truckAlerts } from "../utils/operations";
import { demoToday, truckRules } from "../data/demoData";
import { CustomerSearch } from "./CustomerManagement";
import { matchesCustomer } from "../utils/customers";
import { companyStockTotals, salesmanInventoryRows, warehouseRows } from "../utils/inventoryFlow";
import { useRemote } from "../hooks/useRemote";
import { loadHostedDashboard } from "../services/dashboardService";
import { activityDays, customerSales } from "../utils/hostedDashboard";
import { collectibleSummary, financialSummary, salesByPlant, salesByProduct, sumBy, tripBagSummary } from "../utils/hostedReports";

function Section({ title, children, action }) {
  return <section className="report-section"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">{title}</h2>{action}</div>{children}</section>;
}
function aggregate(lines, keyFn) {
  const map = new Map();
  lines.forEach((line) => {
    const key = keyFn(line);
    const item = map.get(key) || { key, qty: 0, revenue: 0, cogs: 0, profit: 0 };
    item.qty += line.qty; item.revenue += line.revenue; item.cogs += line.cogs; item.profit += line.grossProfit;
    map.set(key, item);
  });
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}
export function FinancialCards({ summary }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <StatCard label="Gross Sales" value={currency(summary.grossSales)} icon={ReceiptText} />
    <StatCard label="Capital (Product Cost)" value={currency(summary.cogs)} icon={PackageCheck} tone="amber" />
    <StatCard label="Expenses" value={currency(summary.expenseTotal)} icon={WalletCards} tone="red" />
    <StatCard label="Profit Estimate" value={currency(summary.profitEstimate)} detail={summary.grossMargin.toFixed(2) + "% gross margin before expenses"} icon={Banknote} tone="green" />
  </div>;
}
function InventoryFlowSummary({ state, range }) {
  const salesmen = state.users.filter((user) => user.role === "Agent");
  const totals = companyStockTotals(state.inventoryRows, state.receivingTransfers || [], state.salesmanTransfers || [], state.movements || [], salesmen.map((user) => user.id));
  const received = (state.receivingTransfers || []).filter((item) => !range || inRange(item.date, range));
  const transferred = (state.salesmanTransfers || []).filter((item) => !range || inRange(item.date, range));
  return <Section title="Inventory Flow"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatMini label="Warehouse Remaining" value={kg(totals.warehouse)} /><StatMini label="Salesman Remaining" value={kg(totals.assigned)} /><StatMini label="Total Company Physical Stock" value={kg(totals.company)} /><StatMini label="Transferred in Period" value={kg(sum([...received, ...transferred], "qty"))} /></div></Section>;
}
export function TripSummary({ trips, previousTrips, inventoryRows }) {
  const plantRows = [...new Set(trips.map((trip) => trip.plant))].map((plant) => {
    const origins = trips.filter((trip) => trip.plant === plant);
    const products = origins.flatMap((trip) => trip.products);
    return [<PlantName name={plant} />, origins.length,
      kg(sum(products.filter(isWholeChicken), "originalQty")),
      kg(sum(products.filter((item) => !isWholeChicken(item)), "originalQty"))];
  });
  const products = trips.flatMap((trip) => trip.products);
  const difference = trips.length - previousTrips.length;
  return <Section title="Trip Summary">
    <div className="mb-4 grid gap-3 sm:grid-cols-3">
      <StatMini label="Trips / Stock Received" value={trips.length} />
      <StatMini label="Previous Period" value={previousTrips.length} />
      <StatMini label="Change" value={(difference >= 0 ? "+" : "") + difference + " Trip" + (Math.abs(difference) === 1 ? "" : "s")} />
    </div>
    <ResponsiveTable columns={["Plant", "Trips", "Whole Chicken", "By-products"]} rows={plantRows} />
    <div className="mt-4"><ResponsiveTable columns={["Trip Date / Reference", "Plant", "Whole Chicken", "By-products", "Total Stock In", "Bags", "Acquisition Cost", "Remaining Now"]}
      rows={trips.slice().sort((a, b) => a.date.localeCompare(b.date)).map((trip) => [
        shortDate(trip.date) + " / " + trip.code, trip.plant,
        kg(sum(trip.products.filter(isWholeChicken), "originalQty")),
        kg(sum(trip.products.filter((item) => !isWholeChicken(item)), "originalQty")),
        kg(sum(trip.products, "originalQty")), tripBagSummary(trip.products),
        currency(tripAcquisitionCost(trip)), kg(sum(inventoryRows.filter((row) => row.tripId === trip.id), "remainingQty")),
      ])} /></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatMini label="Whole Chicken Stocked In" value={kg(sum(products.filter(isWholeChicken), "originalQty"))} />
      <StatMini label="By-products Stocked In" value={kg(sum(products.filter((item) => !isWholeChicken(item)), "originalQty"))} />
      <StatMini label="Total Stock In" value={kg(sum(products, "originalQty"))} />
      <StatMini label="Free from Plant" value={kg(sum(products.filter((item) => item.acquisitionType === "Free from Plant"), "originalQty"))} />
    </div>
  </Section>;
}
export function Collectibles({ state, onPayment, onLedger, compact = false }) {
  const [sort, setSort] = useState("Oldest Unpaid First");
  const [query, setQuery] = useState("");
  const rows = collectibleRows(state.customers, state.ledgerEntries, state.collections).filter((c) => matchesCustomer(c, query));
  if (sort === "Highest Balance") rows.sort((a, b) => b.balance - a.balance);
  if (sort === "Customer Name") rows.sort((a, b) => a.name.localeCompare(b.name));
  return <div>
    {!compact && <SectionHeader title="Collectibles" />}
    {!compact && <div className="mb-4"><CustomerSearch value={query} onChange={setQuery} /></div>}
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-500">Current outstanding balance: <strong className="text-slate-900">{currency(sum(rows, "balance"))}</strong></p>
      {!compact && <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">Sort <select className="min-h-11 rounded-lg border border-slate-200 bg-white px-3" value={sort} onChange={(e) => setSort(e.target.value)}>{["Oldest Unpaid First", "Highest Balance", "Customer Name"].map((item) => <option key={item}>{item}</option>)}</select></label>}
    </div>
    <div className="grid gap-3 lg:grid-cols-2">
      {(compact ? rows.slice(0, 4) : rows).map((customer) => <article key={customer.id} className="balance-item">
        <div className="flex flex-wrap items-start justify-between gap-3"><h3 className="customer-name">{customer.name}</h3><Badge tone="amber">{customer.openSales} open sales</Badge></div>
        <p className="my-2 text-2xl font-bold">{currency(customer.balance)}</p>
        <p className="text-sm text-slate-600">Oldest unpaid: {customer.oldest ? shortDate(customer.oldest) : "-"}{customer.oldest && " (" + Math.max(0, Math.floor((new Date(demoToday) - new Date(customer.oldest)) / 86400000)) + " days)"}</p>
        <p className="mt-1 text-sm text-slate-600">Last payment: {customer.lastPayment ? shortDate(customer.lastPayment) : "None"}</p>
        <div className="mt-3 flex flex-wrap gap-2"><Button onClick={() => onPayment(customer.id)}><Banknote size={17} />Record Payment</Button><Button variant="secondary" onClick={() => onLedger(customer.id)}><ReceiptText size={17} />View Ledger</Button></div>
      </article>)}
      {!rows.length && <p className="py-4 text-slate-500">No outstanding balances.</p>}
    </div>
  </div>;
}
export function DailySummary({ state, compact = false }) {
  const [date, setDate] = useState(demoToday);
  const summary = periodSummary(state, { start: date, end: date });
  const agents = agentPeriodRows(state.users, state, { start: date, end: date });
  return <Section title={compact ? "Today's Operations" : "Daily Summary / Cashier Daily Report"} action={!compact && <label className="text-sm font-semibold">Date <input className="min-h-11 rounded-lg border border-slate-200 px-3" aria-label="Daily summary date" type="date" value={date} onInput={(e) => e.target.value && setDate(e.target.value)} /></label>}>
    <p className="mb-3 text-sm text-slate-500">{shortDate(date)}</p>
    {!summary.lines.length && !summary.payments.length && !summary.recordedExpenses.length && !summary.trips.length && <p className="mb-4 text-slate-500">No transactions for this date.</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[["Gross Sales", currency(summary.grossSales)], ["Payments Received", currency(summary.paymentTotal)], ["Cash", currency(summary.methods.Cash)], ["GCash", currency(summary.methods.GCash)], ["Bank Deposit", currency(summary.methods["Bank Deposit"])], ["Expenses", currency(summary.expenseTotal)], ["New Receivables (Today's Sales)", currency(summary.newReceivables)], ["Trips / Stock Received", summary.trips.length], ["Whole Chicken Sold", kg(summary.wholeKg)], ["By-products Sold", kg(summary.byproductKg)]].map(([label, value]) => <StatMini key={label} label={label} value={value} />)}
    </div>
    <h3 className="mb-2 mt-5 font-bold">Salesman DCR Status</h3>
    <ResponsiveTable columns={["Salesman", "Sales Handled", "Expected Cash", "Actual Remittance", "DCR Status"]} rows={agents.map((agent) => {
      const locked = state.dcrs.find((dcr) => dcr.agentId === agent.id && dcr.date === date);
      return [agent.name, currency(agent.sales), currency(agent.expected), locked ? currency(locked.actual) : "-", <Badge tone={locked ? "green" : "amber"}>{locked ? "Submitted / Locked" : "Pending"}</Badge>];
    })} />
  </Section>;
}
export function Dashboard({ state, onNavigate, onPayment, onLedger }) {
  const [range, setRange] = useState(() => businessWeek(demoToday));
  const summary = periodSummary(state, range);
  const prior = periodSummary(state, previousPeriod(range));
  const plants = aggregate(summary.lines, (line) => line.plant);
  const products = aggregate(summary.lines, (line) => productLabel(line.product, line.sizeCode, line.classType, line.sizeCodeLabel, line.classTypeLabel));
  const customers = aggregate(summary.lines, (line) => getCustomerName(state.customers, line.customerId));
  const max = Math.max(1, ...summary.days.flatMap((day) => [day.sales, day.payments]));
  const truckIssues = state.trucks.flatMap((truck) => truckAlerts(truck, demoToday, truckRules).map((alert) => truck.unit + ": " + alert));
  return <>
    <SectionHeader title="Dashboard" action={<DateRange range={range} setRange={setRange} />} />
    <FinancialCards summary={summary} />
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Payments" value={currency(summary.paymentTotal)} icon={Banknote} tone="green" />
      <StatCard label="Trips / Stock Received" value={summary.trips.length + " Trips"} detail={[...new Set(summary.trips.map((trip) => trip.plant))].map((plant) => summary.trips.filter((trip) => trip.plant === plant).length + " " + plant).join(" / ") || "No trips in range"} icon={Truck} />
      <StatCard label="Whole Chicken Sold" value={kg(summary.wholeKg)} icon={PackageCheck} />
      <StatCard label="By-products Sold" value={kg(summary.byproductKg)} icon={PackageCheck} tone="amber" />
    </div>
    <InventoryFlowSummary state={state} range={{ start: demoToday, end: demoToday }} />
    <Section title="Collectibles" action={<Button variant="secondary" onClick={() => onNavigate("collectibles")}>View All Collectibles <ArrowRight size={17} /></Button>}>
      <Collectibles state={state} compact onPayment={onPayment} onLedger={onLedger} />
    </Section>
    <div className="grid gap-5 xl:grid-cols-2">
      <Section title="Sales and Payments">
        <div className="mb-4 flex gap-4 text-sm"><span className="font-semibold text-blue-700">Sales</span><span className="font-semibold text-emerald-700">Payments</span></div>
        <div className="chart-rows">{summary.days.map((day) => <div key={day.date} className="chart-row">
          <p className="text-sm font-semibold">{day.date.length === 7 ? day.date : shortDate(day.date).replace(", 2026", "")}</p>
          <div className="space-y-1"><div className="h-3 bg-blue-500" style={{ width: day.sales / max * 100 + "%" }} /><div className="h-3 bg-emerald-500" style={{ width: day.payments / max * 100 + "%" }} /></div>
          <p className="text-right text-sm">{currency(day.sales)}<br /><span className="text-emerald-700">{currency(day.payments)}</span></p>
        </div>)}</div>
      </Section>
      <Section title="Sales by Plant"><ResponsiveTable columns={["Plant", "Sales", "KG Sold", "Gross Profit"]} rows={plants.map((plant) => [<PlantName name={plant.key} />, currency(plant.revenue), kg(plant.qty), currency(plant.profit)])} /></Section>
    </div>
    <div className="grid gap-5 xl:grid-cols-2">
      <Section title="Products Sold"><ResponsiveTable columns={["Product / Code", "KG Sold", "Sales"]} rows={products.map((product) => [product.key, kg(product.qty), currency(product.revenue)])} /></Section>
      <Section title="Customer Sales"><ResponsiveTable columns={["Customer", "Sales", "Gross Profit"]} rows={customers.map((customer) => [customer.key, currency(customer.revenue), currency(customer.profit)])} /></Section>
    </div>
    <TripSummary trips={summary.trips} previousTrips={prior.trips} inventoryRows={state.inventoryRows} />
    <DailySummary state={state} compact />
    <Section title="Attention Required">
      {!truckIssues.length && !state.discrepancies.some((item) => item.status === "Open") && <p className="text-slate-500">No items requiring attention.</p>}
      <div className="grid gap-3 md:grid-cols-2">{state.discrepancies.filter((item) => item.status === "Open").map((item) => <button key={item.id} className="alert-item text-left" onClick={() => onNavigate("discrepancies")}><strong>{item.title}</strong><p>{item.details}</p></button>)}
        {truckIssues.map((issue) => <button key={issue} className="alert-item text-left" onClick={() => onNavigate("trucks")}>{issue}</button>)}</div>
    </Section>
  </>;
}

const hostedToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
const hostedIdentity = (row) => [row.productName, row.code !== "-" && row.code, row.classType !== "-" && row.classType].filter(Boolean).join(" / ");

function HostedInventoryFlowSummary({ reports }) {
  const warehouse = sumBy(reports.warehouseStock, "available_quantity_kg");
  const assigned = sumBy(reports.salesmanStock, "available_quantity_kg");
  return <Section title="Inventory Flow"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <StatMini label="Warehouse Remaining" value={kg(warehouse)} />
    <StatMini label="Salesman Remaining" value={kg(assigned)} />
    <StatMini label="Total Company Physical Stock" value={kg(warehouse + assigned)} />
    <StatMini label="Transferred in Period" value={kg(sumBy(reports.transfers, "quantity_kg"))} />
  </div></Section>;
}

function HostedCollectibles({ rows, onPayment, onLedger }) {
  return <div>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-500">Current outstanding balance: <strong className="text-slate-900">{currency(sumBy(rows, "outstanding"))}</strong></p></div>
    <div className="grid gap-3 lg:grid-cols-2">
      {rows.slice(0, 4).map((customer) => <article key={customer.customerId} className="balance-item">
        <div className="flex flex-wrap items-start justify-between gap-3"><h3 className="customer-name">{customer.customerName}</h3><Badge tone="amber">{customer.openSales} open sales</Badge></div>
        <p className="my-2 text-2xl font-bold">{currency(customer.outstanding)}</p>
        <p className="text-sm text-slate-600">Oldest unpaid: {shortDate(customer.oldestUnpaid)}</p>
        <p className="mt-1 text-sm text-slate-600">Last payment: {customer.lastPayment ? shortDate(customer.lastPayment.payment_date) : "None"}</p>
        <div className="mt-3 flex flex-wrap gap-2"><Button onClick={() => onPayment(customer.customerId)}><Banknote size={17} />Record Payment</Button><Button variant="secondary" onClick={() => onLedger(customer.customerId)}><ReceiptText size={17} />View Ledger</Button></div>
      </article>)}
      {!rows.length && <p className="py-4 text-slate-500">No outstanding balances.</p>}
    </div>
  </div>;
}

function HostedDailySummary({ reports, trips, date }) {
  const financial = financialSummary(reports.sales, reports.expenses);
  const payments = sumBy(reports.payments, "amount");
  const products = salesByProduct(reports.productSales);
  const wholeKg = products.filter((row) => row.category === "whole_chicken").reduce((total, row) => total + row.quantityKg, 0);
  const byproductKg = products.filter((row) => row.category !== "whole_chicken").reduce((total, row) => total + row.quantityKg, 0);
  const methodTotal = (method) => sumBy(reports.payments.filter((row) => row.method === method), "amount");
  const receivables = sumBy(reports.collectibles.filter((row) => row.sale_date === date), "outstanding_balance");
  return <Section title="Today's Operations">
    <p className="mb-3 text-sm text-slate-500">{shortDate(date)}</p>
    {!reports.sales.length && !reports.payments.length && !reports.expenses.length && !trips.length && <p className="mb-4 text-slate-500">No transactions for this date.</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[["Gross Sales", currency(financial.grossSales)], ["Payments Received", currency(payments)], ["Cash", currency(methodTotal("cash"))], ["GCash", currency(methodTotal("gcash"))], ["Bank Deposit", currency(methodTotal("bank"))], ["Expenses", currency(financial.expenses)], ["New Receivables (Today's Sales)", currency(receivables)], ["Trips / Stock Received", trips.length], ["Whole Chicken Sold", kg(wholeKg)], ["By-products Sold", kg(byproductKg)]].map(([label, value]) => <StatMini key={label} label={label} value={value} />)}
    </div>
    <h3 className="mb-2 mt-5 font-bold">Salesman DCR Status</h3>
    <ResponsiveTable columns={["Salesman", "Expected Cash", "Actual Remittance", "Difference", "DCR Status"]} rows={reports.dcrs.map((row) => [row.salesman_name, currency(row.expected_cash_remittance), currency(row.actual_cash_remittance), currency(row.difference), <Badge tone={row.status === "locked" ? "green" : "amber"}>{row.status === "locked" ? "Submitted / Locked" : row.status}</Badge>])} />
  </Section>;
}

export function HostedDashboard({ organizationId, epoch = 0, onNavigate, onPayment, onLedger }) {
  const date = hostedToday();
  const [range, setRange] = useState(() => businessWeek(date));
  const remote = useRemote(() => loadHostedDashboard(organizationId, range, date), `${organizationId}-${epoch}-${range.start}-${range.end}`);
  const data = remote.data;
  const reports = data?.reports || { sales: [], expenses: [], payments: [], allPayments: [], plantSales: [], productSales: [], dcrs: [], collectibles: [], warehouseStock: [], salesmanStock: [], transfers: [] };
  const financial = useMemo(() => financialSummary(reports.sales, reports.expenses), [reports.sales, reports.expenses]);
  const plants = useMemo(() => salesByPlant(reports.plantSales), [reports.plantSales]);
  const products = useMemo(() => salesByProduct(reports.productSales), [reports.productSales]);
  const customers = useMemo(() => customerSales(reports.sales, data?.customers || []), [reports.sales, data?.customers]);
  const collectibles = useMemo(() => collectibleSummary(reports.collectibles, reports.allPayments), [reports.collectibles, reports.allPayments]);
  const days = useMemo(() => activityDays(range, reports.sales, reports.payments), [range, reports.sales, reports.payments]);
  const trips = data?.trips || [];
  const wholeKg = products.filter((row) => row.category === "whole_chicken").reduce((total, row) => total + row.quantityKg, 0);
  const byproductKg = products.filter((row) => row.category !== "whole_chicken").reduce((total, row) => total + row.quantityKg, 0);
  const grossMargin = financial.netSales ? (financial.netSales - financial.cogs) / financial.netSales * 100 : 0;
  const summary = { ...financial, expenseTotal: financial.expenses, grossMargin };
  const max = Math.max(1, ...days.flatMap((day) => [day.sales, day.payments]));
  const plantBreakdown = [...new Set(trips.map((trip) => trip.plant))].map((plant) => `${trips.filter((trip) => trip.plant === plant).length} ${plant}`).join(" / ") || "No trips in range";
  const inventoryRows = trips.map((trip) => ({ tripId: trip.id, remainingQty: trip.remainingQty }));
  const todayTrips = data?.todayTrips || [];
  const truckIssues = (data?.trucks || []).flatMap((truck) => {
    if (!truck.lto_registration_expiry) return [];
    const daysLeft = Math.ceil((new Date(`${truck.lto_registration_expiry}T00:00:00`) - new Date(`${date}T00:00:00`)) / 86400000);
    return daysLeft < 0 ? [`${truck.unit_name}: LTO Expired`] : daysLeft <= 30 ? [`${truck.unit_name}: LTO Renewal Due Soon`] : [];
  });

  return <>
    <SectionHeader title="Dashboard" action={<div className="flex flex-wrap items-end gap-2"><DateRange range={range} setRange={setRange} /><Button variant="secondary" aria-label="Refresh dashboard" title="Refresh dashboard" onClick={remote.refresh}><RefreshCw size={17} /></Button></div>} />
    {remote.error && <p role="alert" className="mb-5 border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-800">{remote.error} <button type="button" className="underline" onClick={remote.refresh}>Try again</button></p>}
    {remote.loading && !data ? <p className="py-12 text-center text-slate-500">Loading Dashboard...</p> : <>
      <FinancialCards summary={summary} />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Payments" value={currency(sumBy(reports.payments, "amount"))} icon={Banknote} tone="green" />
        <StatCard label="Trips / Stock Received" value={`${trips.length} Trip${trips.length === 1 ? "" : "s"}`} detail={plantBreakdown} icon={Truck} />
        <StatCard label="Whole Chicken Sold" value={kg(wholeKg)} icon={PackageCheck} />
        <StatCard label="By-products Sold" value={kg(byproductKg)} icon={PackageCheck} tone="amber" />
      </div>
      <HostedInventoryFlowSummary reports={reports} />
      <Section title="Collectibles" action={<Button variant="secondary" onClick={() => onNavigate("collectibles")}>View All Collectibles <ArrowRight size={17} /></Button>}><HostedCollectibles rows={collectibles} onPayment={onPayment} onLedger={onLedger} /></Section>
      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="Sales and Payments"><div className="mb-4 flex gap-4 text-sm"><span className="font-semibold text-blue-700">Sales</span><span className="font-semibold text-emerald-700">Payments</span></div><div className="chart-rows">{days.map((day) => <div key={day.date} className="chart-row"><p className="text-sm font-semibold">{shortDate(day.date).replace(`, ${date.slice(0, 4)}`, "")}</p><div className="space-y-1"><div className="h-3 bg-blue-500" style={{ width: `${day.sales / max * 100}%` }} /><div className="h-3 bg-emerald-500" style={{ width: `${day.payments / max * 100}%` }} /></div><p className="text-right text-sm">{currency(day.sales)}<br /><span className="text-emerald-700">{currency(day.payments)}</span></p></div>)}</div></Section>
        <Section title="Sales by Plant"><ResponsiveTable columns={["Plant", "Sales", "KG Sold", "Gross Profit"]} rows={plants.map((plant) => [<PlantName name={plant.plantName} />, currency(plant.sales), kg(plant.quantityKg), currency(plant.grossProfit)])} /></Section>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="Products Sold"><ResponsiveTable columns={["Product / Code", "KG Sold", "Sales"]} rows={products.map((product) => [hostedIdentity(product), kg(product.quantityKg), currency(product.sales)])} /></Section>
        <Section title="Customer Sales"><ResponsiveTable columns={["Customer", "Sales", "Gross Profit"]} rows={customers.map((customer) => [customer.key, currency(customer.revenue), currency(customer.profit)])} /></Section>
      </div>
      <TripSummary trips={trips} previousTrips={data?.previousTrips || []} inventoryRows={inventoryRows} />
      <HostedDailySummary reports={data?.todayReports || reports} trips={todayTrips} date={date} />
      <Section title="Attention Required">
        {!truckIssues.length && !(data?.discrepancies || []).length && <p className="text-slate-500">No items requiring attention.</p>}
        <div className="grid gap-3 md:grid-cols-2">{(data?.discrepancies || []).map((item) => <button key={item.id} className="alert-item text-left" onClick={() => onNavigate("discrepancies")}><strong>{item.type.replaceAll("_", " ")}</strong><p>{item.description}</p></button>)}{truckIssues.map((issue) => <button key={issue} className="alert-item text-left" onClick={() => onNavigate("trucks")}>{issue}</button>)}</div>
      </Section>
    </>}
  </>;
}
function ProfitTable({ lines, groupBy, label }) {
  return <ResponsiveTable columns={[label, "KG Sold", "Sales", "Capital", "Gross Profit", "Margin"]} rows={aggregate(lines, groupBy).map((item) => [
    item.key, kg(item.qty), currency(item.revenue), currency(item.cogs), currency(item.profit), (item.revenue ? item.profit / item.revenue * 100 : 0).toFixed(2) + "%",
  ])} />;
}
export function Reports({ state }) {
  const [range, setRange] = useState(() => businessWeek(demoToday));
  const [report, setReport] = useState("Weekly Business Report");
  const summary = periodSummary(state, range);
  const prior = periodSummary(state, previousPeriod(range));
  const reports = ["Weekly Business Report", "Daily Summary", "Inventory", "Inventory Transfers", "Sales", "Payments", "Collectibles", "Salesman Accountability", "Discrepancies"];
  const all = report === "Weekly Business Report";
  const inventory = state.inventoryRows.filter((row) => inRange(row.tripDate, range));
  return <>
    <SectionHeader title="Reports" action={report !== "Daily Summary" && <DateRange range={range} setRange={setRange} />} />
    <label className="block max-w-md text-sm font-semibold">Report<select className="mt-2 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3" value={report} onChange={(e) => setReport(e.target.value)}>{reports.map((name) => <option key={name}>{name}</option>)}</select></label>
    {report !== "Daily Summary" && !summary.lines.length && !summary.payments.length && !summary.recordedExpenses.length && !summary.trips.length && !(state.receivingTransfers || []).some((item) => inRange(item.date, range)) && !(state.salesmanTransfers || []).some((item) => inRange(item.date, range)) && !state.discrepancies.some((item) => inRange(item.date, range)) && <p className="mt-4 text-slate-500">No activity in the selected date range.</p>}
    {report === "Daily Summary" ? <DailySummary state={state} /> : <>
      {all && <Section title="Financial Summary"><FinancialCards summary={summary} /><div className="mt-4"><ResponsiveTable columns={["Metric", "Selected Period", "Previous Equal Period"]} rows={[["Gross Sales", currency(summary.grossSales), currency(prior.grossSales)], ["Capital (Product Cost)", currency(summary.cogs), currency(prior.cogs)], ["Expenses", currency(summary.expenseTotal), currency(prior.expenseTotal)], ["Profit Estimate", currency(summary.profitEstimate), currency(prior.profitEstimate)]]} /></div></Section>}
      {all && <TripSummary trips={summary.trips} previousTrips={prior.trips} inventoryRows={state.inventoryRows} />}
      {(all || report === "Inventory Transfers") && <><InventoryFlowSummary state={state} range={range} /><Section title="Warehouse to Salesman"><ResponsiveTable columns={["Receiving Receipt", "Salesman", "Plant / Trip", "Product / Code / Class", "KG", "Bags", "Heads", "Cost/kg", "Date"]} rows={(state.receivingTransfers || []).filter((item) => inRange(item.date, range)).map((item) => [item.receipt, state.users.find((user) => user.id === item.toSalesmanId)?.name || "-", item.plant + " / " + item.tripCode, productLabel(item.product, item.sizeCode, item.classType, item.sizeCodeLabel, item.classTypeLabel), kg(item.qty), item.bags ?? "Not recorded", item.headCount ?? "Not recorded", currency(item.costPerKg), shortDate(item.date)])} /></Section><Section title="Salesman to Salesman"><ResponsiveTable columns={["Transfer Receipt", "From", "To", "Plant / Trip", "Product / Code / Class", "KG", "Cost/kg", "Date"]} rows={(state.salesmanTransfers || []).filter((item) => inRange(item.date, range)).map((item) => [item.receipt, state.users.find((user) => user.id === item.fromSalesmanId)?.name || "-", state.users.find((user) => user.id === item.toSalesmanId)?.name || "-", item.plant + " / " + item.tripCode, productLabel(item.product, item.sizeCode, item.classType, item.sizeCodeLabel, item.classTypeLabel), kg(item.qty), currency(item.costPerKg), shortDate(item.date)])} /></Section></>}
      {all && <Section title="Recorded Expenses"><ResponsiveTable columns={["Date", "Salesman", "Category", "Payment Source", "Approval", "Amount"]} rows={summary.recordedExpenses.map((item) => [shortDate(item.date), state.users.find((user) => user.id === item.agentId)?.name || "-", item.category, item.source === "Cash Collection" ? "Collected Cash" : item.source, item.status, currency(item.amount)])} /></Section>}
      {(all || report === "Sales") && <>
        <Section title="Sales by Plant"><ProfitTable lines={summary.lines} groupBy={(line) => line.plant} label="Plant" /></Section>
        <Section title="Profitability by Trip"><ProfitTable lines={summary.lines} groupBy={(line) => { const trip = state.trips.find((item) => item.id === line.tripId); return trip.plant + " / " + shortDate(trip.date) + " / " + trip.code; }} label="Plant / Trip" /></Section>
        <Section title="Sales by Product"><ProfitTable lines={summary.lines} groupBy={(line) => line.product} label="Product" /></Section>
        <Section title="Sales by Code / Class"><ProfitTable lines={summary.lines} groupBy={(line) => productLabel(line.product, line.sizeCode, line.classType, line.sizeCodeLabel, line.classTypeLabel)} label="Product / Code / Class" /></Section>
        <Section title="Sales by Customer"><ProfitTable lines={summary.lines} groupBy={(line) => getCustomerName(state.customers, line.customerId)} label="Customer" /></Section>
        <Section title="Free-from-Plant Sales"><ProfitTable lines={summary.lines.filter((line) => line.acquisitionType === "Free from Plant")} groupBy={(line) => line.plant + " / " + productLabel(line.product, line.sizeCode, line.classType, line.sizeCodeLabel, line.classTypeLabel)} label="Origin / Product" /></Section>
        <Section title="Sale References"><ResponsiveTable columns={["Date", "Sale", "Trust Receipt", "Customer", "Sales"]} rows={state.outs.filter((out) => inRange(out.date, range)).map((out) => [shortDate(out.date), out.ref, out.trustReceipt || "-", getCustomerName(state.customers, out.customerId), currency(out.total)])} /></Section>
      </>}
      {(all || report === "Inventory") && <Section title="Company Inventory by Stock-In Date">
        <p className="mb-3 text-sm text-slate-500">Received in the selected range; remaining quantities and cost value are current.</p>
        <div className="mb-4 grid gap-3 sm:grid-cols-3"><StatMini label="Stock In" value={kg(sum(inventory, "originalQty"))} /><StatMini label="Remaining Now" value={kg(sum(inventory, "remainingQty"))} /><StatMini label="Sold Out Products" value={inventory.filter((row) => row.remainingQty === 0).length} /></div>
        <ResponsiveTable columns={["Plant / Date / Trip", "Product / Code / Class", "Bags", "Heads", "Stock In", "Sold", "Remaining Now", "Cost Value", "Acquisition / Status"]} rows={inventory.map((row) => [row.plant + " / " + shortDate(row.tripDate) + " / " + row.tripCode, productLabel(row.product, row.sizeCode, row.classType, row.sizeCodeLabel, row.classTypeLabel), row.bags ?? "Not recorded", row.headCount ?? "Not recorded", kg(row.originalQty), kg(row.totalOut), kg(row.remainingQty), currency(row.inventoryCostValue), row.acquisitionType + (row.remainingQty === 0 ? " / SOLD OUT" : "")])} />
      </Section>}
      {(all || report === "Payments") && <Section title="Payments"><ResponsiveTable columns={["Method", "Amount"]} rows={[...Object.entries(summary.methods).map(([method, amount]) => [method, currency(amount)]), ["Total Payments", currency(summary.paymentTotal)]]} /><div className="mt-4"><ResponsiveTable columns={["Date", "Customer", "Payment", "Method", "Reference Number", "Notes", "Amount"]} rows={summary.payments.map((item) => [shortDate(item.date), getCustomerName(state.customers, item.customerId), item.ref, item.method, item.reference || "-", item.notes || "-", currency(item.amount)])} /></div></Section>}
      {(all || report === "Collectibles") && <Section title="Receivables / Collectibles">
        <ResponsiveTable columns={["Metric", "Amount"]} rows={[["Opening Balance", currency(summary.opening)], ["New Credit Sales (Before Payments)", currency(summary.newCreditSales)], ["Payments Applied", currency(summary.paymentsApplied)], ["Closing Outstanding", currency(summary.closing)]]} />
        <h3 className="my-3 font-semibold">Customers with Balances at Range End</h3>
        <ResponsiveTable columns={["Customer", "Outstanding", "Oldest Unpaid"]} rows={collectibleRows(state.customers, state.ledgerEntries.filter((item) => item.date <= range.end), state.collections.filter((item) => item.date <= range.end)).map((item) => [item.name, currency(item.balance), item.oldest ? shortDate(item.oldest) : "-"])} />
      </Section>}
      {(all || report === "Salesman Accountability") && <Section title="Salesman Accountability"><ResponsiveTable columns={["Salesman", "Sales Handled", "Payments", "Cash", "GCash", "Bank", "Expenses", "Expected Cash", "Actual Remittance", "Open Discrepancies"]} rows={agentPeriodRows(state.users, state, range).map((agent) => [agent.name, currency(agent.sales), currency(agent.payments), currency(agent.cash), currency(agent.gcash), currency(agent.bank), currency(agent.expenses), currency(agent.expected), agent.actual === null ? "Pending" : currency(agent.actual), agent.discrepancies])} /></Section>}
      {(all || report === "Discrepancies") && <Section title="Discrepancies"><ResponsiveTable columns={["Date", "Type", "Issue", "Status"]} rows={state.discrepancies.filter((item) => inRange(item.date, range)).map((item) => [shortDate(item.date), item.type, item.title, item.status])} /></Section>}
    </>}
  </>;
}
