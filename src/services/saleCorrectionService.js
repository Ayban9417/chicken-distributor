import { requireSupabase } from "../lib/supabaseClient.js";

async function invoke(body, client = requireSupabase()) {
  const { data, error } = await client.functions.invoke("admin-sale-correction", { body });
  if (error) {
    let message = "Sale correction services are not configured.";
    try { message = (await error.context?.clone?.().json())?.error || message; } catch { /* Keep the recoverable message. */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export const saleCorrectionChanges = (draft) => ({
  saleDate: draft.saleDate,
  customerId: draft.customerId,
  trustReceiptNumber: draft.trustReceiptNumber,
  salesDeductions: Number(draft.salesDeductions),
  notes: draft.notes,
  lines: draft.lines.map((line) => ({
    id: line.id, lotId: line.lotId, quantityKg: Number(line.quantityKg), pricePerKg: Number(line.pricePerKg),
  })),
});

export async function loadSaleCorrectionDetails(organizationId, saleId, client = requireSupabase()) {
  const fail = (result) => { if (result.error) throw result.error; return result.data || []; };
  const [saleResult, linesResult] = await Promise.all([
    client.from("sales").select("*").eq("organization_id", organizationId).eq("id", saleId).single(),
    client.from("sale_lines").select("*").eq("sale_id", saleId).order("id"),
  ]);
  if (saleResult.error) throw saleResult.error;
  return { sale: saleResult.data, lines: fail(linesResult) };
}

export const previewSaleCorrection = (organizationId, saleId, changes, client) =>
  invoke({ action: "preview", organizationId, saleId, changes }, client).then((result) => result.preview);

export const applySaleCorrection = (organizationId, saleId, changes, password, reason, requestId, versionToken, client) =>
  invoke({ action: "apply", organizationId, saleId, changes, password, reason, requestId, versionToken }, client).then((result) => result.correction);
