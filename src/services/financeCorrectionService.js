import { requireSupabase } from "../lib/supabaseClient.js";

async function invoke(body, client = requireSupabase()) {
  const { data, error } = await client.functions.invoke("admin-finance-correction", { body });
  if (error) {
    let message = "Finance correction services are not configured.";
    try { message = (await error.context?.clone?.().json())?.error || message; } catch { /* Keep the recoverable message. */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export const expenseCorrectionChanges = (draft) => ({
  expenseDate: draft.expenseDate,
  salesmanUserId: draft.salesmanUserId || null,
  category: draft.category.trim(),
  amount: Number(draft.amount),
  description: draft.description.trim(),
  approvalStatus: draft.approvalStatus,
});

export const dcrAmendmentChanges = (draft) => ({
  actualCashRemittance: Number(draft.actualCashRemittance),
  explanation: draft.explanation.trim(),
  reconciliationNotes: draft.reconciliationNotes.trim(),
});

export const previewFinanceCorrection = (module, organizationId, transactionId, changes, client) =>
  invoke({ action: "preview", module, organizationId, transactionId, changes }, client).then((result) => result.preview);

export const applyFinanceCorrection = (module, organizationId, transactionId, changes,
  password, reason, requestId, versionToken, client) =>
  invoke({ action: "apply", module, organizationId, transactionId, changes,
    password, reason, requestId, versionToken }, client).then((result) => result.correction);

export async function loadDcrAmendments(organizationId, dcrId, client = requireSupabase()) {
  const { data, error } = await client.from("dcr_amendments").select("*")
    .eq("organization_id", organizationId).eq("dcr_id", dcrId)
    .order("amendment_seq", { ascending: false });
  if (error) throw error;
  return data || [];
}
