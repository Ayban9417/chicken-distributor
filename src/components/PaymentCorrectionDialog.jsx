import { useEffect, useState } from "react";
import { CorrectionDialog } from "./CorrectionDialog";
import { Field, inputClass } from "./ui";
import { currency } from "../utils/business";
import { applyPaymentCorrection, loadPaymentCorrectionDetails, paymentCorrectionChanges, previewPaymentCorrection } from "../services/paymentCorrectionService";

const bankNames = ["Landbank", "BDO", "BPI", "Metrobank"];
const initialDraft = ({ payment, allocations }) => ({
  paymentDate: payment.payment_date,
  customerId: payment.customer_id,
  amount: String(payment.amount),
  method: payment.method,
  referenceNumber: payment.reference_number || "",
  bankName: payment.bank_name || "",
  notes: payment.notes || "",
  allocationMode: "preserve",
  allocations: allocations.map((item) => ({ saleId: item.sale_id, amount: String(item.amount) })),
});

export function PaymentCorrectionDialog({ organizationId, paymentRecord, customers = [], onClose, onSaved }) {
  const [details, setDetails] = useState(null);
  const [draft, setDraft] = useState(null);
  const [preview, setPreview] = useState(null);
  const [baselineVersion, setBaselineVersion] = useState("");
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    loadPaymentCorrectionDetails(organizationId, paymentRecord.id)
      .then(async (result) => {
        if (!active) return;
        const firstDraft = initialDraft(result);
        setDetails(result); setDraft(firstDraft);
        try {
          const firstPreview = await previewPaymentCorrection(organizationId, paymentRecord.id, paymentCorrectionChanges(firstDraft));
          if (active) { setPreview(firstPreview); setBaselineVersion(firstPreview.versionToken); }
        } catch (problem) {
          if (active) setError(problem?.message || "Payment correction services are not configured.");
        }
      })
      .catch((problem) => { if (active) setError(problem?.message || "Unable to load Payment details."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organizationId, paymentRecord.id]);

  const update = (patch) => { setDraft((current) => ({ ...current, ...patch })); setDirty(true); setError(""); };
  async function review() {
    if (!draft.paymentDate || !draft.customerId || !/^\d+(\.\d{1,2})?$/.test(draft.amount)
      || Number(draft.amount) <= 0 || (draft.method === "gcash" && !draft.referenceNumber.trim())
      || (draft.method === "bank" && !draft.bankName.trim())
      || (draft.allocationMode === "manual" && !draft.allocations.some((item) => Number(item.amount) > 0))) {
      setError("Enter a date, Customer, positive amount, required electronic details, and valid allocations.");
      return;
    }
    setReviewing(true); setError("");
    try {
      const result = await previewPaymentCorrection(organizationId, paymentRecord.id, paymentCorrectionChanges(draft));
      if (baselineVersion && result.versionToken !== baselineVersion) {
        setPreview(null);
        setError("This Payment changed after you opened it. Close and reopen it before correcting.");
      } else {
        setBaselineVersion(result.versionToken); setPreview(result); setDirty(false);
      }
    } catch (problem) { setError(problem?.message || "Unable to review this correction."); }
    finally { setReviewing(false); }
  }

  if (loading) return <div role="status" className="p-4">Loading Payment correction...</div>;
  if (!draft || !details) return <div role="alert" className="border border-rose-200 bg-rose-50 p-4 text-rose-800">{error || "Payment details are unavailable."}<button className="ml-3 underline" onClick={onClose}>Close</button></div>;
  const oldAllocations = details.allocations.map((item) => ({
    saleId: item.sale_id, trustReceiptNumber: details.sales.find((sale) => sale.id === item.sale_id)?.trust_receipt_number || item.sale_id,
    amount: Number(item.amount),
  }));
  const localPreview = {
    originalValues: { paymentDate: details.payment.payment_date, customerId: details.payment.customer_id,
      amount: Number(details.payment.amount), method: details.payment.method,
      referenceNumber: details.payment.reference_number, bankName: details.payment.bank_name,
      notes: details.payment.notes, verificationStatus: details.payment.verification_status,
      allocations: oldAllocations },
    proposedValues: { ...paymentCorrectionChanges(draft), allocations: draft.allocationMode === "preserve"
      ? oldAllocations : paymentCorrectionChanges(draft).allocations },
    blockedReasons: [error || "Review changes against the current database before confirming."],
    eligible: false, versionToken: "", affectedRecords: [], expectedFinancialChanges: [],
  };
  const shown = dirty ? localPreview : (preview || localPreview);
  const availableSales = details.sales.filter((sale) => sale.customer_id === draft.customerId && sale.sale_date <= draft.paymentDate);
  const updateAllocation = (saleId, amount) => update({ allocations: [
    ...draft.allocations.filter((item) => item.saleId !== saleId), { saleId, amount },
  ] });
  const customerName = (id) => customers.find((item) => item.id === id)?.name || id || "-";
  const allocationList = (title, rows = []) => <div className="min-w-0">
    <h4 className="font-bold">{title}</h4>
    {rows.length ? rows.map((item, index) => <p key={`${item.saleId}-${index}`} className="flex justify-between gap-3 border-b border-slate-100 py-1">
      <span className="break-all">{item.trustReceiptNumber || details.sales.find((sale) => sale.id === item.saleId)?.trust_receipt_number || item.saleId}</span>
      <strong className="whitespace-nowrap">{currency(item.amount)}</strong>
    </p>) : <p className="text-slate-500">None</p>}
  </div>;
  const editor = <div className="space-y-3">
    {error && <p role="alert" className="border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Payment Date"><input className={inputClass()} type="date" value={draft.paymentDate} onChange={(event) => update({ paymentDate: event.target.value, allocationMode: "fifo", allocations: [] })} /></Field>
      <Field label="Customer"><select className={inputClass()} value={draft.customerId} onChange={(event) => update({ customerId: event.target.value, allocationMode: "fifo", allocations: [] })}>{customers.filter((item) => item.active || item.id === draft.customerId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <Field label="Amount"><input className={inputClass()} type="number" min="0.01" step="0.01" value={draft.amount} onChange={(event) => update({ amount: event.target.value, allocationMode: "fifo", allocations: [] })} /></Field>
      <Field label="Payment Method"><select className={inputClass()} value={draft.method} onChange={(event) => update({ method: event.target.value })}><option value="cash">Cash</option><option value="gcash">GCash</option><option value="bank">Bank</option></select></Field>
      {draft.method === "gcash" && <Field label="GCash Reference Number"><input className={inputClass()} maxLength={160} value={draft.referenceNumber} onChange={(event) => update({ referenceNumber: event.target.value })} /></Field>}
      {draft.method === "bank" && <Field label="Bank"><select className={inputClass()} value={draft.bankName} onChange={(event) => update({ bankName: event.target.value })}><option value="">Select Bank</option>{[...new Set([...bankNames, draft.bankName].filter(Boolean))].map((name) => <option key={name} value={name}>{name}</option>)}</select></Field>}
      {draft.method === "bank" && <Field label="Bank Reference Number (Optional)"><input className={inputClass()} maxLength={160} value={draft.referenceNumber} onChange={(event) => update({ referenceNumber: event.target.value })} /></Field>}
      <div className="sm:col-span-2"><Field label="Notes"><textarea className={`${inputClass()} min-h-20`} maxLength={2000} value={draft.notes} onChange={(event) => update({ notes: event.target.value })} /></Field></div>
    </div>
    <Field label="Allocation Mode"><select className={inputClass()} value={draft.allocationMode} onChange={(event) => update({ allocationMode: event.target.value, allocations: event.target.value === "manual" ? draft.allocations : [] })}>
      {draft.customerId === details.payment.customer_id && draft.paymentDate === details.payment.payment_date && Number(draft.amount) === Number(details.payment.amount) && <option value="preserve">Keep Current Allocations</option>}
      <option value="fifo">Oldest Eligible Sale First</option><option value="manual">Allocate Manually</option>
    </select></Field>
    {draft.allocationMode === "manual" && <div className="space-y-2 border-t border-slate-200 pt-3">
      {availableSales.map((sale) => <div key={sale.id} className="grid gap-2 sm:grid-cols-[1fr_160px]">
        <span className="min-w-0 break-words text-sm font-semibold">{sale.trust_receipt_number} / {sale.sale_date}</span>
        <input aria-label={`Allocate to ${sale.trust_receipt_number}`} className={inputClass()} type="number" min="0" step="0.01"
          value={draft.allocations.find((item) => item.saleId === sale.id)?.amount || ""}
          onChange={(event) => updateAllocation(sale.id, event.target.value)} />
      </div>)}
      {!availableSales.length && <p className="text-sm text-slate-500">No eligible Sales for this Customer and date.</p>}
    </div>}
  </div>;
  const detailsView = <div className="space-y-3 border-y border-slate-200 py-3 text-sm">
    <h3 className="font-bold">ALLOCATION / BALANCE PREVIEW</h3>
    <p>Electronic verification: {details.payment.verification_status}</p>
    <div className="grid gap-3 sm:grid-cols-2">{allocationList("Current Allocations", shown.originalValues?.allocations)}
      {dirty && draft.allocationMode === "fifo" ? <div><h4 className="font-bold">Proposed Allocations</h4><p>Review changes to calculate FIFO allocations.</p></div>
        : allocationList("Proposed Allocations", shown.proposedValues?.allocations)}
    </div>
    {(shown.expectedFinancialChanges || []).map((change, index) => <p key={index}>
      <strong>{change.type === "customer_balance" ? `Customer Balance / ${customerName(change.customerId)}` : "Payment Amount"}</strong>
      {": "}{currency(change.before)} to {currency(change.after)}
    </p>)}
    <p>Submitted DCR dependencies: {(shown.relatedDcrs || []).length}</p>
    {(shown.relatedDcrs || []).map((dcr) => <p key={dcr.id}>{dcr.reportDate} / {dcr.status}</p>)}
  </div>;
  return <CorrectionDialog title={`Edit Payment / ${paymentRecord.ref}`} preview={shown} editor={editor}
    previewDetails={detailsView} showGenericChanges={false} hiddenFields={["allocations"]}
    displayValue={(key, value) => value == null || value === "" ? "-" : key === "customerId" ? customerName(value)
      : key === "amount" ? currency(value) : String(value)}
    fieldLabel={(key) => ({ paymentDate: "Payment Date", customerId: "Customer", referenceNumber: "Reference Number",
      bankName: "Bank", verificationStatus: "Verification Status" })[key] || key.replace(/([a-z])([A-Z])/g, "$1 $2")}
    onReview={review} reviewing={reviewing} reviewRequired={dirty || !preview || !baselineVersion}
    onClose={onClose} onConfirm={async ({ reason, password, requestId, versionToken }) => {
      await applyPaymentCorrection(organizationId, paymentRecord.id, paymentCorrectionChanges(draft), password, reason, requestId, versionToken);
      onSaved();
    }} />;
}
