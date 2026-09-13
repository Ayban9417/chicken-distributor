import { useState } from "react";
import { Plus, Pencil, Trash2, ArrowLeft, Save } from "lucide-react";
import { Button, Badge, Drawer, Field, inputClass, MoneyInput, ResponsiveTable, SectionHeader } from "./ui";
import { currency, customerBalance, generalPrice } from "../utils/business";
import { emptyCustomer, duplicateCustomers, matchesCustomer, hasCustomerHistory, validateCustomer, customerRecord, allowsCredit } from "../utils/customers";

export function CustomerSearch({ value, onChange }) {
  return <Field label="Search Customers"><input type="search" className={inputClass()} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Name, contact or mobile" /></Field>;
}
export function CustomerSelector({ customers, value, onChange, onAdd, label = "Select Customer" }) {
  const [query, setQuery] = useState("");
  const found = customers.filter((c) => matchesCustomer(c, query));
  const selected = customers.find((c) => c.id === value);
  return <div className="space-y-2"><CustomerSearch value={query} onChange={setQuery} />
    <Field label={label}><select className={inputClass()} value={value} onChange={(e) => { onChange(e.target.value); setQuery(""); }}><option value="" disabled>Select Customer</option>{selected && !found.some((c) => c.id === value) && <option value={selected.id}>{selected.name}</option>}{found.map((c) => <option key={c.id} value={c.id}>{c.name}{c.active === false ? " (Inactive)" : ""}</option>)}</select></Field>
    {!found.length && <p role="status" className="text-sm text-slate-600">No customer found</p>}
    {onAdd && <Button variant="secondary" onClick={() => onAdd(query, () => setQuery(""))}><Plus size={17} />{query.trim() && !found.length ? "Add " + query.trim() : "Add New Customer"}</Button>}
  </div>;
}
export function CustomerEditor({ customer, customers, quick = false, initialName = "", productNames, onSave, onExisting, onClose }) {
  const [draft, setDraft] = useState(() => customer ? { ...structuredClone(customer), creditLimit: customer.creditLimit ?? "", paymentDays: customer.paymentDays ?? "" } : { ...emptyCustomer(), name: initialName });
  const [error, setError] = useState("");
  const [duplicates, setDuplicates] = useState([]);
  const patch = (changes) => { setDraft((d) => ({ ...d, ...changes })); setDuplicates([]); setError(""); };
  function save(override = false) {
    const problem = validateCustomer(draft);
    if (problem) return setError(problem);
    const found = duplicateCustomers(customers, draft);
    if (!override && found.length) return setDuplicates(found);
    onSave(customerRecord(draft));
  }
  return <Drawer title={quick ? "Add New Customer" : customer ? "Edit Customer" : "Add Customer"} onClose={onClose}>
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Customer Name"><input required className={inputClass()} value={draft.name} onChange={(e) => patch({ name: e.target.value })} /></Field>
      <Field label="Contact Person"><input className={inputClass()} value={draft.contactPerson} onChange={(e) => patch({ contactPerson: e.target.value })} /></Field>
      <Field label="Mobile Number"><input type="tel" className={inputClass()} value={draft.mobile} onChange={(e) => patch({ mobile: e.target.value })} /></Field>
      <Field label="Address"><input className={inputClass()} value={draft.address} onChange={(e) => patch({ address: e.target.value })} /></Field>
      {!quick && <Field label="Customer Type"><input className={inputClass()} list="customer-types" value={draft.type} onChange={(e) => patch({ type: e.target.value })} /><datalist id="customer-types">{["Retailer", "Restaurant", "Reseller", "Market Vendor", "Institution", "Other"].map((t) => <option key={t}>{t}</option>)}</datalist></Field>}
      <Field label="Payment Type"><select className={inputClass()} value={draft.paymentType} onChange={(e) => patch({ paymentType: e.target.value })}><option>Cash</option><option>Credit</option><option>Cash / Credit</option></select></Field>
      {allowsCredit(draft) && <Field label="Credit Limit"><MoneyInput value={draft.creditLimit} onChange={(e) => patch({ creditLimit: e.target.value })} /></Field>}
      {!quick && allowsCredit(draft) && <Field label="Payment Days"><input type="number" min="0" step="1" className={inputClass()} value={draft.paymentDays} onChange={(e) => patch({ paymentDays: e.target.value })} /></Field>}
      {!quick && <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={draft.active} onChange={(e) => patch({ active: e.target.checked })} />Active Customer</label>}
    </div>
    {!quick && <section className="report-section"><h3 className="mb-3 font-bold">Customer Selling Prices</h3>{[...new Set([...productNames, ...Object.keys(draft.pricing)])].map((product) => <div key={product} className="mb-3 grid items-end gap-3 sm:grid-cols-2"><Field label={product + " Selling Price/kg"}><MoneyInput value={draft.pricing[product] ?? ""} onChange={(e) => patch({ pricing: { ...draft.pricing, [product]: e.target.value } })} /></Field><p className="text-sm text-slate-500">Default: {currency(generalPrice[product] || 0)}/kg</p></div>)}</section>}
    {error && <p role="alert" className="mt-4 text-rose-700">{error}</p>}
    {!!duplicates.length && <section role="alert" className="mt-4 border-l-4 border-amber-500 bg-amber-50 p-4"><h3 className="font-bold">Possible existing customer</h3>{duplicates.map((c) => <div key={c.id} className="mt-3"><p className="font-semibold">{c.name}{c.active === false ? " (Inactive)" : ""}</p><p>{c.mobile || "No mobile recorded"}</p><Button variant="secondary" className="mt-2" disabled={quick && c.active === false} onClick={() => onExisting(c)}>Use Existing Customer</Button></div>)}<Button variant="secondary" className="mt-3" onClick={() => save(true)}>{customer ? "Save Anyway" : "Create Anyway"}</Button></section>}
    <div className="mt-5 flex flex-wrap gap-3"><Button onClick={() => save()}><Save size={17} />{quick ? "Add & Select Customer" : "Save Customer"}</Button><Button variant="secondary" onClick={onClose}>Cancel</Button></div>
  </Drawer>;
}
export function CustomerManagement({ state, onEdit, onAdd, onLedger, onToggle, onDelete, onBack }) {
  const [query, setQuery] = useState("");
  return <div className="customer-management"><Button variant="ghost" onClick={onBack}><ArrowLeft size={17} />Administration</Button><SectionHeader title="Manage Customers" action={<Button onClick={onAdd}><Plus size={17} />Add Customer</Button>} /><div className="mb-4"><CustomerSearch value={query} onChange={setQuery} /></div>
    <ResponsiveTable columns={["Customer", "Type", "Payment Type", "Credit Limit", "Outstanding", "Status", "Actions"]} rows={state.customers.filter((c) => matchesCustomer(c, query)).map((c) => [c.name, c.type, c.paymentType, c.creditLimit === null ? "Not set" : currency(c.creditLimit), currency(customerBalance(state.ledgerEntries, c.id)), <Badge tone={c.active ? "green" : "slate"}>{c.active ? "Active" : "Inactive"}</Badge>, <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => onEdit(c)}><Pencil size={16} />Edit</Button><Button variant="secondary" onClick={() => onEdit(c)}>Pricing</Button><Button variant="secondary" onClick={() => onLedger(c.id)}>View Ledger</Button><Button variant="secondary" onClick={() => onToggle(c)}>{c.active ? "Deactivate" : "Activate"}</Button><Button variant="ghost" aria-label={"Delete " + c.name} title={hasCustomerHistory(c.id, state) ? "Historical transactions: deactivate instead" : "Delete unused customer"} disabled={hasCustomerHistory(c.id, state)} onClick={() => onDelete(c)}><Trash2 size={17} /></Button></div>])} />
  </div>;
}
