import { useState } from "react";
import { RefreshCw, Settings, Users } from "lucide-react";
import { Collections, Customers, Dcr, Discrepancies, InventoryDetail, OutDetail, OutOrders, PaymentDetail, Trips } from "../App";
import { useRemote } from "../hooks/useRemote";
import { createHostedStockIn, loadHostedPlants } from "../services/plantsParityService";
import { createHostedSalesmanTransfer, createHostedWarehouseTransfer, loadHostedInventoryOverview, loadHostedSalesmanInventory, loadHostedWarehouse } from "../services/inventoryParityService";
import { readableError } from "../services/errors";
import { createHostedSale, loadHostedSales } from "../services/salesParityService";
import { loadHostedFinanceParity, recordHostedExpense, recordHostedPayment, saveHostedCustomer, submitHostedDcr } from "../services/financeParityService";
import { saveCustomer } from "../services/operationsService";
import { deleteUnusedHostedCustomer, loadHostedAdministration, setHostedCustomerActive } from "../services/administrationService";
import { createSalesmanAccount, resetSalesmanPassword, setSalesmanAccountActive, updateSalesmanAccount } from "../services/accountService";
import { Button, Drawer, PlantContext, UserContext } from "./ui";
import { Collectibles } from "./Reporting";
import { LivePlantManagement } from "./LivePlantManagement";
import { SalesmanInventory, Warehouse } from "./InventoryFlow";
import { InventoryOverview } from "./InventoryOverview";
import { CustomerEditor } from "./CustomerManagement";
import { SalesmanAccounts } from "./SalesmanAccounts";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());

function RemoteState({ error, loading, onRefresh }) {
  if (loading) return <p className="py-12 text-center text-slate-500">Loading hosted records...</p>;
  if (!error) return null;
  return <p role="alert" className="border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-800">{error} <button type="button" className="underline" onClick={onRefresh}>Try again</button></p>;
}

export function HostedPlantsScreen({ organizationId, role, onChanged }) {
  const [epoch, setEpoch] = useState(0);
  const [manage, setManage] = useState(false);
  const [notice, setNotice] = useState("");
  const remote = useRemote(() => loadHostedPlants(organizationId), `${organizationId}-${epoch}`);
  const refresh = () => { setEpoch((value) => value + 1); onChanged?.(); };
  if (role !== "owner_admin") return <RemoteState error="Stock In and Plant configuration are available only to the Owner / Admin." />;
  if (manage) return <LivePlantManagement organizationId={organizationId} role={role} onBack={() => { setManage(false); refresh(); }} />;
  if (!remote.data) return <RemoteState loading={remote.loading} error={remote.error} onRefresh={remote.refresh} />;
  const { plantConfigs, trips } = remote.data;
  return <PlantContext.Provider value={plantConfigs}>
    {role === "owner_admin" && <div className="mb-4 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => setManage(true)}><Settings size={17} />Manage Plants</Button><Button variant="secondary" aria-label="Refresh Plants" title="Refresh Plants" onClick={remote.refresh}><RefreshCw size={17} /></Button></div>}
    {remote.error && <RemoteState error={remote.error} onRefresh={remote.refresh} />}
    {notice && <p className="mb-4 border border-emerald-200 bg-emerald-50 p-3 font-semibold text-emerald-800">{notice}</p>}
    <Trips
      plantConfigs={plantConfigs}
      trips={trips}
      setTrips={() => {}}
      onStockIn={async (trip) => {
        const saved = await createHostedStockIn(organizationId, trip);
        setNotice(`${saved.trip_number} added to Warehouse.`);
        refresh();
        return saved;
      }}
      currentDate={today()}
      pushToast={setNotice}
    />
  </PlantContext.Provider>;
}

export function HostedWarehouseScreen({ organizationId, onChanged }) {
  const [epoch, setEpoch] = useState(0);
  const [notice, setNotice] = useState("");
  const [detail, setDetail] = useState(null);
  const remote = useRemote(() => loadHostedWarehouse(organizationId), `${organizationId}-${epoch}`);
  const refresh = () => { setEpoch((value) => value + 1); onChanged?.(); };
  if (!remote.data) return <RemoteState loading={remote.loading} error={remote.error} onRefresh={remote.refresh} />;
  return <>
    {remote.error && <RemoteState error={remote.error} onRefresh={remote.refresh} />}
    {notice && <p className="mb-4 border border-emerald-200 bg-emerald-50 p-3 font-semibold text-emerald-800">{notice}</p>}
    <Warehouse
      hostedRows={remote.data.rows}
      hostedTotals={remote.data.totals}
      receivingTransfers={remote.data.receivingTransfers}
      users={remote.data.users}
      onOpen={setDetail}
      currentDate={today()}
      onTransfer={async (values) => {
        const saved = await createHostedWarehouseTransfer(organizationId, values);
        setNotice(`${saved.receipt_number} created.`);
        refresh();
        return saved;
      }}
      pushToast={setNotice}
    />
    {detail && <Drawer title="Inventory Detail" onClose={() => setDetail(null)}><InventoryDetail row={detail} /></Drawer>}
  </>;
}

export function HostedCompanyInventoryScreen({ organizationId, role, onStockIn }) {
  const [detail, setDetail] = useState(null);
  const remote = useRemote(() => loadHostedInventoryOverview(organizationId), organizationId);
  if (role !== "owner_admin") return <RemoteState error="Company Inventory is available only to the Owner / Admin." />;
  if (!remote.data) return <RemoteState loading={remote.loading} error={remote.error} onRefresh={remote.refresh} />;
  return <>
    {remote.error && <RemoteState error={remote.error} onRefresh={remote.refresh} />}
    <InventoryOverview rows={remote.data} onSelect={setDetail} onStockIn={onStockIn} />
    {detail && <Drawer title="Inventory Movement History" onClose={() => setDetail(null)}><InventoryDetail row={detail} /></Drawer>}
  </>;
}

export function HostedInventoryScreen({ organizationId, role, userId, onChanged, onWarehouse, showTransferActions = true, showReceipts = true, transferMode = false }) {
  const [epoch, setEpoch] = useState(0);
  const [notice, setNotice] = useState("");
  const [detail, setDetail] = useState(null);
  const remote = useRemote(() => loadHostedSalesmanInventory(organizationId), `${organizationId}-${epoch}`);
  const refresh = () => { setEpoch((value) => value + 1); onChanged?.(); };
  if (!remote.data) return <RemoteState loading={remote.loading} error={remote.error} onRefresh={remote.refresh} />;
  const salesmen = remote.data.users.filter((person) => person.role === "Agent");
  const initialSalesmanId = role === "salesman" ? userId : salesmen[0]?.id || "";
  return <>
    {remote.error && <RemoteState error={remote.error} onRefresh={remote.refresh} />}
    {notice && <p className="mb-4 border border-emerald-200 bg-emerald-50 p-3 font-semibold text-emerald-800">{notice}</p>}
    <SalesmanInventory
      hostedRows={remote.data.rows}
      salesmanTransfers={remote.data.salesmanTransfers}
      users={remote.data.users}
      initialSalesmanId={initialSalesmanId}
      canSelectSalesman={role === "owner_admin"}
      currentDate={today()}
      onWarehouse={onWarehouse}
      onOpen={setDetail}
      onTransfer={async (values) => {
        const saved = await createHostedSalesmanTransfer(organizationId, values);
        setNotice(`${saved.receipt_number} created.`);
        refresh();
        return saved;
      }}
      pushToast={setNotice}
      showCost={role === "owner_admin"}
      showTransferActions={showTransferActions}
      showReceipts={showReceipts}
      title={transferMode ? "Transfers" : role === "salesman" ? "My Inventory" : "Inventory"}
      eyebrow={transferMode ? "Salesman to Salesman" : "Salesman Inventory"}
    />
    {detail && <Drawer title="Inventory Detail" onClose={() => setDetail(null)}><InventoryDetail row={detail} showCost={role !== "salesman"} /></Drawer>}
  </>;
}

export function HostedSalesScreen({ organizationId, role, userId, onChanged, onStockIn }) {
  const [epoch, setEpoch] = useState(0);
  const [notice, setNotice] = useState("");
  const [customerEditor, setCustomerEditor] = useState(null);
  const remote = useRemote(() => loadHostedSales(organizationId), `${organizationId}-${epoch}`);
  const refresh = () => { setEpoch((value) => value + 1); onChanged?.(); };
  if (!remote.data) return <RemoteState loading={remote.loading} error={remote.error} onRefresh={remote.refresh} />;
  const data = remote.data;
  return <UserContext.Provider value={data.users}>
    {remote.error && <RemoteState error={remote.error} onRefresh={remote.refresh} />}
    {notice && <p className={`mb-4 border p-3 font-semibold ${notice.startsWith("Unable") || notice.includes("duplicate") ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{notice}</p>}
    <OutOrders
      customers={data.customers}
      trips={data.trips}
      outs={data.outs}
      ledgerEntries={data.ledgerEntries}
      currentDate={today()}
      initialSalesmanId={role === "salesman" ? userId : ""}
      canSelectSalesman={role === "owner_admin"}
      requireTrustReceipt
      onQuickAdd={(initialName, onSelected) => setCustomerEditor({ initialName, onSelected })}
      getAvailable={(salesmanId, trip, item) => Number(item?.availableBySalesman?.[salesmanId] || 0)}
      onConfirmSale={async (order) => {
        try {
          const saved = await createHostedSale(organizationId, order);
          setNotice(`Sale ${saved.trust_receipt_number} confirmed successfully.`);
          refresh();
          return saved;
        } catch (reason) {
          const message = readableError(reason);
          setNotice(message);
          throw new Error(message);
        }
      }}
      onStockIn={onStockIn}
      pushToast={setNotice}
    />
    {customerEditor && <CustomerEditor
      quick
      initialName={customerEditor.initialName}
      customers={data.customers}
      productNames={[]}
      onExisting={(customer) => { customerEditor.onSelected(customer); setCustomerEditor(null); }}
      onClose={() => setCustomerEditor(null)}
      onSave={async (record) => {
        try {
          const saved = await saveCustomer(organizationId, {
            name: record.name,
            contactPerson: record.contactPerson,
            mobile: record.mobile,
            address: record.address,
            customerType: record.type?.toLowerCase().replaceAll(" ", "_") || "other",
            paymentType: ({ Cash: "cash", Credit: "credit", "Cash / Credit": "cash_credit" })[record.paymentType] || "cash",
            creditLimit: record.creditLimit,
            paymentTerms: record.paymentDays,
            active: true,
          });
          const normalized = { ...record, id: saved.id, active: true };
          customerEditor.onSelected(normalized);
          setCustomerEditor(null);
          setNotice("Customer added and selected.");
          refresh();
        } catch (reason) {
          setNotice(readableError(reason));
        }
      }}
    />}
  </UserContext.Provider>;
}

export function HostedFinanceScreen({ organizationId, role, userId, view, initialCustomerId = "", onChanged, onNavigate }) {
  const [epoch, setEpoch] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState(null);
  const [customerEditor, setCustomerEditor] = useState(null);
  const remote = useRemote(() => loadHostedFinanceParity(organizationId), `${organizationId}-${epoch}`);
  const refresh = () => { setEpoch((value) => value + 1); onChanged?.(); };
  const run = async (action, success) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const saved = await action();
      setNotice(typeof success === "function" ? success(saved) : success);
      refresh();
      return saved;
    } catch (reason) {
      setError(readableError(reason));
      return null;
    } finally {
      setBusy(false);
    }
  };
  if (!remote.data) return <RemoteState loading={remote.loading} error={remote.error} onRefresh={remote.refresh} />;
  const data = remote.data;
  const firstSalesman = data.users.find((person) => person.active && person.role === "Agent")?.id || "";
  const selectedSalesman = role === "salesman" ? userId : firstSalesman;
  const canManageCustomers = role === "owner_admin";
  const feedback = <>{remote.error && <RemoteState error={remote.error} onRefresh={remote.refresh} />}{error && <p role="alert" className="mb-4 border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-800">{error}</p>}{notice && <p role="status" className="mb-4 border border-emerald-200 bg-emerald-50 p-3 font-semibold text-emerald-800">{notice}</p>}</>;
  const baseState = { ...data, trips: [], inventoryRows: [], receivingTransfers: [], salesmanTransfers: [], movements: [], attendance: [], payroll: [], trucks: [] };

  if (view === "collectibles") return <UserContext.Provider value={data.users}>{feedback}<Collectibles state={baseState} onPayment={(customerId) => onNavigate("payments", customerId)} onLedger={(customerId) => onNavigate("ledger", customerId)} /></UserContext.Provider>;

  if (view === "ledger") return <UserContext.Provider value={data.users}>
    {feedback}
    <Customers
      key={initialCustomerId || "ledger"}
      initialCustomerId={initialCustomerId}
      customers={data.customers}
      ledgerEntries={data.ledgerEntries}
      outs={data.outs}
      collections={data.collections}
      onSelect={setDetail}
      canManage={canManageCustomers}
      onAdd={() => setCustomerEditor({})}
      onEdit={(customer) => setCustomerEditor({ customer })}
    />
    {detail && <Drawer title={detail.type === "out" ? "Sale Detail" : "Payment Detail"} onClose={() => setDetail(null)}>{detail.type === "out" ? <OutDetail out={detail.out} customers={data.customers} /> : <PaymentDetail payment={detail.payment} />}</Drawer>}
    {customerEditor && <CustomerEditor
      customer={customerEditor.customer}
      customers={data.customers}
      productNames={data.productNames}
      onExisting={(customer) => setCustomerEditor({ customer })}
      onClose={() => setCustomerEditor(null)}
      onSave={async (record) => {
        const saved = await run(() => saveHostedCustomer(organizationId, record), "Customer saved.");
        if (saved) setCustomerEditor(null);
      }}
    />}
  </UserContext.Provider>;

  if (view === "dcr") return <UserContext.Provider value={data.users}>
    {feedback}
    <Dcr
      outs={data.outs}
      customers={data.customers}
      collections={data.collections}
      expenses={data.expenses}
      dcrs={data.dcrs}
      users={data.users}
      currentDate={today()}
      initialSalesmanId={selectedSalesman}
      canSelectSalesman={role !== "salesman"}
      busy={busy}
      postDcrAlert={data.discrepancies.find((item) => item.backendType === "post_dcr_adjustment" && item.status !== "Resolved")?.details || ""}
      pushToast={setNotice}
      onSubmitDcr={(values) => run(() => submitHostedDcr(organizationId, values), (saved) => `DCR locked. Difference: ${Number(saved?.difference || 0).toFixed(2)}.`)}
    />
  </UserContext.Provider>;

  if (view === "discrepancies") return <UserContext.Provider value={data.users}>
    {feedback}
    <Discrepancies discrepancies={data.discrepancies} customers={data.customers} users={data.users} />
    <p className="mt-4 text-sm text-slate-500">Review and resolution are displayed from the hosted backend. This schema currently exposes discrepancies read-only; status changes require a secured admin workflow.</p>
  </UserContext.Provider>;

  return <UserContext.Provider value={data.users}>
    {feedback}
    <Collections
      key={initialCustomerId || "payments"}
      initialCustomerId={initialCustomerId}
      customers={data.customers}
      ledgerEntries={data.ledgerEntries}
      collections={data.collections}
      expenses={data.expenses}
      users={data.users}
      currentDate={today()}
      initialSalesmanId={selectedSalesman}
      canSelectSalesman={role !== "salesman"}
      allowManualAllocation={false}
      showExpense={role !== "salesman"}
      busy={busy}
      pushToast={setNotice}
      onRecordPayment={(values) => run(() => recordHostedPayment(organizationId, values), (saved) => `${saved?.payment_number || "Payment"} recorded and allocated.`)}
      onRecordExpense={(values) => run(() => recordHostedExpense(organizationId, values, userId), "Expense recorded.")}
    />
  </UserContext.Provider>;
}

export function HostedAdministration({ organizationId, role, onChanged, onNavigate }) {
  const [mode, setMode] = useState("users");
  const [epoch, setEpoch] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [customerEditor, setCustomerEditor] = useState(null);
  const remote = useRemote(() => loadHostedAdministration(organizationId), `${organizationId}-${epoch}`);
  const refresh = () => { setEpoch((value) => value + 1); onChanged?.(); };
  const run = async (action, success) => {
    setError(""); setNotice("");
    try {
      const saved = await action();
      setNotice(success);
      refresh();
      return saved;
    } catch (reason) {
      setError(readableError(reason));
      return null;
    }
  };
  if (mode === "plants") return <LivePlantManagement organizationId={organizationId} role={role} onBack={() => { setMode("users"); refresh(); }} />;
  if (!remote.data) return <RemoteState loading={remote.loading} error={remote.error} onRefresh={remote.refresh} />;
  const data = remote.data;
  const state = { ...data, attendance: [], payroll: [] };
  const feedback = <>{remote.error && <RemoteState error={remote.error} onRefresh={remote.refresh} />}{error && <p role="alert" className="mb-4 border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-800">{error}</p>}{notice && <p role="status" className="mb-4 border border-emerald-200 bg-emerald-50 p-3 font-semibold text-emerald-800">{notice}</p>}</>;

  if (mode === "customers") return <UserContext.Provider value={data.users}>
    {feedback}
    <CustomerManagement
      state={state}
      onBack={() => setMode("users")}
      onAdd={() => setCustomerEditor({})}
      onEdit={(customer) => setCustomerEditor({ customer })}
      onLedger={(customerId) => onNavigate("ledger", customerId)}
      onToggle={(customer) => run(() => setHostedCustomerActive(customer.id, !customer.active), `${customer.name} ${customer.active ? "deactivated" : "activated"}.`)}
      onDelete={(customer) => run(() => deleteUnusedHostedCustomer(customer.id), `${customer.name} deleted.`)}
    />
    {customerEditor && <CustomerEditor customer={customerEditor.customer} customers={data.customers} productNames={data.productNames} onExisting={(customer) => setCustomerEditor({ customer })} onClose={() => setCustomerEditor(null)} onSave={async (record) => { const saved = await run(() => saveHostedCustomer(organizationId, record), "Customer saved."); if (saved) setCustomerEditor(null); }} />}
  </UserContext.Provider>;

  return <UserContext.Provider value={data.users}>
    {feedback}
    <div className="mb-4 flex flex-wrap gap-3"><Button variant="secondary" onClick={() => setMode("plants")}><Settings size={17} />Manage Plants</Button><Button variant="secondary" onClick={() => setMode("customers")}><Users size={17} />Manage Customers</Button></div>
    <SalesmanAccounts
      users={data.users}
      onCreate={(values) => run(() => createSalesmanAccount(organizationId, values), "Salesman account created.")}
      onUpdate={(user, values) => run(() => updateSalesmanAccount(organizationId, { ...user, name: values.fullName, username: values.username }), "Salesman account updated.")}
      onToggle={(user) => run(() => setSalesmanAccountActive(organizationId, user.id, !user.active), `${user.name} ${user.active ? "deactivated" : "activated"}.`)}
      onReset={(user, values) => run(() => resetSalesmanPassword(organizationId, user.id, values), "Temporary password set. The Salesman must change it after signing in.")}
    />
  </UserContext.Provider>;
}
