import { useEffect, useState } from "react";
import { CorrectionDialog } from "./CorrectionDialog";
import { Field, inputClass } from "./ui";
import { buildCorrectionPreview } from "../utils/correctionPreview";
import { applyTransferCorrection, previewTransferCorrection, transferCorrectionChanges } from "../services/transferCorrectionService";
import { kg, productLabel, tripReferenceLabel } from "../utils/business";

const initialDraft = (receipt, lots) => ({
  date: receipt.date || "",
  fromSalesmanId: receipt.fromSalesmanId || "",
  toSalesmanId: receipt.toSalesmanId || "",
  lotId: receipt.lotId || lots.find((lot) => lot.tripId === receipt.tripId
    && lot.product === receipt.product && (lot.sizeCode || "") === (receipt.sizeCode || "")
    && (lot.classType || "") === (receipt.classType || ""))?.lotId || "",
  qty: String(receipt.qty),
  notes: receipt.notes || "",
});

export function TransferCorrectionDialog({ organizationId, module, receipt, users = [], lots = [], localMode = false, onClose, onSaved }) {
  const [draft, setDraft] = useState(() => initialDraft(receipt, lots));
  const [baselineVersion, setBaselineVersion] = useState("");
  const [preview, setPreview] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!localMode);
  const changes = () => transferCorrectionChanges(draft, module);
  useEffect(() => {
    if (localMode) return;
    let active = true;
    previewTransferCorrection(organizationId, receipt.id, module, transferCorrectionChanges(initialDraft(receipt, lots), module))
      .then((result) => { if (active) { setBaselineVersion(result.versionToken); setPreview(result); } })
      .catch((problem) => { if (active) setError(problem?.message || "Transfer correction services are not configured."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organizationId, receipt, module, localMode, lots]);

  const update = (patch) => { setDraft((current) => ({ ...current, ...patch })); setDirty(true); setError(""); };
  async function review() {
    if (!draft.date || !draft.toSalesmanId || !draft.lotId || (module === "salesman_transfer" && !draft.fromSalesmanId)
      || !/^\d+(\.\d{1,3})?$/.test(draft.qty) || Number(draft.qty) <= 0) {
      setError("Select a date, Salesmen, source lot, and positive quantity up to three decimals.");
      return;
    }
    setReviewing(true); setError("");
    try {
      const result = await previewTransferCorrection(organizationId, receipt.id, module, changes());
      if (baselineVersion && result.versionToken !== baselineVersion) {
        setPreview(null);
        setError("This receipt changed after you opened it. Close and reopen it before correcting.");
      } else {
        setBaselineVersion(result.versionToken);
        setPreview(result); setDirty(false);
      }
    } catch (problem) { setError(problem?.message || "Unable to review this correction."); }
    finally { setReviewing(false); }
  }

  const original = {
    effectiveDate: receipt.date, fromSalesmanId: receipt.fromSalesmanId || null,
    toSalesmanId: receipt.toSalesmanId, lotId: initialDraft(receipt, lots).lotId,
    quantityKg: receipt.qty, notes: receipt.notes || "", receiptNumber: receipt.receipt,
  };
  const localPreview = buildCorrectionPreview({
    originalValues: original,
    proposedValues: { ...original, ...changes() },
    blockedReasons: [localMode
      ? "Secure transfer correction services are not configured in local demo mode. No changes can be saved."
      : "Review changes against the current database before confirming."],
    versionRequired: !localMode,
  });
  const salesmen = users.filter((person) => person.active && person.role === "Agent");
  const sourceLots = lots.filter((lot) => module === "warehouse_transfer" || lot.salesmanId === draft.fromSalesmanId || lot.id === draft.lotId || lot.lotId === draft.lotId);
  const selectedLot = lots.find((lot) => lot.id === draft.lotId || lot.lotId === draft.lotId);
  const displayValue = (key, value) => {
    if (key === "fromSalesmanId" || key === "toSalesmanId") return users.find((person) => person.id === value)?.name || value || "-";
    if (key === "lotId") {
      const lot = lots.find((item) => item.id === value || item.lotId === value);
      return lot ? `${lot.plant} / ${tripReferenceLabel(lot)} / ${productLabel(lot.product, lot.sizeCode, lot.classType)}` : value || "-";
    }
    if (key === "quantityKg") return kg(value);
    return value == null || value === "" ? "-" : String(value);
  };
  const editor = <div className="space-y-3">
    {error && <p role="alert" className="border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={module === "warehouse_transfer" ? "Receiving Date" : "Transfer Date"}><input className={inputClass()} type="date" value={draft.date} onChange={(event) => update({ date: event.target.value })} /></Field>
      {module === "salesman_transfer" && <Field label="Sending Salesman"><select className={inputClass()} value={draft.fromSalesmanId} onChange={(event) => update({ fromSalesmanId: event.target.value })}><option value="">Select Salesman</option>{salesmen.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field>}
      <Field label="Receiving Salesman"><select className={inputClass()} value={draft.toSalesmanId} onChange={(event) => update({ toSalesmanId: event.target.value })}><option value="">Select Salesman</option>{salesmen.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field>
      <Field label="Product / Source Lot"><select className={inputClass()} value={draft.lotId} onChange={(event) => update({ lotId: event.target.value })}><option value="">Select Source Lot</option>{sourceLots.map((lot) => <option key={`${lot.lotId || lot.id}-${lot.salesmanId || "warehouse"}`} value={lot.lotId || lot.id}>{lot.plant} / {tripReferenceLabel(lot)} / {productLabel(lot.product, lot.sizeCode, lot.classType)} / {kg(lot.warehouseAvailable ?? lot.remainingQty)}</option>)}</select></Field>
      <Field label="Transferred Quantity KG"><input className={inputClass()} type="number" min="0.001" step="0.001" value={draft.qty} onChange={(event) => update({ qty: event.target.value })} /></Field>
      <div className="sm:col-span-2"><Field label="Notes"><textarea className={`${inputClass()} min-h-20`} maxLength={2000} value={draft.notes} onChange={(event) => update({ notes: event.target.value })} /></Field></div>
    </div>
    {selectedLot && <p className="text-sm font-semibold text-slate-600">Selected source: {selectedLot.plant} / {tripReferenceLabel(selectedLot)} / {productLabel(selectedLot.product, selectedLot.sizeCode, selectedLot.classType)}</p>}
  </div>;
  return <CorrectionDialog
    title={`Edit ${module === "warehouse_transfer" ? "Receiving" : "Transfer"} Receipt / ${receipt.receipt}`}
    preview={dirty ? localPreview : (preview || localPreview)} editor={editor}
    displayValue={displayValue}
    hiddenFields={module === "warehouse_transfer" ? ["fromSalesmanId"] : []}
    fieldLabel={(key) => ({ fromSalesmanId: "Sending Salesman", toSalesmanId: "Receiving Salesman", lotId: "Product / Source Lot", effectiveDate: module === "warehouse_transfer" ? "Receiving Date" : "Transfer Date", quantityKg: "Quantity KG" })[key] || key.replace(/([a-z])([A-Z])/g, "$1 $2")}
    onReview={localMode ? undefined : review} reviewing={reviewing || loading}
    reviewRequired={localMode || dirty || !preview || !baselineVersion}
    onClose={onClose}
    onConfirm={async ({ reason, password, requestId, versionToken }) => {
      if (localMode) throw new Error("Secure transfer correction services are not configured in local demo mode.");
      await applyTransferCorrection(organizationId, receipt.id, module, changes(), password, reason, requestId, versionToken);
      onSaved();
    }}
  />;
}
