import { useEffect, useState } from "react";
import { CorrectionDialog } from "./CorrectionDialog";
import { Field, inputClass } from "./ui";
import { currency } from "../utils/business";
import { applyFinanceCorrection, dcrAmendmentChanges, expenseCorrectionChanges,
  loadDcrAmendments, previewFinanceCorrection } from "../services/financeCorrectionService";

const expenseDraft = (expense) => ({
  expenseDate: expense.date, salesmanUserId: expense.agentId || "",
  category: expense.category, amount: String(expense.amount),
  description: expense.description || "", approvalStatus: expense.status.toLowerCase(),
});
const dcrDraft = (dcr) => ({
  actualCashRemittance: String(dcr.currentActual ?? dcr.actual),
  explanation: dcr.currentExplanation ?? dcr.explanation ?? "",
  reconciliationNotes: dcr.currentNotes || "",
});

export function FinanceCorrectionDialog({ module, organizationId, record, users = [], localMode = false, onClose, onSaved }) {
  const [draft, setDraft] = useState(() => module === "expense" ? expenseDraft(record) : dcrDraft(record));
  const [preview, setPreview] = useState(null);
  const [baselineVersion, setBaselineVersion] = useState("");
  const [dirty, setDirty] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const changes = module === "expense" ? expenseCorrectionChanges : dcrAmendmentChanges;

  useEffect(() => {
    if (localMode) { setError("Secure correction services are unavailable in local demo mode. Saving is disabled."); return; }
    let active = true;
    previewFinanceCorrection(module, organizationId, record.id, changes(draft))
      .then((result) => { if (active) { setPreview(result); setBaselineVersion(result.versionToken); } })
      .catch((problem) => { if (active) setError(problem?.message || "Correction services are not configured."); });
    if (module === "dcr") loadDcrAmendments(organizationId, record.id)
      .then((rows) => { if (active) setHistory(rows); })
      .catch(() => {});
    return () => { active = false; };
    // The initial preview is intentionally loaded only when the dialog opens.
  }, [module, organizationId, record.id, localMode]);

  const update = (patch) => { setDraft((current) => ({ ...current, ...patch })); setDirty(true); setError(""); };
  async function review() {
    if (localMode) { setError("Secure correction services are unavailable in local demo mode. Saving is disabled."); return; }
    if (module === "expense" && (!draft.expenseDate || !draft.category.trim()
      || !/^\d+(\.\d{1,2})?$/.test(draft.amount) || Number(draft.amount) <= 0)) {
      setError("Enter a date, category, and positive amount with at most two decimals."); return;
    }
    if (module === "dcr" && (!/^\d+(\.\d{1,2})?$/.test(draft.actualCashRemittance)
      || Number(draft.actualCashRemittance) < 0)) {
      setError("Enter a nonnegative actual cash remittance."); return;
    }
    setReviewing(true); setError("");
    try {
      const result = await previewFinanceCorrection(module, organizationId, record.id, changes(draft));
      if (baselineVersion && baselineVersion !== result.versionToken) {
        setPreview(null);
        setError("This transaction changed after you opened it. Close and reopen before correcting.");
      } else { setPreview(result); setBaselineVersion(result.versionToken); setDirty(false); }
    } catch (problem) { setError(problem?.message || "Unable to review this correction."); }
    finally { setReviewing(false); }
  }
  const editor = module === "expense" ? <div className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Expense Date"><input className={inputClass()} type="date" value={draft.expenseDate} onChange={(event) => update({ expenseDate: event.target.value })} /></Field>
      <Field label="Salesman"><select className={inputClass()} value={draft.salesmanUserId} onChange={(event) => update({ salesmanUserId: event.target.value })}>
        <option value="">Unassigned</option>{users.filter((item) => item.role === "Agent").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></Field>
      <Field label="Category"><input className={inputClass()} maxLength={160} value={draft.category} onChange={(event) => update({ category: event.target.value })} /></Field>
      <Field label="Amount"><input className={inputClass()} type="number" min="0.01" step="0.01" value={draft.amount} onChange={(event) => update({ amount: event.target.value })} /></Field>
      <Field label="Approval"><select className={inputClass()} value={draft.approvalStatus} onChange={(event) => update({ approvalStatus: event.target.value })}>
        {["pending", "approved", "rejected", "voided"].map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}
      </select></Field>
      <p className="text-sm text-slate-600">Payment source stays {record.source}. The Expense ID remains unchanged.</p>
    </div>
    <Field label="Description"><textarea className={`${inputClass()} min-h-20`} maxLength={2000} value={draft.description} onChange={(event) => update({ description: event.target.value })} /></Field>
  </div> : <div className="space-y-3">
    <p className="text-sm font-semibold text-slate-700">The original submitted DCR remains locked. Approved cash Expenses are recalculated from their source records.</p>
    <Field label="Actual Cash Remitted"><input className={inputClass()} type="number" min="0" step="0.01" value={draft.actualCashRemittance} onChange={(event) => update({ actualCashRemittance: event.target.value })} /></Field>
    <Field label="Cash Difference Explanation"><textarea className={`${inputClass()} min-h-20`} maxLength={2000} value={draft.explanation} onChange={(event) => update({ explanation: event.target.value })} /></Field>
    <Field label="Reconciliation Notes"><textarea className={`${inputClass()} min-h-20`} maxLength={2000} value={draft.reconciliationNotes} onChange={(event) => update({ reconciliationNotes: event.target.value })} /></Field>
  </div>;
  const fallbackOriginal = module === "expense" ? {
    expenseDate: record.date, salesmanUserId: record.agentId || null,
    category: record.category, amount: record.amount, description: record.description || "",
    approvalStatus: record.status.toLowerCase(), paymentSource: record.source,
  } : {
    cashCollected: record.snapshot.totals.Cash,
    gcashCollected: record.snapshot.totals.GCash,
    bankCollected: record.snapshot.totals["Bank Deposit"],
    cashPaidExpenses: record.snapshot.expenseTotals.cashPaid,
    expectedCashRemittance: record.snapshot.expectedCashRemittance,
    actualCashRemittance: record.actual, difference: record.diff,
    explanation: record.explanation || "",
  };
  const localPreview = { originalValues: preview?.originalValues || fallbackOriginal,
    proposedValues: { ...fallbackOriginal, ...changes(draft) },
    blockedReasons: [error || "Review changes against the current database before confirming."],
    eligible: false, versionToken: "", affectedRecords: [], expectedFinancialChanges: [] };
  const shown = dirty || !preview || error ? localPreview : preview;
  const details = <div className="space-y-2 border-y border-slate-200 py-3 text-sm">
    {module === "expense" && <p>Linked DCR amendments: {shown.dcrAmendments?.length || 0}. Any linked amendment is written atomically with the Expense correction.</p>}
    {module === "dcr" && <><p>Original submission: {currency(record.snapshot.expectedCashRemittance)} expected / {currency(record.actual)} actual / {currency(record.diff)} difference.</p>
      <p>Prior amendments: {history.length}</p>{history.slice(0, 4).map((item) => <p key={item.id}>{new Date(item.created_at).toLocaleString("en-PH")} / {item.reason}</p>)}</>}
    {(shown.expectedFinancialChanges || []).map((item, index) => <p key={index}>{item.type}: {currency(item.before)} to {currency(item.after)} ({currency(item.delta)})</p>)}
  </div>;
  return <CorrectionDialog title={module === "expense" ? "Edit Expense" : "Amend DCR"}
    preview={shown} editor={<>{error && <p role="alert" className="mb-3 border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}{editor}</>}
    previewDetails={details} showGenericChanges={false} onReview={localMode ? undefined : review} reviewing={reviewing}
    reviewRequired={dirty || !preview || !baselineVersion || Boolean(error)}
    displayValue={(key, value) => value == null || value === "" ? "-"
      : typeof value === "number" && /(amount|cash|bank|difference)/i.test(key) ? currency(value) : String(value)}
    onClose={onClose} onConfirm={async ({ reason, password, requestId, versionToken }) => {
      await applyFinanceCorrection(module, organizationId, record.id, changes(draft),
        password, reason, requestId, versionToken);
      onSaved();
    }} />;
}
