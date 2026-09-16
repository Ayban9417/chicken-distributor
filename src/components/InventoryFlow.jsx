import { useMemo, useState } from "react";
import { ArrowRightLeft, ClipboardCheck, PackageCheck } from "lucide-react";
import { Badge, Button, Field, inputClass, MoneyInput, PlantName, ResponsiveTable, SectionHeader, StatCard, StatMini } from "./ui";
import { currency, kg, money, productLabel, shortDate, isWholeChicken } from "../utils/business";
import { companyStockTotals, getSalesmanAvailableQty, getWarehouseAvailableQty, nextReceipt, salesmanInventoryRows, warehouseRows } from "../utils/inventoryFlow";
import { compareInventoryProducts, compareInventoryTrips } from "../utils/inventory";
import { sum } from "../utils/operations";
import { demoToday } from "../data/demoData";

const stockName = (row) => productLabel(row.product, row.sizeCode, row.classType, row.sizeCodeLabel, row.classTypeLabel);
const activeSalesmen = (users) => users.filter((user) => user.active && user.role === "Agent");
const initialTransfer = () => ({ rowId: "", toSalesmanId: "", qty: "", bags: "", notes: "" });

function StockTable({ rows, warehouse, onTransfer, onOpen, showCost = true, showTransferActions = true }) {
  const actionColumns = showTransferActions ? ["Action"] : [];
  const columns = warehouse
    ? ["Product / Code / Class", "Bags", "Heads", "Original KG", "Transferred KG", "Warehouse KG", ...(showCost ? ["Cost/kg"] : []), "Status", ...actionColumns]
    : ["Product / Code / Class", "Bags", "Heads", "Assigned KG", "Sold KG", "Remaining KG", ...(showCost ? ["Cost/kg"] : []), "Status", ...actionColumns];
  return <ResponsiveTable columns={columns}
    rows={rows.map((row) => [
      <button className="text-left font-extrabold uppercase text-slate-950" onClick={() => onOpen?.(row)}>{stockName(row)}</button>,
      row.bags ?? "Not recorded", row.headCount ?? "Not recorded",
      warehouse ? kg(row.originalQty) : kg(row.assignedQty),
      warehouse ? kg(row.transferredQty) : kg(row.totalOut),
      ...(!warehouse ? [kg(row.remainingQty)] : []),
      ...(warehouse ? [kg(row.warehouseAvailable)] : []),
      ...(showCost ? [currency(row.costPerKg)] : []),
      <Badge tone={(warehouse ? row.warehouseAvailable : row.remainingQty) === 0 ? "red" : "green"}>{(warehouse ? row.warehouseAvailable : row.remainingQty) === 0 ? "SOLD OUT" : "AVAILABLE"}</Badge>,
      ...(showTransferActions ? [<Button variant="secondary" disabled={(warehouse ? row.warehouseAvailable : row.remainingQty) <= 0} onClick={() => onTransfer(row)}><ArrowRightLeft size={16} />Transfer</Button>] : []),
    ])} />;
}

function TripStock({ rows, warehouse, onTransfer, onOpen, showCost = true, showTransferActions = true }) {
  const trips = [...rows.reduce((map, row) => {
    const current = map.get(row.tripId) || { tripId: row.tripId, tripDate: row.tripDate, tripCode: row.tripCode, plant: row.plant, rows: [] };
    current.rows.push(row); map.set(row.tripId, current); return map;
  }, new Map()).values()].sort(compareInventoryTrips);
  return <div className="space-y-5">{trips.map((trip) => {
    const sorted = [...trip.rows].sort(compareInventoryProducts);
    const whole = sorted.filter(isWholeChicken); const byproducts = sorted.filter((row) => !isWholeChicken(row));
    const remainingKey = warehouse ? "warehouseAvailable" : "remainingQty";
    return <details key={trip.tripId} open className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <summary className="cursor-pointer"><span className="font-extrabold uppercase">{shortDate(trip.tripDate)} / {trip.tripCode}</span><span className="ml-2 text-sm text-slate-500">{kg(sum(sorted, remainingKey))} remaining</span></summary>
      {!!whole.length && <section className="mt-4"><h3 className="mb-3 text-lg font-extrabold uppercase">Whole Dressed Chicken</h3>
        <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatMini label="Total Original KG" value={kg(sum(whole, "originalQty"))} /><StatMini label="Total Sold" value={kg(sum(whole, "totalOut"))} />{warehouse && <StatMini label="Transferred to Salesmen" value={kg(sum(whole, "transferredQty"))} />}<StatMini label={warehouse ? "Warehouse Remaining" : "Salesman Remaining"} value={kg(sum(whole, remainingKey))} /></div>
        <StockTable rows={whole} warehouse={warehouse} onTransfer={onTransfer} onOpen={onOpen} showCost={showCost} showTransferActions={showTransferActions} /></section>}
      {!!byproducts.length && <section className="mt-5"><h3 className="mb-3 text-lg font-extrabold uppercase">By-products</h3><StockTable rows={byproducts} warehouse={warehouse} onTransfer={onTransfer} onOpen={onOpen} showCost={showCost} showTransferActions={showTransferActions} /></section>}
    </details>;
  })}</div>;
}

export function Warehouse({ inventoryRows = [], trips = [], movements = [], receivingTransfers = [], setReceivingTransfers, salesmanTransfers = [], users = [], addAudit, pushToast, onOpen, hostedRows, hostedTotals, onTransfer, currentDate = demoToday }) {
  const rows = useMemo(() => hostedRows || warehouseRows(inventoryRows, receivingTransfers), [hostedRows, inventoryRows, receivingTransfers]);
  const salesmen = activeSalesmen(users);
  const totals = hostedTotals || companyStockTotals(inventoryRows, receivingTransfers, salesmanTransfers, movements, salesmen.map((user) => user.id));
  const [transfer, setTransfer] = useState(initialTransfer);
  const [error, setError] = useState("");
  const row = rows.find((item) => item.id === transfer.rowId);
  function openTransfer(stock) { setTransfer({ ...initialTransfer(), rowId: stock.id, toSalesmanId: salesmen[0]?.id || "" }); setError(""); }
  const [busy, setBusy] = useState(false);
  async function confirm() {
    const qty = Number(transfer.qty); const bags = transfer.bags === "" ? null : Number(transfer.bags);
    if (!row || !transfer.toSalesmanId || !Number.isFinite(qty) || qty <= 0 || qty > row.warehouseAvailable) return setError("Enter a positive quantity within Warehouse Available KG.");
    if (bags !== null && (!Number.isInteger(bags) || bags < 0)) return setError("Bags must be a whole nonnegative number or left blank.");
    const receipt = nextReceipt("RR", receivingTransfers);
    const item = { id: crypto.randomUUID(), receipt, date: demoToday, at: new Date().toISOString(), from: "Warehouse", toSalesmanId: transfer.toSalesmanId,
      tripId: row.tripId, plant: row.plant, tripDate: row.tripDate, tripCode: row.tripCode, product: row.product, sizeCode: row.sizeCode || "", sizeCodeLabel: row.sizeCodeLabel || "", classType: row.classType || "", classTypeLabel: row.classTypeLabel || "",
      qty, bags, headCount: null, notes: transfer.notes.trim(), costPerKg: row.costPerKg };
    item.date = currentDate;
    setBusy(true);
    try {
      if (onTransfer) {
        const saved = await onTransfer({ ...transfer, row, date: currentDate, headCount: null });
        item.receipt = saved?.receipt_number || receipt;
      } else {
        setReceivingTransfers((items) => [item, ...items]);
      }
      addAudit?.(`Created ${item.receipt}: Warehouse to ${salesmen.find((user) => user.id === item.toSalesmanId)?.name}`, "Warehouse"); pushToast?.(item.receipt + " created"); setTransfer(initialTransfer());
    } catch (reason) {
      setError(reason?.message || "Unable to create Receiving Receipt.");
    } finally {
      setBusy(false);
    }
  }
  return <><SectionHeader title="WAREHOUSE" eyebrow="PLANTS > WAREHOUSE > SALESMAN INVENTORY" />
    <div className="grid gap-3 sm:grid-cols-3"><StatCard label="Warehouse Stock" value={kg(totals.warehouse)} icon={PackageCheck} /><StatCard label="Salesman Stock" value={kg(totals.assigned)} icon={ArrowRightLeft} tone="amber" /><StatCard label="Total Company Physical Stock" value={kg(totals.company)} icon={ClipboardCheck} tone="green" /></div>
    {transfer.rowId && <section className="report-section"><h2 className="mb-3 text-lg font-extrabold uppercase">Transfer to Salesman</h2><p className="mb-3 font-bold uppercase">{row && stockName(row)} / {row?.plant} / {shortDate(row?.tripDate)}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Salesman"><select className={inputClass()} value={transfer.toSalesmanId} onChange={(e) => setTransfer({ ...transfer, toSalesmanId: e.target.value })}>{salesmen.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></Field>
        <Field label="Quantity KG"><MoneyInput value={transfer.qty} onChange={(e) => setTransfer({ ...transfer, qty: e.target.value })} /></Field><Field label="Bags (Optional)"><input className={inputClass()} type="number" min="0" step="1" value={transfer.bags} onChange={(e) => setTransfer({ ...transfer, bags: e.target.value })} /></Field><Field label="Notes"><input className={inputClass()} value={transfer.notes} onChange={(e) => setTransfer({ ...transfer, notes: e.target.value })} /></Field></div>
      <p className="mt-2 text-sm font-semibold text-slate-600">Warehouse available: {kg(row?.warehouseAvailable)} / Cost basis: {currency(row?.costPerKg)}/kg</p>{error && <p role="alert" className="mt-2 font-semibold text-rose-700">{error}</p>}
      <div className="mt-3 flex gap-2"><Button disabled={busy} onClick={confirm}><ClipboardCheck size={17} />{busy ? "Creating..." : "Create Receiving Receipt"}</Button><Button variant="secondary" onClick={() => setTransfer(initialTransfer())}>Cancel</Button></div></section>}
    {!rows.length ? <p className="mt-5 text-slate-500">No warehouse stock available.</p> : [...new Set(rows.map((item) => item.plant))].map((plant) => <section key={plant} className="report-section"><h2 className="mb-4"><PlantName name={plant} /></h2><TripStock rows={rows.filter((item) => item.plant === plant)} warehouse onTransfer={openTransfer} onOpen={onOpen} /></section>)}
    <section className="report-section"><h2 className="mb-3 text-lg font-extrabold uppercase">Receiving Receipts</h2><ResponsiveTable columns={["Receipt", "Date", "Salesman", "Plant / Trip", "Product / Code / Class", "KG", "Bags", "Heads", "Cost/kg", "Notes"]} rows={receivingTransfers.map((item) => [item.receipt, shortDate(item.date), users.find((user) => user.id === item.toSalesmanId)?.name || "-", item.plant + " / " + item.tripCode, productLabel(item.product, item.sizeCode, item.classType, item.sizeCodeLabel, item.classTypeLabel), kg(item.qty), item.bags ?? "Not recorded", item.headCount ?? "Not recorded", currency(item.costPerKg), item.notes || "-"])} /></section>
  </>;
}

export function SalesmanInventory({ inventoryRows = [], receivingTransfers = [], salesmanTransfers = [], setSalesmanTransfers, movements = [], users = [], addAudit, pushToast, onOpen, onWarehouse, hostedRows, onTransfer, currentDate = demoToday, initialSalesmanId = "", canSelectSalesman = true, showCost = false, showTransferActions = true, showReceipts = true, title = "INVENTORY", eyebrow = "SALESMAN INVENTORY" }) {
  const salesmen = activeSalesmen(users); const [salesmanId, setSalesmanId] = useState(initialSalesmanId || salesmen[0]?.id || "");
  const rows = useMemo(() => hostedRows ? hostedRows.filter((item) => item.salesmanId === salesmanId) : salesmanInventoryRows(inventoryRows, receivingTransfers, salesmanTransfers, movements, salesmanId), [hostedRows, inventoryRows, receivingTransfers, salesmanTransfers, movements, salesmanId]);
  const [transfer, setTransfer] = useState(initialTransfer); const [error, setError] = useState(""); const row = rows.find((item) => item.id === transfer.rowId);
  function openTransfer(stock) { setTransfer({ ...initialTransfer(), rowId: stock.id, toSalesmanId: salesmen.find((user) => user.id !== salesmanId)?.id || "" }); setError(""); }
  const [busy, setBusy] = useState(false);
  async function confirm() {
    const qty = Number(transfer.qty); const bags = transfer.bags === "" ? null : Number(transfer.bags);
    if (!row || !transfer.toSalesmanId || transfer.toSalesmanId === salesmanId || !Number.isFinite(qty) || qty <= 0 || qty > row.remainingQty) return setError("Select another Salesman and enter a positive quantity within available inventory.");
    if (bags !== null && (!Number.isInteger(bags) || bags < 0)) return setError("Bags must be a whole nonnegative number or left blank.");
    const receipt = nextReceipt("TF", salesmanTransfers); const item = { id: crypto.randomUUID(), receipt, date: currentDate, at: new Date().toISOString(), fromSalesmanId: salesmanId, toSalesmanId: transfer.toSalesmanId,
      tripId: row.tripId, plant: row.plant, tripDate: row.tripDate, tripCode: row.tripCode, product: row.product, sizeCode: row.sizeCode || "", sizeCodeLabel: row.sizeCodeLabel || "", classType: row.classType || "", classTypeLabel: row.classTypeLabel || "", qty, bags, notes: transfer.notes.trim(), costPerKg: row.costPerKg };
    setBusy(true);
    try {
      if (onTransfer) {
        const saved = await onTransfer({ ...transfer, row, fromSalesmanId: salesmanId, date: currentDate, headCount: null });
        item.receipt = saved?.receipt_number || receipt;
      } else {
        setSalesmanTransfers((items) => [item, ...items]);
      }
      addAudit?.(`Created ${item.receipt}: ${salesmen.find((user) => user.id === salesmanId)?.name} to ${salesmen.find((user) => user.id === item.toSalesmanId)?.name}`, "Owner / Admin"); pushToast?.(item.receipt + " created"); setTransfer(initialTransfer());
    } catch (reason) {
      setError(reason?.message || "Unable to create Transfer Receipt.");
    } finally {
      setBusy(false);
    }
  }
  const visibleTransfers = salesmanTransfers.filter((item) => item.fromSalesmanId === salesmanId || item.toSalesmanId === salesmanId);
  return <><SectionHeader title={title} eyebrow={eyebrow} action={canSelectSalesman ? <Field label="Salesman"><select className={inputClass()} value={salesmanId} onChange={(e) => { setSalesmanId(e.target.value); setTransfer(initialTransfer()); }}>{salesmen.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></Field> : null} />
    <h2 className="mb-4 text-2xl font-extrabold uppercase text-slate-950">{salesmen.find((user) => user.id === salesmanId)?.name}</h2>
    {transfer.rowId && <section className="report-section"><h2 className="mb-3 text-lg font-extrabold uppercase">Transfer to Salesman</h2><p className="mb-3 font-bold uppercase">{row && stockName(row)}</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="To Salesman"><select className={inputClass()} value={transfer.toSalesmanId} onChange={(e) => setTransfer({ ...transfer, toSalesmanId: e.target.value })}>{salesmen.filter((user) => user.id !== salesmanId).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></Field><Field label="Quantity KG"><MoneyInput value={transfer.qty} onChange={(e) => setTransfer({ ...transfer, qty: e.target.value })} /></Field><Field label="Bags (Optional)"><input className={inputClass()} type="number" min="0" step="1" value={transfer.bags} onChange={(e) => setTransfer({ ...transfer, bags: e.target.value })} /></Field><Field label="Notes"><input className={inputClass()} value={transfer.notes} onChange={(e) => setTransfer({ ...transfer, notes: e.target.value })} /></Field></div>{error && <p role="alert" className="mt-2 font-semibold text-rose-700">{error}</p>}<div className="mt-3 flex gap-2"><Button disabled={busy} onClick={confirm}>{busy ? "Creating..." : "Create Transfer Receipt"}</Button><Button variant="secondary" onClick={() => setTransfer(initialTransfer())}>Cancel</Button></div></section>}
    {!rows.length ? <div className="rounded-lg border border-slate-200 bg-white p-5"><p className="text-slate-500">No inventory assigned to this Salesman yet.</p>{onWarehouse && <Button className="mt-3" onClick={onWarehouse}>Receive from Warehouse</Button>}</div> : [...new Set(rows.map((item) => item.plant))].map((plant) => <section key={plant} className="report-section"><h2 className="mb-4"><PlantName name={plant} /></h2><TripStock rows={rows.filter((item) => item.plant === plant)} warehouse={false} onTransfer={openTransfer} onOpen={onOpen} showCost={showCost} showTransferActions={showTransferActions} /></section>)}
    {showReceipts && <section className="report-section"><h2 className="mb-3 text-lg font-extrabold uppercase">Transfer Receipts</h2><ResponsiveTable columns={["Receipt", "Date", "From", "To", "Plant / Trip", "Product / Code / Class", "KG", "Bags", "Heads", "Notes"]} rows={visibleTransfers.map((item) => [item.receipt, shortDate(item.date), users.find((user) => user.id === item.fromSalesmanId)?.name || "-", users.find((user) => user.id === item.toSalesmanId)?.name || "-", item.plant + " / " + item.tripCode, productLabel(item.product, item.sizeCode, item.classType, item.sizeCodeLabel, item.classTypeLabel), kg(item.qty), item.bags ?? "Not recorded", item.headCount ?? "Not recorded", item.notes || "-"])} /></section>}
  </>;
}
