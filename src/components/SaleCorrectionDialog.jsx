import { useEffect, useState } from "react";
import { CorrectionDialog } from "./CorrectionDialog";
import { Field, inputClass, NumericInput } from "./ui";
import { currency, kg, productLabel, tripReferenceLabel } from "../utils/business";
import { applySaleCorrection, loadSaleCorrectionDetails, previewSaleCorrection, saleCorrectionChanges } from "../services/saleCorrectionService";

const initialDraft = ({ sale, lines }) => ({
  saleDate: sale.sale_date,
  customerId: sale.customer_id,
  trustReceiptNumber: sale.trust_receipt_number,
  salesDeductions: String(sale.sales_deductions),
  notes: sale.notes || "",
  lines: lines.map((line) => ({ id: line.id, lotId: line.inventory_lot_id,
    quantityKg: String(line.quantity_kg), pricePerKg: String(line.selling_price_per_kg) })),
});

export function SaleCorrectionDialog({ organizationId, saleRecord, customers = [], trips = [], onClose, onSaved }) {
  const [details, setDetails] = useState(null);
  const [draft, setDraft] = useState(null);
  const [preview, setPreview] = useState(null);
  const [baselineVersion, setBaselineVersion] = useState("");
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");
  const lots = trips.flatMap((trip) => trip.products.map((product) => ({
    ...product, trip, lotId: product.lotId,
  })));
  const lotName = (lotId) => {
    const item = lots.find((lot) => lot.lotId === lotId);
    return item ? `${item.trip.plant} / ${tripReferenceLabel(item.trip)} / ${productLabel(item.name, item.sizeCode, item.classType)}` : lotId || "-";
  };

  useEffect(() => {
    let active = true;
    loadSaleCorrectionDetails(organizationId, saleRecord.id)
      .then(async (result) => {
        if (!active) return;
        const firstDraft = initialDraft(result);
        setDetails(result); setDraft(firstDraft);
        try {
          const firstPreview = await previewSaleCorrection(organizationId, saleRecord.id, saleCorrectionChanges(firstDraft));
          if (active) { setPreview(firstPreview); setBaselineVersion(firstPreview.versionToken); }
        } catch (problem) {
          if (active) setError(problem?.message || "Sale correction services are not configured.");
        }
      })
      .catch((problem) => { if (active) setError(problem?.message || "Unable to load Sale details."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organizationId, saleRecord.id]);

  const update = (patch) => { setDraft((current) => ({ ...current, ...patch })); setDirty(true); setError(""); };
  const updateLine = (id, patch) => update({ lines: draft.lines.map((line) => line.id === id ? { ...line, ...patch } : line) });
  async function review() {
    if (!draft.saleDate || !draft.customerId || !draft.trustReceiptNumber.trim()
      || !/^\d+(\.\d{1,2})?$/.test(draft.salesDeductions)
      || draft.lines.some((line) => !line.lotId || !/^\d+(\.\d{1,3})?$/.test(line.quantityKg)
        || Number(line.quantityKg) <= 0 || !/^\d+(\.\d{1,2})?$/.test(line.pricePerKg))) {
      setError("Enter a date, Customer, Trust Receipt, valid line quantities and prices, and nonnegative deductions.");
      return;
    }
    setReviewing(true); setError("");
    try {
      const result = await previewSaleCorrection(organizationId, saleRecord.id, saleCorrectionChanges(draft));
      if (baselineVersion && result.versionToken !== baselineVersion) {
        setPreview(null);
        setError("This Sale changed after you opened it. Close and reopen it before correcting.");
      } else {
        setBaselineVersion(result.versionToken); setPreview(result); setDirty(false);
      }
    } catch (problem) { setError(problem?.message || "Unable to review this correction."); }
    finally { setReviewing(false); }
  }

  if (loading) return <div role="status" className="p-4">Loading Sale correction...</div>;
  if (!draft || !details) return <div role="alert" className="border border-rose-200 bg-rose-50 p-4 text-rose-800">{error || "Sale details are unavailable."}<button className="ml-3 underline" onClick={onClose}>Close</button></div>;
  const localPreview = {
    originalValues: { saleDate: details.sale.sale_date, customerId: details.sale.customer_id,
      trustReceiptNumber: details.sale.trust_receipt_number, salesDeductions: Number(details.sale.sales_deductions),
      notes: details.sale.notes || "", lines: details.lines.map((line) => ({ id: line.id, lotId: line.inventory_lot_id,
        quantityKg: Number(line.quantity_kg), pricePerKg: Number(line.selling_price_per_kg),
        costPerKg: Number(line.acquisition_cost_per_kg) })), grossSales: Number(details.sale.gross_sales),
      netSales: Number(details.sale.net_sales), totalCogs: Number(details.sale.total_cogs) },
    proposedValues: { ...saleCorrectionChanges(draft), grossSales: draft.lines.reduce((sum, line) => sum + Number(line.quantityKg) * Number(line.pricePerKg), 0) },
    blockedReasons: [error || "Review changes against the current database before confirming."],
    eligible: false, versionToken: "", affectedRecords: [], expectedInventoryChanges: [], expectedFinancialChanges: [],
  };
  const shown = dirty ? localPreview : (preview || localPreview);
  const decorated = { ...shown,
    originalValues: { ...shown.originalValues, lines: shown.originalValues.lines?.map((line) => ({ ...line, product: lotName(line.lotId) })) },
    proposedValues: { ...shown.proposedValues, lines: shown.proposedValues.lines?.map((line) => ({ ...line, product: lotName(line.lotId) })) },
  };
  const editor = <div className="space-y-3">
    {error && <p role="alert" className="border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Sale Date"><input className={inputClass()} type="date" value={draft.saleDate} onChange={(event) => update({ saleDate: event.target.value })} /></Field>
      <Field label="Customer"><select className={inputClass()} value={draft.customerId} onChange={(event) => update({ customerId: event.target.value })}>{customers.filter((customer) => customer.active || customer.id === draft.customerId).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></Field>
      <Field label="Trust Receipt Number"><input className={inputClass()} maxLength={160} value={draft.trustReceiptNumber} onChange={(event) => update({ trustReceiptNumber: event.target.value })} /></Field>
      <Field label="Sales Deductions"><NumericInput className={inputClass()} min="0" step="0.01" value={draft.salesDeductions} onChange={(event) => update({ salesDeductions: event.target.value })} /></Field>
      <div className="sm:col-span-2"><Field label="Notes"><textarea className={`${inputClass()} min-h-20`} maxLength={2000} value={draft.notes} onChange={(event) => update({ notes: event.target.value })} /></Field></div>
    </div>
    <h3 className="text-sm font-bold">PRODUCTS / SOURCE LOTS</h3>
    {draft.lines.map((line) => <div key={line.id} className="grid gap-3 border-t border-slate-200 pt-3 sm:grid-cols-2">
      <div className="sm:col-span-2"><Field label="Product / Source Lot"><select className={inputClass()} value={line.lotId} onChange={(event) => updateLine(line.id, { lotId: event.target.value })}>
        {!lots.some((lot) => lot.lotId === line.lotId) && <option value={line.lotId}>{line.lotId}</option>}
        {lots.map((lot) => <option key={lot.lotId} value={lot.lotId}>{lotName(lot.lotId)}</option>)}
      </select></Field></div>
      <Field label="Quantity KG"><NumericInput className={inputClass()} min="0.001" step="0.001" value={line.quantityKg} onChange={(event) => updateLine(line.id, { quantityKg: event.target.value })} /></Field>
      <Field label="Selling Price / KG"><NumericInput className={inputClass()} min="0" step="0.01" value={line.pricePerKg} onChange={(event) => updateLine(line.id, { pricePerKg: event.target.value })} /></Field>
    </div>)}
  </div>;
  const detailsView = <div className="space-y-3 border-y border-slate-200 py-3 text-sm">
    <h3 className="font-bold">RECONCILIATION PREVIEW</h3>
    {(shown.expectedFinancialChanges || []).map((change, index) => <p key={index} className="break-words">
      <strong>{change.type === "cogs" ? "COGS" : change.type === "revenue" ? "Revenue" : `Customer Balance / ${customers.find((item) => item.id === change.customerId)?.name || change.customerId}`}</strong>
      {": "}{currency(change.before)} to {currency(change.after)} ({currency(change.delta ?? Number(change.after) - Number(change.before))})
    </p>)}
    {(shown.expectedInventoryChanges || []).map((change, index) => <p key={index} className="break-words">
      <strong>{change.action === "reverse_sale" ? "Reverse" : "Replace"}</strong>{": "}{lotName(change.lotId)} / {kg(Math.abs(Number(change.quantityKg)))}
    </p>)}
    <p>Related Payment allocations: {(shown.relatedPayments || []).length}</p>
    <p>Submitted DCR dependencies: {(shown.lockedDcrs || []).length}</p>
    {(shown.relatedPayments || []).map((payment) => <p key={payment.allocationId}>Payment {payment.method} / {currency(payment.amount)} / {payment.verificationStatus}</p>)}
    {(shown.lockedDcrs || []).map((dcr) => <p key={dcr.id}>DCR {dcr.reportDate} / {dcr.status}</p>)}
  </div>;
  return <CorrectionDialog
    title={`Edit Sale / ${saleRecord.trustReceipt}`} preview={decorated} editor={editor}
    previewDetails={detailsView} showGenericChanges={false}
    displayValue={(key, value) => value == null || value === "" ? "-" : key === "customerId" ? customers.find((item) => item.id === value)?.name || value || "-"
      : ["salesDeductions", "grossSales", "netSales", "totalCogs"].includes(key) ? currency(value)
        : String(value)}
    fieldLabel={(key) => ({ saleDate: "Sale Date", customerId: "Customer", trustReceiptNumber: "Trust Receipt Number", salesDeductions: "Deductions", grossSales: "Gross Sales", netSales: "Net Sales", totalCogs: "COGS" })[key] || key.replace(/([a-z])([A-Z])/g, "$1 $2")}
    onReview={review} reviewing={reviewing} reviewRequired={dirty || !preview || !baselineVersion}
    onClose={onClose}
    onConfirm={async ({ reason, password, requestId, versionToken }) => {
      await applySaleCorrection(organizationId, saleRecord.id, saleCorrectionChanges(draft), password, reason, requestId, versionToken);
      onSaved();
    }}
  />;
}
