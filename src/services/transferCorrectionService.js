import { requireSupabase } from "../lib/supabaseClient.js";

async function invoke(body, client = requireSupabase()) {
  const { data, error } = await client.functions.invoke("admin-transfer-correction", { body });
  if (error) {
    let message = "Transfer correction services are not configured.";
    try { message = (await error.context?.clone?.().json())?.error || message; } catch { /* Keep the recoverable message. */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export const transferCorrectionChanges = (draft, module) => ({
  effectiveDate: draft.date,
  ...(module === "salesman_transfer" ? { fromSalesmanId: draft.fromSalesmanId } : {}),
  toSalesmanId: draft.toSalesmanId,
  lotId: draft.lotId,
  quantityKg: Number(draft.qty),
  notes: draft.notes,
});

export const previewTransferCorrection = (organizationId, receiptId, module, changes, client) =>
  invoke({ action: "preview", module, organizationId, receiptId, changes }, client).then((result) => result.preview);

export const applyTransferCorrection = (organizationId, receiptId, module, changes, password, reason, requestId, versionToken, client) =>
  invoke({ action: "apply", module, organizationId, receiptId, changes, password, reason, requestId, versionToken }, client).then((result) => result.correction);
