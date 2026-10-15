import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { currency, kg } from "../utils/business";
import { redactCorrectionData } from "../utils/correctionPreview";
import { Button, Drawer, Field, inputClass } from "./ui";

const labelFor = (key) => key.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2");
const display = (key, value) => {
  if (value == null || value === "") return "-";
  if (typeof value === "number" && /(^|_)(amount|cost|price|sales|profit|balance|pay|deductions)($|_)/i.test(key)) return currency(value);
  if (typeof value === "number" && /(kg|quantity)/i.test(key)) return kg(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

export function CorrectionDialog({ title = "Correct Transaction", preview, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const originalValues = redactCorrectionData(preview?.originalValues || {});
  const proposedValues = redactCorrectionData(preview?.proposedValues || {});
  const affectedRecords = redactCorrectionData(preview?.affectedRecords || []);
  const expectedChanges = redactCorrectionData([...(preview?.expectedInventoryChanges || []), ...(preview?.expectedFinancialChanges || [])]);
  const keys = [...new Set([...Object.keys(originalValues), ...Object.keys(proposedValues)])];

  async function confirm() {
    if (!preview?.eligible || !preview.versionToken) return setError("This correction is not eligible. Refresh the preview.");
    if (reason.trim().length < 10) return setError("Enter a correction reason of at least 10 characters.");
    if (!password) return setError("Enter your current password.");
    setBusy(true);
    setError("");
    try {
      await onConfirm({ reason: reason.trim(), password, requestId, versionToken: preview.versionToken });
      setPassword("");
      setBusy(false);
    } catch (problem) {
      setPassword("");
      setError(problem?.message || "The correction could not be completed.");
      setBusy(false);
    }
  }

  return <Drawer title={title} onClose={busy ? () => {} : onClose}>
    <div className="space-y-5">
      {preview?.blockedReasons?.length > 0 && <div role="alert" className="border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{preview.blockedReasons.map((item) => <p key={item}>{item}</p>)}</div>}
      <div className="overflow-x-auto border-y border-slate-200 py-3">
        <table className="w-full text-left text-sm"><thead><tr className="text-slate-500"><th className="p-2">Field</th><th className="p-2">Original</th><th className="p-2">Proposed</th></tr></thead><tbody>{keys.map((key) => <tr key={key} className="border-t border-slate-100"><th className="p-2 font-semibold">{labelFor(key)}</th><td className="max-w-48 break-words p-2">{display(key, originalValues[key])}</td><td className="max-w-48 break-words p-2 font-semibold">{display(key, proposedValues[key])}</td></tr>)}</tbody></table>
      </div>
      <div className="grid gap-3 sm:grid-cols-2"><PreviewList title="Affected Records" rows={affectedRecords} /><PreviewList title="Expected Inventory / Financial Changes" rows={expectedChanges} /></div>
      <Field label="Correction Reason"><textarea className={`${inputClass()} min-h-24 py-3`} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
      <Field label="Current Password"><input className={inputClass()} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field>
      {error && <p role="alert" className="border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2"><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy || !preview?.eligible || !preview.versionToken || reason.trim().length < 10 || !password} onClick={confirm}><CheckCircle2 size={17} />{busy ? "Confirming..." : "Confirm Correction"}</Button></div>
    </div>
  </Drawer>;
}

function PreviewList({ title, rows = [] }) {
  return <div className="border border-slate-200 p-3 text-sm"><h3 className="font-bold">{title}</h3>{rows.length ? <ul className="mt-2 space-y-1 break-words text-slate-700">{rows.map((row, index) => <li key={index}>{typeof row === "object" ? JSON.stringify(row) : String(row)}</li>)}</ul> : <p className="mt-2 text-slate-500">None</p>}</div>;
}
