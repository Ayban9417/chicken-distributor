import { useEffect, useMemo, useState } from "react";
import { Banknote, ClipboardCheck, PackageCheck, Plus, RefreshCw, Save, Send, ShoppingCart } from "lucide-react";
import { Badge, Button, Field, inputClass, ResponsiveTable, SectionHeader, StatCard, StatMini } from "./ui";
import { currency, kg, shortDate } from "../utils/business";
import { useRemote } from "../hooks/useRemote";
import { readableError } from "../services/errors";
import {
  createSale, createStockTrip, loadCustomers, loadFinance, loadOperationsSummary, loadPeople,
  loadSalesmanStock, loadStockFormData, loadWarehouseStock, recordExpense, recordPayment,
  saveCustomer, submitDcr, transferSalesmanStock, transferWarehouseStock,
} from "../services/operationsService";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
const num = (value) => Number(value || 0);
const sum = (rows, key) => rows.reduce((total, row) => total + num(row[key]), 0);
const rowLabel = (row) => [row.plant_name, shortDate(row.trip_date), row.product_name, row.product_code || row.class_type].filter(Boolean).join(" / ");
const emptyLine = { lotId: "", quantity: "", price: "", bags: "", headCount: "" };

function Feedback({ error, notice }) {
  return <>{error && <p role="alert" className="mb-4 border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-800">{error}</p>}{notice && <p className="mb-4 border border-emerald-200 bg-emerald-50 p-3 font-semibold text-emerald-800">{notice}</p>}</>;
}

function Loading({ message = "Loading database records..." }) {
  return <p className="py-10 text-center text-slate-500">{message}</p>;
}

export function StockInScreen({ organizationId, onChanged }) {
  const remote = useRemote(() => loadStockFormData(organizationId), organizationId);
  const [form, setForm] = useState({ plantId: "", date: today(), reference: "", deliveryNote: "", notes: "", lines: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const links = (remote.data?.links || []).filter((link) => link.plant_id === form.plantId);
  const addLine = () => setForm({ ...form, lines: [...form.lines, { plantProductId: links[0]?.id || "", codeId: "", classTypeId: "", bags: "", headCount: "", quantity: "", acquisitionType: "purchased", cost: "" }] });
  function patchLine(index, patch) { setForm({ ...form, lines: form.lines.map((line, i) => i === index ? { ...line, ...patch } : line) }); }
  async function submit() {
    setError(""); setNotice("");
    if (!form.plantId || !form.lines.length) return setError("Select a Plant and add at least one Product.");
    for (const line of form.lines) {
      const link = links.find((item) => item.id === line.plantProductId);
      if (!link || num(line.quantity) <= 0) return setError("Every Product needs a positive KG quantity.");
      if (link.uses_size_codes && !line.codeId) return setError("Select a Code for each coded Product.");
      if (link.uses_class_types && !line.classTypeId) return setError("Select a Class Type where required.");
      if (line.acquisitionType === "purchased" && num(line.cost) <= 0) return setError("Purchased Products require a positive acquisition cost.");
    }
    setBusy(true);
    try {
      const result = await createStockTrip(organizationId, form);
      setNotice(`${result.trip_number} received. Warehouse stock was refreshed from the database.`);
      setForm({ plantId: "", date: today(), reference: "", deliveryNote: "", notes: "", lines: [] });
      onChanged();
    } catch (reason) { setError(readableError(reason)); } finally { setBusy(false); }
  }
  return <div><SectionHeader title="Stock In" eyebrow="Atomic Plant to Warehouse receipt" action={<Button variant="secondary" onClick={remote.refresh}><RefreshCw size={16} />Refresh Config</Button>} /><Feedback error={error || remote.error} notice={notice} />{remote.loading && !remote.data ? <Loading /> : <>
    <section className="report-section"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Field label="Plant"><select className={inputClass()} value={form.plantId} onChange={(e) => setForm({ ...form, plantId: e.target.value, lines: [] })}><option value="">Select Plant</option>{remote.data.plants.map((plant) => <option key={plant.id} value={plant.id}>{plant.name}</option>)}</select></Field>
      <Field label="Trip Date"><input type="date" className={inputClass()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
      <Field label="Reference"><input className={inputClass()} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
      <Field label="Delivery Note"><input className={inputClass()} value={form.deliveryNote} onChange={(e) => setForm({ ...form, deliveryNote: e.target.value })} /></Field>
    </div>
    {form.lines.map((line, index) => {
      const link = links.find((item) => item.id === line.plantProductId);
      return <fieldset key={index} className="mt-5 border-t border-slate-200 pt-4"><legend className="font-bold">Product {index + 1}</legend><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Product"><select className={inputClass()} value={line.plantProductId} onChange={(e) => patchLine(index, { plantProductId: e.target.value, codeId: "", classTypeId: "" })}><option value="">Select Product</option>{links.map((item) => <option key={item.id} value={item.id}>{item.product?.name}</option>)}</select></Field>
        {link?.uses_size_codes && <Field label="Code"><select className={inputClass()} value={line.codeId} onChange={(e) => patchLine(index, { codeId: e.target.value })}><option value="">Select Code</option>{link.codes.map((code) => <option key={code.id} value={code.id}>{code.code}{code.display_name ? " / " + code.display_name : ""}</option>)}</select></Field>}
        {link?.uses_class_types && <Field label="Class Type"><select className={inputClass()} value={line.classTypeId} onChange={(e) => patchLine(index, { classTypeId: e.target.value })}><option value="">Select Class</option>{link.classTypes.map((item) => <option key={item.id} value={item.id}>{item.class_type}</option>)}</select></Field>}
        {link?.uses_bags && <Field label="Bags"><input type="number" min="0" className={inputClass()} value={line.bags} onChange={(e) => patchLine(index, { bags: e.target.value })} /></Field>}
        {link?.uses_head_count && <Field label="Head Count"><input type="number" min="0" className={inputClass()} value={line.headCount} onChange={(e) => patchLine(index, { headCount: e.target.value })} /></Field>}
        <Field label="KG"><input type="number" min="0" step="0.001" className={inputClass()} value={line.quantity} onChange={(e) => patchLine(index, { quantity: e.target.value })} /></Field>
        <Field label="Acquisition"><select className={inputClass()} value={line.acquisitionType} onChange={(e) => patchLine(index, { acquisitionType: e.target.value, cost: e.target.value === "free_from_plant" ? "0" : line.cost })}><option value="purchased">Purchased</option>{link?.allows_free_from_plant && <option value="free_from_plant">Free from Plant</option>}</select></Field>
        <Field label="Cost / KG"><input type="number" min="0" step="0.01" disabled={line.acquisitionType === "free_from_plant"} className={inputClass()} value={line.cost} onChange={(e) => patchLine(index, { cost: e.target.value })} /></Field>
        <Button variant="ghost" onClick={() => setForm({ ...form, lines: form.lines.filter((_, i) => i !== index) })}>Remove</Button>
      </div></fieldset>;
    })}
    <div className="mt-4 flex flex-wrap gap-3"><Button variant="secondary" disabled={!form.plantId || !links.length} onClick={addLine}><Plus size={17} />Add Product</Button><Button onClick={submit} disabled={busy}><ClipboardCheck size={17} />{busy ? "Receiving..." : "Confirm Stock In"}</Button></div></section>
  </>}</div>;
}

export function WarehouseScreen({ organizationId, role, onChanged }) {
  const [epoch, setEpoch] = useState(0);
  const stock = useRemote(() => loadWarehouseStock(organizationId), epoch);
  const people = useRemote(() => loadPeople(organizationId), organizationId);
  const [form, setForm] = useState({ lotId: "", salesmanId: "", quantity: "", bags: "", headCount: "", date: today(), notes: "" });
  const [status, setStatus] = useState({ busy: false, error: "", notice: "" });
  const salesmen = (people.data || []).filter((item) => item.role === "salesman" && item.active);
  const selected = (stock.data || []).find((row) => row.inventory_lot_id === form.lotId);
  async function transfer() {
    setStatus({ busy: true, error: "", notice: "" });
    try {
      const result = await transferWarehouseStock(organizationId, { ...form, lines: [{ lotId: form.lotId, quantity: form.quantity, bags: form.bags, headCount: form.headCount }] });
      setStatus({ busy: false, error: "", notice: `${result.receipt_number} created.` }); setForm({ ...form, lotId: "", quantity: "", bags: "", headCount: "", notes: "" }); setEpoch((v) => v + 1); onChanged();
    } catch (reason) { setStatus({ busy: false, error: readableError(reason), notice: "" }); }
  }
  return <div><SectionHeader title="Warehouse" action={<Button variant="secondary" onClick={() => setEpoch((v) => v + 1)}><RefreshCw size={16} />Refresh</Button>} /><Feedback error={status.error || stock.error || people.error} notice={status.notice} />
    <div className="grid gap-3 sm:grid-cols-3"><StatCard label="Warehouse Stock" value={kg(sum(stock.data || [], "available_quantity_kg"))} icon={PackageCheck} /><StatCard label="Cost Value" value={currency(sum(stock.data || [], "inventory_cost_value"))} icon={Banknote} tone="green" /><StatCard label="Lots" value={(stock.data || []).length} icon={ClipboardCheck} tone="amber" /></div>
    {(role === "owner_admin" || role === "warehouse") && <section className="report-section mt-5"><h2 className="mb-4 text-lg font-bold">Warehouse to Salesman</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Field label="Stock Lot"><select className={inputClass()} value={form.lotId} onChange={(e) => setForm({ ...form, lotId: e.target.value })}><option value="">Select Lot</option>{(stock.data || []).filter((row) => num(row.available_quantity_kg) > 0).map((row) => <option key={row.inventory_lot_id} value={row.inventory_lot_id}>{rowLabel(row)} / {kg(row.available_quantity_kg)}</option>)}</select></Field>
      <Field label="Salesman"><select className={inputClass()} value={form.salesmanId} onChange={(e) => setForm({ ...form, salesmanId: e.target.value })}><option value="">Select Salesman</option>{salesmen.map((person) => <option key={person.user_id} value={person.user_id}>{person.full_name}</option>)}</select></Field>
      <Field label="KG"><input type="number" min="0" max={selected?.available_quantity_kg || undefined} step="0.001" className={inputClass()} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></Field>
      <Field label="Date"><input type="date" className={inputClass()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
    </div><p className="mt-3 text-sm font-semibold text-slate-600">Available: {kg(selected?.available_quantity_kg)} / Cost basis: {currency(selected?.cost_per_kg)}/kg</p><Button className="mt-4" disabled={status.busy || !form.lotId || !form.salesmanId || num(form.quantity) <= 0} onClick={transfer}><Send size={17} />{status.busy ? "Transferring..." : "Create Receiving Receipt"}</Button></section>}
    {stock.loading && !stock.data ? <Loading /> : <StockTable rows={stock.data || []} quantityKey="available_quantity_kg" />}</div>;
}

export function SalesmanInventoryScreen({ organizationId, role, userId, onChanged }) {
  const people = useRemote(() => loadPeople(organizationId), organizationId);
  const salesmen = (people.data || []).filter((item) => item.role === "salesman" && item.active);
  const [salesmanId, setSalesmanId] = useState(role === "salesman" ? userId : "");
  const [epoch, setEpoch] = useState(0);
  const stock = useRemote(() => loadSalesmanStock(organizationId, salesmanId || null), `${salesmanId}-${epoch}`);
  const [form, setForm] = useState({ lotId: "", toSalesmanId: "", quantity: "", date: today() });
  const [status, setStatus] = useState({ busy: false, error: "", notice: "" });
  async function transfer() {
    setStatus({ busy: true, error: "", notice: "" });
    try {
      const result = await transferSalesmanStock(organizationId, { fromSalesmanId: salesmanId, toSalesmanId: form.toSalesmanId, date: form.date, lines: [{ ...emptyLine, lotId: form.lotId, quantity: form.quantity }] });
      setStatus({ busy: false, error: "", notice: `${result.receipt_number} created.` }); setForm({ ...form, lotId: "", quantity: "" }); setEpoch((v) => v + 1); onChanged();
    } catch (reason) { setStatus({ busy: false, error: readableError(reason), notice: "" }); }
  }
  return <div><SectionHeader title="Salesman Inventory" action={role !== "salesman" && <Field label="Salesman"><select className={inputClass()} value={salesmanId} onChange={(e) => setSalesmanId(e.target.value)}><option value="">All Salesmen</option>{salesmen.map((person) => <option key={person.user_id} value={person.user_id}>{person.full_name}</option>)}</select></Field>} /><Feedback error={status.error || stock.error} notice={status.notice} />
    {(role === "owner_admin" || role === "salesman") && salesmanId && <section className="report-section"><h2 className="mb-4 text-lg font-bold">Salesman to Salesman Transfer</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Field label="Stock Lot"><select className={inputClass()} value={form.lotId} onChange={(e) => setForm({ ...form, lotId: e.target.value })}><option value="">Select Lot</option>{(stock.data || []).filter((row) => num(row.available_quantity_kg) > 0).map((row) => <option key={row.inventory_lot_id} value={row.inventory_lot_id}>{rowLabel(row)} / {kg(row.available_quantity_kg)}</option>)}</select></Field>
      <Field label="To Salesman"><select className={inputClass()} value={form.toSalesmanId} onChange={(e) => setForm({ ...form, toSalesmanId: e.target.value })}><option value="">Select Salesman</option>{salesmen.filter((person) => person.user_id !== salesmanId).map((person) => <option key={person.user_id} value={person.user_id}>{person.full_name}</option>)}</select></Field>
      <Field label="KG"><input type="number" min="0" step="0.001" className={inputClass()} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></Field>
      <Field label="Date"><input type="date" className={inputClass()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
    </div><Button className="mt-4" disabled={status.busy || !form.lotId || !form.toSalesmanId || num(form.quantity) <= 0} onClick={transfer}><Send size={17} />Create Transfer Receipt</Button></section>}
    {stock.loading && !stock.data ? <Loading /> : <StockTable rows={stock.data || []} quantityKey="available_quantity_kg" showSalesman />}</div>;
}

function StockTable({ rows, quantityKey, showSalesman = false }) {
  if (!rows.length) return <p className="report-section mt-5 text-center text-slate-500">No stock records are visible for this role and selection.</p>;
  return <section className="report-section mt-5"><ResponsiveTable columns={[showSalesman ? "Salesman / Plant" : "Plant", "Trip", "Product / Code / Class", "Available KG", "Cost / KG", "Cost Value", "Status"]} rows={rows.map((row) => [
    (showSalesman ? (row.salesman_name || "-") + " / " : "") + row.plant_name,
    `${shortDate(row.trip_date)} / ${row.trip_number}`,
    [row.product_name, row.product_code, row.class_type].filter(Boolean).join(" / "),
    kg(row[quantityKey]),
    currency(row.cost_per_kg),
    currency(row.inventory_cost_value),
    <Badge tone={num(row[quantityKey]) > 0 ? "green" : "slate"}>{num(row[quantityKey]) > 0 ? "Available" : "Sold Out"}</Badge>,
  ])} /></section>;
}

export function CustomersScreen({ organizationId, onChanged, selectMode = false, onSelect }) {
  const [epoch, setEpoch] = useState(0);
  const remote = useRemote(() => loadCustomers(organizationId), epoch);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState(null);
  const [status, setStatus] = useState({ busy: false, error: "", notice: "" });
  const rows = (remote.data || []).filter((item) => [item.name, item.contact_person, item.mobile].some((value) => String(value || "").toLowerCase().includes(query.toLowerCase())));
  async function save() {
    if (!draft.name?.trim()) return setStatus({ busy: false, error: "Customer Name is required.", notice: "" });
    setStatus({ busy: true, error: "", notice: "" });
    try {
      const saved = await saveCustomer(organizationId, draft);
      setStatus({ busy: false, error: "", notice: "Customer saved." }); setDraft(null); setEpoch((v) => v + 1); onChanged?.(); onSelect?.(saved);
    } catch (reason) { setStatus({ busy: false, error: readableError(reason), notice: "" }); }
  }
  return <div><SectionHeader title={selectMode ? "Quick Add Customer" : "Customers"} action={!draft && <Button onClick={() => setDraft({ name: "", contactPerson: "", mobile: "", address: "", customerType: "other", paymentType: "cash", creditLimit: "", paymentTerms: "", active: true })}><Plus size={17} />Add Customer</Button>} /><Feedback error={status.error || remote.error} notice={status.notice} />
    {draft ? <section className="report-section"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Field label="Customer Name"><input className={inputClass()} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
      <Field label="Contact Person"><input className={inputClass()} value={draft.contactPerson || ""} onChange={(e) => setDraft({ ...draft, contactPerson: e.target.value })} /></Field>
      <Field label="Mobile"><input className={inputClass()} value={draft.mobile || ""} onChange={(e) => setDraft({ ...draft, mobile: e.target.value })} /></Field>
      <Field label="Customer Type"><input className={inputClass()} value={draft.customerType || ""} onChange={(e) => setDraft({ ...draft, customerType: e.target.value })} /></Field>
      <Field label="Payment Type"><select className={inputClass()} value={draft.paymentType || "cash"} onChange={(e) => setDraft({ ...draft, paymentType: e.target.value })}><option value="cash">Cash</option><option value="credit">Credit</option><option value="cash_credit">Cash / Credit</option></select></Field>
      <Field label="Credit Limit"><input type="number" min="0" className={inputClass()} value={draft.creditLimit ?? ""} onChange={(e) => setDraft({ ...draft, creditLimit: e.target.value })} /></Field>
      <Field label="Payment Terms / Days"><input type="number" min="0" className={inputClass()} value={draft.paymentTerms ?? ""} onChange={(e) => setDraft({ ...draft, paymentTerms: e.target.value })} /></Field>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={draft.active !== false} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />Active</label>
    </div><div className="mt-4 flex gap-3"><Button onClick={save} disabled={status.busy}><Save size={17} />Save Customer</Button><Button variant="secondary" onClick={() => setDraft(null)}>Cancel</Button></div></section> : <>
      <Field label="Search"><input className={inputClass()} value={query} onChange={(e) => setQuery(e.target.value)} /></Field>
      {remote.loading && !remote.data ? <Loading /> : <section className="report-section mt-4"><ResponsiveTable columns={["Customer", "Contact", "Payment", "Credit Limit", "Status", "Action"]} rows={rows.map((item) => [item.name, item.contact_person || item.mobile || "-", item.payment_type.replace("_", " / "), item.credit_limit == null ? "Not set" : currency(item.credit_limit), <Badge tone={item.active ? "green" : "slate"}>{item.active ? "Active" : "Inactive"}</Badge>, <div className="flex gap-2">{onSelect && <Button onClick={() => onSelect(item)}>Select</Button>}<Button variant="secondary" onClick={() => setDraft({ id: item.id, name: item.name, contactPerson: item.contact_person || "", mobile: item.mobile || "", address: item.address || "", customerType: item.customer_type, paymentType: item.payment_type, creditLimit: item.credit_limit ?? "", paymentTerms: item.payment_terms_days ?? "", active: item.active })}>Edit</Button></div>])} /></section>}
    </>}</div>;
}

export function SalesScreen({ organizationId, role, userId, onChanged }) {
  const [epoch, setEpoch] = useState(0);
  const customers = useRemote(() => loadCustomers(organizationId), epoch);
  const people = useRemote(() => loadPeople(organizationId), organizationId);
  const salesmen = (people.data || []).filter((item) => item.role === "salesman" && item.active);
  const [form, setForm] = useState({ customerId: "", salesmanId: role === "salesman" ? userId : "", date: today(), trustReceipt: "", lines: [{ ...emptyLine }], deductions: "", notes: "", paymentAmount: "", paymentMethod: "cash", paymentReference: "", paymentNotes: "" });
  const stock = useRemote(() => form.salesmanId ? loadSalesmanStock(organizationId, form.salesmanId) : Promise.resolve([]), `${form.salesmanId}-${epoch}`);
  const [status, setStatus] = useState({ busy: false, error: "", notice: "" });
  const total = form.lines.reduce((value, line) => value + num(line.quantity) * num(line.price), 0) - num(form.deductions);
  function patchLine(index, patch) { setForm({ ...form, lines: form.lines.map((line, i) => i === index ? { ...line, ...patch } : line) }); }
  async function submit() {
    setStatus({ busy: true, error: "", notice: "" });
    try {
      const result = await createSale(organizationId, form);
      setStatus({ busy: false, error: "", notice: `Sale ${result.trust_receipt_number} created with status ${String(result.status).replace("_", " ")}.` });
      setForm({ ...form, customerId: "", trustReceipt: "", lines: [{ ...emptyLine }], deductions: "", notes: "", paymentAmount: "", paymentReference: "", paymentNotes: "" }); setEpoch((v) => v + 1); onChanged();
    } catch (reason) { setStatus({ busy: false, error: readableError(reason), notice: "" }); }
  }
  return <div><SectionHeader title="New Sale" eyebrow="Exact lot deduction through atomic RPC" /><Feedback error={status.error || customers.error || people.error || stock.error} notice={status.notice} /><section className="report-section">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Field label="Customer"><select className={inputClass()} value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}><option value="">Select Customer</option>{(customers.data || []).filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="Salesman"><select disabled={role === "salesman"} className={inputClass()} value={form.salesmanId} onChange={(e) => setForm({ ...form, salesmanId: e.target.value, lines: [{ ...emptyLine }] })}><option value="">Select Salesman</option>{salesmen.map((item) => <option key={item.user_id} value={item.user_id}>{item.full_name}</option>)}</select></Field>
      <Field label="Sale Date"><input type="date" className={inputClass()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
      <Field label="Trust Receipt"><input className={inputClass()} value={form.trustReceipt} onChange={(e) => setForm({ ...form, trustReceipt: e.target.value })} /></Field>
    </div>
    {form.lines.map((line, index) => <div key={index} className="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2 xl:grid-cols-4">
      <Field label="Plant / Trip / Product"><select className={inputClass()} value={line.lotId} onChange={(e) => patchLine(index, { lotId: e.target.value })}><option value="">Select Stock</option>{(stock.data || []).filter((row) => num(row.available_quantity_kg) > 0).map((row) => <option key={row.inventory_lot_id} value={row.inventory_lot_id}>{rowLabel(row)} / {kg(row.available_quantity_kg)}</option>)}</select></Field>
      <Field label="Quantity / KG"><input type="number" min="0" step="0.001" className={inputClass()} value={line.quantity} onChange={(e) => patchLine(index, { quantity: e.target.value })} /></Field>
      <Field label="Selling Price / KG"><input type="number" min="0" step="0.01" className={inputClass()} value={line.price} onChange={(e) => patchLine(index, { price: e.target.value })} /></Field>
      <Button variant="ghost" onClick={() => setForm({ ...form, lines: form.lines.filter((_, i) => i !== index) })}>Remove</Button>
    </div>)}
    <Button className="mt-4" variant="secondary" onClick={() => setForm({ ...form, lines: [...form.lines, { ...emptyLine }] })}><Plus size={17} />Add Another Plant / Trip</Button>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Field label="Sales Deductions"><input type="number" min="0" className={inputClass()} value={form.deductions} onChange={(e) => setForm({ ...form, deductions: e.target.value })} /></Field><StatMini label="Sale Total" value={currency(total)} /></div>
    <h3 className="mt-6 font-bold">Optional Initial Payment</h3><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Field label="Amount"><input type="number" min="0" max={total} step="0.01" className={inputClass()} value={form.paymentAmount} onChange={(e) => setForm({ ...form, paymentAmount: e.target.value })} /></Field>
      <Field label="Method"><select className={inputClass()} value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}><option value="cash">Cash</option><option value="gcash">GCash</option><option value="bank">Bank Deposit</option></select></Field>
      {form.paymentMethod !== "cash" && <Field label="Reference"><input className={inputClass()} value={form.paymentReference} onChange={(e) => setForm({ ...form, paymentReference: e.target.value })} /></Field>}
      <Field label="Payment Notes"><input className={inputClass()} value={form.paymentNotes} onChange={(e) => setForm({ ...form, paymentNotes: e.target.value })} /></Field>
    </div>
    <Button className="mt-5" disabled={status.busy || !form.customerId || !form.salesmanId || !form.trustReceipt.trim() || !form.lines.length || form.lines.some((line) => !line.lotId || num(line.quantity) <= 0 || num(line.price) < 0)} onClick={submit}><ShoppingCart size={17} />{status.busy ? "Creating Sale..." : "Confirm Sale"}</Button>
  </section></div>;
}

export function FinanceScreen({ organizationId, role, userId, view, initialCustomerId = "", onChanged, onNavigate }) {
  const [epoch, setEpoch] = useState(0);
  const finance = useRemote(() => loadFinance(organizationId), epoch);
  const customers = useRemote(() => loadCustomers(organizationId), epoch);
  const people = useRemote(() => loadPeople(organizationId), organizationId);
  const salesmen = (people.data || []).filter((item) => item.role === "salesman" && item.active);
  const [form, setForm] = useState({ customerId: initialCustomerId, salesmanId: role === "salesman" ? userId : "", date: today(), amount: "", method: "cash", reference: "", notes: "" });
  const [status, setStatus] = useState({ busy: false, error: "", notice: "" });
  useEffect(() => {
    if (initialCustomerId) setForm((current) => ({ ...current, customerId: initialCustomerId }));
  }, [initialCustomerId]);
  async function pay() {
    setStatus({ busy: true, error: "", notice: "" });
    try {
      const result = await recordPayment(organizationId, form); setStatus({ busy: false, error: "", notice: `${result.payment_number} recorded and allocated.` }); setForm({ ...form, customerId: "", amount: "", reference: "", notes: "" }); setEpoch((v) => v + 1); onChanged();
    } catch (reason) { setStatus({ busy: false, error: readableError(reason), notice: "" }); }
  }
  const data = finance.data || { ledger: [], collectibles: [], balances: [], payments: [] };
  if (view === "ledger") return <div><SectionHeader title="Customer Ledger" action={<Button variant="secondary" onClick={() => setEpoch((v) => v + 1)}><RefreshCw size={16} />Refresh</Button>} /><Feedback error={finance.error} />{finance.loading && !finance.data ? <Loading /> : <section className="report-section"><ResponsiveTable columns={["Date", "Customer", "Reference", "Entry", "Charge", "Payment"]} rows={data.ledger.map((row) => [shortDate(row.entry_date), (customers.data || []).find((item) => item.id === row.customer_id)?.name || "-", row.reference_number, row.entry_type === "sale" ? "Sale" : "Payment", currency(row.debit), currency(row.credit)])} /></section>}</div>;
  if (view === "collectibles") return <div><SectionHeader title="Collectibles" /><Feedback error={finance.error} />{finance.loading && !finance.data ? <Loading /> : <section className="report-section"><ResponsiveTable columns={["Customer", "Trust Receipt", "Sale Date", "Due Date", "Outstanding", "Action"]} rows={data.collectibles.map((row) => [row.customer_name, row.trust_receipt_number, shortDate(row.sale_date), row.due_date ? shortDate(row.due_date) : "-", currency(row.outstanding_balance), <Button onClick={() => onNavigate("payments", row.customer_id)}>Record Payment</Button>])} /></section>}</div>;
  return <div><SectionHeader title="Payments" eyebrow="FIFO allocation from database" /><Feedback error={status.error || finance.error} notice={status.notice} /><section className="report-section"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <Field label="Customer"><select className={inputClass()} value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}><option value="">Select Customer</option>{(customers.data || []).filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
    <Field label="Salesman"><select disabled={role === "salesman"} className={inputClass()} value={form.salesmanId} onChange={(e) => setForm({ ...form, salesmanId: e.target.value })}><option value="">None / Cashier</option>{salesmen.map((item) => <option key={item.user_id} value={item.user_id}>{item.full_name}</option>)}</select></Field>
    <Field label="Date"><input type="date" className={inputClass()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
    <Field label="Amount"><input type="number" min="0" step="0.01" className={inputClass()} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
    <Field label="Method"><select className={inputClass()} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}><option value="cash">Cash</option><option value="gcash">GCash</option><option value="bank">Bank Deposit</option></select></Field>
    {form.method !== "cash" && <Field label="Reference"><input className={inputClass()} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>}
    <Field label="Notes"><input className={inputClass()} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
  </div><Button className="mt-4" disabled={status.busy || !form.customerId || num(form.amount) <= 0 || (form.method !== "cash" && !form.reference.trim())} onClick={pay}><Banknote size={17} />Record Payment</Button></section>
  <section className="report-section mt-5"><ResponsiveTable columns={["Date", "Payment", "Customer", "Method", "Amount", "Verification"]} rows={data.payments.map((row) => [shortDate(row.payment_date), row.payment_number, (customers.data || []).find((item) => item.id === row.customer_id)?.name || "-", row.method, currency(row.amount), row.verification_status])} /></section></div>;
}

export function DcrScreen({ organizationId, role, userId, onChanged }) {
  const people = useRemote(() => loadPeople(organizationId), organizationId);
  const [epoch, setEpoch] = useState(0);
  const summary = useRemote(() => loadOperationsSummary(organizationId), epoch);
  const salesmen = (people.data || []).filter((item) => item.role === "salesman" && item.active);
  const [salesmanId, setSalesmanId] = useState(role === "salesman" ? userId : "");
  const [form, setForm] = useState({ date: today(), actual: "", explanation: "" });
  const [expense, setExpense] = useState({ date: today(), amount: "", category: "Fuel", source: "cash_collection", status: "approved", description: "" });
  const [status, setStatus] = useState({ busy: false, error: "", notice: "" });
  const dayPayments = (summary.data?.payments || []).filter((item) => item.payment_date === form.date && item.salesman_user_id === salesmanId);
  const cash = sum(dayPayments.filter((item) => item.method === "cash"), "amount");
  const dayExpenses = (summary.data?.expenses || []).filter((item) => item.expense_date === form.date && item.salesman_user_id === salesmanId && item.approval_status === "approved" && item.payment_source === "cash_collection");
  const expected = cash - sum(dayExpenses, "amount");
  async function addExpense() {
    setStatus({ busy: true, error: "", notice: "" });
    try { await recordExpense(organizationId, { ...expense, salesmanId }, userId); setStatus({ busy: false, error: "", notice: "Expense recorded." }); setExpense({ ...expense, amount: "", description: "" }); setEpoch((v) => v + 1); onChanged(); }
    catch (reason) { setStatus({ busy: false, error: readableError(reason), notice: "" }); }
  }
  async function lock() {
    setStatus({ busy: true, error: "", notice: "" });
    try { const result = await submitDcr(organizationId, { ...form, salesmanId }); setStatus({ busy: false, error: "", notice: `DCR locked. Difference: ${currency(result.difference)}.` }); setEpoch((v) => v + 1); onChanged(); }
    catch (reason) { setStatus({ busy: false, error: readableError(reason), notice: "" }); }
  }
  return <div><SectionHeader title="Daily Cash Report" /><Feedback error={status.error || summary.error} notice={status.notice} /><section className="report-section"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <Field label="Salesman"><select disabled={role === "salesman"} className={inputClass()} value={salesmanId} onChange={(e) => setSalesmanId(e.target.value)}><option value="">Select Salesman</option>{salesmen.map((item) => <option key={item.user_id} value={item.user_id}>{item.full_name}</option>)}</select></Field>
    <Field label="Report Date"><input type="date" className={inputClass()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
    <StatMini label="Cash Collected" value={currency(cash)} /><StatMini label="Expected Cash" value={currency(expected)} />
  </div><h3 className="mt-5 font-bold">Record Expense</h3><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Field label="Category"><input className={inputClass()} value={expense.category} onChange={(e) => setExpense({ ...expense, category: e.target.value })} /></Field><Field label="Amount"><input type="number" min="0" className={inputClass()} value={expense.amount} onChange={(e) => setExpense({ ...expense, amount: e.target.value })} /></Field><Field label="Source"><select className={inputClass()} value={expense.source} onChange={(e) => setExpense({ ...expense, source: e.target.value })}><option value="cash_collection">Cash Collection</option><option value="personal_cash">Personal Cash</option><option value="other">Other</option></select></Field><Button variant="secondary" disabled={!salesmanId || num(expense.amount) <= 0} onClick={addExpense}><Plus size={17} />Add Expense</Button></div>
  <h3 className="mt-6 font-bold">Submit and Lock</h3><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Field label="Actual Cash Remittance"><input type="number" min="0" className={inputClass()} value={form.actual} onChange={(e) => setForm({ ...form, actual: e.target.value })} /></Field><Field label="Explanation"><input className={inputClass()} value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} /></Field><Button disabled={!salesmanId || form.actual === "" || (num(form.actual) !== expected && !form.explanation.trim())} onClick={lock}><ClipboardCheck size={17} />Submit DCR</Button></div></section>
  <section className="report-section mt-5"><ResponsiveTable columns={["Date", "Salesman", "Cash", "GCash", "Bank", "Expenses", "Expected", "Actual", "Difference", "Status"]} rows={(summary.data?.dcrs || []).map((row) => [shortDate(row.report_date), salesmen.find((item) => item.user_id === row.salesman_user_id)?.full_name || "-", currency(row.cash_collected), currency(row.gcash_collected), currency(row.bank_collected), currency(row.cash_paid_expenses), currency(row.expected_cash_remittance), currency(row.actual_cash_remittance), currency(row.difference), <Badge tone="green">{row.status}</Badge>])} /></section></div>;
}

export function LiveDashboard({ organizationId, epoch = 0 }) {
  const remote = useRemote(() => loadOperationsSummary(organizationId), epoch);
  const [range, setRange] = useState({ start: today(), end: today() });
  const data = remote.data || { trips: [], sales: [], payments: [], expenses: [], companyStock: [], salesmanStock: [], plantSales: [], productSales: [] };
  const within = (date) => date >= range.start && date <= range.end;
  const sales = data.sales.filter((item) => within(item.sale_date));
  const payments = data.payments.filter((item) => within(item.payment_date));
  const expenses = data.expenses.filter((item) => within(item.expense_date) && item.approval_status === "approved");
  const trips = data.trips.filter((item) => within(item.trip_date));
  return <div><SectionHeader title="Dashboard" action={<div className="flex flex-wrap gap-2"><Field label="From"><input type="date" className={inputClass()} value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} /></Field><Field label="To"><input type="date" className={inputClass()} value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} /></Field><Button variant="secondary" onClick={remote.refresh}><RefreshCw size={16} /></Button></div>} /><Feedback error={remote.error} />{remote.loading && !remote.data ? <Loading /> : <>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Gross Sales" value={currency(sum(sales, "net_sales"))} icon={ShoppingCart} /><StatCard label="Capital / Product Cost" value={currency(sum(sales, "total_cogs"))} icon={PackageCheck} tone="amber" /><StatCard label="Expenses" value={currency(sum(expenses, "amount"))} icon={Banknote} tone="rose" /><StatCard label="Profit Estimate" value={currency(sum(sales, "gross_profit") - sum(expenses, "amount"))} icon={ClipboardCheck} tone="green" /></div>
    <section className="report-section mt-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatMini label="Payments" value={currency(sum(payments, "amount"))} /><StatMini label="Trips" value={trips.length} /><StatMini label="Company Stock" value={kg(sum(data.companyStock, "available_quantity_kg"))} /><StatMini label="Salesman Stock" value={kg(sum(data.salesmanStock, "available_quantity_kg"))} /></div></section>
    <section className="report-section mt-5"><h2 className="mb-4 text-lg font-bold">Sales by Plant</h2><ResponsiveTable columns={["Plant", "Quantity", "Sales", "COGS", "Gross Profit"]} rows={data.plantSales.filter((item) => within(item.sale_date)).map((item) => [item.plant_name, kg(item.quantity_kg), currency(item.gross_sales), currency(item.cogs), currency(item.gross_profit)])} /></section>
  </>}</div>;
}
