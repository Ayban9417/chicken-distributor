import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  BarChart3,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileClock,
  FileText,
  History,
  Home,
  Menu,
  PackageCheck,
  Plus,
  ReceiptText,
  Search,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import {
  agents,
  initialAuditLog,
  initialCollections,
  initialCustomers,
  initialDiscrepancies,
  initialExpenses,
  initialLedgerEntries,
  initialMovements,
  initialOuts,
  initialTrips,
  plants,
  products,
  users,
  weeklyBusinessData,
} from "./data/demoData";
import {
  allocateOldestFirst,
  buildDcr,
  currency,
  customerBalance,
  customerPrice,
  generalPrice,
  getAgentName,
  getAcquisitionCost,
  getAvailableQty,
  getCustomerName,
  getInventoryRows,
  periodOutFinancials,
  kg,
  ledgerWithRunningBalance,
  shortDate,
  tripAcquisitionCost,
} from "./utils/business";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "trips", label: "Trips / Stock In", icon: Truck },
  { id: "inventory", label: "Inventory", icon: PackageCheck },
  { id: "out", label: "OUT / Orders", icon: ShoppingCart },
  { id: "customers", label: "Customers", icon: Users },
  { id: "collections", label: "Collections", icon: WalletCards },
  { id: "dcr", label: "Daily Cash Reports", icon: FileClock },
  { id: "discrepancies", label: "Discrepancies", icon: AlertTriangle },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "admin", label: "Administration", icon: Settings },
];

const today = "2026-08-30";

const uid = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const defaultTripForm = {
  plant: "Bounty",
  date: today,
  reference: "FLOW-A-DEMO",
  deliveryNote: "Client workflow demo stock in",
  notes: "Bounty Aug 30 delivery",
  products: [
    { name: "Whole Dressed Chicken", qty: 1500, costPerKg: 145 },
    { name: "Liver", qty: 70, costPerKg: 90 },
    { name: "Gizzard", qty: 55, costPerKg: 115 },
    { name: "Feet", qty: 80, costPerKg: 65 },
    { name: "Head", qty: 75, costPerKg: 45 },
  ],
};

const categories = ["Fuel", "Parking", "Toll", "Meals", "Repairs", "Delivery Expense", "Other"];
const paymentMethods = ["Cash", "GCash", "Bank Deposit"];
const wholeChickenProduct = "Whole Dressed Chicken";

function Badge({ children, tone = "slate" }) {
  const tones = {
    blue: "bg-blue-50 text-blue-700 ring-blue-200",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-50 text-amber-800 ring-amber-200",
    red: "bg-rose-50 text-rose-700 ring-rose-200",
    purple: "bg-violet-50 text-violet-700 ring-violet-200",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tones[tone]}`}>{children}</span>;
}

function Button({ children, variant = "primary", className = "", ...props }) {
  const variants = {
    primary: "bg-[#146ef5] text-white hover:bg-blue-700",
    secondary: "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
  };
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function inputClass() {
  return "min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";
}

function StatCard({ label, value, detail, tone = "blue", icon: Icon }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
          {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
        </div>
        {Icon && (
          <div className={`rounded-lg p-2 ${tone === "red" ? "bg-rose-50 text-rose-600" : tone === "green" ? "bg-emerald-50 text-emerald-600" : tone === "amber" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"}`}>
            <Icon size={20} />
          </div>
        )}
      </div>
    </div>
  );
}

function Drawer({ title, children, onClose }) {
  if (!children) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/25">
      <button className="flex-1" aria-label="Close drawer" onClick={onClose} />
      <aside className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-950">{title}</h2>
          <Button variant="ghost" className="h-11 w-11 px-0" onClick={onClose} aria-label="Close">
            <X size={20} />
          </Button>
        </div>
        {children}
      </aside>
    </div>
  );
}

function SectionHeader({ title, eyebrow, action }) {
  return (
    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow && <p className="mb-1 text-sm font-semibold text-[#146ef5]">{eyebrow}</p>}
        <h1 className="text-2xl font-bold text-slate-950 md:text-3xl">{title}</h1>
      </div>
      {action}
    </div>
  );
}

export default function App() {
  const [active, setActive] = useState("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [trips, setTrips] = useState(initialTrips);
  const [movements, setMovements] = useState(initialMovements);
  const [outs, setOuts] = useState(initialOuts);
  const [ledgerEntries, setLedgerEntries] = useState(initialLedgerEntries);
  const [collections, setCollections] = useState(initialCollections);
  const [expenses, setExpenses] = useState(initialExpenses);
  const [discrepancies, setDiscrepancies] = useState(initialDiscrepancies);
  const [auditLog, setAuditLog] = useState(initialAuditLog);
  const [dcrs, setDcrs] = useState([]);
  const [drawer, setDrawer] = useState(null);
  const [toast, setToast] = useState("");
  const [postDcrAlert, setPostDcrAlert] = useState("");

  const inventoryRows = useMemo(() => getInventoryRows(trips, movements), [trips, movements]);
  const customers = initialCustomers;

  function pushToast(message) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  function addAudit(action, actor = "System") {
    setAuditLog((logs) => [
      { id: uid("audit"), at: new Date().toISOString(), actor, action },
      ...logs,
    ]);
  }

  function registerPostDcrChange(agentId, date, description) {
    const locked = dcrs.find((dcr) => dcr.agentId === agentId && dcr.date === date && dcr.status === "LOCKED");
    if (locked) {
      const message = `Post-DCR Adjustment Detected: ${shortDate(date)} / ${getAgentName(agents, agentId)} - ${description}`;
      setPostDcrAlert(message);
      setDiscrepancies((items) => [
        {
          id: `disc-post-${Date.now()}`,
          type: "Post-DCR",
          title: "Post-DCR Adjustment Detected",
          status: "Open",
          agentId,
          details: message,
        },
        ...items,
      ]);
    }
  }

  const views = {
    dashboard: (
      <Dashboard
        inventoryRows={inventoryRows}
        collections={collections}
        outs={outs}
        trips={trips}
        expenses={expenses}
        ledgerEntries={ledgerEntries}
        discrepancies={discrepancies}
        onNavigate={setActive}
      />
    ),
    trips: (
      <Trips
        trips={trips}
        setTrips={setTrips}
        addAudit={addAudit}
        pushToast={pushToast}
      />
    ),
    inventory: (
      <Inventory
        inventoryRows={inventoryRows}
        movements={movements}
        onSelect={(row) => setDrawer({ type: "inventory", row })}
      />
    ),
    out: (
      <OutOrders
        customers={customers}
        trips={trips}
        movements={movements}
        setMovements={setMovements}
        outs={outs}
        setOuts={setOuts}
        ledgerEntries={ledgerEntries}
        setLedgerEntries={setLedgerEntries}
        setDiscrepancies={setDiscrepancies}
        addAudit={addAudit}
        pushToast={pushToast}
      />
    ),
    customers: (
      <Customers
        customers={customers}
        ledgerEntries={ledgerEntries}
        outs={outs}
        collections={collections}
        onSelect={(payload) => setDrawer(payload)}
      />
    ),
    collections: (
      <Collections
        customers={customers}
        ledgerEntries={ledgerEntries}
        setLedgerEntries={setLedgerEntries}
        collections={collections}
        setCollections={setCollections}
        expenses={expenses}
        setExpenses={setExpenses}
        setDiscrepancies={setDiscrepancies}
        addAudit={addAudit}
        pushToast={pushToast}
        registerPostDcrChange={registerPostDcrChange}
      />
    ),
    dcr: (
      <Dcr
        customers={customers}
        collections={collections}
        expenses={expenses}
        dcrs={dcrs}
        setDcrs={setDcrs}
        setDiscrepancies={setDiscrepancies}
        addAudit={addAudit}
        pushToast={pushToast}
        postDcrAlert={postDcrAlert}
      />
    ),
    discrepancies: (
      <Discrepancies
        discrepancies={discrepancies}
        setDiscrepancies={setDiscrepancies}
        customers={customers}
      />
    ),
    reports: <Reports customers={customers} inventoryRows={inventoryRows} trips={trips} outs={outs} ledgerEntries={ledgerEntries} collections={collections} expenses={expenses} discrepancies={discrepancies} />,
    admin: <Administration users={users} auditLog={auditLog} />,
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-200 bg-white md:block">
        <Brand />
        <Nav active={active} setActive={setActive} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/35 md:hidden">
          <aside className="h-full w-80 max-w-[86vw] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pr-3">
              <Brand />
              <Button variant="ghost" className="h-11 w-11 px-0" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <X size={20} />
              </Button>
            </div>
            <Nav
              active={active}
              setActive={(id) => {
                setActive(id);
                setMobileOpen(false);
              }}
            />
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:ml-72 md:px-7">
        <Button variant="ghost" className="h-11 w-11 px-0 md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
          <Menu size={22} />
        </Button>
        <div className="hidden text-sm font-semibold text-slate-500 md:block">Concept Workflow Prototype by Noderno</div>
        <div className="flex items-center gap-2">
          <Badge tone="blue">Local state only</Badge>
          <Badge>Presentation mode</Badge>
        </div>
      </header>

      <main className="pb-24 md:ml-72">
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-7">{views[active]}</div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex gap-2 overflow-x-auto border-t border-slate-200 bg-white p-2 md:hidden">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`flex min-w-20 flex-col items-center gap-1 rounded-lg px-2 py-2 text-[11px] font-semibold ${active === id ? "bg-blue-50 text-[#146ef5]" : "text-slate-500"}`}
            onClick={() => setActive(id)}
          >
            <Icon size={18} />
            <span>{label.split(" / ")[0]}</span>
          </button>
        ))}
      </nav>

      <footer className="border-t border-slate-200 bg-white px-4 py-4 text-center text-xs text-slate-500 md:ml-72">
        Prototype for discussion purposes only. Final features and workflows will be based on approved client requirements.
      </footer>

      {toast && <div className="fixed right-4 top-20 z-50 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-xl">{toast}</div>}

      {drawer && (
        <Drawer title={drawerTitle(drawer)} onClose={() => setDrawer(null)}>
          {drawer.type === "inventory" && <InventoryDetail row={drawer.row} />}
          {drawer.type === "out" && <OutDetail out={drawer.out} />}
          {drawer.type === "payment" && <PaymentDetail payment={drawer.payment} />}
          {drawer.type === "report" && <ReportDetail report={drawer.report} rows={drawer.rows} />}
        </Drawer>
      )}
    </div>
  );
}

function Brand() {
  return (
    <div className="p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#146ef5] text-white">
          <ClipboardCheck size={24} />
        </div>
        <div>
          <p className="text-base font-bold text-slate-950">Chicken Distributor</p>
          <p className="text-xs font-semibold text-slate-500">Concept Workflow Prototype by Noderno</p>
        </div>
      </div>
    </div>
  );
}

function Nav({ active, setActive }) {
  return (
    <nav className="space-y-1 px-3">
      {navItems.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold transition ${active === id ? "bg-blue-50 text-[#146ef5]" : "text-slate-600 hover:bg-slate-100"}`}
          onClick={() => setActive(id)}
        >
          <Icon size={19} />
          {label}
        </button>
      ))}
    </nav>
  );
}

function periodRangeLabel(period) {
  const start = new Date(`${period.start}T00:00:00`);
  const end = new Date(`${period.end}T00:00:00`);
  const sameMonth = start.getMonth() === end.getMonth();
  const startMonth = new Intl.DateTimeFormat("en-US", { month: "short" }).format(start);
  const endMonth = new Intl.DateTimeFormat("en-US", { month: "short" }).format(end);
  const startDay = start.getDate();
  const endDay = end.getDate();
  const year = end.getFullYear();
  return sameMonth
    ? `${startMonth} ${startDay}-${endDay}, ${year}`
    : `${startMonth} ${startDay}-${endMonth} ${endDay}, ${year}`;
}

function weeklyTotals(period) {
  const totalSales = period.days.reduce((sum, day) => sum + day.sales, 0);
  const totalCollections = period.days.reduce((sum, day) => sum + day.collections, 0);
  const totalExpenses = period.expenses.reduce((sum, item) => sum + item.amount, 0);
  const wholeChickenKg = period.products.find((item) => item.product === wholeChickenProduct)?.kg || 0;
  const byProductKg = period.products
    .filter((item) => item.product !== wholeChickenProduct)
    .reduce((sum, item) => sum + item.kg, 0);
  const strongestDay = period.days.reduce((best, day) => (day.sales > best.sales ? day : best), period.days[0]);
  const weakestDay = period.days.reduce((low, day) => (day.sales < low.sales ? day : low), period.days[0]);
  return {
    totalSales,
    totalCollections,
    totalExpenses,
    wholeChickenKg,
    byProductKg,
    strongestDay,
    weakestDay,
    averageDailySales: totalSales / period.days.length,
    collectionRate: totalSales ? (totalCollections / totalSales) * 100 : 0,
    closingReceivables: period.receivables.opening + period.receivables.newCreditSales - period.receivables.collectionsApplied,
  };
}

function tripsForPeriod(trips, period) {
  return trips
    .filter((trip) => trip.date >= period.start && trip.date <= period.end)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function previousWeekPeriod(period) {
  const start = new Date(`${period.start}T00:00:00`);
  const end = new Date(`${period.end}T00:00:00`);
  start.setDate(start.getDate() - 7);
  end.setDate(end.getDate() - 7);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function tripProductTotals(trip) {
  const wholeChickenStockIn = trip.products
    .filter((item) => item.name === wholeChickenProduct)
    .reduce((sum, item) => sum + Number(item.originalQty || 0), 0);
  const byProductStockIn = trip.products
    .filter((item) => item.name !== wholeChickenProduct)
    .reduce((sum, item) => sum + Number(item.originalQty || 0), 0);
  return {
    wholeChickenStockIn,
    byProductStockIn,
    totalStockIn: wholeChickenStockIn + byProductStockIn,
  };
}

function weeklyTripStats(trips, period, inventoryRows = []) {
  const periodTrips = tripsForPeriod(trips, period);
  const rows = periodTrips.map((trip) => {
    const totals = tripProductTotals(trip);
    const remainingStock = inventoryRows
      .filter((row) => row.tripId === trip.id)
      .reduce((sum, row) => sum + Number(row.remainingQty || 0), 0);
    return { ...trip, ...totals, remainingStock };
  });
  const plantMap = rows.reduce((map, trip) => {
    const current = map.get(trip.plant) || {
      plant: trip.plant,
      trips: 0,
      wholeChickenStockIn: 0,
      byProductStockIn: 0,
      totalStockIn: 0,
    };
    current.trips += 1;
    current.wholeChickenStockIn += trip.wholeChickenStockIn;
    current.byProductStockIn += trip.byProductStockIn;
    current.totalStockIn += trip.totalStockIn;
    map.set(trip.plant, current);
    return map;
  }, new Map());
  const plantBreakdown = [...plantMap.values()].sort((a, b) => b.trips - a.trips || a.plant.localeCompare(b.plant));
  return {
    rows,
    plantBreakdown,
    totalTrips: rows.length,
    wholeChickenStockIn: rows.reduce((sum, trip) => sum + trip.wholeChickenStockIn, 0),
    byProductStockIn: rows.reduce((sum, trip) => sum + trip.byProductStockIn, 0),
    totalStockIn: rows.reduce((sum, trip) => sum + trip.totalStockIn, 0),
  };
}

function operatingExpenseTotal(expenses, period) {
  const baseline = (period.expenses || []).reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const liveAdditions = expenses
    .filter((expense) => expense.date >= period.start && expense.date <= period.end)
    .filter((expense) => !initialExpenses.some((seed) => seed.id === expense.id))
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  return baseline + liveAdditions;
}

function weeklyFinancialSummary(period, outs, trips, expenses) {
  const financials = periodOutFinancials(outs, trips, period);
  const recordedOperatingExpenses = operatingExpenseTotal(expenses, period);
  return {
    ...financials,
    recordedOperatingExpenses,
    operatingProfitEstimate: financials.grossProfit - recordedOperatingExpenses,
  };
}

function marginLabel(netSales, grossProfit) {
  if (!netSales) return "0.00%";
  return `${((grossProfit / netSales) * 100).toFixed(2)}%`;
}

function aggregateProfit(lines, keyFn) {
  const map = lines.reduce((items, line) => {
    const key = keyFn(line);
    const current = items.get(key) || {
      key,
      qty: 0,
      netSales: 0,
      cogs: 0,
      grossProfit: 0,
    };
    current.qty += Number(line.qty || 0);
    current.netSales += Number(line.revenue || 0);
    current.cogs += Number(line.cogs || 0);
    current.grossProfit += Number(line.grossProfit || 0);
    items.set(key, current);
    return items;
  }, new Map());
  return [...map.values()]
    .map((item) => ({ ...item, grossMargin: item.netSales ? (item.grossProfit / item.netSales) * 100 : 0 }))
    .sort((a, b) => b.netSales - a.netSales);
}

function tripPlantBreakdownLabel(stats) {
  if (!stats.plantBreakdown.length) return "No trips in selected week";
  return stats.plantBreakdown.map((plant) => `${plant.trips} ${plant.plant}`).join(" • ");
}

function tripChangeLabel(current, previous) {
  const difference = current.totalTrips - previous.totalTrips;
  if (difference === 0) return "No change vs previous week";
  return `${difference > 0 ? "+" : ""}${difference} vs last week`;
}

function percentChange(current, previous) {
  if (!previous) return "0.0%";
  const value = ((current - previous) / previous) * 100;
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function PeriodControls({ periodKey, setPeriodKey, showCustom = true }) {
  return (
    <div className="flex flex-wrap gap-2">
      {[
        ["thisWeek", "This Week"],
        ["lastWeek", "Last Week"],
        ["custom", "Custom"],
      ].map(([key, label]) => (
        <Button
          key={key}
          variant={periodKey === key ? "primary" : "secondary"}
          className={!showCustom && key === "custom" ? "hidden" : ""}
          onClick={() => setPeriodKey(key)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}

function Dashboard({ inventoryRows, collections, outs, trips, expenses, ledgerEntries, discrepancies, onNavigate }) {
  const [periodKey, setPeriodKey] = useState("thisWeek");
  const activePeriodKey = periodKey === "custom" ? "thisWeek" : periodKey;
  const period = weeklyBusinessData[activePeriodKey];
  const previousPeriod = previousWeekPeriod(period);
  const totals = weeklyTotals(period);
  const financials = weeklyFinancialSummary(period, outs, trips, expenses);
  const previousFinancials = weeklyFinancialSummary(previousPeriod, outs, trips, expenses);
  const productProfit = aggregateProfit(financials.lines, (line) => line.product);
  const wholeChickenOut = productProfit.find((item) => item.key === wholeChickenProduct)?.qty || 0;
  const byProductOut = productProfit.filter((item) => item.key !== wholeChickenProduct).reduce((sum, item) => sum + item.qty, 0);
  const tripStats = weeklyTripStats(trips, period, inventoryRows);
  const previousTripStats = weeklyTripStats(trips, previousPeriod, inventoryRows);
  const todayOps = weeklyBusinessData.thisWeek.today;
  const openDiscrepancies = discrepancies.filter((item) => item.status === "Open");
  const recentOuts = outs.slice(-3).reverse();
  const recentCollections = collections.filter((collection) => collection.date === today).slice(0, 3);
  const todaysTrips = trips.filter((trip) => trip.date === today);
  const maxDaily = Math.max(...period.days.flatMap((day) => [day.sales, day.collections]));
  const plantProfit = aggregateProfit(financials.lines, (line) => line.plant || "Unassigned");
  const productOutRows = productProfit.length ? productProfit : period.products.map((item) => ({ key: item.product, qty: item.kg, netSales: 0, cogs: 0, grossProfit: 0, grossMargin: 0 }));
  const plantOutRows = plantProfit.length ? plantProfit : period.plants.map((item) => ({ key: item.plant, qty: item.kg, netSales: item.sales, cogs: 0, grossProfit: 0, grossMargin: 0 }));
  const productMax = Math.max(...productOutRows.map((item) => item.qty), 1);
  const plantMax = Math.max(...plantOutRows.map((item) => item.netSales), 1);
  const plantRemaining = (plantName) =>
    inventoryRows
      .filter((row) => row.plant === plantName)
      .reduce((sum, row) => sum + row.remainingQty, 0);

  return (
    <>
      <SectionHeader
        title="Dashboard"
        eyebrow="This Week -> Today -> Attention Required"
        action={<PeriodControls periodKey={periodKey} setPeriodKey={setPeriodKey} />}
      />
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-bold text-[#146ef5]">{periodKey === "custom" ? "Custom Range" : period.label}</p>
            <h2 className="text-2xl font-bold text-slate-950">{periodRangeLabel(period)}</h2>
            <p className="mt-1 text-sm text-slate-500">Weekly business performance first, with daily operations below.</p>
          </div>
          {periodKey === "custom" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <input className={inputClass()} type="date" defaultValue={period.start} aria-label="Custom start date" />
              <input className={inputClass()} type="date" defaultValue={period.end} aria-label="Custom end date" />
            </div>
          )}
        </div>
        <h3 className="mb-3 text-sm font-bold uppercase text-slate-500">Financial Performance</h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Gross Sales" value={currency(financials.grossSales)} detail={`${percentChange(financials.grossSales, previousFinancials.grossSales)} vs previous week`} icon={ReceiptText} />
          <StatCard label="Net Sales" value={currency(financials.netSales)} detail="No sales deductions in demo data" icon={ClipboardCheck} />
          <StatCard label="COGS" value={currency(financials.cogs)} detail="Exact Plant + Trip + Product cost" icon={PackageCheck} tone="amber" />
          <StatCard label="Gross Profit" value={currency(financials.grossProfit)} detail={`${financials.grossMargin.toFixed(2)}% gross margin`} icon={BarChart3} tone="green" />
          <StatCard label="Gross Margin" value={`${financials.grossMargin.toFixed(2)}%`} detail="Gross Profit ÷ Net Sales" icon={ReceiptText} />
          <StatCard label="Expenses" value={currency(financials.recordedOperatingExpenses)} detail={`${percentChange(financials.recordedOperatingExpenses, previousFinancials.recordedOperatingExpenses)} vs previous week`} icon={WalletCards} tone="red" />
          <StatCard label="Operating Profit Estimate" value={currency(financials.operatingProfitEstimate)} detail="Gross Profit minus recorded expenses" icon={Banknote} tone="green" />
        </div>
        <h3 className="mb-3 mt-5 text-sm font-bold uppercase text-slate-500">Operations</h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Trips This Week" value={`${tripStats.totalTrips} Trips`} detail={`${tripPlantBreakdownLabel(tripStats)} • ${tripChangeLabel(tripStats, previousTripStats)}`} icon={Truck} />
          <StatCard label="Whole Chicken OUT" value={kg(wholeChickenOut)} detail="From weekly OUT lines" icon={PackageCheck} />
          <StatCard label="By-products OUT" value={kg(byProductOut)} detail="Tracked as separate products" icon={ClipboardList} tone="amber" />
          <StatCard label="Collections" value={currency(totals.totalCollections)} detail="Payments received, not sales" icon={Banknote} tone="green" />
          <StatCard label="Receivables" value={currency(totals.closingReceivables)} detail={`New receivables ${currency(period.receivables.newCreditSales)}`} icon={Users} tone="amber" />
        </div>
      </section>

      <section className="mt-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-bold text-slate-950">Trips This Week</h2>
            <p className="text-sm text-slate-500">Trip Date, Plant, Whole Chicken, By-products, and Total Stock In are calculated from Trip records.</p>
          </div>
          <Badge tone="blue">{tripStats.totalTrips} trips</Badge>
        </div>
        <ResponsiveTable
          columns={["Trip Date", "Plant", "Whole Chicken", "By-products", "Total Stock In"]}
          rows={tripStats.rows.map((trip) => [
            shortDate(trip.date).replace(", 2026", ""),
            trip.plant,
            kg(trip.wholeChickenStockIn),
            kg(trip.byProductStockIn),
            kg(trip.totalStockIn),
          ])}
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <StatMini label="Total Trips" value={tripStats.totalTrips} />
          {tripStats.plantBreakdown.map((plant) => (
            <StatMini key={plant.plant} label={plant.plant} value={plant.trips} />
          ))}
          <StatMini label="Whole Chicken Stocked In" value={kg(tripStats.wholeChickenStockIn)} />
          <StatMini label="By-products Stocked In" value={kg(tripStats.byProductStockIn)} />
          <StatMini label="Total Stock In" value={kg(tripStats.totalStockIn)} />
        </div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-bold text-slate-950">Weekly Sales & Collections</h2>
              <p className="text-sm text-slate-500">Monday-Sunday comparison</p>
            </div>
            <div className="flex gap-2 text-xs font-bold">
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-[#146ef5]" /> OUT / Sales</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-emerald-500" /> Collections</span>
            </div>
          </div>
          <div className="space-y-3">
            {period.days.map((day) => (
              <div key={day.date} className="grid gap-2 md:grid-cols-[90px_1fr_110px] md:items-center">
                <div className="text-sm font-bold text-slate-700">{day.day}</div>
                <div className="space-y-1">
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-[#146ef5]" style={{ width: `${(day.sales / maxDaily) * 100}%` }} />
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(day.collections / maxDaily) * 100}%` }} />
                  </div>
                </div>
                <div className="flex justify-between gap-3 text-xs font-bold text-slate-600 md:block md:text-right">
                  <span>{currency(day.sales)}</span>
                  <span className="text-emerald-700">{currency(day.collections)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <StatMini label="Strongest sales day" value={`${totals.strongestDay.day} ${currency(totals.strongestDay.sales)}`} />
            <StatMini label="Weakest sales day" value={`${totals.weakestDay.day} ${currency(totals.weakestDay.sales)}`} />
            <StatMini label="Collections pace" value={`${totals.collectionRate.toFixed(1)}% of sales`} />
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-bold text-slate-950">Products OUT This Week</h2>
          <div className="space-y-3">
            {productOutRows.map((item) => (
              <div key={item.key}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-700">{item.key}</span>
                  <span className="font-bold text-slate-950">{kg(item.qty)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${item.key === wholeChickenProduct ? "bg-[#146ef5]" : "bg-amber-500"}`} style={{ width: `${productMax ? (item.qty / productMax) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-bold text-slate-950">OUT by Plant</h2>
          <div className="space-y-3">
            {plantOutRows.map((plant) => (
              <button key={plant.key} className="w-full rounded-lg bg-slate-50 p-3 text-left hover:bg-blue-50" onClick={() => onNavigate("inventory")}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-950">{plant.key}</p>
                    <p className="text-sm text-slate-500">{kg(plant.qty)} OUT</p>
                  </div>
                  <p className="font-bold text-slate-950">{currency(plant.netSales)}</p>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                  <div className="h-full rounded-full bg-[#146ef5]" style={{ width: `${(plant.netSales / plantMax) * 100}%` }} />
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  Gross Profit: {currency(plant.grossProfit)} • Remaining inventory: {plant.key === "Other" ? "Demo plant group" : kg(plantRemaining(plant.key))}
                </p>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-bold text-slate-950">Top Customers This Week</h2>
          <div className="space-y-2">
            {period.customers.map((customer, index) => (
              <div key={customer.customerId} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
                <div>
                  <p className="font-bold text-slate-950">{index + 1}. {getCustomerName(initialCustomers, customer.customerId)}</p>
                  <p className="text-sm text-slate-500">Outstanding {currency(customer.outstanding)}</p>
                </div>
                <p className="font-bold text-slate-950">{currency(customer.sales)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-slate-950">Today's Operations</h2>
            <p className="text-sm text-slate-500">Daily operational snapshot remains secondary to the weekly view.</p>
          </div>
          <Button variant="secondary" onClick={() => onNavigate("dcr")}>
            <FileClock size={18} /> Open DCR
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <StatMini label="OUT Today" value={currency(todayOps.outToday)} />
          <StatMini label="Collections Today" value={currency(todayOps.collectionsToday)} />
          <StatMini label="Cash Pending Remittance" value={currency(todayOps.cashPendingRemittance)} />
          <StatMini label="Trips Received Today" value={trips.filter((trip) => trip.date === today).length} />
          <StatMini label="DCR Status" value={todayOps.dcrStatus} />
          <StatMini label="Open Discrepancies" value={todayOps.openDiscrepancies} />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-4">
          <TodayActivity title="Recent OUT transactions" items={recentOuts.map((out) => `${out.ref} - ${getCustomerName(initialCustomers, out.customerId)} - ${currency(out.total)}`)} empty="No recent OUT transactions." />
          <TodayActivity title="Recent collections" items={recentCollections.map((collection) => `${getCustomerName(initialCustomers, collection.customerId)} - ${collection.method} - ${currency(collection.amount)}`)} empty="No collections today." />
          <TodayActivity title="Today's trips" items={todaysTrips.map((trip) => `${trip.plant} - ${trip.code}`)} empty="No trips recorded today yet." />
          <TodayActivity title="Agent DCR status" items={["Pedro Reyes - Submitted", "Maria Santos - Not submitted", "Juan Cruz - Submitted"]} />
        </div>
      </section>

      <section className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-bold text-rose-950">Attention Required</h2>
          <Badge tone="red">{openDiscrepancies.length || todayOps.openDiscrepancies} open</Badge>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {[
            ["Cash Shortage", "Pedro Reyes", "₱1,000 SHORT"],
            ["Bank Payment Awaiting Verification", "Owner Bank Account", "₱30,000"],
            ["Inventory Difference", "Bounty / Aug 15 / Whole Chicken", "-15 kg"],
            ["Manual Price Override", "ABC Restaurant", "₱184 -> ₱180/kg"],
            ["DCR Not Submitted", "Maria Santos", "Sunday DCR pending"],
          ].map(([title, detail, value]) => (
            <div key={title} className="rounded-lg bg-white p-3 shadow-sm">
              <p className="text-sm font-bold text-rose-900">{title}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">{detail}</p>
              <p className="mt-3 font-bold text-slate-950">{value}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function TodayActivity({ title, items, empty }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="mb-2 text-sm font-bold text-slate-700">{title}</p>
      <div className="space-y-2">
        {items.length ? (
          items.map((item) => <p key={item} className="text-sm font-semibold text-slate-600">{item}</p>)
        ) : (
          <p className="text-sm font-semibold text-slate-400">{empty}</p>
        )}
      </div>
    </div>
  );
}

function Trips({ trips, setTrips, addAudit, pushToast }) {
  const [form, setForm] = useState(defaultTripForm);
  const formTripAcquisitionCost = form.products.reduce(
    (sum, item) => sum + Number(item.qty || 0) * Number(item.costPerKg || 0),
    0
  );
  function updateProduct(index, patch) {
    setForm((current) => ({
      ...current,
      products: current.products.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    }));
  }
  function confirmStockIn() {
    const suffix = form.plant.slice(0, 3).toUpperCase().replace(/\W/g, "");
    const code = `TR-${form.date.replaceAll("-", "").slice(0, 6)}-${suffix}-${trips.length + 1}`;
    const trip = {
      id: `trip-${Date.now()}`,
      code,
      plant: form.plant,
      date: form.date,
      reference: form.reference,
      deliveryNote: form.deliveryNote,
      notes: form.notes,
      products: form.products
        .filter((item) => item.name && Number(item.qty) > 0)
        .map((item) => ({ name: item.name, originalQty: Number(item.qty), costPerKg: Number(item.costPerKg || 0) })),
    };
    setTrips((items) => [trip, ...items]);
    addAudit(`Confirmed Stock In ${code}`, "Owner / Admin");
    pushToast(`${code} added to inventory with ${currency(tripAcquisitionCost(trip))} acquisition cost`);
  }
  return (
    <>
      <SectionHeader title="Trips / Stock In" eyebrow="Admin workflow" action={<Button onClick={confirmStockIn}><Plus size={18} />Confirm Stock In</Button>} />
      <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-4 font-bold">+ New Trip / Stock In</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Plant Origin">
              <select className={inputClass()} value={form.plant} onChange={(e) => setForm({ ...form, plant: e.target.value })}>{plants.map((plant) => <option key={plant}>{plant}</option>)}</select>
            </Field>
            <Field label="Trip Date">
              <input className={inputClass()} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field>
            <Field label="Reference Number">
              <input className={inputClass()} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            </Field>
            <Field label="Delivery Note">
              <input className={inputClass()} value={form.deliveryNote} onChange={(e) => setForm({ ...form, deliveryNote: e.target.value })} />
            </Field>
          </div>
          <Field label="Notes">
            <textarea className={`${inputClass()} mt-1 min-h-24 py-3`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <div className="mt-4 space-y-2">
            <p className="text-sm font-bold text-slate-700">Products, Quantities, and Acquisition Cost</p>
            {form.products.map((item, index) => (
              <div key={`${item.name}-${index}`} className="grid gap-2 xl:grid-cols-[1fr_120px_120px_130px_44px]">
                <Field label={index === 0 ? "Product" : " "}>
                  <select className={inputClass()} value={item.name} onChange={(e) => updateProduct(index, { name: e.target.value })}>{products.map((product) => <option key={product}>{product}</option>)}</select>
                </Field>
                <Field label={index === 0 ? "Quantity" : " "}>
                  <input className={inputClass()} type="number" min="0" value={item.qty} onChange={(e) => updateProduct(index, { qty: e.target.value })} />
                </Field>
                <Field label={index === 0 ? "Cost / kg" : " "}>
                  <input className={inputClass()} type="number" min="0" step="0.01" value={item.costPerKg} onChange={(e) => updateProduct(index, { costPerKg: e.target.value })} />
                </Field>
                <div>
                  <p className="mb-1.5 text-sm font-semibold text-slate-700">{index === 0 ? "Total Cost" : " "}</p>
                  <div className="flex min-h-11 items-center justify-end rounded-lg bg-slate-50 px-3 text-sm font-bold text-slate-950">
                    {currency(Number(item.qty || 0) * Number(item.costPerKg || 0))}
                  </div>
                </div>
                <Button variant="ghost" className="px-0" onClick={() => setForm({ ...form, products: form.products.filter((_, itemIndex) => itemIndex !== index) })} aria-label="Remove product">
                  <X size={18} />
                </Button>
              </div>
            ))}
            <Button variant="secondary" className="w-full" onClick={() => setForm({ ...form, products: [...form.products, { name: "Other", qty: 0, costPerKg: 0 }] })}>
              <Plus size={18} /> Add Product
            </Button>
          </div>
          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-800">Total Trip Acquisition Cost</p>
            <p className="mt-1 text-2xl font-bold text-blue-950">{currency(formTripAcquisitionCost)}</p>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-4 font-bold">Recent Trips</h2>
          <div className="space-y-3">
            {trips.map((trip) => (
              <div key={trip.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-slate-950">{trip.code}</p>
                    <p className="text-sm text-slate-500">{trip.plant} - {shortDate(trip.date)}</p>
                  </div>
                  <Badge tone="green">Stock In</Badge>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {trip.products.map((product) => (
                    <div key={product.name} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
                      <span className="font-semibold">{product.name}</span>: {kg(product.originalQty)} • {currency(product.costPerKg)}/kg
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-sm font-bold text-slate-700">Total Acquisition Cost: {currency(tripAcquisitionCost(trip))}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function Inventory({ inventoryRows, onSelect }) {
  const [selectedPlant, setSelectedPlant] = useState(null);
  const [plantQuery, setPlantQuery] = useState("");
  const [tripFilter, setTripFilter] = useState("All");
  const [productQuery, setProductQuery] = useState("");
  const [productMode, setProductMode] = useState("All Products");

  const activeRows = inventoryRows.filter((row) => row.remainingQty > 0);
  const plantSummaries = [...new Set(activeRows.map((row) => row.plant))]
    .map((plantName) => {
      const rows = activeRows.filter((row) => row.plant === plantName);
      const totalRemaining = rows.reduce((sum, row) => sum + row.remainingQty, 0);
      const wholeChickenStock = rows
        .filter((row) => row.product === wholeChickenProduct)
        .reduce((sum, row) => sum + row.remainingQty, 0);
      return {
        plant: plantName,
        rows,
        activeTrips: new Set(rows.map((row) => row.tripId)).size,
        totalRemaining,
        inventoryCostValue: rows.reduce((sum, row) => sum + Number(row.inventoryCostValue || 0), 0),
        wholeChickenStock,
        byProductStock: totalRemaining - wholeChickenStock,
      };
    })
    .filter((summary) => summary.plant.toLowerCase().includes(plantQuery.toLowerCase()))
    .sort((a, b) => a.plant.localeCompare(b.plant));

  const selectedRows = activeRows.filter((row) => row.plant === selectedPlant);
  const selectedTotal = selectedRows.reduce((sum, row) => sum + row.remainingQty, 0);
  const selectedWholeChicken = selectedRows
    .filter((row) => row.product === wholeChickenProduct)
    .reduce((sum, row) => sum + row.remainingQty, 0);
  const plantSummary = selectedPlant
    ? {
        plant: selectedPlant,
        rows: selectedRows,
        activeTrips: new Set(selectedRows.map((row) => row.tripId)).size,
        totalRemaining: selectedTotal,
        inventoryCostValue: selectedRows.reduce((sum, row) => sum + Number(row.inventoryCostValue || 0), 0),
        wholeChickenStock: selectedWholeChicken,
        byProductStock: selectedTotal - selectedWholeChicken,
      }
    : null;

  const tripOptions = [...selectedRows.reduce((map, row) => {
    if (!map.has(row.tripId)) {
      map.set(row.tripId, { tripId: row.tripId, tripDate: row.tripDate, tripCode: row.tripCode });
    }
    return map;
  }, new Map()).values()].sort((a, b) => a.tripDate.localeCompare(b.tripDate) || a.tripCode.localeCompare(b.tripCode));
  const productFilteredRows = selectedRows.filter((row) => {
    const matchesTrip = tripFilter === "All" || row.tripId === tripFilter;
    const matchesProductText = `${row.product} ${row.tripCode}`.toLowerCase().includes(productQuery.toLowerCase());
    const matchesMode =
      productMode === "All Products" ||
      (productMode === "Whole Chicken" && row.product === wholeChickenProduct) ||
      (productMode === "By-products" && row.product !== wholeChickenProduct);
    return matchesTrip && matchesProductText && matchesMode;
  });
  const tripGroups = tripOptions
    .map((trip) => ({
      ...trip,
      rows: productFilteredRows
        .filter((row) => row.tripId === trip.tripId)
        .sort((a, b) => {
          if (a.product === wholeChickenProduct) return -1;
          if (b.product === wholeChickenProduct) return 1;
          return products.indexOf(a.product) - products.indexOf(b.product);
        }),
    }))
    .filter((group) => group.rows.length);

  if (!selectedPlant) {
    return (
      <>
        <SectionHeader title="Inventory" eyebrow="Plant -> Trip Date -> Products" />
        <div className="mb-4 max-w-xl">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 text-slate-400" size={18} />
            <input
              className={`${inputClass()} pl-10`}
              placeholder="Search Plant"
              value={plantQuery}
              onChange={(event) => setPlantQuery(event.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plantSummaries.map((summary) => (
            <button
              key={summary.plant}
              className="rounded-lg border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md"
              onClick={() => {
                setSelectedPlant(summary.plant);
                setTripFilter("All");
                setProductQuery("");
                setProductMode("All Products");
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-slate-950">{summary.plant}</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">{summary.activeTrips} active trips</p>
                </div>
                <div className="rounded-lg bg-blue-50 p-2 text-[#146ef5]">
                  <PackageCheck size={22} />
                </div>
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-600">Whole Chicken + By-products</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <StatMini label="Total remaining stock" value={kg(summary.totalRemaining)} />
                <StatMini label="Whole Chicken" value={kg(summary.wholeChickenStock)} />
                <StatMini label="Remaining cost value" value={currency(summary.inventoryCostValue)} />
              </div>
              <div className="mt-4 flex items-center justify-between text-sm font-bold text-[#146ef5]">
                <span>View Inventory</span>
                <ChevronRight size={18} />
              </div>
            </button>
          ))}
          {!plantSummaries.length && (
            <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-500">
              No active plants match the search.
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <SectionHeader
        title={`${selectedPlant} Inventory`}
        eyebrow="Inventory -> Plant -> Trip Date -> Products"
        action={
          <Button variant="secondary" onClick={() => setSelectedPlant(null)}>
            <ArrowLeft size={18} /> Back to Plants
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-500">
        <button className="text-[#146ef5]" onClick={() => setSelectedPlant(null)}>Inventory</button>
        <ChevronRight size={16} />
        <span className="text-slate-950">{selectedPlant}</span>
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Remaining Stock" value={kg(plantSummary.totalRemaining)} icon={PackageCheck} tone="green" />
        <StatCard label="Whole Chicken Stock" value={kg(plantSummary.wholeChickenStock)} icon={ClipboardList} />
        <StatCard label="By-product Stock" value={kg(plantSummary.byProductStock)} icon={ReceiptText} tone="amber" />
        <StatCard label="Inventory Cost Value" value={currency(plantSummary.inventoryCostValue)} detail="Remaining quantity × acquisition cost" icon={Banknote} tone="green" />
      </div>
      <div className="mb-4 grid gap-3 md:grid-cols-[180px_1fr_180px]">
        <Field label="Trip Date">
          <select className={inputClass()} value={tripFilter} onChange={(event) => setTripFilter(event.target.value)}>
            <option>All</option>
            {tripOptions.map((trip) => <option key={trip.tripId} value={trip.tripId}>{shortDate(trip.tripDate)} - {trip.tripCode}</option>)}
          </select>
        </Field>
        <Field label="Product Search">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 text-slate-400" size={18} />
            <input
              className={`${inputClass()} pl-10`}
              placeholder="Search product or trip"
              value={productQuery}
              onChange={(event) => setProductQuery(event.target.value)}
            />
          </div>
        </Field>
        <Field label="Product Type">
          <select className={inputClass()} value={productMode} onChange={(event) => setProductMode(event.target.value)}>
            <option>All Products</option>
            <option>Whole Chicken</option>
            <option>By-products</option>
          </select>
        </Field>
      </div>
      <div className="space-y-5">
        {tripGroups.map((group) => {
          const wholeChicken = group.rows.find((row) => row.product === wholeChickenProduct);
          const byProducts = group.rows.filter((row) => row.product !== wholeChickenProduct);
          return (
            <section key={group.tripId} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">Trip - {shortDate(group.tripDate)}</h2>
                  <p className="text-sm font-semibold text-slate-500">{group.tripCode}</p>
                </div>
                <Badge tone="blue">{group.rows.length} products</Badge>
              </div>
              {wholeChicken && (
                <div className="mb-4">
                  <p className="mb-2 text-sm font-bold text-slate-700">Whole Dressed Chicken</p>
                  <InventoryRowHeader />
                  <ProductInventoryRow row={wholeChicken} prominent onSelect={onSelect} />
                </div>
              )}
              {byProducts.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-bold text-slate-700">By-products</p>
                  <InventoryRowHeader />
                  <div className="space-y-2">
                    {byProducts.map((row) => (
                      <ProductInventoryRow key={row.id} row={row} onSelect={onSelect} />
                    ))}
                  </div>
                </div>
              )}
            </section>
          );
        })}
        {!tripGroups.length && (
          <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-500">
            No products match the selected trip or product filter.
          </div>
        )}
      </div>
    </>
  );
}

function InventoryRowHeader() {
  return (
    <div className="mb-2 hidden rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold uppercase text-slate-500 lg:grid lg:grid-cols-[1.3fr_100px_90px_95px_110px_90px_130px_145px]">
      <span>Product</span>
      <span className="text-right">Stock In</span>
      <span className="text-right">OUT</span>
      <span className="text-right">Adjustment</span>
      <span className="text-right">Remaining</span>
      <span className="text-right">Cost/kg</span>
      <span className="text-right">Cost Value</span>
      <span></span>
    </div>
  );
}

function ProductInventoryRow({ row, prominent = false, onSelect }) {
  return (
    <div className={`rounded-lg border ${prominent ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-slate-50"}`}>
      <button
        className="hidden w-full items-center gap-3 px-3 py-3 text-left lg:grid lg:grid-cols-[1.3fr_100px_90px_95px_110px_90px_130px_145px]"
        onClick={() => onSelect(row)}
      >
        <span className="font-bold text-slate-950">{row.product}</span>
        <span className="text-right text-sm font-semibold">{kg(row.originalQty)}</span>
        <span className="text-right text-sm font-semibold">{kg(row.totalOut)}</span>
        <span className="text-right text-sm font-semibold">{row.adjustments ? kg(row.adjustments) : "-"}</span>
        <span className="text-right text-base font-bold text-slate-950">{kg(row.remainingQty)}</span>
        <span className="text-right text-sm font-semibold">{currency(row.costPerKg)}</span>
        <span className="text-right text-sm font-bold text-slate-950">{currency(row.inventoryCostValue)}</span>
        <span className="flex items-center justify-end gap-1 text-sm font-bold text-[#146ef5]">View Movements <ChevronRight size={16} /></span>
      </button>
      <button className="w-full p-3 text-left lg:hidden" onClick={() => onSelect(row)}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-bold text-slate-950">{row.product}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">{row.plant} / {shortDate(row.tripDate)}</p>
          </div>
          <Badge tone={row.remainingQty < 100 ? "amber" : "green"}>{kg(row.remainingQty)}</Badge>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div><p className="text-slate-500">Stock In</p><p className="font-bold">{kg(row.originalQty)}</p></div>
          <div><p className="text-slate-500">OUT</p><p className="font-bold">{kg(row.totalOut)}</p></div>
          <div><p className="text-slate-500">Remaining</p><p className="font-bold">{kg(row.remainingQty)}</p></div>
          <div><p className="text-slate-500">Cost/kg</p><p className="font-bold">{currency(row.costPerKg)}</p></div>
          <div><p className="text-slate-500">Cost Value</p><p className="font-bold">{currency(row.inventoryCostValue)}</p></div>
        </div>
        <p className="mt-3 flex items-center gap-1 text-sm font-bold text-[#146ef5]">View Movements <ChevronRight size={16} /></p>
      </button>
    </div>
  );
}

function MovementRef({ movement }) {
  const [reference, customer] = movement.ref.split(" / ");
  return (
    <div>
      <p className="font-semibold">{reference}</p>
      {customer ? (
        <p className="text-sm text-slate-500">{customer}</p>
      ) : (
        <p className="text-sm text-slate-500">{movement.type}</p>
      )}
    </div>
  );
}

function InventoryDetail({ row }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-500">
        <span>Inventory</span>
        <ChevronRight size={16} />
        <span>{row.plant}</span>
        <ChevronRight size={16} />
        <span>{shortDate(row.tripDate)}</span>
        <ChevronRight size={16} />
        <span className="text-slate-950">{row.product}</span>
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-bold text-[#146ef5]">{row.plant}</p>
        <h3 className="mt-1 text-xl font-bold text-slate-950">{row.product}</h3>
        <p className="mt-1 text-sm font-semibold text-slate-500">Trip: {shortDate(row.tripDate)} - {row.tripCode}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          ["Stock In", kg(row.originalQty)],
          ["Total OUT", kg(row.totalOut)],
          ["Adjustments", kg(row.adjustments)],
          ["Remaining", kg(row.remainingQty)],
          ["Cost / kg", currency(row.costPerKg)],
          ["Inventory Cost Value", currency(row.inventoryCostValue)],
          ["Original Acquisition Cost", currency(row.originalAcquisitionCost)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-500">{label}</p>
            <p className="mt-1 font-bold text-slate-950">{value}</p>
          </div>
        ))}
      </div>
      <h3 className="font-bold">Movement History</h3>
      {row.history.map((movement) => (
        <div key={movement.id} className="flex items-center justify-between border-b border-slate-100 py-3">
          <MovementRef movement={movement} />
          <p className={`font-bold ${movement.qty < 0 ? "text-rose-600" : "text-emerald-600"}`}>{movement.qty > 0 ? "+" : ""}{kg(movement.qty)}</p>
        </div>
      ))}
    </div>
  );
}

function OutOrders({ customers, trips, movements, setMovements, outs, setOuts, ledgerEntries, setLedgerEntries, setDiscrepancies, addAudit, pushToast }) {
  const defaultCustomerId = "cust-abc";
  const [customerId, setCustomerId] = useState(defaultCustomerId);
  const selectedCustomer = customers.find((customer) => customer.id === customerId) || customers[0];
  const plantOptions = useMemo(() => [...new Set(trips.map((trip) => trip.plant))], [trips]);
  const [groups, setGroups] = useState(() => [
    buildDefaultGroup(selectedCustomer),
  ]);
  const linesWithTrip = groups.flatMap((group) => group.lines.map((line) => ({ ...line, tripId: group.tripId, groupId: group.id })));
  const activeLinesWithTrip = linesWithTrip.filter((line) => Number(line.qty || 0) > 0);
  const hasInsufficient = activeLinesWithTrip.some((line) => Number(line.qty) > getAvailableQty(trips, movements, line.tripId, line.product));
  const hasEmptyOptionalGroup = groups.slice(1).some((group) => group.lines.length === 0 || group.lines.every((line) => Number(line.qty || 0) <= 0));
  const hasEmptyGroup = groups.some((group) => group.lines.length === 0 || group.lines.every((line) => Number(line.qty || 0) <= 0));
  const total = activeLinesWithTrip.reduce((sum, line) => sum + Number(line.qty || 0) * Number(line.price || 0), 0);
  const overrides = activeLinesWithTrip.filter((line) => Number(line.price) !== customerPrice(selectedCustomer, line.product));
  const summaryGroups = groups.map((group) => {
    const trip = trips.find((item) => item.id === group.tripId);
    const activeLines = group.lines.filter((line) => Number(line.qty || 0) > 0);
    return {
      ...group,
      trip,
      lines: activeLines,
      total: activeLines.reduce((sum, line) => sum + Number(line.qty || 0) * Number(line.price || 0), 0),
    };
  }).filter((group) => group.lines.length);

  function getTrip(preferredTripId) {
    return trips.find((trip) => trip.id === preferredTripId) || trips[0];
  }

  function defaultTripId() {
    return getTrip("trip-bty-0815")?.id || trips[0]?.id || "";
  }

  function lineFor(product, qty = 0, customer = selectedCustomer) {
    return { product, qty, price: customerPrice(customer, product) };
  }

  function normalizeLinesForTrip(lines, trip, customer = selectedCustomer) {
    const productNames = trip?.products?.map((product) => product.name) || [];
    const fallbackProduct = productNames.includes(wholeChickenProduct) ? wholeChickenProduct : productNames[0] || wholeChickenProduct;
    const safeLines = lines.length ? lines : [lineFor(fallbackProduct, 0, customer)];
    return safeLines.map((line) => {
      const product = productNames.includes(line.product) ? line.product : fallbackProduct;
      return {
        ...line,
        product,
        price: line.product === product ? line.price : customerPrice(customer, product),
      };
    });
  }

  function buildOrderGroup(preferredTripId = defaultTripId(), lineSpecs = [{ product: wholeChickenProduct, qty: 0 }], customer = selectedCustomer) {
    const trip = getTrip(preferredTripId);
    const lines = lineSpecs.map((line) => lineFor(line.product, line.qty, customer));
    return {
      id: uid("group"),
      tripId: trip?.id || "",
      lines: normalizeLinesForTrip(lines, trip, customer),
    };
  }

  function buildDefaultGroup(customer = selectedCustomer) {
    return buildOrderGroup("trip-bty-0815", [
      { product: "Whole Dressed Chicken", qty: 100 },
      { product: "Liver", qty: 10 },
    ], customer);
  }

  function resetOutForm() {
    const defaultCustomer = customers.find((item) => item.id === defaultCustomerId) || customers[0];
    setCustomerId(defaultCustomerId);
    setGroups([buildDefaultGroup(defaultCustomer)]);
  }

  function handleCustomerChange(nextCustomerId) {
    const nextCustomer = customers.find((customer) => customer.id === nextCustomerId) || customers[0];
    setCustomerId(nextCustomerId);
    setGroups((current) =>
      current.map((group) => ({
        ...group,
        lines: group.lines.map((line) => ({ ...line, price: customerPrice(nextCustomer, line.product) })),
      }))
    );
  }

  function updateGroup(groupId, patch) {
    setGroups((current) => current.map((group) => (group.id === groupId ? { ...group, ...patch } : group)));
  }

  function changeGroupPlant(groupId, plant) {
    const nextTrip = trips.find((trip) => trip.plant === plant);
    if (!nextTrip) return;
    setGroups((current) =>
      current.map((group) =>
        group.id === groupId
          ? { ...group, tripId: nextTrip.id, lines: normalizeLinesForTrip(group.lines, nextTrip) }
          : group
      )
    );
  }

  function changeGroupTrip(groupId, tripId) {
    const nextTrip = getTrip(tripId);
    setGroups((current) =>
      current.map((group) =>
        group.id === groupId
          ? { ...group, tripId: nextTrip?.id || "", lines: normalizeLinesForTrip(group.lines, nextTrip) }
          : group
      )
    );
  }

  function updateLine(groupId, index, patch) {
    setGroups((current) =>
      current.map((group) =>
        group.id === groupId
          ? { ...group, lines: group.lines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)) }
          : group
      )
    );
  }

  function addAnotherGroup() {
    setGroups((current) => {
      const hasOpenEmptyGroup = current.slice(1).some((group) => group.lines.length === 0 || group.lines.every((line) => Number(line.qty || 0) <= 0));
      if (hasOpenEmptyGroup) return current;
      const usedTripIds = new Set(current.map((group) => group.tripId));
      const preferredIds = ["trip-mag-0818", "trip-bty-0824", "trip-mag-0827", "trip-bty-0830"];
      const nextTrip =
        preferredIds.map((tripId) => trips.find((trip) => trip.id === tripId)).find((trip) => trip && !usedTripIds.has(trip.id)) ||
        trips.find((trip) => !usedTripIds.has(trip.id)) ||
        trips[0];
      const nextIndex = current.length;
      const lineSpecs = nextIndex === 1
        ? [
            { product: "Whole Dressed Chicken", qty: 50 },
            { product: "Feet", qty: 10 },
          ]
        : [{ product: "Whole Dressed Chicken", qty: 0 }];
      return [...current, buildOrderGroup(nextTrip?.id, lineSpecs)];
    });
  }

  function removeGroup(groupId) {
    setGroups((current) => current.filter((group, index) => index === 0 || group.id !== groupId));
  }

  function confirmOut() {
    const ref = `OUT-${1080 + outs.length + 1}`;
    const outGroups = groups.map((group) => {
      const trip = trips.find((item) => item.id === group.tripId);
      if (!trip) return null;
      return {
        tripId: group.tripId,
        plant: trip.plant,
        tripDate: trip.date,
        lines: group.lines
          .filter((line) => Number(line.qty || 0) > 0)
          .map((line) => ({ ...line, subtotal: Number(line.qty || 0) * Number(line.price || 0) })),
      };
    }).filter((group) => group?.lines.length);
    const out = { id: `out-${Date.now()}`, ref, date: today, customerId, agentId: selectedCustomer.agentId, total, groups: outGroups };
    setOuts((items) => [out, ...items]);
    setMovements((items) => [
      ...items,
      ...outGroups.flatMap((group) =>
        group.lines.map((line, index) => ({
          id: `mov-${Date.now()}-${group.tripId}-${index}`,
          tripId: group.tripId,
          product: line.product,
          qty: -Number(line.qty || 0),
          type: "OUT",
          ref: `${ref} / ${selectedCustomer.name}`,
          actor: getAgentName(agents, selectedCustomer.agentId),
          at: new Date().toISOString(),
        }))
      ),
    ]);
    setLedgerEntries((items) => [
      ...items,
      { id: `led-${Date.now()}`, customerId, date: today, ref, description: "Chicken Order", charge: total, payment: 0, type: "OUT", outId: out.id },
    ]);
    overrides.forEach((line) => {
      const acquisitionCost = getAcquisitionCost(trips, line.tripId, line.product);
      const qty = Number(line.qty || 0);
      const normalPrice = customerPrice(selectedCustomer, line.product);
      const expectedGrossProfit = qty * normalPrice - qty * acquisitionCost;
      const actualGrossProfit = qty * Number(line.price || 0) - qty * acquisitionCost;
      setDiscrepancies((items) => [
        {
          id: `disc-price-${Date.now()}-${line.product}`,
          type: "Price",
          title: "Manual Price Override",
          status: "Open",
          customerId,
          product: line.product,
          normalPrice,
          agentPrice: Number(line.price),
          acquisitionCost,
          qty,
          expectedGrossProfit,
          actualGrossProfit,
          profitImpact: actualGrossProfit - expectedGrossProfit,
          difference: Number(line.price) - normalPrice,
        },
        ...items,
      ]);
      addAudit(`Changed ${line.product} price ${currency(normalPrice)} -> ${currency(line.price)}`, getAgentName(agents, selectedCustomer.agentId));
    });
    addAudit(`Created ${ref}`, getAgentName(agents, selectedCustomer.agentId));
    pushToast(`${ref} created successfully`);
  }
  return (
    <>
      <SectionHeader
        title="OUT / Orders"
        eyebrow="Single plant/trip by default. Add another origin only when the customer orders it."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={resetOutForm}><Plus size={18} />New OUT</Button>
            <Button disabled={hasInsufficient || hasEmptyGroup || total <= 0} onClick={confirmOut}><ClipboardCheck size={18} />Confirm OUT</Button>
          </div>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 font-bold">Step 1 - Select Customer</h2>
          <select className={inputClass()} value={customerId} onChange={(e) => handleCustomerChange(e.target.value)}>
            {customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}
          </select>
          <div className="mt-4 space-y-3 rounded-lg bg-slate-50 p-3">
            <p className="font-bold">{selectedCustomer.name}</p>
            <Info label="Customer Type" value={selectedCustomer.type} />
            <Info label="Outstanding Balance" value={currency(customerBalance(ledgerEntries, customerId))} />
            <Info label="Credit Status" value={selectedCustomer.creditStatus} />
            <Info label="Price for Whole Chicken" value={currency(customerPrice(selectedCustomer, "Whole Dressed Chicken")) + "/kg"} />
          </div>
          <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
            Customer-specific pricing loads automatically. Any edited price is visibly flagged and added to the audit log.
          </div>
        </div>
        <div className="space-y-4">
          {groups.map((group, groupIndex) => {
            const trip = trips.find((item) => item.id === group.tripId);
            const tripOptions = trips.filter((tripOption) => tripOption.plant === trip?.plant);
            return (
              <div key={group.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-bold">{groups.length === 1 ? "Step 2-4 - Plant / Trip / Products" : `Plant / Trip ${groupIndex + 1}`}</h2>
                    {groupIndex === 0 && <p className="text-sm text-slate-500">Complete this first origin, then confirm the OUT or add another origin.</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="blue">{trip?.plant} - {trip ? shortDate(trip.date) : ""}</Badge>
                    {groupIndex > 0 && (
                      <Button variant="ghost" className="min-h-9 px-2 text-rose-600 hover:bg-rose-50" onClick={() => removeGroup(group.id)}>
                        <X size={16} />Remove Group
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label={groupIndex === 0 ? "Step 2 - Select Plant" : "Select Plant"}>
                    <select className={inputClass()} value={trip?.plant || ""} onChange={(e) => changeGroupPlant(group.id, e.target.value)}>
                      {plantOptions.map((plant) => <option key={plant} value={plant}>{plant}</option>)}
                    </select>
                  </Field>
                  <Field label={groupIndex === 0 ? "Step 3 - Select Trip" : "Select Trip"}>
                    <select className={inputClass()} value={group.tripId} onChange={(e) => changeGroupTrip(group.id, e.target.value)}>
                      {tripOptions.map((tripOption) => <option key={tripOption.id} value={tripOption.id}>{shortDate(tripOption.date)} - {tripOption.code}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-700">{groupIndex === 0 ? "Step 4 - Add Products" : "Products"}</h3>
                  <span className="text-xs font-semibold text-slate-500">Stock deducts from {trip?.plant} / {trip ? shortDate(trip.date) : "selected trip"}</span>
                </div>
                <div className="mt-2 space-y-2">
                  {group.lines.map((line, index) => {
                    const available = getAvailableQty(trips, movements, group.tripId, line.product);
                    const defaultPrice = customerPrice(selectedCustomer, line.product);
                    const changed = Number(line.price) !== defaultPrice;
                    const insufficient = Number(line.qty) > available;
                    return (
                      <div key={`${group.id}-${index}`} className={`rounded-lg border p-3 ${insufficient ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-slate-50"}`}>
                        <div className="grid gap-2 md:grid-cols-[1fr_120px_120px_44px]">
                          <select className={inputClass()} value={line.product} onChange={(e) => updateLine(group.id, index, { product: e.target.value, price: customerPrice(selectedCustomer, e.target.value) })}>
                            {(trip?.products || []).map((productOption) => <option key={productOption.name}>{productOption.name}</option>)}
                          </select>
                          <input className={inputClass()} type="number" min="0" value={line.qty} onChange={(e) => updateLine(group.id, index, { qty: e.target.value })} />
                          <input className={inputClass()} type="number" min="0" value={line.price} onChange={(e) => updateLine(group.id, index, { price: e.target.value })} />
                          <Button variant="ghost" className="px-0" disabled={group.lines.length === 1} onClick={() => updateGroup(group.id, { lines: group.lines.filter((_, lineIndex) => lineIndex !== index) })} aria-label="Remove line"><X size={18} /></Button>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
                          <Badge tone={insufficient ? "red" : "green"}>Available from this trip: {kg(available)}</Badge>
                          <Badge>Default Customer Price: {currency(defaultPrice)}/kg</Badge>
                          {changed && <Badge tone="amber">Price manually changed: {currency(line.price)}/kg, difference {currency(Number(line.price) - defaultPrice)}/kg</Badge>}
                          {insufficient && <span className="text-rose-700">Insufficient stock. Requested {kg(line.qty)}, available {kg(available)}.</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Button variant="secondary" className="mt-3" onClick={() => updateGroup(group.id, { lines: [...group.lines, { product: trip?.products?.[0]?.name || "Whole Dressed Chicken", qty: 0, price: customerPrice(selectedCustomer, trip?.products?.[0]?.name || "Whole Dressed Chicken") }] })}>
                  <Plus size={18} /> Add Product
                </Button>
              </div>
            );
          })}
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-3">
            <Button variant="ghost" className="w-full justify-start text-slate-600" disabled={hasEmptyOptionalGroup} onClick={addAnotherGroup}>
              <Plus size={18} /> Add Another Plant / Trip
            </Button>
            {hasEmptyOptionalGroup && <p className="px-4 pb-2 text-xs font-semibold text-slate-500">Fill or remove the empty optional plant/trip before adding another.</p>}
          </div>
          <div className="sticky bottom-24 rounded-lg border border-slate-200 bg-white p-4 shadow-lg md:bottom-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-500">Order Summary</p>
                <p className="mt-1 font-bold text-slate-950">{selectedCustomer.name}</p>
                <div className="mt-2 space-y-2 text-sm text-slate-700">
                  {summaryGroups.length === 0 && <p>No products added yet.</p>}
                  {summaryGroups.map((group) => (
                    <div key={`summary-${group.id}`} className={summaryGroups.length > 1 ? "border-t border-slate-100 pt-2" : ""}>
                      <p className="font-bold text-slate-950">{group.trip?.plant} - {group.trip ? shortDate(group.trip.date) : ""}</p>
                      <div className="mt-1 space-y-1">
                        {group.lines.map((line, index) => (
                          <div key={`${group.id}-summary-${line.product}-${index}`} className="flex flex-wrap justify-between gap-2">
                            <span>{line.product} - {kg(line.qty)}</span>
                            <span className="font-semibold">{currency(Number(line.qty || 0) * Number(line.price || 0))}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="lg:min-w-[180px]">
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-500">OUT Total</p>
                  <p className="text-2xl font-bold text-slate-950">{currency(total)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Customers({ customers, ledgerEntries, outs, collections, onSelect }) {
  const [selectedId, setSelectedId] = useState("cust-abc");
  const selected = customers.find((customer) => customer.id === selectedId);
  const ledger = ledgerWithRunningBalance(ledgerEntries, selectedId);
  const totalPurchases = ledger.reduce((sum, entry) => sum + entry.charge, 0);
  const totalPayments = ledger.reduce((sum, entry) => sum + entry.payment, 0);
  return (
    <>
      <SectionHeader title="Customers" eyebrow="Customer Ledger" />
      <div className="grid gap-5 xl:grid-cols-[330px_1fr]">
        <div className="space-y-2">
          {customers.map((customer) => (
            <button key={customer.id} className={`w-full rounded-lg border p-3 text-left ${selectedId === customer.id ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`} onClick={() => setSelectedId(customer.id)}>
              <p className="font-bold">{customer.name}</p>
              <p className="text-sm text-slate-500">{customer.type} - {getAgentName(agents, customer.agentId)}</p>
              <p className="mt-2 text-sm font-semibold">Balance: {currency(customerBalance(ledgerEntries, customer.id))}</p>
            </button>
          ))}
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">{selected.name}</h2>
              <p className="text-sm text-slate-500">{selected.type} - Assigned Agent: {getAgentName(agents, selected.agentId)}</p>
            </div>
            <Badge tone={selected.creditStatus === "Good" ? "green" : "amber"}>{selected.creditStatus}</Badge>
          </div>
          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <StatMini label="Credit Limit" value={currency(selected.creditLimit)} />
            <StatMini label="Outstanding Balance" value={currency(customerBalance(ledgerEntries, selected.id))} />
            <StatMini label="Total Purchases" value={currency(totalPurchases)} />
            <StatMini label="Total Payments" value={currency(totalPayments)} />
          </div>
          <ResponsiveTable
            columns={["Date", "Reference", "Description", "Charge", "Payment", "Balance"]}
            rows={ledger.map((entry) => [
              shortDate(entry.date).replace(", 2026", ""),
              <button className="font-bold text-[#146ef5]" onClick={() => entry.type === "OUT" ? onSelect({ type: "out", out: outs.find((out) => out.ref === entry.ref) }) : onSelect({ type: "payment", payment: { ...entry, collection: collections.find((collection) => collection.ref === entry.ref) } })}>{entry.ref}</button>,
              entry.description,
              entry.charge ? currency(entry.charge) : "-",
              entry.payment ? currency(entry.payment) : "-",
              currency(entry.balance),
            ])}
          />
        </div>
      </div>
    </>
  );
}

function Collections({ customers, ledgerEntries, setLedgerEntries, collections, setCollections, expenses, setExpenses, setDiscrepancies, addAudit, pushToast, registerPostDcrChange }) {
  const [collection, setCollection] = useState({ agentId: "agent-pedro", customerId: "cust-abc", amount: 30000, method: "Cash", date: today, reference: "", bank: "BDO", manual: false, allocations: [] });
  const [expense, setExpense] = useState({ agentId: "agent-pedro", date: today, category: "Fuel", amount: 2500, source: "Cash Collection", description: "Flow D fuel expense" });
  const autoAllocations = allocateOldestFirst(ledgerEntries, collection.customerId, collection.amount);
  const allocations = collection.manual ? collection.allocations.filter((item) => Number(item.amount) > 0) : autoAllocations;
  const allocationTotal = allocations.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const collectionInvalid =
    Number(collection.amount || 0) <= 0 ||
    (collection.method === "GCash" && !collection.reference) ||
    (collection.method === "Bank Deposit" && (!collection.reference || !collection.bank)) ||
    allocationTotal > Number(collection.amount || 0);

  function recordCollection() {
    const ref = `PAY-${3000 + collections.length + 1}`;
    const destination = collection.method === "Cash" ? "Cash held by agent until remittance" : collection.method === "GCash" ? "Owner GCash" : "Owner Bank Account";
    const newCollection = { ...collection, id: `col-${Date.now()}`, ref, amount: Number(collection.amount), destination, allocations };
    setCollections((items) => [newCollection, ...items]);
    setLedgerEntries((items) => [
      ...items,
      { id: `led-${Date.now()}`, customerId: collection.customerId, date: collection.date, ref, description: `${collection.method} Payment`, charge: 0, payment: Number(collection.amount), type: "Payment", allocations, agentId: collection.agentId, method: collection.method },
    ]);
    if (collection.method === "Bank Deposit") {
      setDiscrepancies((items) => [
        {
          id: `disc-bank-${Date.now()}`,
          type: "Payment Verification",
          title: "Bank Verification",
          status: "Open",
          customerId: collection.customerId,
          agentId: collection.agentId,
          amount: Number(collection.amount),
          details: `${ref} awaiting verification for ${getCustomerName(customers, collection.customerId)}`,
        },
        ...items,
      ]);
      addAudit(`Bank payment ${ref} awaiting verification for ${getCustomerName(customers, collection.customerId)}`);
    }
    addAudit(`Recorded ${currency(collection.amount)} ${collection.method.toLowerCase()} collection`, getAgentName(agents, collection.agentId));
    registerPostDcrChange(collection.agentId, collection.date, `${ref} collection was added after lock`);
    pushToast(`${ref} recorded and allocated`);
  }

  function recordExpense() {
    const item = { ...expense, id: `exp-${Date.now()}`, amount: Number(expense.amount) };
    setExpenses((items) => [item, ...items]);
    addAudit(`Recorded ${currency(item.amount)} ${item.category.toLowerCase()} expense`, getAgentName(agents, item.agentId));
    registerPostDcrChange(item.agentId, item.date, `${item.category} expense was added after lock`);
    pushToast(`${item.category} expense recorded`);
  }

  return (
    <>
      <SectionHeader title="Collections" eyebrow="Payments apply to Customer Ledger, not plant/trip" />
      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-4 font-bold">+ Record Collection</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Agent"><select className={inputClass()} value={collection.agentId} onChange={(e) => setCollection({ ...collection, agentId: e.target.value })}>{agents.map((agent) => <option value={agent.id} key={agent.id}>{agent.name}</option>)}</select></Field>
            <Field label="Customer"><select className={inputClass()} value={collection.customerId} onChange={(e) => setCollection({ ...collection, customerId: e.target.value, allocations: [] })}>{customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}</select></Field>
            <Field label="Amount"><input className={inputClass()} type="number" value={collection.amount} onChange={(e) => setCollection({ ...collection, amount: e.target.value })} /></Field>
            <Field label="Payment Method"><select className={inputClass()} value={collection.method} onChange={(e) => setCollection({ ...collection, method: e.target.value })}>{paymentMethods.map((method) => <option key={method}>{method}</option>)}</select></Field>
            <Field label="Date"><input className={inputClass()} type="date" value={collection.date} onChange={(e) => setCollection({ ...collection, date: e.target.value })} /></Field>
            {collection.method === "GCash" && <Field label="GCash Reference Number"><input className={inputClass()} value={collection.reference} onChange={(e) => setCollection({ ...collection, reference: e.target.value })} /></Field>}
            {collection.method === "Bank Deposit" && <Field label="Bank"><input className={inputClass()} value={collection.bank} onChange={(e) => setCollection({ ...collection, bank: e.target.value })} /></Field>}
            {collection.method === "Bank Deposit" && <Field label="Reference / Deposit Reference"><input className={inputClass()} value={collection.reference} onChange={(e) => setCollection({ ...collection, reference: e.target.value })} /></Field>}
          </div>
          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-700">Destination: {collection.method === "Cash" ? "Cash held by agent until remittance" : collection.method === "GCash" ? "Owner GCash" : "Owner Bank Account"}</div>
          {collection.method === "Bank Deposit" && <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm font-semibold text-slate-500">Proof of Deposit placeholder</div>}
          <div className="mt-4 flex items-center gap-3">
            <input id="manual" type="checkbox" checked={collection.manual} onChange={(e) => setCollection({ ...collection, manual: e.target.checked })} />
            <label htmlFor="manual" className="text-sm font-semibold">Allocate Manually</label>
          </div>
          <AllocationPreview collection={collection} ledgerEntries={ledgerEntries} allocations={allocations} setCollection={setCollection} />
          {allocationTotal > Number(collection.amount || 0) && <p className="mt-3 text-sm font-bold text-rose-700">Manual allocation cannot exceed the payment amount.</p>}
          <Button className="mt-4 w-full" disabled={collectionInvalid} onClick={recordCollection}><Banknote size={18} />Record Collection</Button>
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-4 font-bold">+ Record Expense</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Agent"><select className={inputClass()} value={expense.agentId} onChange={(e) => setExpense({ ...expense, agentId: e.target.value })}>{agents.map((agent) => <option value={agent.id} key={agent.id}>{agent.name}</option>)}</select></Field>
              <Field label="Category"><select className={inputClass()} value={expense.category} onChange={(e) => setExpense({ ...expense, category: e.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></Field>
              <Field label="Amount"><input className={inputClass()} type="number" value={expense.amount} onChange={(e) => setExpense({ ...expense, amount: e.target.value })} /></Field>
              <Field label="Payment Source"><select className={inputClass()} value={expense.source} onChange={(e) => setExpense({ ...expense, source: e.target.value })}>{["Cash Collection", "Personal Cash", "Other"].map((source) => <option key={source}>{source}</option>)}</select></Field>
            </div>
            <Field label="Description"><textarea className={`${inputClass()} min-h-20 py-3`} value={expense.description} onChange={(e) => setExpense({ ...expense, description: e.target.value })} /></Field>
            <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm font-semibold text-slate-500">Receipt placeholder</div>
            {expense.source === "Cash Collection" && <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900">This reduces expected physical cash remittance in the DCR.</div>}
            <Button className="mt-4 w-full" onClick={recordExpense}><ReceiptText size={18} />Record Expense</Button>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 font-bold">Recent Collections</h2>
            {collections.slice(0, 6).map((item) => (
              <div key={item.id} className="flex items-center justify-between border-b border-slate-100 py-3 last:border-0">
                <div><p className="font-semibold">{getCustomerName(customers, item.customerId)}</p><p className="text-sm text-slate-500">{item.method} - {item.ref}</p></div>
                <p className="font-bold">{currency(item.amount)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function AllocationPreview({ collection, ledgerEntries, allocations, setCollection }) {
  const invoices = useMemo(() => ledgerEntries.filter((entry) => entry.customerId === collection.customerId && entry.charge > 0), [ledgerEntries, collection.customerId]);
  return (
    <div className="mt-4 rounded-lg border border-slate-200 p-3">
      <p className="mb-2 font-bold">Payment Allocation</p>
      {!collection.manual && <p className="mb-2 text-sm text-slate-500">Automatically applies to oldest unpaid OUT/invoice first.</p>}
      {collection.manual ? (
        <div className="space-y-2">
          {invoices.map((invoice) => {
            const current = collection.allocations.find((item) => item.invoiceRef === invoice.ref)?.amount || "";
            return (
              <div key={invoice.ref} className="grid grid-cols-[1fr_130px] gap-2">
                <span className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold">{invoice.ref} - {currency(invoice.charge)}</span>
                <input className={inputClass()} type="number" value={current} onChange={(e) => {
                  const next = collection.allocations.filter((item) => item.invoiceRef !== invoice.ref);
                  setCollection({ ...collection, allocations: [...next, { invoiceRef: invoice.ref, amount: Number(e.target.value || 0) }] });
                }} />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {allocations.map((allocation) => <div key={allocation.invoiceRef} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{allocation.invoiceRef}</span><strong>{currency(allocation.amount)} applied</strong></div>)}
          {!allocations.length && <p className="text-sm text-slate-500">No open invoices found for this customer in demo data.</p>}
        </div>
      )}
      <p className="mt-2 text-sm font-semibold text-slate-700">Remaining Balance after payment: {currency(Math.max(0, customerBalance(ledgerEntries, collection.customerId) - Number(collection.amount || 0)))}</p>
    </div>
  );
}

function Dcr({ customers, collections, expenses, dcrs, setDcrs, setDiscrepancies, addAudit, pushToast, postDcrAlert }) {
  const [agentId, setAgentId] = useState("agent-pedro");
  const [date, setDate] = useState(today);
  const [actual, setActual] = useState(36500);
  const [explanation, setExplanation] = useState("Cash shortage found during remittance count.");
  const dcr = buildDcr({ collections, expenses, customers, agentId, date });
  const diff = Number(actual || 0) - dcr.expectedCashRemittance;
  const locked = dcrs.find((item) => item.agentId === agentId && item.date === date && item.status === "LOCKED");
  function submitDcr() {
    const saved = { id: `dcr-${Date.now()}`, agentId, date, actual: Number(actual), diff, status: "LOCKED", explanation };
    setDcrs((items) => [saved, ...items.filter((item) => !(item.agentId === agentId && item.date === date))]);
    if (diff !== 0) {
      setDiscrepancies((items) => [
        { id: `disc-cash-${Date.now()}`, type: "Cash", title: diff < 0 ? "Cash Shortage" : "Cash Over", status: "Open", agentId, expected: dcr.expectedCashRemittance, actual: Number(actual), difference: diff, details: explanation },
        ...items,
      ]);
    }
    addAudit("Submitted DCR", getAgentName(agents, agentId));
    pushToast("DCR submitted and locked");
  }
  return (
    <>
      <SectionHeader title="Daily Cash Reports" eyebrow="System-generated from agent transactions" action={<Button disabled={Boolean(locked) || (diff !== 0 && !explanation)} onClick={submitDcr}><FileClock size={18} />Submit DCR</Button>} />
      <div className="grid gap-5 xl:grid-cols-[330px_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="grid gap-3">
            <Field label="Agent"><select className={inputClass()} value={agentId} onChange={(e) => setAgentId(e.target.value)}>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></Field>
            <Field label="Date"><input className={inputClass()} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Button variant="secondary" onClick={() => setActual(Math.max(0, dcr.expectedCashRemittance - 1000))}><FileText size={18} />Generate DCR</Button>
          </div>
          {locked && <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-800">DCR submitted and locked</div>}
          {postDcrAlert && <div className="mt-4 rounded-lg bg-rose-50 p-3 text-sm font-bold text-rose-800">{postDcrAlert}</div>}
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-bold">Daily Cash Report</h2>
              <p className="text-sm text-slate-500">Agent: {getAgentName(agents, agentId)} - Date: {shortDate(date)}</p>
            </div>
            <Badge tone={locked ? "green" : "blue"}>{locked ? "LOCKED" : "Draft"}</Badge>
          </div>
          <h3 className="mb-2 font-bold">Collections</h3>
          <ResponsiveTable
            columns={["Customer", "Cash", "GCash", "Bank", "Total"]}
            rows={dcr.rows.map((row) => [row.customer, currency(row.Cash), currency(row.GCash), currency(row["Bank Deposit"]), currency(row.total)])}
            footer={["Totals", currency(dcr.totals.Cash), currency(dcr.totals.GCash), currency(dcr.totals["Bank Deposit"]), currency(dcr.totals.total)]}
          />
          <h3 className="mb-2 mt-5 font-bold">Expenses</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            {Object.entries(dcr.expenseTotals.byCategory).map(([category, amount]) => <StatMini key={category} label={category} value={currency(amount)} />)}
            <StatMini label="Total Expenses" value={currency(dcr.expenseTotals.total)} />
          </div>
          <h3 className="mb-2 mt-5 font-bold">Reconciliation</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <StatMini label="Cash Collected" value={currency(dcr.totals.Cash)} />
            <StatMini label="Less Cash-paid Expenses" value={currency(dcr.expenseTotals.cashPaid)} />
            <StatMini label="Expected Cash Remittance" value={currency(dcr.expectedCashRemittance)} />
            <Field label="Actual Cash Remitted"><input disabled={Boolean(locked)} className={inputClass()} type="number" value={actual} onChange={(e) => setActual(e.target.value)} /></Field>
          </div>
          <div className={`mt-4 rounded-lg p-4 text-center text-lg font-bold ${diff === 0 ? "bg-emerald-50 text-emerald-700" : diff < 0 ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>
            {diff === 0 ? "Balanced ✓" : diff < 0 ? `SHORT ${currency(Math.abs(diff))}` : `OVER ${currency(diff)}`}
          </div>
          {diff !== 0 && <Field label="Explanation required"><textarea disabled={Boolean(locked)} className={`${inputClass()} mt-3 min-h-20 py-3`} value={explanation} onChange={(e) => setExplanation(e.target.value)} /></Field>}
        </div>
      </div>
    </>
  );
}

function Discrepancies({ discrepancies, setDiscrepancies, customers }) {
  const counts = ["Open", "Resolved", "Cash", "Inventory", "Payment Verification"].map((key) => ({
    key,
    count: key === "Open" || key === "Resolved" ? discrepancies.filter((item) => item.status === key).length : discrepancies.filter((item) => item.type === key).length,
  }));
  function mark(id, status) {
    setDiscrepancies((items) => items.map((item) => (item.id === id ? { ...item, status } : item)));
  }
  return (
    <>
      <SectionHeader title="Discrepancies" eyebrow="Owner review queue" />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{counts.map((item) => <StatCard key={item.key} label={item.key} value={item.count} icon={AlertTriangle} tone={item.key === "Open" ? "red" : item.key === "Resolved" ? "green" : "amber"} />)}</div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {discrepancies.map((item) => (
          <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div><p className="font-bold">{item.title}</p><p className="text-sm text-slate-500">{item.type}</p></div>
              <Badge tone={item.status === "Resolved" ? "green" : item.status === "Reviewed" ? "blue" : "red"}>{item.status}</Badge>
            </div>
            <div className="space-y-2 text-sm">
              {item.agentId && <Info label="Agent" value={getAgentName(agents, item.agentId)} />}
              {item.customerId && <Info label="Customer" value={getCustomerName(customers, item.customerId)} />}
              {item.plant && <Info label="Plant" value={item.plant} />}
              {item.tripDate && <Info label="Trip" value={shortDate(item.tripDate)} />}
              {item.product && <Info label="Product" value={item.product} />}
              {item.expected !== undefined && <Info label="Expected" value={item.type === "Inventory" ? kg(item.expected) : currency(item.expected)} />}
              {item.actual !== undefined && <Info label="Actual" value={item.type === "Inventory" ? kg(item.actual) : currency(item.actual)} />}
              {item.amount && <Info label="Amount" value={currency(item.amount)} />}
              {item.normalPrice && <Info label="Normal Price" value={`${currency(item.normalPrice)}/kg`} />}
              {item.agentPrice && <Info label="Agent Price" value={`${currency(item.agentPrice)}/kg`} />}
              {item.acquisitionCost !== undefined && <Info label="Acquisition Cost" value={`${currency(item.acquisitionCost)}/kg`} />}
              {item.expectedGrossProfit !== undefined && <Info label="Expected Gross Profit" value={currency(item.expectedGrossProfit)} />}
              {item.actualGrossProfit !== undefined && <Info label="Actual Gross Profit" value={currency(item.actualGrossProfit)} />}
              {item.profitImpact !== undefined && <Info label="Profit Impact of Price Override" value={currency(item.profitImpact)} />}
              {item.difference !== undefined && <Info label="Difference" value={item.type === "Inventory" ? kg(item.difference) : item.type === "Price" ? `${currency(item.difference)}/kg` : currency(item.difference)} />}
              {item.details && <p className="rounded-lg bg-slate-50 p-2 font-semibold text-slate-700">{item.details}</p>}
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => mark(item.id, "Reviewed")}>Reviewed</Button>
              <Button className="flex-1" onClick={() => mark(item.id, "Resolved")}>Resolved</Button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Reports({ customers, inventoryRows, trips, outs, ledgerEntries, collections, expenses, discrepancies }) {
  const [report, setReport] = useState("Weekly Business Report");
  const [periodKey, setPeriodKey] = useState("thisWeek");
  const activePeriodKey = periodKey === "custom" ? "thisWeek" : periodKey;
  const period = weeklyBusinessData[activePeriodKey];
  const reportNames = [
    "Weekly Business Report",
    "Trip Inventory Report",
    "Plant Sales Report",
    "Customer Ledger Report",
    "Agent Collection Report",
    "Daily Cash Report",
    "Cash Discrepancy Report",
    "Inventory Discrepancy Report",
    "Payment Verification Report",
  ];
  const reportFinancials = weeklyFinancialSummary(period, outs, trips, expenses);
  const reportPlantProfit = aggregateProfit(reportFinancials.lines, (line) => line.plant || "Unassigned");
  const rows = {
    "Trip Inventory Report": inventoryRows.slice(0, 8).map((row) => [row.plant, shortDate(row.tripDate), row.product, `${kg(row.remainingQty)} / ${currency(row.costPerKg)}/kg`, currency(row.inventoryCostValue)]),
    "Plant Sales Report": reportPlantProfit.map((plant) => [plant.key, currency(plant.netSales), currency(plant.cogs), currency(plant.grossProfit), marginLabel(plant.netSales, plant.grossProfit)]),
    "Customer Ledger Report": customers.map((customer) => [customer.name, customer.type, currency(customerBalance(ledgerEntries, customer.id)), getAgentName(agents, customer.agentId)]),
    "Agent Collection Report": collections.slice(0, 6).map((item) => [getAgentName(agents, item.agentId), getCustomerName(customers, item.customerId), item.method, currency(item.amount)]),
    "Daily Cash Report": [["Pedro Reyes", "Aug 30, 2026", "Submitted", "Cash shortage reviewed"], ["Maria Santos", "Aug 30, 2026", "Not submitted", "Attention required"], ["Juan Cruz", "Aug 30, 2026", "Submitted", "Balanced"]],
    "Cash Discrepancy Report": discrepancies.filter((item) => item.type === "Cash").map((item) => [item.title, getAgentName(agents, item.agentId), currency(item.difference), item.status]),
    "Inventory Discrepancy Report": discrepancies.filter((item) => item.type === "Inventory").map((item) => [item.plant, shortDate(item.tripDate), item.product, kg(item.difference)]),
    "Payment Verification Report": discrepancies.filter((item) => item.type === "Payment Verification").map((item) => [getCustomerName(customers, item.customerId), getAgentName(agents, item.agentId), currency(item.amount), item.status]),
  };
  const tableRows = rows[report] || [["Demo", "Report", "For presentation", "Ready"]];

  return (
    <>
      <SectionHeader
        title="Reports"
        eyebrow="Weekly Business Report is whole business + week. DCR remains agent + day."
        action={<PeriodControls periodKey={periodKey} setPeriodKey={setPeriodKey} />}
      />
      {periodKey === "custom" && (
        <div className="mb-4 grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-2">
          <input className={inputClass()} type="date" defaultValue={period.start} aria-label="Custom report start date" />
          <input className={inputClass()} type="date" defaultValue={period.end} aria-label="Custom report end date" />
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {reportNames.map((name) => (
          <button
            key={name}
            className={`rounded-lg border p-4 text-left ${report === name ? "border-blue-300 bg-blue-50" : name === "Weekly Business Report" ? "border-blue-200 bg-white hover:bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
            onClick={() => setReport(name)}
          >
            <FileText className="mb-3 text-[#146ef5]" size={22} />
            <p className="font-bold">{name}</p>
            <p className="mt-1 text-sm text-slate-500">{name === "Weekly Business Report" ? "Whole business performance" : "Tap to view demo table"}</p>
          </button>
        ))}
      </div>
      <div className="mt-5">
        {report === "Weekly Business Report" ? (
          <WeeklyBusinessReport period={period} trips={trips} outs={outs} expenses={expenses} inventoryRows={inventoryRows} customers={customers} discrepancies={discrepancies} />
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 font-bold">{report}</h2>
            <ResponsiveTable columns={report === "Trip Inventory Report" ? ["Plant", "Trip", "Product", "Remaining / Cost", "Cost Value"] : report === "Plant Sales Report" ? ["Plant", "Net Sales", "COGS", "Gross Profit", "Margin"] : ["Column A", "Column B", "Column C", "Column D"]} rows={tableRows.length ? tableRows : [["No matching records", "-", "-", "-"]]} />
          </div>
        )}
      </div>
    </>
  );
}

function WeeklyBusinessReport({ period, trips, outs, expenses, inventoryRows, customers, discrepancies }) {
  const totals = weeklyTotals(period);
  const financials = weeklyFinancialSummary(period, outs, trips, expenses);
  const previousFinancials = weeklyFinancialSummary(previousWeekPeriod(period), outs, trips, expenses);
  const plantProfit = aggregateProfit(financials.lines, (line) => line.plant || "Unassigned");
  const productProfit = aggregateProfit(financials.lines, (line) => line.product);
  const customerProfit = aggregateProfit(financials.lines, (line) => line.customerId);
  const tripProfit = aggregateProfit(financials.lines, (line) => line.tripId).map((tripRow) => {
    const trip = trips.find((item) => item.id === tripRow.key);
    const inventoryForTrip = inventoryRows.filter((row) => row.tripId === tripRow.key);
    return {
      ...tripRow,
      trip,
      originalAcquisitionCost: tripAcquisitionCost(trip),
      remainingKg: inventoryForTrip.reduce((sum, row) => sum + Number(row.remainingQty || 0), 0),
      remainingInventoryCostValue: inventoryForTrip.reduce((sum, row) => sum + Number(row.inventoryCostValue || 0), 0),
    };
  });
  const tripStats = weeklyTripStats(trips, period, inventoryRows);
  const previousTripStats = weeklyTripStats(trips, previousWeekPeriod(period), inventoryRows);
  const cash = period.agents.reduce((sum, agent) => sum + agent.cash, 0);
  const gcash = period.agents.reduce((sum, agent) => sum + agent.gcash, 0);
  const bank = period.agents.reduce((sum, agent) => sum + agent.bank, 0);
  const remainingForPlant = (plantName) =>
    plantName === "Other"
      ? "Demo plant group"
      : kg(inventoryRows.filter((row) => row.plant === plantName).reduce((sum, row) => sum + row.remainingQty, 0));

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-950">Weekly Business Report</h2>
            <p className="text-sm font-semibold text-slate-500">Period: {periodRangeLabel(period)}</p>
          </div>
          <Badge tone="blue">{period.label}</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatMini label="Gross Sales" value={currency(financials.grossSales)} />
          <StatMini label="COGS" value={currency(financials.cogs)} />
          <StatMini label="Gross Profit" value={currency(financials.grossProfit)} />
          <StatMini label="Gross Margin" value={`${financials.grossMargin.toFixed(2)}%`} />
          <StatMini label="Operating Profit Estimate" value={currency(financials.operatingProfitEstimate)} />
        </div>
      </section>

      <ReportSection title="Financial Performance">
        <ResponsiveTable
          columns={["Metric", "This Week", "Previous Week", "Notes"]}
          rows={[
            ["Gross Sales", currency(financials.grossSales), currency(previousFinancials.grossSales), "Selling value from OUT transactions"],
            ["Sales Deductions", currency(financials.salesDeductions), currency(previousFinancials.salesDeductions), "No returns or credits in demo data"],
            ["Net Sales", currency(financials.netSales), currency(previousFinancials.netSales), "Gross Sales minus deductions"],
            ["COGS", currency(financials.cogs), currency(previousFinancials.cogs), "Qty OUT × exact trip/product acquisition cost"],
            ["Gross Profit", currency(financials.grossProfit), currency(previousFinancials.grossProfit), "Net Sales minus COGS"],
            ["Gross Margin", `${financials.grossMargin.toFixed(2)}%`, `${previousFinancials.grossMargin.toFixed(2)}%`, "Gross Profit ÷ Net Sales"],
            ["Recorded Operating Expenses", currency(financials.recordedOperatingExpenses), currency(previousFinancials.recordedOperatingExpenses), "Agent/business expenses"],
            ["Operating Profit Estimate", currency(financials.operatingProfitEstimate), currency(previousFinancials.operatingProfitEstimate), "Gross Profit minus recorded operating expenses"],
          ]}
        />
        <p className="mt-3 text-sm font-semibold text-slate-500">Collections are tracked separately as payments against receivables and are not counted as sales again.</p>
      </ReportSection>

      <ReportSection title="Trip Summary">
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <StatMini label="Trips This Week" value={tripStats.totalTrips} />
          <StatMini label="Previous Week" value={previousTripStats.totalTrips} />
          <StatMini label="Change" value={`${tripStats.totalTrips - previousTripStats.totalTrips >= 0 ? "+" : ""}${tripStats.totalTrips - previousTripStats.totalTrips} Trip${Math.abs(tripStats.totalTrips - previousTripStats.totalTrips) === 1 ? "" : "s"}`} />
        </div>
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          {tripStats.plantBreakdown.map((plant) => (
            <div key={plant.plant} className="rounded-lg bg-slate-50 p-3">
              <p className="text-base font-bold text-slate-950">{plant.plant}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <StatMini label="Trips" value={`${plant.trips} Trip${plant.trips === 1 ? "" : "s"}`} />
                <StatMini label="Whole Chicken" value={kg(plant.wholeChickenStockIn)} />
                <StatMini label="By-products" value={kg(plant.byProductStockIn)} />
              </div>
            </div>
          ))}
        </div>
        <ResponsiveTable
          columns={["Trip Date", "Plant Origin", "Whole Chicken Stock In", "By-product Stock In", "Total Stock In", "Remaining Stock"]}
          rows={tripStats.rows.map((trip) => [
            shortDate(trip.date).replace(", 2026", ""),
            trip.plant,
            kg(trip.wholeChickenStockIn),
            kg(trip.byProductStockIn),
            kg(trip.totalStockIn),
            kg(trip.remainingStock),
          ])}
        />
      </ReportSection>

      <div className="grid gap-5 xl:grid-cols-2">
        <ReportSection title="Sales / OUT">
          <ResponsiveTable
            columns={["Metric", "This Week", "Last Week", "Change"]}
            rows={[
              ["Gross Sales", currency(financials.grossSales), currency(previousFinancials.grossSales), percentChange(financials.grossSales, previousFinancials.grossSales)],
              ["Net Sales", currency(financials.netSales), currency(previousFinancials.netSales), percentChange(financials.netSales, previousFinancials.netSales)],
              ["COGS", currency(financials.cogs), currency(previousFinancials.cogs), percentChange(financials.cogs, previousFinancials.cogs)],
            ]}
          />
        </ReportSection>
        <ReportSection title="Collections">
          <ResponsiveTable
            columns={["Type", "Amount", "Share", "Notes"]}
            rows={[
              ["Total Collections", currency(totals.totalCollections), `${totals.collectionRate.toFixed(1)}%`, "Collection rate vs sales"],
              ["Cash", currency(cash), "-", "Agent remittance basis"],
              ["GCash", currency(gcash), "-", "Owner GCash"],
              ["Bank", currency(bank), "-", "Owner bank account"],
            ]}
          />
        </ReportSection>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <ReportSection title="Expenses">
          <ResponsiveTable
            columns={["Category", "Amount", "Last Week", "Change"]}
            rows={[
              ...period.expenses.map((expense) => [expense.category, currency(expense.amount), "-", "-"]),
              ["Total Recorded Operating Expenses", currency(financials.recordedOperatingExpenses), currency(previousFinancials.recordedOperatingExpenses), percentChange(financials.recordedOperatingExpenses, previousFinancials.recordedOperatingExpenses)],
            ]}
          />
        </ReportSection>
        <ReportSection title="Receivables">
          <ResponsiveTable
            columns={["Metric", "Amount", "Purpose", "Scope"]}
            rows={[
              ["Opening Receivables", currency(period.receivables.opening), "Starting balance", "Whole business"],
              ["New Credit Sales", currency(period.receivables.newCreditSales), "New receivables", "This week"],
              ["Collections Applied", currency(period.receivables.collectionsApplied), "Payments applied", "This week"],
              ["Closing Receivables", currency(totals.closingReceivables), "Ending balance", "Whole business"],
            ]}
          />
        </ReportSection>
      </div>

      <ReportSection title="Profitability by Plant">
        <ResponsiveTable
          columns={["Plant", "Net Sales", "COGS", "Gross Profit", "Gross Margin", "Remaining Inventory"]}
          rows={plantProfit.map((plant) => [plant.key, currency(plant.netSales), currency(plant.cogs), currency(plant.grossProfit), marginLabel(plant.netSales, plant.grossProfit), remainingForPlant(plant.key)])}
        />
      </ReportSection>

      <ReportSection title="Profitability by Trip">
        <ResponsiveTable
          columns={["Trip", "Original Acquisition Cost", "Sales Generated", "COGS Sold", "Gross Profit", "Remaining Inventory", "Remaining Cost Value"]}
          rows={tripProfit.map((trip) => [
            `${trip.trip?.plant || "Unknown"} - ${trip.trip ? shortDate(trip.trip.date) : trip.key} - ${trip.trip?.code || trip.key}`,
            currency(trip.originalAcquisitionCost),
            currency(trip.netSales),
            currency(trip.cogs),
            currency(trip.grossProfit),
            kg(trip.remainingKg),
            currency(trip.remainingInventoryCostValue),
          ])}
        />
      </ReportSection>

      <ReportSection title="Profitability by Product">
        <ResponsiveTable
          columns={["Product", "Qty OUT", "Net Sales", "COGS", "Gross Profit", "Margin"]}
          rows={productProfit.map((product) => [
            product.key,
            kg(product.qty),
            currency(product.netSales),
            currency(product.cogs),
            currency(product.grossProfit),
            marginLabel(product.netSales, product.grossProfit),
          ])}
        />
      </ReportSection>

      <div className="grid gap-5 xl:grid-cols-2">
        <ReportSection title="Customer Profitability">
          <ResponsiveTable
            columns={["Customer", "Net Sales", "COGS", "Gross Profit", "Gross Margin"]}
            rows={customerProfit.map((customer) => [
              getCustomerName(customers, customer.key),
              currency(customer.netSales),
              currency(customer.cogs),
              currency(customer.grossProfit),
              marginLabel(customer.netSales, customer.grossProfit),
            ])}
          />
        </ReportSection>
        <ReportSection title="Top Outstanding Balances">
          <ResponsiveTable
            columns={["Customer", "Outstanding", "Sales", "Collections"]}
            rows={[...period.customers]
              .sort((a, b) => b.outstanding - a.outstanding)
              .map((customer) => [
                getCustomerName(customers, customer.customerId),
                currency(customer.outstanding),
                currency(customer.sales),
                currency(customer.collections),
              ])}
          />
        </ReportSection>
      </div>

      <ReportSection title="Agent Performance">
        <ResponsiveTable
          columns={["Agent", "OUT handled", "Collections", "Cash / GCash / Bank", "Expenses", "Remittance", "Discrepancies"]}
          rows={period.agents.map((agent) => [
            getAgentName(agents, agent.agentId),
            currency(agent.outHandled),
            currency(agent.collections),
            `${currency(agent.cash)} / ${currency(agent.gcash)} / ${currency(agent.bank)}`,
            currency(agent.expenses),
            `${currency(agent.expectedRemittance)} expected / ${currency(agent.actualRemittance)} actual`,
            agent.discrepancies,
          ])}
        />
        <p className="mt-3 text-sm font-semibold text-slate-500">This section supports accountability and operational reporting, not employee ranking.</p>
      </ReportSection>

      <ReportSection title="Discrepancies">
        <ResponsiveTable
          columns={["Type", "Issue", "Amount / Difference", "Status"]}
          rows={discrepancies.map((item) => [
            item.type,
            item.title,
            item.amount ? currency(item.amount) : item.difference !== undefined ? (item.type === "Inventory" ? kg(item.difference) : item.type === "Price" ? `${currency(item.difference)}/kg` : currency(item.difference)) : item.details || "-",
            item.status,
          ])}
        />
      </ReportSection>
    </div>
  );
}

function ReportSection({ title, children }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 font-bold text-slate-950">{title}</h3>
      {children}
    </section>
  );
}

function Administration({ users, auditLog }) {
  return (
    <>
      <SectionHeader title="Administration" eyebrow="Users and Audit Log" />
      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 font-bold">Users</h2>
          {users.map((user) => (
            <div key={user.id} className="flex items-center justify-between border-b border-slate-100 py-3 last:border-0">
              <div><p className="font-semibold">{user.name}</p><p className="text-sm text-slate-500">{user.id}</p></div>
              <Badge tone={user.role.includes("Admin") ? "blue" : "slate"}>{user.role}</Badge>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 flex items-center gap-2 font-bold"><History size={19} />Audit Log</h2>
          {auditLog.map((item) => (
            <div key={item.id} className="grid gap-2 border-b border-slate-100 py-3 text-sm last:border-0 sm:grid-cols-[90px_150px_1fr]">
              <span className="font-semibold text-slate-500">{new Date(item.at).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}</span>
              <span className="font-bold">{item.actor}</span>
              <span>{item.action}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function OutDetail({ out }) {
  if (!out) return <p className="text-sm text-slate-500">Transaction details are not available in this demo record.</p>;
  return (
    <div className="space-y-4">
      <Info label="Reference" value={out.ref} />
      <Info label="Customer" value={getCustomerName(initialCustomers, out.customerId)} />
      <Info label="Total" value={currency(out.total)} />
      {out.groups.map((group, index) => (
        <div key={`${group.tripId}-${index}`} className="rounded-lg border border-slate-200 p-3">
          <p className="font-bold">{group.plant} - {shortDate(group.tripDate)}</p>
          {group.lines.map((line) => (
            <div key={`${line.product}-${line.qty}`} className="mt-2 flex items-center justify-between text-sm">
              <span>{line.product} - {kg(line.qty)} x {currency(line.price)}</span>
              <strong>{currency(line.subtotal)}</strong>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function PaymentDetail({ payment }) {
  return (
    <div className="space-y-3">
      <Info label="Reference" value={payment.ref} />
      <Info label="Agent" value={getAgentName(agents, payment.agentId)} />
      <Info label="Payment Method" value={payment.method || payment.collection?.method || "Payment"} />
      <Info label="Amount" value={currency(payment.payment)} />
      <Info label="Date/time" value={shortDate(payment.date)} />
      <div className="rounded-lg border border-slate-200 p-3">
        <p className="mb-2 font-bold">Payment Allocation</p>
        {(payment.allocations || []).map((item) => <div key={item.invoiceRef} className="flex justify-between text-sm"><span>{item.invoiceRef}</span><strong>{currency(item.amount)}</strong></div>)}
      </div>
    </div>
  );
}

function ReportDetail({ report, rows }) {
  return <ResponsiveTable columns={[report, "Value", "Status", "Notes"]} rows={rows} />;
}

function ResponsiveTable({ columns, rows, footer }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>{columns.map((column) => <th key={column} className="px-3 py-3 font-bold">{column}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-3">{cell}</td>)}</tr>)}
          </tbody>
          {footer && <tfoot className="bg-slate-950 text-sm font-bold text-white"><tr>{footer.map((cell, index) => <td key={index} className="px-3 py-3">{cell}</td>)}</tr></tfoot>}
        </table>
      </div>
      <div className="divide-y divide-slate-100 md:hidden">
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="p-3">
            {row.map((cell, cellIndex) => (
              <div key={cellIndex} className="mb-2 flex justify-between gap-3 text-sm">
                <span className="font-semibold text-slate-500">{columns[cellIndex]}</span>
                <span className="text-right font-semibold">{cell}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatMini({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 font-bold text-slate-950">{value}</p>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <strong className="text-right text-slate-900">{value}</strong>
    </div>
  );
}

function drawerTitle(drawer) {
  if (!drawer) return "";
  if (drawer.type === "inventory") return "Stock Item Detail";
  if (drawer.type === "out") return drawer.out?.ref || "OUT Detail";
  if (drawer.type === "payment") return drawer.payment?.ref || "Payment Detail";
  if (drawer.type === "report") return drawer.report || "Report";
  return "Detail";
}
