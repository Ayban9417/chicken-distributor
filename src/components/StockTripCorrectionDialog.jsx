import { useEffect, useState } from "react";
import { CorrectionDialog } from "./CorrectionDialog";
import { Field, inputClass, NumericInput } from "./ui";
import { buildCorrectionPreview } from "../utils/correctionPreview";
import { applyStockTripCorrection, previewStockTripCorrection, stockTripCorrectionChanges } from "../services/stockTripCorrectionService";

const initialDraft = (trip) => ({
  date: trip.date,
  reference: trip.reference || "",
  notes: trip.notes || "",
  lines: Object.fromEntries(trip.products.map((line) => [line.lineId, {
    quantityKg: String(line.originalQty),
    costPerKg: String(line.costPerKg),
    bags: line.bags == null ? "" : String(line.bags),
    headCount: line.headCount == null ? "" : String(line.headCount),
  }])),
});

function draftError(trip, draft) {
  const parsedDate = new Date(`${draft.date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || Number.isNaN(parsedDate.getTime())
      || parsedDate.toISOString().slice(0, 10) !== draft.date) return "Enter a valid Trip date.";
  if (draft.reference.length > 160 || draft.notes.length > 2000) return "Reference or notes are too long.";
  for (const line of trip.products) {
    const row = draft.lines[line.lineId];
    if (!/^\d+(\.\d{1,3})?$/.test(row.quantityKg) || Number(row.quantityKg) <= 0) return `${line.name}: enter a positive KG amount with up to three decimals.`;
    if (!/^\d+(\.\d{1,2})?$/.test(row.costPerKg) || (line.acquisitionType === "Purchased" && Number(row.costPerKg) <= 0)
        || (line.acquisitionType === "Free from Plant" && Number(row.costPerKg) !== 0)) return `${line.name}: enter a valid cost per KG.`;
    if ([row.bags, row.headCount].some((value) => value !== "" && (!/^\d+$/.test(value) || Number(value) > 2147483647))) return `${line.name}: bags and heads must be whole nonnegative numbers.`;
  }
  return "";
}

export function StockTripCorrectionDialog({ organizationId, trip, onClose, onSaved }) {
  const [draft, setDraft] = useState(() => initialDraft(trip));
  const [baselineVersion, setBaselineVersion] = useState("");
  const [preview, setPreview] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [loadingBaseline, setLoadingBaseline] = useState(true);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let active = true;
    previewStockTripCorrection(organizationId, trip.id, stockTripCorrectionChanges(trip, initialDraft(trip)))
      .then((result) => { if (active) { setBaselineVersion(result.versionToken); setPreview(result); } })
      .catch((problem) => { if (active) setError(problem?.message || "The Trip could not be loaded for correction."); })
      .finally(() => { if (active) setLoadingBaseline(false); });
    return () => { active = false; };
  }, [organizationId, trip]);

  const update = (patch) => { setDraft((current) => ({ ...current, ...patch })); setDirty(true); setError(""); };
  const updateLine = (id, patch) => { setDraft((current) => ({ ...current, lines: { ...current.lines, [id]: { ...current.lines[id], ...patch } } })); setDirty(true); setError(""); };
  const changes = () => stockTripCorrectionChanges(trip, draft);
  async function retryBaseline() {
    setLoadingBaseline(true);
    setError("");
    try {
      const result = await previewStockTripCorrection(organizationId, trip.id, stockTripCorrectionChanges(trip, initialDraft(trip)));
      setBaselineVersion(result.versionToken);
      setPreview(result);
    } catch (problem) {
      setError(problem?.message || "The Trip could not be loaded for correction.");
    } finally {
      setLoadingBaseline(false);
    }
  }
  async function review() {
    const problem = draftError(trip, draft);
    if (problem) return setError(problem);
    setReviewing(true);
    setError("");
    try {
      const result = await previewStockTripCorrection(organizationId, trip.id, changes());
      if (result.versionToken !== baselineVersion) {
        setPreview(null);
        setError("This Trip changed after you opened it. Close and reopen the Trip before correcting it.");
      } else {
        setPreview(result);
        setDirty(false);
      }
    } catch (problem) {
      setError(problem?.message || "The correction preview could not be loaded.");
    } finally {
      setReviewing(false);
    }
  }

  const original = {
    tripDate: trip.date, reference: trip.reference, notes: trip.notes,
    lines: trip.products.map((line) => ({ id: line.lineId, product: line.name, quantityKg: line.originalQty, costPerKg: line.costPerKg, bags: line.bags, headCount: line.headCount })),
  };
  const proposed = {
    tripDate: draft.date, reference: draft.reference, notes: draft.notes,
    lines: trip.products.map((line) => ({ id: line.lineId, product: line.name, quantityKg: draft.lines[line.lineId].quantityKg, costPerKg: draft.lines[line.lineId].costPerKg, bags: draft.lines[line.lineId].bags || null, headCount: draft.lines[line.lineId].headCount || null })),
  };
  const localPreview = buildCorrectionPreview({ originalValues: original, proposedValues: proposed, blockedReasons: ["Review changes before confirming."], versionToken: "local-unverified" });
  const editor = <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Trip Date"><input className={inputClass()} type="date" value={draft.date} onChange={(event) => update({ date: event.target.value })} /></Field>
      <Field label="Reference Number"><input className={inputClass()} maxLength={160} value={draft.reference} onChange={(event) => update({ reference: event.target.value })} /></Field>
      <div className="sm:col-span-2"><Field label="Notes"><textarea className={`${inputClass()} min-h-20`} maxLength={2000} value={draft.notes} onChange={(event) => update({ notes: event.target.value })} /></Field></div>
    </div>
    {trip.products.map((line) => { const row = draft.lines[line.lineId]; return <section key={line.lineId} className="border-t border-slate-200 pt-3"><h3 className="mb-2 text-sm font-bold">{line.name}{line.sizeCode ? ` / ${line.sizeCode}` : ""}{line.classType ? ` / ${line.classType}` : ""}</h3><div className="grid gap-3 sm:grid-cols-2">
      <Field label="Quantity KG"><NumericInput className={inputClass()} min="0.001" step="0.001" value={row.quantityKg} onChange={(event) => updateLine(line.lineId, { quantityKg: event.target.value })} /></Field>
      <Field label="Cost/KG"><NumericInput className={inputClass()} min="0" step="0.01" disabled={line.acquisitionType === "Free from Plant"} value={row.costPerKg} onChange={(event) => updateLine(line.lineId, { costPerKg: event.target.value })} /></Field>
      {line.usesBags && <Field label="Bags"><NumericInput className={inputClass()} min="0" step="1" value={row.bags} onChange={(event) => updateLine(line.lineId, { bags: event.target.value })} /></Field>}
      {line.usesHeadCount && <Field label="Heads"><NumericInput className={inputClass()} min="0" step="1" value={row.headCount} onChange={(event) => updateLine(line.lineId, { headCount: event.target.value })} /></Field>}
    </div></section>; })}
  </div>;

  return <CorrectionDialog
    title={`Edit Stock In / ${trip.reference || trip.code}`}
    preview={dirty ? localPreview : (preview || localPreview)}
    editor={<>{error && <p role="alert" className="mb-3 border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</p>}{editor}</>}
    onReview={baselineVersion ? review : retryBaseline}
    reviewing={reviewing || loadingBaseline}
    reviewRequired={dirty || !preview || !baselineVersion}
    onClose={onClose}
    onConfirm={async ({ reason, password, requestId, versionToken }) => {
      await applyStockTripCorrection(organizationId, trip.id, changes(), password, reason, requestId, versionToken);
      onSaved();
    }}
  />;
}
