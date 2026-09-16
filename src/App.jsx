import { useEffect, useMemo, useState } from "react";
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
  users,
  demoToday,
  initialDcrs,
  initialAttendance,
  initialPayroll,
  initialTrucks,
  initialReceivingTransfers,
  initialSalesmanTransfers,
  cleanOperationalData,
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

import { Badge, Button, Field, inputClass, StatCard, Drawer, SectionHeader, ResponsiveTable, StatMini, Info, MoneyInput, PlantName, UserContext, useUsers } from "./components/ui";
import { Dashboard, Reports, Collectibles } from "./components/Reporting";
import { Administration, Dtr, Payroll, Trucks } from "./components/Supporting";
import { validateStock, validateSale, validatePayment, salePaymentStatus, sum, duplicateTrustReceipt } from "./utils/operations";
import { productLabel, money, invoiceBalances, getTripProduct } from "./utils/business";
import { initialPlantConfigs, activeProducts, activeCodes, activeClassTypes, optionLabel, stockLine, validatePlantStock, stockSnapshot } from "./utils/plants";
import { PlantManagement } from "./components/PlantManagement";
import { PlantContext } from "./components/ui";
import { isWholeChicken } from "./utils/business";
import { CustomerManagement, CustomerEditor, CustomerSelector, CustomerSearch } from "./components/CustomerManagement";
import { normalizeCustomer, customerPermissions, matchesCustomer, hasCustomerHistory, availableCredit, exceedsCredit } from "./utils/customers";
import { emptySalePayment, initialPaymentAmount, validateSalePayment, paymentAtSaleStatus, saleFinancialEvents } from "./utils/salePayment";
import { compareInventoryProducts, compareInventoryTrips } from "./utils/inventory";
import { Warehouse, SalesmanInventory } from "./components/InventoryFlow";
import { getSalesmanAvailableQty } from "./utils/inventoryFlow";
import { InventoryOverview } from "./components/InventoryOverview";
import { buildLocalInventoryOverviewRows } from "./utils/inventoryOverview";
import { Brand, PrimaryNav, primaryNavigation } from "./components/ApplicationNavigation";
import { canAccessScreen, initialScreenForRole } from "./lib/roleAccess";

const today = demoToday;

const uid = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const tripForm = (plant, date = today) => ({ plantId: plant?.id || "", plant: plant?.name || "", date, reference: "", deliveryNote: "", notes: "", products: activeProducts(plant).length ? [stockLine(activeProducts(plant)[0])] : [] });

const categories = ["Fuel", "Parking", "Toll", "Meals", "Repairs", "Delivery Expense", "Other"];
const paymentMethods = ["Cash", "GCash", "Bank Deposit"];
const wholeChickenProduct = "Whole Dressed Chicken";

export default function App() {
  const [active, setActive] = useState("dashboard");
  useEffect(() => { window.scrollTo({ top: 0 }); }, [active]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [trips, setTrips] = useState(initialTrips);
  const [plantConfigs, setPlantConfigs] = useState(initialPlantConfigs);
  const [demoRole, setDemoRole] = useState("Owner / Admin");
  const [managePlants, setManagePlants] = useState(false);
  const [manageCustomers, setManageCustomers] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  useEffect(() => { setResetOpen(false); }, [demoRole]);
  const [resetEpoch, setResetEpoch] = useState(0);
  const [customers, setCustomers] = useState(() => initialCustomers.map(normalizeCustomer));
  const [customerEditor, setCustomerEditor] = useState(null);
  const permissions = customerPermissions[demoRole];
  const [movements, setMovements] = useState(initialMovements);
  const [outs, setOuts] = useState(initialOuts);
  const [ledgerEntries, setLedgerEntries] = useState(initialLedgerEntries);
  const [collections, setCollections] = useState(initialCollections);
  const [expenses, setExpenses] = useState(initialExpenses);
  const [discrepancies, setDiscrepancies] = useState(initialDiscrepancies);
  const [auditLog, setAuditLog] = useState(initialAuditLog);
  const [dcrs, setDcrs] = useState(initialDcrs);
  const [userRecords, setUsers] = useState(users);
  const [attendance, setAttendance] = useState(initialAttendance);
  const [payroll, setPayroll] = useState(initialPayroll);
  const [trucks, setTrucks] = useState(initialTrucks);
  const [receivingTransfers, setReceivingTransfers] = useState(initialReceivingTransfers);
  const [salesmanTransfers, setSalesmanTransfers] = useState(initialSalesmanTransfers);
  const [targetCustomer, setTargetCustomer] = useState("");
  const [drawer, setDrawer] = useState(null);
  const [toast, setToast] = useState("");
  const [postDcrAlert, setPostDcrAlert] = useState("");
  const demoBackendRole = demoRole === "Owner / Admin" ? "owner_admin" : demoRole === "Agent" ? "salesman" : "warehouse";
  const demoSalesmanId = agents.find((agent) => agent.active)?.id || "";
  const navigationItems = primaryNavigation.filter((item) => canAccessScreen(demoBackendRole, item.id)).map((item) => demoBackendRole === "salesman" && item.id === "inventory" ? { ...item, label: "My Inventory" } : item);

  const inventoryRows = useMemo(() => getInventoryRows(trips, movements), [trips, movements]);
  const inventoryOverviewRows = useMemo(() => buildLocalInventoryOverviewRows({ inventoryRows, receivingTransfers, salesmanTransfers, movements, users: userRecords }), [inventoryRows, receivingTransfers, salesmanTransfers, movements, userRecords]);
  const state = { trips, inventoryRows, outs, ledgerEntries, collections, expenses, discrepancies, dcrs, customers, users: userRecords, auditLog, attendance, payroll, trucks, receivingTransfers, salesmanTransfers, movements };
  function goCustomer(view, id) { setTargetCustomer(id); setActive(view); }
  function resetOperationalData() {
    if (!permissions.manage) return;
    const clean = cleanOperationalData();
    setTrips(clean.trips); setMovements(clean.movements); setOuts(clean.outs); setCustomers(clean.customers);
    setCollections(clean.collections); setLedgerEntries(clean.ledgerEntries); setExpenses(clean.expenses);
    setDcrs(clean.dcrs); setDiscrepancies(clean.discrepancies); setAuditLog(clean.auditLog);
    setAttendance(clean.attendance); setPayroll(clean.payroll); setTrucks(clean.trucks);
    setReceivingTransfers(clean.receivingTransfers); setSalesmanTransfers(clean.salesmanTransfers);
    setCustomerEditor(null); setDrawer(null); setPostDcrAlert(""); setTargetCustomer(""); setToast("");
    setResetOpen(false); setManagePlants(false); setManageCustomers(false); setMobileOpen(false);
    setResetEpoch((value) => value + 1); setActive("dashboard");
  }
  function openCustomerEditor(customer = null) { if (permissions.manage) setCustomerEditor({ customer }); }
  function saveCustomer(record) {
    if (!(customerEditor?.quick ? permissions.quickAdd : permissions.manage)) return;
    const saved = { ...record, id: record.id || uid("cust") };
    setCustomers((items) => record.id ? items.map((c) => c.id === saved.id ? saved : c) : [...items, saved]);
    addAudit((record.id ? "Edited customer " : "Added customer ") + saved.name, demoRole);
    customerEditor?.onSelected?.(saved);
    if (!customerEditor?.quick && active === "customers") setTargetCustomer(saved.id);
    setCustomerEditor(null); pushToast("Customer saved");
  }

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
      const message = `Post-DCR Adjustment Detected: ${shortDate(date)} / ${getAgentName(userRecords, agentId)} - ${description}`;
      setPostDcrAlert(message);
      setDiscrepancies((items) => [
        {
          id: `disc-post-${Date.now()}`,
          date,
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
    dashboard: <Dashboard state={state} onNavigate={setActive} onPayment={(id) => goCustomer("collections", id)} onLedger={(id) => goCustomer("customers", id)} />,
    collectibles: <Collectibles state={state} onPayment={(id) => goCustomer("collections", id)} onLedger={(id) => goCustomer("customers", id)} />,
    trips: (
      <Trips
        plantConfigs={plantConfigs}
        trips={trips}
        setTrips={setTrips}
        addAudit={addAudit}
        pushToast={pushToast}
      />
    ),
    warehouse: <Warehouse inventoryRows={inventoryRows} trips={trips} movements={movements} receivingTransfers={receivingTransfers} setReceivingTransfers={setReceivingTransfers} salesmanTransfers={salesmanTransfers} users={userRecords} addAudit={addAudit} pushToast={pushToast} onOpen={(row) => setDrawer({ type: "inventory", row })} />,
    inventory: demoRole === "Owner / Admin"
      ? <InventoryOverview rows={inventoryOverviewRows} onSelect={(row) => setDrawer({ type: "inventory", row })} onStockIn={() => setActive("trips")} />
      : <SalesmanInventory inventoryRows={inventoryRows} receivingTransfers={receivingTransfers} salesmanTransfers={salesmanTransfers} setSalesmanTransfers={setSalesmanTransfers} movements={movements} users={userRecords} addAudit={addAudit} pushToast={pushToast} onOpen={(row) => setDrawer({ type: "inventory", row, showCost: false })} onWarehouse={() => setActive("warehouse")} />,
    "salesman-inventory": <SalesmanInventory inventoryRows={inventoryRows} receivingTransfers={receivingTransfers} salesmanTransfers={salesmanTransfers} setSalesmanTransfers={setSalesmanTransfers} movements={movements} users={userRecords} addAudit={addAudit} pushToast={pushToast} onOpen={(row) => setDrawer({ type: "inventory", row })} onWarehouse={() => setActive("warehouse")} showCost />,
    out: (
      <OutOrders
        collections={collections} setCollections={setCollections} registerPostDcrChange={registerPostDcrChange} onStockIn={() => setActive("trips")}
        onQuickAdd={permissions.quickAdd ? (name, onSelected) => setCustomerEditor({ quick: true, initialName: name, onSelected }) : null}
        customers={customers}
        trips={trips}
        movements={movements}
        receivingTransfers={receivingTransfers}
        salesmanTransfers={salesmanTransfers}
        setMovements={setMovements}
        outs={outs}
        setOuts={setOuts}
        ledgerEntries={ledgerEntries}
        setLedgerEntries={setLedgerEntries}
        setDiscrepancies={setDiscrepancies}
        addAudit={addAudit}
        pushToast={pushToast}
        initialSalesmanId={demoRole === "Agent" ? demoSalesmanId : ""}
        canSelectSalesman={demoRole === "Owner / Admin"}
      />
    ),
    customers: (
      <Customers key={targetCustomer} initialCustomerId={targetCustomer}
        canManage={permissions.manage} onAdd={() => openCustomerEditor()} onEdit={openCustomerEditor}
        customers={customers}
        ledgerEntries={ledgerEntries}
        outs={outs}
        collections={collections}
        onSelect={(payload) => setDrawer(payload)}
      />
    ),
    collections: (
      <Collections key={targetCustomer} initialCustomerId={targetCustomer}
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
        initialSalesmanId={demoRole === "Agent" ? demoSalesmanId : ""}
        canSelectSalesman={demoRole === "Owner / Admin"}
      />
    ),
    dcr: (
      <Dcr outs={outs}
        customers={customers}
        collections={collections}
        expenses={expenses}
        dcrs={dcrs}
        setDcrs={setDcrs}
        setDiscrepancies={setDiscrepancies}
        addAudit={addAudit}
        pushToast={pushToast}
        postDcrAlert={postDcrAlert}
        initialSalesmanId={demoRole === "Agent" ? demoSalesmanId : ""}
        canSelectSalesman={demoRole === "Owner / Admin"}
      />
    ),
    discrepancies: (
      <Discrepancies
        discrepancies={discrepancies}
        setDiscrepancies={setDiscrepancies}
        customers={customers}
      />
    ),
    reports: <Reports state={state} />,
    admin: permissions.manage && manageCustomers ? <CustomerManagement state={state} onAdd={() => openCustomerEditor()} onEdit={openCustomerEditor} onLedger={(id) => goCustomer("customers", id)} onBack={() => setManageCustomers(false)} onToggle={(c) => { if (!permissions.manage) return; setCustomers((items) => items.map((item) => item.id === c.id ? { ...item, active: !item.active } : item)); addAudit((c.active ? "Deactivated customer " : "Activated customer ") + c.name, demoRole); }} onDelete={(c) => { if (!permissions.manage || hasCustomerHistory(c.id, state)) return; setCustomers((items) => items.filter((item) => item.id !== c.id)); addAudit("Deleted unused customer " + c.name, demoRole); }} /> : demoRole === "Owner / Admin" && managePlants ? <PlantManagement plants={plantConfigs} setPlants={setPlantConfigs} trips={trips} role={demoRole} addAudit={addAudit} pushToast={pushToast} onBack={() => setManagePlants(false)} /> : <><div className="mb-4 flex flex-wrap gap-3">{permissions.manage && <><Button variant="secondary" onClick={() => setManagePlants(true)}><Settings size={17} />Manage Plants</Button><Button variant="secondary" onClick={() => setManageCustomers(true)}><Users size={17} />Manage Customers</Button></>}</div><Administration state={state} setUsers={setUsers} addAudit={addAudit} pushToast={pushToast} /></>,
    dtr: <Dtr users={userRecords} attendance={attendance} setAttendance={setAttendance} pushToast={pushToast} addAudit={addAudit} />,
    payroll: <Payroll users={userRecords} attendance={attendance} payroll={payroll} setPayroll={setPayroll} pushToast={pushToast} addAudit={addAudit} />,
    trucks: <Trucks trucks={trucks} setTrucks={setTrucks} pushToast={pushToast} addAudit={addAudit} />,
  };

  return (
    <PlantContext.Provider value={plantConfigs}><UserContext.Provider value={userRecords}><div className="min-h-screen bg-slate-100 text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 overflow-y-auto border-r border-slate-200 bg-white md:block">
        <Brand />
        <PrimaryNav active={active} setActive={setActive} items={navigationItems} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/35 md:hidden">
          <aside className="h-full w-80 overflow-y-auto max-w-[86vw] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pr-3">
              <Brand />
              <Button variant="ghost" className="h-11 w-11 px-0" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <X size={20} />
              </Button>
            </div>
            <PrimaryNav
              active={active}
              items={navigationItems}
              setActive={(id) => {
                setActive(id);
                setMobileOpen(false);
              }}
            />
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:ml-64 md:px-7">
        <Button variant="ghost" className="h-11 w-11 px-0 md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
          <Menu size={22} />
        </Button>
        <div className="hidden text-sm font-semibold text-slate-500 xl:block">Concept Workflow Prototype by Noderno</div>
        <div className="flex items-center gap-2">
          <select aria-label="Demo Role" className="min-h-11 max-w-40 rounded-lg border border-slate-200 bg-white px-2 text-sm" value={demoRole} onChange={(e) => { const nextRole = e.target.value; const backendRole = nextRole === "Owner / Admin" ? "owner_admin" : nextRole === "Agent" ? "salesman" : "warehouse"; setDemoRole(nextRole); setActive(initialScreenForRole(backendRole)); setManagePlants(false); setManageCustomers(false); setCustomerEditor(null); }}><option>Owner / Admin</option><option value="Agent">Salesman</option><option>Warehouse</option></select>
          <Badge tone="blue">Demo: {shortDate(today)}</Badge>
        </div>
      </header>

      <main className="pb-24 md:ml-64">
        <div key={resetEpoch} className="mx-auto max-w-7xl px-4 py-6 md:px-7">{views[active]}{active === "admin" && permissions.manage && <section className="report-section"><Button variant="danger" onClick={() => setResetOpen(true)}>Reset Operational Data</Button></section>}</div>
      </main>

      <nav className="mobile-nav fixed inset-x-0 bottom-0 z-30 flex gap-2 overflow-x-auto border-t border-slate-200 bg-white p-2 md:hidden">
        {navigationItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`flex min-w-20 flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold ${active === id ? "bg-blue-50 text-[#146ef5]" : "text-slate-500"}`}
            onClick={() => setActive(id)}
          >
            <Icon size={18} />
            <span>{label.split(" / ")[0]}</span>
          </button>
        ))}
      </nav>

      <footer className="border-t border-slate-200 bg-white px-4 py-4 text-center text-xs text-slate-500 md:ml-64">
        Fictional demonstration data and acquisition costs. Prototype by Noderno.
      </footer>

      {toast && <div className="fixed right-4 top-20 z-50 rounded-lg bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-xl">{toast}</div>}
      {resetOpen && permissions.manage && <Drawer title="Reset all operational demo data?" onClose={() => setResetOpen(false)}><p>This clears Stock In, Warehouse and Salesman transfers, Inventory, Sales, Payments, Ledgers, DCRs, expenses and report activity. Plant and system configuration will remain.</p><p className="mt-3">Customers, DTR entries, payroll runs, truck assets, maintenance activity and audit activity will also be cleared. This cannot be undone.</p><div className="mt-6 flex flex-wrap gap-3"><Button variant="secondary" onClick={() => setResetOpen(false)}>Cancel</Button><Button variant="danger" onClick={resetOperationalData}>Reset Operational Data</Button></div></Drawer>}
      {customerEditor && <CustomerEditor {...customerEditor} customers={customers} productNames={[...new Set([...Object.keys(generalPrice), ...plantConfigs.flatMap((p) => p.products.map((product) => product.productName)), ...trips.flatMap((trip) => trip.products.map((p) => p.name))])]} onSave={saveCustomer} onClose={() => setCustomerEditor(null)} onExisting={(c) => { customerEditor.onSelected?.(c); if (!customerEditor.quick) goCustomer("customers", c.id); setCustomerEditor(null); }} />}

      {drawer && (
        <Drawer title={drawerTitle(drawer)} onClose={() => setDrawer(null)}>
          {drawer.type === "inventory" && <InventoryDetail row={drawer.row} showCost={drawer.showCost !== false} />}
          {drawer.type === "out" && <OutDetail out={drawer.out} customers={customers} />}
          {drawer.type === "payment" && <PaymentDetail payment={drawer.payment} />}
          {drawer.type === "report" && <ReportDetail report={drawer.report} rows={drawer.rows} />}
        </Drawer>
      )}
    </div></UserContext.Provider></PlantContext.Provider>
  );
}

export function Trips({ trips, setTrips, addAudit, pushToast, plantConfigs, onStockIn, currentDate = today }) {
  const [form, setForm] = useState(() => tripForm(plantConfigs.find((p) => p.active), currentDate));
  const plant = plantConfigs.find((p) => p.id === form.plantId);
  const productOptions = activeProducts(plant);
  const [error, setError] = useState("");
  const totalCost = sum(form.products, (item) => Number(item.qty) * (item.acquisitionType === "Free from Plant" ? 0 : Number(item.costPerKg)));
  function updateProduct(index, patch) {
    setForm((current) => ({ ...current, products: current.products.map((item, i) => i === index ? { ...item, ...patch } : item) }));
  }
  const [busy, setBusy] = useState(false);
  async function confirmStockIn() {
    const problem = validatePlantStock(form, plant) || validateStock(form);
    if (problem) return setError(problem);
    const trip = {
      id: uid("trip"), code: "TR-" + form.date.replaceAll("-", "") + "-" + plant.shortCode + "-" + (trips.length + 1),
      plantId: plant.id, plant: plant.name, date: form.date, reference: form.reference, deliveryNote: form.deliveryNote, notes: form.notes,
      products: form.products.map((item) => stockSnapshot(item, plant)),
    };
    setBusy(true);
    try {
      if (onStockIn) {
        const saved = await onStockIn(trip);
        trip.code = saved?.trip_number || trip.code;
      } else {
        setTrips((items) => [trip, ...items]);
      }
      setError(""); setForm(tripForm(plant, currentDate));
      addAudit?.("Confirmed Stock In " + trip.code, "Owner / Admin");
      pushToast?.(trip.code + " added to Warehouse");
    } catch (reason) {
      setError(reason?.message || "Unable to confirm Stock In. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return <>
    <SectionHeader title="Plants" />
    <section className="report-section">
      <h2 className="mb-4 text-lg font-bold">New Trip / Stock In</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Plant Origin"><select className={inputClass()} value={form.plantId} onChange={(e) => { const next = plantConfigs.find((p) => p.id === e.target.value); setForm({ ...form, plantId: next.id, plant: next.name, products: activeProducts(next).length ? [stockLine(activeProducts(next)[0])] : [] }); setError(""); }}><option value="" disabled>Select Plant</option>{plantConfigs.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Trip Date"><input className={inputClass()} type="date" value={form.date} onInput={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        <Field label="Reference"><input className={inputClass()} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
        <Field label="Delivery Note"><input className={inputClass()} value={form.deliveryNote} onChange={(e) => setForm({ ...form, deliveryNote: e.target.value })} /></Field>
        <Field label="Notes"><input className={inputClass()} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      </div>
      <div className="mt-4 space-y-4">
        {form.products.map((item, index) => { const config = productOptions.find((p) => p.productId === item.productId); return <div key={index} className="stock-line">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Product"><select className={inputClass()} value={item.productId} onChange={(e) => updateProduct(index, stockLine(productOptions.find((p) => p.productId === e.target.value)))}>{productOptions.map((p) => <option key={p.productId} value={p.productId}>{p.productName}</option>)}</select></Field>
            {config?.usesSizeCodes && <Field label="Size/Code"><select className={inputClass()} value={item.sizeCode} onChange={(e) => updateProduct(index, { sizeCode: e.target.value })}><option value="">Select Code</option>{activeCodes(config).map((c) => <option key={c.id} value={c.id}>{optionLabel(c)}</option>)}</select></Field>}
            {config?.usesClassTypes && <Field label="Class Type"><select className={inputClass()} value={item.classType} onChange={(e) => updateProduct(index, { classType: e.target.value })}><option value="">Select Class Type</option>{activeClassTypes(config).map((c) => <option key={c.id} value={c.id}>{optionLabel(c)}</option>)}</select></Field>}
            {config?.usesBags && <Field label="Bags"><input className={inputClass()} type="number" min="0" step="1" value={item.bags} onChange={(e) => updateProduct(index, { bags: e.target.value })} placeholder="Not recorded" /></Field>}
            {config?.usesHeadCount && <Field label="Heads Count"><input className={inputClass()} type="number" min="0" step="1" value={item.headCount} onChange={(e) => updateProduct(index, { headCount: e.target.value })} placeholder="Not recorded" /></Field>}
            <Field label="Total KG"><input className={inputClass()} type="number" min="0" step="0.01" value={item.qty} onChange={(e) => updateProduct(index, { qty: e.target.value })} /></Field>
            <Field label="Acquisition Type"><select className={inputClass()} value={item.acquisitionType} onChange={(e) => updateProduct(index, { acquisitionType: e.target.value, costPerKg: e.target.value === "Free from Plant" ? 0 : "" })}><option>Purchased</option>{config?.allowsFreeFromPlant && <option>Free from Plant</option>}</select></Field>
            <Field label="Cost/kg"><MoneyInput disabled={item.acquisitionType === "Free from Plant"} value={item.costPerKg} onChange={(e) => updateProduct(index, { costPerKg: e.target.value })} /></Field>
            <StatMini label="Total Acquisition Cost" value={currency(Number(item.qty || 0) * Number(item.costPerKg || 0))} />
            <div className="flex items-end gap-2">{item.acquisitionType === "Free from Plant" && <Badge tone="green">FREE FROM PLANT</Badge>}<Button variant="ghost" disabled={form.products.length === 1} onClick={() => setForm({ ...form, products: form.products.filter((_, i) => i !== index) })} aria-label="Remove product"><X size={18} /></Button></div>
          </div>
        </div>; })}
        {!productOptions.length && <p className="text-slate-600">No active products configured for this plant.</p>}
        <Button variant="secondary" disabled={!productOptions.length} onClick={() => setForm({ ...form, products: [...form.products, stockLine(productOptions[0])] })}><Plus size={18} />Add Product</Button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatMini label="Total Trip Acquisition Cost" value={currency(totalCost)} />
        <StatMini label="Total Bags" value={sum(form.products, "bags")} /><StatMini label="Total KG" value={kg(sum(form.products, "qty"))} />
        <StatMini label="Purchased KG" value={kg(sum(form.products.filter((item) => item.acquisitionType === "Purchased"), "qty"))} />
        <StatMini label="Free KG" value={kg(sum(form.products.filter((item) => item.acquisitionType === "Free from Plant"), "qty"))} />
      </div>
      {error && <p role="alert" className="mt-3 font-semibold text-rose-700">{error}</p>}
      <Button className="mt-4" disabled={busy || !plant?.active || !productOptions.length} onClick={confirmStockIn}><ClipboardCheck size={18} />{busy ? "Confirming..." : "Confirm Stock In"}</Button>
    </section>
    <section className="report-section"><h2 className="mb-4 text-lg font-bold">Plant Trips</h2>
      {[...new Set(trips.map((trip) => trip.plant))].map((plant) => <div key={plant} className="mb-6">
        <h3 className="mb-3"><PlantName name={plant} /></h3>
        <div className="space-y-3">{trips.filter((trip) => trip.plant === plant).sort((a, b) => b.date.localeCompare(a.date)).map((trip) => <details key={trip.id} className="rounded-lg border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer font-bold">{shortDate(trip.date)} / {trip.code} / {kg(sum(trip.products, "originalQty"))} / {currency(tripAcquisitionCost(trip))}</summary>
          <div className="mt-3"><ResponsiveTable columns={["Product", "Size/Code", "Class Type", "Bags", "Heads", "KG", "Acquisition Type", "Cost/kg", "Total Cost"]} rows={trip.products.map((item) => [item.name, productLabel("", item.sizeCode, "", item.sizeCodeLabel) || "-", productLabel("", "", item.classType, "", item.classTypeLabel) || "-", item.bags ?? "Not recorded", item.headCount ?? "Not recorded", kg(item.originalQty), item.acquisitionType === "Free from Plant" ? <Badge tone="green">FREE FROM PLANT</Badge> : "Purchased", currency(item.costPerKg), currency(item.originalQty * item.costPerKg)])} /></div>
        </details>)}</div>
      </div>)}
    </section>
  </>;
}

function Inventory({ inventoryRows, onSelect, onStockIn }) {
  const [selectedPlant, setSelectedPlant] = useState(null);
  const [plantQuery, setPlantQuery] = useState("");
  const [tripFilter, setTripFilter] = useState("All");
  const [productQuery, setProductQuery] = useState("");
  const [productMode, setProductMode] = useState("All Products");

  const activeRows = inventoryRows;
  const plantSummaries = [...new Set(activeRows.map((row) => row.plant))]
    .map((plantName) => {
      const rows = activeRows.filter((row) => row.plant === plantName);
      const totalRemaining = rows.reduce((sum, row) => sum + row.remainingQty, 0);
      const wholeChickenStock = rows
        .filter(isWholeChicken)
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
    .filter(isWholeChicken)
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
  }, new Map()).values()].sort(compareInventoryTrips);
  const productFilteredRows = selectedRows.filter((row) => {
    const matchesTrip = tripFilter === "All" || row.tripId === tripFilter;
    const matchesProductText = [row.product, row.sizeCode, row.tripCode].filter(Boolean).join(" ").toLowerCase().includes(productQuery.toLowerCase());
    const matchesMode =
      productMode === "All Products" ||
      (productMode === "Whole Chicken" && isWholeChicken(row)) ||
      (productMode === "By-products" && !isWholeChicken(row));
    return matchesTrip && matchesProductText && matchesMode;
  });
  const tripGroups = tripOptions
    .map((trip) => ({
      ...trip,
      rows: productFilteredRows
        .filter((row) => row.tripId === trip.tripId)
        .sort(compareInventoryProducts),
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
                  <h2><PlantName name={summary.plant} /></h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">{summary.activeTrips} trips / {summary.rows.filter((row) => row.remainingQty === 0).length} sold out</p>
                </div>
                <div className="rounded-lg bg-blue-50 p-2 text-[#146ef5]">
                  <PackageCheck size={22} />
                </div>
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-600">{[summary.rows.some(isWholeChicken) && "Whole Chicken", summary.rows.some((row) => !isWholeChicken(row)) && "By-products"].filter(Boolean).join(" + ")}</p>
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
              {inventoryRows.length ? "No plants match the search." : <><p>No stock received yet.</p><Button className="mt-3" onClick={onStockIn}><Plus size={17} />Stock In Product</Button></>}
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <SectionHeader
        title={<PlantName name={selectedPlant} />}
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
          const wholeChicken = group.rows.filter(isWholeChicken);
          const byProducts = group.rows.filter((row) => !isWholeChicken(row));
          return (
            <section key={group.tripId} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">Trip - {shortDate(group.tripDate)}</h2>
                  <p className="text-sm font-semibold text-slate-500">{group.tripCode}</p>
                  <p className="mt-2 text-sm font-semibold">Whole Chicken: {kg(sum(wholeChicken, "remainingQty"))} / By-products: {kg(sum(byProducts, "remainingQty"))} / Total Remaining: {kg(sum(group.rows, "remainingQty"))}</p>
                </div>
                <Badge tone="blue">{group.rows.length} stock lines / {group.rows.filter((row) => row.remainingQty === 0).length} sold out</Badge>
              </div>
              {wholeChicken.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-sm font-bold text-slate-700">Whole Dressed Chicken</p>
                  <InventoryRowHeader />
                  {wholeChicken.map((row) => <ProductInventoryRow key={row.id} row={row} prominent onSelect={onSelect} />)}
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

function InventoryRowHeader() { return null; }

function ProductInventoryRow({ row, onSelect }) {
  return <button className="inventory-product" onClick={() => onSelect(row)}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-base font-extrabold uppercase">{productLabel(row.product, row.sizeCode, row.classType, row.sizeCodeLabel, row.classTypeLabel)}</h3>
        <p className="mt-1 text-sm text-slate-500">Bags received: {row.bags ?? "Not recorded"}</p>
        {row.product === "Head" && <p className="mt-1 text-sm text-slate-500">Heads received: {row.headCount ?? "Not recorded"}</p>}
        {row.acquisitionType === "Free from Plant" && <Badge tone="green">FREE FROM PLANT</Badge>}
      </div>
      <div className={`remaining-stock ${row.remainingQty === 0 ? "sold-out" : ""}`}><p>REMAINING</p><strong>{kg(row.remainingQty)}</strong>
        <Badge tone={row.remainingQty === 0 ? "red" : row.remainingQty < 100 ? "amber" : "green"}>{row.remainingQty === 0 ? "SOLD OUT" : row.remainingQty < 100 ? "Low Stock" : "Available"}</Badge>
      </div>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      {[["Original KG", kg(row.originalQty)], ["Sold KG", kg(row.totalOut)], ["Adjustments", kg(row.adjustments)], ["Cost/kg", currency(row.costPerKg)], ["Remaining Cost Value", currency(row.inventoryCostValue)]].map(([label, value]) => <div key={label}><p className="text-sm text-slate-500">{label}</p><p className="font-semibold">{value}</p></div>)}
    </div>
    <p className="mt-3 flex items-center gap-1 text-sm font-semibold text-blue-700">View Movements <ChevronRight size={16} /></p>
  </button>;
}

function MovementRef({ movement }) {
  const [reference, customer] = String(movement.ref ?? movement.type ?? "Movement").split(" / ");
  return (
    <div>
      <p className="font-semibold">{reference}</p>
      {customer ? (
        <p className="text-sm text-slate-500">{customer}</p>
      ) : (
        <p className="text-sm text-slate-500">{movement.type === "OUT" ? "Sale" : movement.type}</p>
      )}
    </div>
  );
}

export function InventoryDetail({ row, showCost = true }) {
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
        <h3 className="mt-1 text-xl font-extrabold uppercase text-slate-950">{productLabel(row.product, row.sizeCode, row.classType, row.sizeCodeLabel, row.classTypeLabel)}</h3>
        <Badge tone={row.acquisitionType === "Free from Plant" ? "green" : "slate"}>{row.acquisitionType === "Free from Plant" ? "FREE FROM PLANT" : "Purchased"}</Badge>
        <p className="mt-1 text-sm font-semibold text-slate-500">Trip: {shortDate(row.tripDate)} - {row.tripCode}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          ["Stock In", kg(row.originalQty)],
          ["Bags Received", row.bags ?? "Not recorded"],
          ...(row.product === "Head" ? [["Heads Count", row.headCount ?? "Not recorded"]] : []),
          ["Sold KG", kg(row.totalOut)],
          ["Adjustments", kg(row.adjustments)],
          ["Remaining", kg(row.remainingQty)],
          ...(showCost ? [["Cost / kg", currency(row.costPerKg)], ["Inventory Cost Value", currency(row.inventoryCostValue)], ["Original Acquisition Cost", currency(row.originalAcquisitionCost)]] : []),
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-500">{label}</p>
            <p className="mt-1 font-bold text-slate-950">{value}</p>
          </div>
        ))}
      </div>
      <h3 className="font-bold">Movement History</h3>
      {(row.history ?? []).map((movement) => (
        <div key={movement.id} className="flex items-center justify-between border-b border-slate-100 py-3">
          <MovementRef movement={movement} />
          <p className={`font-bold ${movement.direction === "neutral" ? "text-slate-700" : movement.direction === "out" || movement.qty < 0 ? "text-rose-600" : "text-emerald-600"}`}>{movement.direction === "out" ? "-" : movement.direction === "in" || movement.qty > 0 && movement.direction !== "neutral" ? "+" : ""}{kg(Math.abs(Number(movement.qty || 0)))}</p>
        </div>
      ))}
    </div>
  );
}

export function OutOrders({ customers, trips, movements = [], receivingTransfers = [], salesmanTransfers = [], setMovements, outs = [], setOuts, ledgerEntries = [], setLedgerEntries, setDiscrepancies, addAudit, pushToast, onQuickAdd, collections = [], setCollections, registerPostDcrChange, onStockIn, getAvailable, onConfirmSale, currentDate = today, requireTrustReceipt = false, canSelectSalesman = true, initialSalesmanId = "" }) {
  const agents = useUsers();
  const [review, setReview] = useState(false);
  const [salePayment, setSalePayment] = useState(emptySalePayment);
  const [trustReceipt, setTrustReceipt] = useState("");
  const [saleDate, setSaleDate] = useState(currentDate);
  const [saleAgent, setSaleAgent] = useState(initialSalesmanId);
  const defaultCustomerId = customers.find((c) => c.active)?.id || "";
  const [customerId, setCustomerId] = useState(defaultCustomerId);
  const selectedCustomer = customers.find((customer) => customer.id === customerId) || { name: "Select Customer", pricing: {}, active: false };
  const selectedAgentId = saleAgent || (agents.some((agent) => agent.id === selectedCustomer.agentId && agent.active && agent.role === "Agent") ? selectedCustomer.agentId : agents.find((agent) => agent.active && agent.role === "Agent")?.id || "");
  const availableFor = (salesmanId, trip, item) => getAvailable ? getAvailable(salesmanId, trip, item) : getSalesmanAvailableQty(receivingTransfers, salesmanTransfers, movements, salesmanId, trip.id, item.name, item.sizeCode, item.classType);
  const saleableTrips = trips.filter((trip) => trip.products.some((item) => availableFor(selectedAgentId, trip, item) > 0));
  const plantOptions = [...new Set(saleableTrips.map((trip) => trip.plant))];
  const [groups, setGroups] = useState(() => [
    buildDefaultGroup(selectedCustomer),
  ]);
  const linesWithTrip = groups.flatMap((group) => group.lines.map((line) => ({ ...line, tripId: group.tripId, groupId: group.id })));
  const activeLinesWithTrip = linesWithTrip.filter((line) => Number(line.qty || 0) > 0);
  const duplicateSale = duplicateTrustReceipt(outs, trustReceipt);
  const hasEmptyOptionalGroup = groups.some((group) => group.lines.length === 0 || group.lines.every((line) => Number(line.qty || 0) <= 0));
  const hasEmptyGroup = groups.some((group) => group.lines.length === 0 || group.lines.every((line) => Number(line.qty || 0) <= 0));
  const hostedStockError = getAvailable && activeLinesWithTrip.some((line) => {
    const trip = trips.find((item) => item.id === line.tripId);
    const stock = trip?.products.find((item) => item.lotId === line.lotId) || trip?.products.find((item) => item.name === line.product && (item.sizeCode || "") === (line.sizeCode || "") && (item.classType || "") === (line.classType || ""));
    return !stock || Number(line.qty) > availableFor(selectedAgentId, trip, stock);
  });
  const saleError = !selectedCustomer.active ? "Select an active customer." : requireTrustReceipt && !trustReceipt.trim() ? "Enter a Trust Receipt Number." : duplicateSale ? `Trust Receipt Number already exists. ${trustReceipt.trim()} is already used by ${duplicateSale.ref}.` : getAvailable ? (hasEmptyGroup ? "Add products to each origin or remove the empty optional group." : hostedStockError ? "Insufficient Salesman Inventory." : "") : validateSale(groups, trips, movements, saleDate, selectedAgentId, receivingTransfers, salesmanTransfers);
  const hasInsufficient = Boolean(saleError);
  const total = sum(activeLinesWithTrip, (line) => money(Number(line.qty || 0) * Number(line.price || 0)));
  const initialPaid = initialPaymentAmount(salePayment);
  const paymentError = validateSalePayment(salePayment, total);
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
    return saleableTrips.find((trip) => trip.id === preferredTripId) || saleableTrips[0];
  }

  function defaultTripId() {
    return saleableTrips[0]?.id || "";
  }

  function lineFor(product, qty = 0, customer = selectedCustomer) {
    return { product, qty, sizeCode: "", sizeCodeLabel: "", classType: "", classTypeLabel: "", price: customerPrice(customer, product) };
  }

  function normalizeLinesForTrip(lines, trip, customer = selectedCustomer) {
    const availableItems = (trip?.products || []).filter((item) => availableFor(selectedAgentId, trip, item) > 0);
    const productNames = availableItems.map((product) => product.name);
    const fallbackProduct = productNames.includes(wholeChickenProduct) ? wholeChickenProduct : productNames[0] || wholeChickenProduct;
    const safeLines = lines.length ? lines : [lineFor(fallbackProduct, 0, customer)];
    return safeLines.map((line) => {
      const product = productNames.includes(line.product) ? line.product : fallbackProduct;
      const exact = availableItems.find((item) => item.name === product && (item.sizeCode || "") === (line.sizeCode || "") && (item.classType || "") === (line.classType || "")) || availableItems.find((item) => item.name === product);
      return {
        ...line,
        product,
        lotId: exact?.lotId || "", sizeCode: exact?.sizeCode || "", sizeCodeLabel: exact?.sizeCodeLabel || "", classType: exact?.classType || "", classTypeLabel: exact?.classTypeLabel || "",
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
    return buildOrderGroup(defaultTripId(), [{ product: "Whole Dressed Chicken", qty: 0 }], customer);
  }

  function resetOutForm() {
    const defaultCustomer = customers.find((item) => item.id === defaultCustomerId);
    setCustomerId(defaultCustomerId);
    setTrustReceipt(""); setSaleDate(currentDate); setReview(false); setSaleAgent(initialSalesmanId);
    setSalePayment(emptySalePayment());
    setGroups([buildDefaultGroup(defaultCustomer)]);
  }

  function handleCustomerChange(nextCustomerId, record) {
    const nextCustomer = record || customers.find((customer) => customer.id === nextCustomerId);
    if (!nextCustomer?.active) return;
    setCustomerId(nextCustomer.id);
    setGroups((current) =>
      current.map((group) => ({
        ...group,
        lines: group.lines.map((line) => ({ ...line, price: Number(line.price) === customerPrice(selectedCustomer, line.product) ? customerPrice(nextCustomer, line.product) : line.price })),
      }))
    );
  }

  function updateGroup(groupId, patch) {
    setGroups((current) => current.map((group) => (group.id === groupId ? { ...group, ...patch } : group)));
  }

  function changeGroupPlant(groupId, plant) {
      const nextTrip = saleableTrips.find((trip) => trip.plant === plant);
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
      const hasOpenEmptyGroup = current.some((group) => group.lines.length === 0 || group.lines.every((line) => Number(line.qty || 0) <= 0));
      if (hasOpenEmptyGroup) return current;
      const usedTripIds = new Set(current.map((group) => group.tripId));
      const nextTrip =
        saleableTrips.find((trip) => !usedTripIds.has(trip.id)) ||
        saleableTrips[0];
      const lineSpecs = [{ product: "Whole Dressed Chicken", qty: 0 }];
      return [...current, buildOrderGroup(nextTrip?.id, lineSpecs)];
    });
  }

  function removeGroup(groupId) {
    setGroups((current) => current.filter((group, index) => index === 0 || group.id !== groupId));
  }

  const [busy, setBusy] = useState(false);
  async function confirmOut() {
    if (saleError || paymentError || !selectedAgentId || total <= 0) return;
    const ref = "SALE-" + (1300 + outs.length + 1);
    const outGroups = groups.map((group) => {
      const trip = trips.find((item) => item.id === group.tripId);
      if (!trip) return null;
      return {
        tripId: group.tripId,
        plant: trip.plant,
        tripDate: trip.date,
        lines: group.lines
          .filter((line) => Number(line.qty || 0) > 0)
          .map((line) => ({ ...line, qty: Number(line.qty), price: Number(line.price), subtotal: money(Number(line.qty || 0) * Number(line.price || 0)) })),
      };
    }).filter((group) => group?.lines.length);
    const out = { id: uid("out"), ref, trustReceipt: trustReceipt.trim(), date: saleDate, customerId, agentId: selectedAgentId, total, groups: outGroups };
    if (onConfirmSale) {
      setBusy(true);
      try {
        const saved = await onConfirmSale({ customerId, salesmanId: selectedAgentId, date: saleDate, trustReceipt: trustReceipt.trim(), groups: outGroups, salePayment });
        resetOutForm();
        pushToast?.(`Sale ${saved.trust_receipt_number} confirmed successfully`);
      } catch (reason) {
        setReview(false);
        pushToast?.(reason?.message || "Unable to confirm Sale.");
      } finally {
        setBusy(false);
      }
      return;
    }
    const financial = saleFinancialEvents(out, salePayment, "PAY-" + (3000 + collections.length + 1), uid);
    if (exceedsCredit(selectedCustomer, ledgerEntries, total - initialPaid)) addAudit("Credit Limit Exceeded: " + ref + " / " + selectedCustomer.name + " (warning-only demo policy)", getAgentName(agents, selectedAgentId));
    setOuts((items) => [out, ...items]);
    setMovements((items) => [
      ...items,
      ...outGroups.flatMap((group) =>
        group.lines.map((line, index) => ({
          id: uid("mov"),
          tripId: group.tripId,
          product: line.product,
          sizeCode: line.sizeCode || "", classType: line.classType || "", agentId: selectedAgentId,
          outId: out.id,
          qty: -Number(line.qty || 0),
          type: "OUT",
          ref: `${ref} / ${selectedCustomer.name}`,
          actor: getAgentName(agents, selectedAgentId),
          at: saleDate + "T12:00:00",
        }))
      ),
    ]);
    setLedgerEntries((items) => [...items, ...financial.entries]);
    if (financial.collection) {
      setCollections((items) => [financial.collection, ...items]);
      if (financial.discrepancy) setDiscrepancies((items) => [financial.discrepancy, ...items]);
      addAudit("Recorded " + currency(initialPaid) + " " + salePayment.method + " payment at " + ref, getAgentName(agents, selectedAgentId));
      registerPostDcrChange(selectedAgentId, saleDate, financial.collection.ref + " payment at Sale added after lock");
    }
    overrides.forEach((line) => {
      const acquisitionCost = getAcquisitionCost(trips, line.tripId, line.product, line.sizeCode, line.classType);
      const qty = Number(line.qty || 0);
      const normalPrice = customerPrice(selectedCustomer, line.product);
      const expectedGrossProfit = qty * normalPrice - qty * acquisitionCost;
      const actualGrossProfit = qty * Number(line.price || 0) - qty * acquisitionCost;
      setDiscrepancies((items) => [
        {
          id: `disc-price-${Date.now()}-${line.product}`,
          date: saleDate,
          tripId: line.tripId, sizeCode: line.sizeCode,
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
      addAudit(`Changed ${line.product} price ${currency(normalPrice)} -> ${currency(line.price)}`, getAgentName(agents, selectedAgentId));
    });
    addAudit(`Created ${ref}`, getAgentName(agents, selectedAgentId));
    resetOutForm();
    pushToast(`${ref} confirmed successfully`);
  }
  return (
    <>
      <SectionHeader
        title="Sales"
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={resetOutForm}><Plus size={18} />{outs.length ? "New Sale" : "Create First Sale"}</Button>
          </div>
        }
      />
      {!outs.length && <p className="mb-4 text-slate-500">No sales yet.</p>}
      {!trips.length && <div className="mb-4"><p className="mb-2 text-slate-500">No stock received yet.</p><Button variant="secondary" onClick={onStockIn}>Stock In Product</Button></div>}
      {!!trips.length && !saleableTrips.length && <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 font-semibold text-amber-900">No inventory assigned to this Salesman yet. Receive stock from Warehouse before creating a Sale.</p>}
      <div className="grid gap-5 2xl:grid-cols-[300px_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 font-bold">Step 1 - Select Customer</h2>
          <CustomerSelector customers={customers.filter((c) => c.active)} value={customerId} onChange={handleCustomerChange} onAdd={onQuickAdd ? (name, clearSearch) => onQuickAdd(name, (customer) => { handleCustomerChange(customer.id, customer); clearSearch(); }) : null} />
          {selectedCustomer.id && <div className="mt-4 space-y-3 rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-extrabold uppercase text-blue-700">Customer</p><p className="customer-name uppercase">{selectedCustomer.name}</p>
            <Info label="Customer Type" value={selectedCustomer.type || "-"} />
            <Info label="Outstanding Balance" value={currency(customerBalance(ledgerEntries, customerId))} />
            <Info label="Credit Status" value={selectedCustomer.creditStatus || "-"} />
            <Info label="Payment Type" value={selectedCustomer.paymentType || "-"} />
            <Info label="Available Credit" value={availableCredit(selectedCustomer, ledgerEntries) === null ? "Not set" : currency(availableCredit(selectedCustomer, ledgerEntries))} />
            <Info label="Price for Whole Chicken" value={currency(customerPrice(selectedCustomer, "Whole Dressed Chicken")) + "/kg"} />
          </div>}
          {selectedCustomer.active && exceedsCredit(selectedCustomer, ledgerEntries, total - initialPaid) && <p role="alert" className="mt-3 border-l-4 border-amber-500 bg-amber-50 p-3 font-semibold text-amber-900">Credit Limit Exceeded</p>}
          <div className="mt-4 grid gap-3 sm:grid-cols-3 2xl:grid-cols-1">
            <Field label="Trust Receipt No."><input className={inputClass()} placeholder="TR-001" value={trustReceipt} onChange={(e) => setTrustReceipt(e.target.value)} /></Field>
            <Field label="Sale Date"><input className={inputClass()} type="date" value={saleDate} onInput={(e) => setSaleDate(e.target.value)} /></Field>
            <Field label="Salesman"><select disabled={!canSelectSalesman} className={inputClass()} value={selectedAgentId} onChange={(e) => { const id = e.target.value; setSaleAgent(id); const firstTrip = trips.find((trip) => trip.products.some((item) => availableFor(id, trip, item) > 0)); const firstItem = firstTrip?.products.find((item) => availableFor(id, firstTrip, item) > 0); setGroups([{ id: uid("group"), tripId: firstTrip?.id || "", lines: firstItem ? [{ product: firstItem.name, lotId: firstItem.lotId || "", sizeCode: firstItem.sizeCode || "", sizeCodeLabel: firstItem.sizeCodeLabel || "", classType: firstItem.classType || "", classTypeLabel: firstItem.classTypeLabel || "", qty: 0, price: customerPrice(selectedCustomer, firstItem.name) }] : [] }]); }} >{agents.filter((agent) => agent.active && agent.role === "Agent").map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></Field>
          </div>
        </div>
        <div className="space-y-4">
          {saleableTrips.length > 0 && groups.map((group, groupIndex) => {
            const trip = saleableTrips.find((item) => item.id === group.tripId);
            const tripOptions = saleableTrips.filter((tripOption) => tripOption.plant === trip?.plant);
            const availableItems = (trip?.products || []).filter((item) => availableFor(selectedAgentId, trip, item) > 0);
            return (
              <div key={group.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-bold">{groups.length === 1 ? "Step 2-4 - Plant / Trip / Products" : `Plant / Trip ${groupIndex + 1}`}</h2>

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
                  <span className="text-xs font-semibold text-slate-500">Stock deducts from {getAgentName(agents, selectedAgentId)} / {trip?.plant} / {trip ? shortDate(trip.date) : "selected trip"}</span>
                </div>
                <div className="mt-2 space-y-2">
                  {group.lines.map((line, index) => {
                    const stockItem = availableItems.find((item) => item.lotId === line.lotId) || availableItems.find((item) => item.name === line.product && (item.sizeCode || "") === (line.sizeCode || "") && (item.classType || "") === (line.classType || ""));
                    const available = stockItem ? availableFor(selectedAgentId, trip, stockItem) : 0;
                    const defaultPrice = customerPrice(selectedCustomer, line.product);
                    const changed = Number(line.price) !== defaultPrice;
                    const insufficient = Number(line.qty) > available;
                    return (
                      <div key={`${group.id}-${index}`} className={`rounded-lg border p-3 ${insufficient ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-slate-50"}`}>
                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(150px,1fr)_120px_120px_100px_130px_44px]">
                          <Field label="Product"><select className={inputClass()} value={line.product} onChange={(e) => { const item = availableItems.find((stock) => stock.name === e.target.value); updateLine(group.id, index, { product: e.target.value, lotId: item?.lotId || "", sizeCode: item?.sizeCode || "", sizeCodeLabel: item?.sizeCodeLabel || "", classType: item?.classType || "", classTypeLabel: item?.classTypeLabel || "", qty: 0, price: customerPrice(selectedCustomer, e.target.value) }); }}>
                            {[...new Set(availableItems.map((item) => item.name))].map((name) => <option key={name}>{name}</option>)}
                          </select></Field>
                          {availableItems.some((item) => item.name === line.product && item.sizeCode) && <Field label="Size/Code"><select className={inputClass()} value={line.sizeCode || ""} onChange={(e) => { const item = availableItems.find((stock) => stock.name === line.product && stock.sizeCode === e.target.value); updateLine(group.id, index, { lotId: item?.lotId || "", sizeCode: e.target.value, sizeCodeLabel: item?.sizeCodeLabel || "", classType: item?.classType || "", classTypeLabel: item?.classTypeLabel || "", qty: 0 }); }}>
                            {[...new Map(availableItems.filter((item) => item.name === line.product).map((item) => [item.sizeCode || "", item])).values()].map((item) => <option key={item.sizeCode || "uncoded"} value={item.sizeCode || ""}>{productLabel("", item.sizeCode, "", item.sizeCodeLabel)}</option>)}
                          </select></Field>}
                          {availableItems.some((item) => item.name === line.product && item.classType) && <Field label="Class Type"><select className={inputClass()} value={line.classType || ""} onChange={(e) => { const item = availableItems.find((stock) => stock.name === line.product && (stock.sizeCode || "") === (line.sizeCode || "") && stock.classType === e.target.value); updateLine(group.id, index, { lotId: item?.lotId || "", classType: e.target.value, classTypeLabel: item?.classTypeLabel || "", qty: 0 }); }}>{availableItems.filter((item) => item.name === line.product && (item.sizeCode || "") === (line.sizeCode || "")).map((item) => <option key={item.classType} value={item.classType}>{productLabel("", "", item.classType, "", item.classTypeLabel)}</option>)}</select></Field>}
                          <Field label="KG"><input className={inputClass()} type="number" min="0" step="0.01" value={line.qty} onChange={(e) => updateLine(group.id, index, { qty: e.target.value })} /></Field>
                          <Field label="Selling Price/kg"><MoneyInput value={line.price} onChange={(e) => updateLine(group.id, index, { price: e.target.value })} /></Field>
                          <Button variant="ghost" className="px-0" disabled={group.lines.length === 1} onClick={() => updateGroup(group.id, { lines: group.lines.filter((_, lineIndex) => lineIndex !== index) })} aria-label="Remove line"><X size={18} /></Button>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
                          <Badge tone={insufficient ? "red" : "green"}>Salesman available: {kg(available)}</Badge>
                          <Badge>Default Customer Price: {currency(defaultPrice)}/kg</Badge>
                          {changed && <Badge tone="amber">Price manually changed: {currency(line.price)}/kg, difference {currency(Number(line.price) - defaultPrice)}/kg</Badge>}
                          {insufficient && <span className="text-rose-700">Insufficient Salesman Inventory. Requested {kg(line.qty)}, available {kg(available)}.</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Button variant="secondary" className="mt-3" onClick={() => { const item = availableItems[0]; if (item) updateGroup(group.id, { lines: [...group.lines, { product: item.name, lotId: item.lotId || "", sizeCode: item.sizeCode || "", sizeCodeLabel: item.sizeCodeLabel || "", classType: item.classType || "", classTypeLabel: item.classTypeLabel || "", qty: 0, price: customerPrice(selectedCustomer, item.name) }] }); }}>
                  <Plus size={18} /> Add Product
                </Button>
              </div>
            );
          })}
          {saleableTrips.length > 0 && <div className="rounded-lg border border-dashed border-slate-300 bg-white p-3">
            <Button variant="ghost" className="w-full justify-start text-slate-600" disabled={hasEmptyOptionalGroup} onClick={addAnotherGroup}>
              <Plus size={18} /> Add Another Plant / Trip
            </Button>
            {hasEmptyOptionalGroup && groups.length > 1 && <p className="px-4 pb-2 text-xs font-semibold text-slate-500">Fill or remove the empty optional plant/trip before adding another.</p>}
          </div>}
          <div className="border-t border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-500">Sale Summary</p>
                <p className="customer-name uppercase">{selectedCustomer.name}</p>
                <div className="mt-2 space-y-2 text-sm text-slate-700">
                  {summaryGroups.length === 0 && <p>No products added yet.</p>}
                  {summaryGroups.map((group) => (
                    <div key={`summary-${group.id}`} className={summaryGroups.length > 1 ? "border-t border-slate-100 pt-2" : ""}>
                      <p className="font-bold text-slate-950">{group.trip?.plant} - {group.trip ? shortDate(group.trip.date) : ""}</p>
                      <div className="mt-1 space-y-1">
                        {group.lines.map((line, index) => (
                          <div key={`${group.id}-summary-${line.product}-${index}`} className="flex flex-wrap justify-between gap-2">
                            <span>{productLabel(line.product, line.sizeCode, line.classType, line.sizeCodeLabel, line.classTypeLabel)} - {kg(line.qty)} x {currency(line.price)}</span>
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
                  <p className="text-sm font-semibold text-slate-500">Sale Total</p>
                  <p className="text-2xl font-bold text-slate-950">{currency(total)}</p>
                  <Button className="mt-3" disabled={hasInsufficient || hasEmptyGroup || total <= 0 || !selectedAgentId} onClick={() => setReview(true)}><ClipboardCheck size={18} />Review Sale</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {saleError && <p className="my-3 text-sm font-semibold text-amber-800" role="status">{saleError}</p>}
      {review && <Drawer title="Review Sale" onClose={() => setReview(false)}>
        <h2 className="customer-name mb-3 uppercase">{selectedCustomer.name}</h2>
        {exceedsCredit(selectedCustomer, ledgerEntries, total - initialPaid) && <p role="alert" className="mb-3 border-l-4 border-amber-500 bg-amber-50 p-3 font-semibold text-amber-900">Credit Limit Exceeded</p>}
        <Info label="Trust Receipt No." value={trustReceipt || "Not provided"} />
        <Info label="Sale Date" value={shortDate(saleDate)} />
        {summaryGroups.map((group) => <div key={group.id} className="my-4 border-t border-slate-200 pt-4">
          <p className="font-bold">{group.trip?.plant} / {group.trip && shortDate(group.trip.date)}</p>
          {group.lines.map((line, i) => <div key={i} className="mt-3 flex flex-wrap justify-between gap-2 text-sm"><span>{productLabel(line.product, line.sizeCode, line.classType, line.sizeCodeLabel, line.classTypeLabel)} / {kg(line.qty)} x {currency(line.price)}</span><strong>{currency(money(Number(line.qty) * Number(line.price)))}</strong></div>)}
          <Button variant="ghost" className="mt-2" onClick={() => setReview(false)}>Edit Products</Button>
        </div>)}
        <p className="my-4 text-2xl font-bold">Total: {currency(total)}</p>
        <section className="report-section mb-5"><h3 className="mb-3 font-bold">Payment at Sale</h3>
          {!salePayment.enabled ? <><p className="mb-3 text-slate-500">No Payment Yet</p><Button variant="secondary" onClick={() => setSalePayment({ ...salePayment, enabled: true })}><Plus size={17} />Add Payment</Button></> : <>
            <div className="grid gap-3 sm:grid-cols-2"><Field label="Amount Paid"><MoneyInput value={salePayment.amount} onChange={(e) => setSalePayment({ ...salePayment, amount: e.target.value })} /></Field>
              <Field label="Payment Method"><select className={inputClass()} value={salePayment.method} onChange={(e) => setSalePayment({ ...salePayment, method: e.target.value, reference: "", bank: "" })}>{paymentMethods.map((method) => <option key={method}>{method}</option>)}</select></Field>
              <Field label={salePayment.method === "Cash" ? "Reference Number (Optional)" : "Reference Number"}><input className={inputClass()} value={salePayment.reference} onChange={(e) => setSalePayment({ ...salePayment, reference: e.target.value })} /></Field>
              {salePayment.method === "Bank Deposit" && <Field label="Bank (Optional)"><input className={inputClass()} value={salePayment.bank} onChange={(e) => setSalePayment({ ...salePayment, bank: e.target.value })} /></Field>}
              <Field label="Notes / Description (Optional)"><input className={inputClass()} value={salePayment.notes || ""} onChange={(e) => setSalePayment({ ...salePayment, notes: e.target.value })} placeholder="Branch or payment description" /></Field>
            </div><Button className="mt-3" variant="ghost" onClick={() => setSalePayment(emptySalePayment())}><X size={17} />Remove Payment</Button>
          </>}
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><StatMini label="Payment" value={currency(Number.isFinite(initialPaid) ? initialPaid : 0)} /><StatMini label="Remaining Balance" value={currency(Math.max(0, total - (Number.isFinite(initialPaid) ? initialPaid : 0)))} /></div>
          {paymentError ? <p role="alert" className="mt-3 font-semibold text-rose-700">{paymentError}</p> : <div className="mt-3"><Badge tone={initialPaid >= total ? "green" : initialPaid > 0 ? "amber" : "slate"}>{paymentAtSaleStatus(total, initialPaid)}</Badge></div>}
        </section>
        <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setReview(false)}>Edit Sale</Button><Button disabled={busy || hasInsufficient || !!paymentError || !selectedAgentId || total <= 0} onClick={confirmOut}><ClipboardCheck size={18} />{busy ? "Confirming..." : "Confirm Sale"}</Button></div>
      </Drawer>}
      <section className="report-section"><h2 className="mb-3 text-lg font-bold">Sales</h2>
        <ResponsiveTable columns={["Date", "Sale", "Trust Receipt", "Customer", "Total", "Payment Status"]} rows={outs.slice().sort((a, b) => b.date.localeCompare(a.date)).map((out) => { const paymentStatus = out.status ? ({ paid: "Paid", partially_paid: "Partially Paid", unpaid: "Unpaid" }[out.status] || out.status) : salePaymentStatus(ledgerEntries, out.ref); return [shortDate(out.date), out.ref, out.trustReceipt || "-", getCustomerName(customers, out.customerId), currency(out.total), <Badge tone={paymentStatus === "Paid" ? "green" : "amber"}>{paymentStatus}</Badge>]; })} />
      </section>
    </>
  );
}

export function Customers({ initialCustomerId = "", customers, ledgerEntries, outs, collections, onSelect, canManage, onAdd, onEdit }) {
  const agents = useUsers();
  const [selectedId, setSelectedId] = useState(initialCustomerId);
  const [balanceFilter, setBalanceFilter] = useState("All");
  const [query, setQuery] = useState("");
  const selected = customers.find((customer) => customer.id === selectedId) || customers[0];
  const ledger = ledgerWithRunningBalance(ledgerEntries, selected?.id);
  const totalPurchases = ledger.reduce((sum, entry) => sum + entry.charge, 0);
  const totalPayments = ledger.reduce((sum, entry) => sum + entry.payment, 0);
  return (
    <>
      <SectionHeader title="Ledger" action={<div className="flex flex-wrap items-end gap-3"><Field label="Customers"><select className={inputClass()} value={balanceFilter} onChange={(e) => setBalanceFilter(e.target.value)}>{["All", "With Balance", "Paid"].map((value) => <option key={value}>{value}</option>)}</select></Field>{canManage && <Button onClick={onAdd}><Plus size={17} />Add Customer</Button>}</div>} />
      <div className="mb-4"><CustomerSearch value={query} onChange={setQuery} /></div>
      {!customers.length && <p className="mb-4 text-slate-500">No customers yet.</p>}
      <div className="grid gap-5 xl:grid-cols-[330px_1fr]">
        <div className="space-y-2">
          {customers.filter((customer) => matchesCustomer(customer, query) && (balanceFilter === "All" || (balanceFilter === "With Balance" ? customerBalance(ledgerEntries, customer.id) > 0 : customerBalance(ledgerEntries, customer.id) <= 0))).map((customer) => (
            <button key={customer.id} className={`w-full rounded-lg border p-3 text-left ${selectedId === customer.id ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`} onClick={() => setSelectedId(customer.id)}>
              <p className="customer-name">{customer.name}</p>
              <p className="text-sm text-slate-500">{customer.type} - Salesman: {getAgentName(agents, customer.agentId)}</p>
              <p className={customerBalance(ledgerEntries, customer.id) > 0 ? "mt-2 text-base font-bold text-amber-800" : "mt-2 text-sm font-semibold text-emerald-700"}>Balance: {currency(customerBalance(ledgerEntries, customer.id))}</p>
            </button>
          ))}
        </div>
        {selected && <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="customer-name">{selected.name}</h2>
              <p className="text-sm text-slate-500">{selected.type} - Assigned Salesman: {getAgentName(agents, selected.agentId)}</p>
            </div>
            <div className="flex flex-wrap gap-2"><Badge tone={selected.active ? "green" : "slate"}>{selected.active ? "Active" : "Inactive"}</Badge>{canManage && <Button variant="secondary" onClick={() => onEdit(selected)}>Edit Customer</Button>}</div>
          </div>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            <StatMini label="Credit Limit" value={selected.creditLimit === null || selected.creditLimit === "" ? "Not set" : currency(selected.creditLimit)} />
            <StatMini label="Outstanding Balance" value={currency(customerBalance(ledgerEntries, selected.id))} />
            <StatMini label="Total Purchases" value={currency(totalPurchases)} />
            <StatMini label="Total Payments" value={currency(totalPayments)} />
          </div>
          <div className="customer-contact mb-4 grid gap-3 2xl:grid-cols-2"><Info label="Contact" value={selected.contactPerson || "-"} /><Info label="Mobile" value={selected.mobile || "-"} /><Info label="Address" value={selected.address || "-"} /><Info label="Payment Type" value={selected.paymentType} /><Info label="Available Credit" value={availableCredit(selected, ledgerEntries) === null ? "Not set" : currency(availableCredit(selected, ledgerEntries))} /><Info label="Payment Days" value={selected.paymentDays === "" ? "Not set" : selected.paymentDays ?? "Not set"} /></div>
          {!ledger.length && <p className="mb-4 text-slate-500">No Transactions Yet</p>}
          <ResponsiveTable
            columns={["Date", "Salesman", "Trust Receipt", "Transaction", "Charge", "Payment", "Balance"]}
            rows={ledger.map((entry) => [
              shortDate(entry.date).replace(", 2026", ""),
              getAgentName(agents, entry.agentId),
              entry.trustReceipt || "-",
              <button className="font-bold text-[#146ef5]" onClick={() => entry.type === "OUT" ? onSelect({ type: "out", out: outs.find((out) => out.ref === entry.ref) }) : onSelect({ type: "payment", payment: { ...entry, collection: collections.find((collection) => collection.ref === entry.ref) } })}>{entry.ref} / {entry.type === "OUT" ? <>Sale <Badge tone={salePaymentStatus(ledgerEntries, entry.ref) === "Paid" ? "green" : "amber"}>{salePaymentStatus(ledgerEntries, entry.ref)}</Badge></> : entry.description}</button>,
              entry.charge ? currency(entry.charge) : "-",
              entry.payment ? currency(entry.payment) : "-",
              currency(entry.balance),
            ])}
          />
          <section className="report-section"><h3 className="mb-3 font-bold">Pricing</h3><ResponsiveTable columns={["Product", "Default Selling Price/kg", "Customer Selling Price/kg"]} rows={Object.entries(selected.pricing).map(([product, price]) => [product, currency(generalPrice[product] || 0), currency(price)])} /></section>
        </div>}
      </div>
    </>
  );
}

export function Collections({ initialCustomerId = "", customers, ledgerEntries, setLedgerEntries, collections, setCollections, expenses, setExpenses, setDiscrepancies, addAudit, pushToast, registerPostDcrChange, users: providedUsers, currentDate = today, initialSalesmanId = "", canSelectSalesman = true, allowManualAllocation = true, onRecordPayment, onRecordExpense, busy = false }) {
  const contextUsers = useUsers();
  const agents = providedUsers || contextUsers;
  const firstAgent = initialSalesmanId || agents.find((agent) => agent.active && agent.role === "Agent")?.id || "";
  const [collection, setCollection] = useState({ agentId: firstAgent, customerId: customers.some((c) => c.id === initialCustomerId) ? initialCustomerId : customers[0]?.id || "", amount: "", method: "Cash", date: currentDate, reference: "", bank: "", notes: "", manual: false, allocations: [] });
  const [expense, setExpense] = useState({ agentId: firstAgent, date: currentDate, category: "Fuel", amount: "", source: "Cash Collection", description: "", status: "Approved" });
  const autoAllocations = allocateOldestFirst(ledgerEntries, collection.customerId, collection.amount, collection.date);
  const allocations = collection.manual ? collection.allocations.filter((item) => Number(item.amount) > 0) : autoAllocations;
  const allocationTotal = allocations.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const paymentError = validatePayment(collection, ledgerEntries, allocations);
  const collectionInvalid = Boolean(paymentError) || !customers.some((c) => c.id === collection.customerId) || !agents.some((agent) => agent.id === collection.agentId && agent.active && agent.role === "Agent");

  async function recordCollection() {
    if (collectionInvalid) return;
    if (onRecordPayment) {
      const saved = await onRecordPayment({ ...collection, amount: Number(collection.amount), allocations });
      if (!saved) return;
      setCollection((current) => ({ ...current, amount: "", reference: "", notes: "", allocations: [] }));
      pushToast?.(`${saved?.payment_number || "Payment"} recorded and allocated`);
      return;
    }
    const ref = `PAY-${3000 + collections.length + 1}`;
    const destination = collection.method === "Cash" ? "Cash held by Salesman until remittance" : collection.method === "GCash" ? "Owner GCash" : "Owner Bank Account";
    const newCollection = { ...collection, id: `col-${Date.now()}`, ref, amount: Number(collection.amount), destination, allocations };
    setCollections((items) => [newCollection, ...items]);
    setLedgerEntries((items) => [
      ...items,
      { id: `led-${Date.now()}`, customerId: collection.customerId, date: collection.date, ref, description: `${collection.method} Payment`, notes: collection.notes.trim(), charge: 0, payment: Number(collection.amount), type: "Payment", allocations, reference: collection.reference.trim(), agentId: collection.agentId, method: collection.method },
    ]);
    if (collection.method === "Bank Deposit") {
      setDiscrepancies((items) => [
        {
          id: `disc-bank-${Date.now()}`,
          date: collection.date,
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
    addAudit(`Recorded ${currency(collection.amount)} ${collection.method.toLowerCase()} payment`, getAgentName(agents, collection.agentId));
    registerPostDcrChange(collection.agentId, collection.date, `${ref} payment was added after lock`);
    setCollection((current) => ({ ...current, amount: "", reference: "", notes: "", allocations: [] }));
    pushToast(`${ref} recorded and allocated`);
  }

  async function recordExpense() {
    if (!expense.date || !Number.isFinite(Number(expense.amount)) || Number(expense.amount) <= 0) return;
    const item = { ...expense, id: `exp-${Date.now()}`, amount: Number(expense.amount) };
    if (onRecordExpense) {
      const saved = await onRecordExpense(item);
      if (!saved) return;
      setExpense((current) => ({ ...current, amount: "", description: "" }));
      pushToast?.(`${item.category} expense recorded`);
      return;
    }
    setExpenses((items) => [item, ...items]);
    addAudit(`Recorded ${currency(item.amount)} ${item.category.toLowerCase()} expense`, getAgentName(agents, item.agentId));
    registerPostDcrChange(item.agentId, item.date, `${item.category} expense was added after lock`);
    setExpense((current) => ({ ...current, amount: "", description: "" }));
    pushToast(`${item.category} expense recorded`);
  }

  return (
    <>
      <SectionHeader title="Payments" />
      {!collections.length && <p className="mb-4 text-slate-500">No payments recorded yet.</p>}
      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-4 font-bold">Record Payment</h2>
          <h3 className="customer-name mb-4">{collection.customerId ? getCustomerName(customers, collection.customerId) : "Select Customer"}</h3>
          <div className="mb-4 grid gap-3 sm:grid-cols-2"><StatMini label="Current Balance" value={currency(customerBalance(ledgerEntries, collection.customerId))} /><StatMini label="Amount Applied" value={currency(allocationTotal)} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Salesman"><select disabled={!canSelectSalesman} className={inputClass()} value={collection.agentId} onChange={(e) => setCollection({ ...collection, agentId: e.target.value })}>{agents.filter((agent) => agent.active && agent.role === "Agent").map((agent) => <option value={agent.id} key={agent.id}>{agent.name}</option>)}</select></Field>
            <CustomerSelector label="Customer" customers={customers} value={collection.customerId} onChange={(id) => setCollection({ ...collection, customerId: id, allocations: [] })} />
            <Field label="Amount"><MoneyInput className={inputClass()} value={collection.amount} onChange={(e) => setCollection({ ...collection, amount: e.target.value })} /></Field>
            <Field label="Payment Method"><select className={inputClass()} value={collection.method} onChange={(e) => setCollection({ ...collection, method: e.target.value })}>{paymentMethods.map((method) => <option key={method}>{method}</option>)}</select></Field>
            <Field label="Date"><input className={inputClass()} type="date" value={collection.date} onInput={(e) => setCollection({ ...collection, date: e.target.value })} /></Field>
            {collection.method === "GCash" && <Field label="GCash Reference Number"><input className={inputClass()} value={collection.reference} onChange={(e) => setCollection({ ...collection, reference: e.target.value })} /></Field>}
            {collection.method === "Bank Deposit" && <Field label="Bank"><input className={inputClass()} value={collection.bank} onChange={(e) => setCollection({ ...collection, bank: e.target.value })} /></Field>}
            {collection.method === "Bank Deposit" && <Field label="Bank Reference Number"><input className={inputClass()} value={collection.reference} onChange={(e) => setCollection({ ...collection, reference: e.target.value })} /></Field>}
            <Field label="Notes / Description (Optional)"><input className={inputClass()} value={collection.notes} onChange={(e) => setCollection({ ...collection, notes: e.target.value })} placeholder="Branch or payment description" /></Field>
          </div>
          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-700">Destination: {collection.method === "Cash" ? "Cash held by Salesman until remittance" : collection.method === "GCash" ? "Owner GCash" : "Owner Bank Account"}</div>

          {allowManualAllocation && <div className="mt-4 flex items-center gap-3">
            <input id="manual" type="checkbox" checked={collection.manual} onChange={(e) => setCollection({ ...collection, manual: e.target.checked })} />
            <label htmlFor="manual" className="text-sm font-semibold">Allocate Manually</label>
          </div>}
          <AllocationPreview collection={collection} ledgerEntries={ledgerEntries} allocations={allocations} setCollection={setCollection} />
          {allocationTotal > Number(collection.amount || 0) && <p className="mt-3 text-sm font-bold text-rose-700">Manual allocation cannot exceed the payment amount.</p>}
          {paymentError && collection.amount !== "" && <p role="alert" className="mt-3 text-sm font-semibold text-rose-700">{paymentError}</p>}
          <Button className="mt-4 w-full" disabled={busy || collectionInvalid} onClick={recordCollection}><Banknote size={18} />{busy ? "Recording..." : "Record Payment"}</Button>
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-4 font-bold">+ Record Expense</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Salesman"><select disabled={!canSelectSalesman} className={inputClass()} value={expense.agentId} onChange={(e) => setExpense({ ...expense, agentId: e.target.value })}>{agents.filter((agent) => agent.active && agent.role === "Agent").map((agent) => <option value={agent.id} key={agent.id}>{agent.name}</option>)}</select></Field>
              <Field label="Expense Date"><input className={inputClass()} type="date" value={expense.date} onInput={(e) => setExpense({ ...expense, date: e.target.value })} /></Field>
              <Field label="Approval"><select className={inputClass()} value={expense.status} onChange={(e) => setExpense({ ...expense, status: e.target.value })}><option>Approved</option><option>Pending</option></select></Field>
              <Field label="Category"><select className={inputClass()} value={expense.category} onChange={(e) => setExpense({ ...expense, category: e.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></Field>
              <Field label="Amount"><MoneyInput className={inputClass()} value={expense.amount} onChange={(e) => setExpense({ ...expense, amount: e.target.value })} /></Field>
              <Field label="Payment Source"><select className={inputClass()} value={expense.source} onChange={(e) => setExpense({ ...expense, source: e.target.value })}>{["Cash Collection", "Personal Cash", "Other"].map((source) => <option key={source}>{source}</option>)}</select></Field>
            </div>
            <Field label="Description"><textarea className={`${inputClass()} min-h-20 py-3`} value={expense.description} onChange={(e) => setExpense({ ...expense, description: e.target.value })} /></Field>

            {expense.source === "Cash Collection" && <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900">Approved cash-paid expenses reduce expected physical cash remittance.</div>}
            <Button className="mt-4 w-full" disabled={busy || !expense.date || Number(expense.amount) <= 0 || !agents.some((agent) => agent.id === expense.agentId && agent.active && agent.role === "Agent")} onClick={recordExpense}><ReceiptText size={18} />{busy ? "Recording..." : "Record Expense"}</Button>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-3 font-bold">Recent Payments</h2>
            {collections.slice().sort((a, b) => b.date.localeCompare(a.date) || b.ref.localeCompare(a.ref)).slice(0, 6).map((item) => (
              <div key={item.id} className="flex items-center justify-between border-b border-slate-100 py-3 last:border-0">
                <div><p className="font-semibold">{getCustomerName(customers, item.customerId)}</p><p className="text-sm text-slate-500">{item.method} - {item.ref}{item.notes ? " / " + item.notes : ""}</p></div>
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
  const invoices = invoiceBalances(ledgerEntries, collection.customerId).filter((item) => item.date <= collection.date);
  return (
    <div className="mt-4 rounded-lg border border-slate-200 p-3">
      <p className="mb-2 font-bold">Payment Allocation</p>
      {!collection.manual && <p className="mb-2 text-sm text-slate-500">Automatically applies to oldest unpaid sale/invoice first.</p>}
      {collection.manual ? (
        <div className="space-y-2">
          {invoices.map((invoice) => {
            const current = collection.allocations.find((item) => item.invoiceRef === invoice.ref)?.amount || "";
            return (
              <div key={invoice.ref} className="grid grid-cols-[1fr_130px] gap-2">
                <span className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold">{invoice.ref} - {currency(invoice.balance)} outstanding</span>
                <MoneyInput aria-label={"Allocate to " + invoice.ref} className={inputClass()} value={current} onChange={(e) => {
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
          {!allocations.length && <p className="text-sm text-slate-500">Enter an amount to preview invoice allocation.</p>}
        </div>
      )}
      <p className="mt-2 text-sm font-semibold text-slate-700">Remaining Balance after payment: {currency(Math.max(0, customerBalance(ledgerEntries, collection.customerId) - Number(collection.amount || 0)))}</p>
    </div>
  );
}

export function Dcr({ outs, customers, collections, expenses, dcrs, setDcrs, setDiscrepancies, addAudit, pushToast, postDcrAlert, users: providedUsers, currentDate = today, initialSalesmanId = "", canSelectSalesman = true, onSubmitDcr, busy = false }) {
  const contextUsers = useUsers();
  const agents = providedUsers || contextUsers;
  const [agentId, setAgentId] = useState(initialSalesmanId || agents.find((agent) => agent.active && agent.role === "Agent")?.id || "");
  const [date, setDate] = useState(currentDate);
  const [actual, setActual] = useState(0);
  const [explanation, setExplanation] = useState("");
  const liveDcr = buildDcr({ collections, expenses, customers, agentId, date });
  const locked = dcrs.find((item) => item.agentId === agentId && item.date === date && item.status === "LOCKED");
  const dcr = locked?.snapshot || liveDcr;
  const actualRemittance = locked ? locked.actual : actual;
  const diff = locked ? locked.diff : money(Number(actual || 0) - dcr.expectedCashRemittance);
  const hasActivity = Boolean(locked) || dcr.collections.length > 0 || dcr.expenses.length > 0 || outs.some((out) => out.agentId === agentId && out.date === date);
  async function submitDcr() {
    if (!hasActivity || !agentId || locked || !date || !Number.isFinite(Number(actual)) || Number(actual) < 0 || (diff !== 0 && !explanation.trim())) return;
    if (onSubmitDcr) {
      const saved = await onSubmitDcr({ agentId, date, actual: Number(actual), explanation });
      if (!saved) return;
      pushToast?.(`DCR locked. Difference: ${currency(saved?.difference || 0)}.`);
      return;
    }
    const saved = { id: `dcr-${Date.now()}`, agentId, date, actual: Number(actual), diff, status: "LOCKED", explanation, snapshot: structuredClone(liveDcr) };
    setDcrs((items) => [saved, ...items.filter((item) => !(item.agentId === agentId && item.date === date))]);
    if (diff !== 0) {
      setDiscrepancies((items) => [
        { id: `disc-cash-${Date.now()}`, date, type: "Cash", title: diff < 0 ? "Cash Shortage" : "Cash Over", status: "Open", agentId, expected: dcr.expectedCashRemittance, actual: Number(actual), difference: diff, details: explanation },
        ...items,
      ]);
    }
    addAudit("Submitted DCR", getAgentName(agents, agentId));
    pushToast("DCR submitted and locked");
  }
  return (
    <>
      <SectionHeader title="Daily Cash Report" eyebrow="System-generated from Salesman transactions" action={<Button disabled={busy || !hasActivity || !agentId || Boolean(locked) || !date || actual === "" || Number(actual) < 0 || (diff !== 0 && !explanation.trim())} onClick={submitDcr}><FileClock size={18} />{busy ? "Submitting..." : "Submit DCR"}</Button>} />
      {!hasActivity && <p className="mb-4 text-slate-500">No transactions for this date.</p>}
      <div className="grid gap-5 xl:grid-cols-[330px_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="grid gap-3">
            <Field label="Salesman"><select disabled={!canSelectSalesman} className={inputClass()} value={agentId} onChange={(e) => setAgentId(e.target.value)}>{agents.filter((agent) => agent.role === "Agent" || dcrs.some((item) => item.agentId === agent.id)).map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></Field>
            <Field label="Date"><input className={inputClass()} type="date" value={date} onInput={(e) => setDate(e.target.value)} /></Field>
            <Button disabled={Boolean(locked) || !hasActivity} variant="secondary" onClick={() => setActual(Math.max(0, dcr.expectedCashRemittance))}><FileText size={18} />Generate DCR</Button>
          </div>
          {locked && <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-800">DCR submitted and locked</div>}
          {postDcrAlert && <div className="mt-4 rounded-lg bg-rose-50 p-3 text-sm font-bold text-rose-800">{postDcrAlert}</div>}
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-bold">Daily Cash Report</h2>
              <p className="text-sm text-slate-500">Salesman: {getAgentName(agents, agentId)} - Date: {shortDate(date)}</p>
            </div>
            <Badge tone={locked ? "green" : "blue"}>{locked ? "LOCKED" : "Draft"}</Badge>
          </div>
          <StatMini label="Sales Handled" value={currency(sum(outs.filter((out) => out.agentId === agentId && out.date === date), "total"))} />
          <h3 className="mb-2 mt-4 font-bold">Payments</h3>
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
            <Field label="Actual Cash Remitted"><MoneyInput disabled={Boolean(locked)} className={inputClass()} value={actualRemittance} onChange={(e) => setActual(e.target.value)} /></Field>
          </div>
          <div className={`mt-4 rounded-lg p-4 text-center text-lg font-bold ${diff === 0 ? "bg-emerald-50 text-emerald-700" : diff < 0 ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>
            {diff === 0 ? "Balanced ✓" : diff < 0 ? `SHORT ${currency(Math.abs(diff))}` : `OVER ${currency(diff)}`}
          </div>
          {diff !== 0 && <Field label="Explanation required"><textarea disabled={Boolean(locked)} className={`${inputClass()} mt-3 min-h-20 py-3`} value={locked ? locked.explanation : explanation} onChange={(e) => setExplanation(e.target.value)} /></Field>}
        </div>
      </div>
    </>
  );
}

export function Discrepancies({ discrepancies, setDiscrepancies, customers, users: providedUsers, onMark }) {
  const contextUsers = useUsers();
  const agents = providedUsers || contextUsers;
  const counts = ["Open", "Resolved", "Cash", "Inventory", "Payment Verification"].map((key) => ({
    key,
    count: key === "Open" || key === "Resolved" ? discrepancies.filter((item) => item.status === key).length : discrepancies.filter((item) => item.type === key).length,
  }));
  async function mark(id, status) {
    if (onMark) return onMark(id, status);
    setDiscrepancies((items) => items.map((item) => (item.id === id ? { ...item, status } : item)));
  }
  return (
    <>
      <SectionHeader title="Discrepancies" eyebrow="Owner review queue" />
      {!discrepancies.length && <p className="mb-4 text-slate-500">No discrepancies recorded.</p>}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{counts.map((item) => <StatCard key={item.key} label={item.key} value={item.count} icon={AlertTriangle} tone={item.key === "Open" ? "red" : item.key === "Resolved" ? "green" : "amber"} />)}</div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {discrepancies.map((item) => (
          <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div><p className="font-bold">{item.title}</p><p className="text-sm text-slate-500">{item.type}</p></div>
              <Badge tone={item.status === "Resolved" ? "green" : item.status === "Reviewed" ? "blue" : "red"}>{item.status}</Badge>
            </div>
            <div className="space-y-2 text-sm">
              {item.agentId && <Info label="Salesman" value={getAgentName(agents, item.agentId)} />}
              {item.severity && <Info label="Severity" value={item.severity} />}
              {item.createdAt && <Info label="Created" value={new Date(item.createdAt).toLocaleString("en-PH")} />}
              {item.relatedEntityType && <Info label="Related Transaction" value={`${item.relatedEntityType}${item.relatedEntityId ? ` / ${item.relatedEntityId}` : ""}`} />}
              {item.customerId && <Info label="Customer" value={getCustomerName(customers, item.customerId)} />}
              {item.plant && <Info label="Plant" value={item.plant} />}
              {item.tripDate && <Info label="Trip" value={shortDate(item.tripDate)} />}
              {item.product && <Info label="Product" value={item.product} />}
              {item.expected !== undefined && <Info label="Expected" value={item.type === "Inventory" ? kg(item.expected) : currency(item.expected)} />}
              {item.actual !== undefined && <Info label="Actual" value={item.type === "Inventory" ? kg(item.actual) : currency(item.actual)} />}
              {item.amount && <Info label="Amount" value={currency(item.amount)} />}
              {item.normalPrice && <Info label="Normal Price" value={`${currency(item.normalPrice)}/kg`} />}
              {item.agentPrice && <Info label="Salesman Price" value={`${currency(item.agentPrice)}/kg`} />}
              {item.acquisitionCost !== undefined && <Info label="Acquisition Cost" value={`${currency(item.acquisitionCost)}/kg`} />}
              {item.expectedGrossProfit !== undefined && <Info label="Expected Gross Profit" value={currency(item.expectedGrossProfit)} />}
              {item.actualGrossProfit !== undefined && <Info label="Actual Gross Profit" value={currency(item.actualGrossProfit)} />}
              {item.profitImpact !== undefined && <Info label="Profit Impact of Price Override" value={currency(item.profitImpact)} />}
              {item.difference !== undefined && <Info label="Difference" value={item.type === "Inventory" ? kg(item.difference) : item.type === "Price" ? `${currency(item.difference)}/kg` : currency(item.difference)} />}
              {item.details && <p className="rounded-lg bg-slate-50 p-2 font-semibold text-slate-700">{item.details}</p>}
            </div>
            {(setDiscrepancies || onMark) && <div className="mt-4 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => mark(item.id, "Reviewed")}>Reviewed</Button>
              <Button className="flex-1" onClick={() => mark(item.id, "Resolved")}>Resolved</Button>
            </div>}
          </div>
        ))}
      </div>
    </>
  );
}

export function OutDetail({ out, customers }) {
  if (!out) return <p className="text-sm text-slate-500">Transaction details are not available in this demo record.</p>;
  return (
    <div className="space-y-4">
      <Info label="Reference" value={out.ref} />
      <Info label="Trust Receipt No." value={out.trustReceipt || "-"} />
      <Info label="Customer" value={getCustomerName(customers, out.customerId)} />
      <Info label="Total" value={currency(out.total)} />
      {out.groups.map((group, index) => (
        <div key={`${group.tripId}-${index}`} className="rounded-lg border border-slate-200 p-3">
          <p className="font-bold">{group.plant} - {shortDate(group.tripDate)}</p>
          {group.lines.map((line) => (
            <div key={`${line.product}-${line.sizeCode}-${line.qty}`} className="mt-2 flex items-center justify-between text-sm">
              <span>{productLabel(line.product, line.sizeCode)} - {kg(line.qty)} x {currency(line.price)}</span>
              <strong>{currency(line.subtotal)}</strong>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function PaymentDetail({ payment }) {
  const agents = useUsers();
  return (
    <div className="space-y-3">
      <Info label="Reference" value={payment.ref} />
      <Info label="Salesman" value={getAgentName(agents, payment.agentId)} />
      <Info label="Payment Method" value={payment.method || payment.collection?.method || "Payment"} />
      <Info label="Amount" value={currency(payment.payment ?? payment.amount)} />
      <Info label="Reference Number" value={payment.reference || payment.collection?.reference || "-"} />
      <Info label="Notes / Description" value={payment.notes || payment.collection?.notes || "-"} />
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

function drawerTitle(drawer) {
  if (!drawer) return "";
  if (drawer.type === "inventory") return "Stock Item Detail";
  if (drawer.type === "out") return drawer.out?.ref || "Sale Detail";
  if (drawer.type === "payment") return drawer.payment?.ref || "Payment Detail";
  if (drawer.type === "report") return drawer.report || "Report";
  return "Detail";
}
