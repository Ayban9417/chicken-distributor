import { requireSupabase } from "../lib/supabaseClient.js";

async function invoke(body, client = requireSupabase()) {
  const { data, error } = await client.functions.invoke("admin-payment-correction", { body });
  if (error) {
    let message = "Payment correction services are not configured.";
    try { message = (await error.context?.clone?.().json())?.error || message; } catch { /* Keep the recoverable message. */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export const paymentCorrectionChanges = (draft) => ({
  paymentDate: draft.paymentDate,
  customerId: draft.customerId,
  amount: Number(draft.amount),
  method: draft.method,
  referenceNumber: draft.referenceNumber || "",
  bankName: draft.bankName || "",
  notes: draft.notes || "",
  allocationMode: draft.allocationMode,
  allocations: draft.allocationMode === "manual"
    ? draft.allocations.filter((item) => Number(item.amount) > 0).map((item) => ({ saleId: item.saleId, amount: Number(item.amount) }))
    : [],
});

export async function loadPaymentCorrectionDetails(organizationId, paymentId, client = requireSupabase()) {
  const fail = (result) => { if (result.error) throw result.error; return result.data || []; };
  const [paymentResult, allocationsResult, salesResult] = await Promise.all([
    client.from("payments").select("*").eq("organization_id", organizationId).eq("id", paymentId).single(),
    client.from("payment_allocations").select("*").eq("payment_id", paymentId).order("id"),
    client.from("sales").select("id, customer_id, trust_receipt_number, sale_date, net_sales, status").eq("organization_id", organizationId).neq("status", "voided").order("sale_date").order("created_at"),
  ]);
  if (paymentResult.error) throw paymentResult.error;
  return { payment: paymentResult.data, allocations: fail(allocationsResult), sales: fail(salesResult) };
}

export const previewPaymentCorrection = (organizationId, paymentId, changes, client) =>
  invoke({ action: "preview", organizationId, paymentId, changes }, client).then((result) => result.preview);

export const applyPaymentCorrection = (organizationId, paymentId, changes, password, reason, requestId, versionToken, client) =>
  invoke({ action: "apply", organizationId, paymentId, changes, password, reason, requestId, versionToken }, client)
    .then((result) => result.correction);
