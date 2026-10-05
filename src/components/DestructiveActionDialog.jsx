import { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button, Drawer, Field, inputClass } from "./ui";

export function DestructiveActionDialog({ title, description, details, confirmLabel, reasonRequired = false, initialReason = "", onClose, onConfirm }) {
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState(initialReason);
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    if (!password) return setError("Enter your current password.");
    if (reasonRequired && reason.trim().length < 3) return setError("Enter a short deletion reason.");
    setBusy(true);
    setError("");
    try {
      await onConfirm({ password, reason: reason.trim(), requestId });
    } catch (problem) {
      setError(problem?.message || "The deletion could not be completed.");
      setBusy(false);
    }
  }

  return <Drawer title={title} onClose={busy ? () => {} : onClose}>
    <div className="space-y-5">
      <div className="flex gap-3 border border-rose-200 bg-rose-50 p-4 text-rose-900">
        <AlertTriangle className="mt-0.5 shrink-0" size={20} />
        <div><p className="font-bold">This action cannot be undone.</p><p className="mt-1 text-sm">{description}</p></div>
      </div>
      <dl className="space-y-2 border-y border-slate-200 py-4">
        {details.map(([label, value]) => <div key={label} className="flex justify-between gap-4 text-sm"><dt className="text-slate-500">{label}</dt><dd className="text-right font-bold text-slate-900">{value || "-"}</dd></div>)}
      </dl>
      <Field label={reasonRequired ? "Reason" : "Reason (optional)"}>
        <textarea className={`${inputClass()} min-h-24 py-3`} maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={reasonRequired ? "Why is this record being deleted?" : "Product added by mistake."} />
      </Field>
      <Field label="Current Password">
        <input className={inputClass()} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
      </Field>
      {error && <p role="alert" className="border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button variant="danger" disabled={busy || !password || (reasonRequired && reason.trim().length < 3)} onClick={confirm}><Trash2 size={17} />{busy ? "Deleting..." : confirmLabel}</Button>
      </div>
    </div>
  </Drawer>;
}
