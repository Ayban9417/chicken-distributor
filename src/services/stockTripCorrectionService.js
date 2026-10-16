import { requireSupabase } from "../lib/supabaseClient.js";

async function invoke(body, client = requireSupabase()) {
  const { data, error } = await client.functions.invoke("admin-stock-trip-correction", { body });
  if (error) {
    let message = "Stock-In correction service is unavailable.";
    try { message = (await error.context?.clone?.().json())?.error || message; } catch { /* Preserve recoverable error. */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export function stockTripCorrectionChanges(trip, draft) {
  return {
    tripDate: draft.date,
    reference: draft.reference,
    notes: draft.notes,
    lines: trip.products.map((line) => ({
      id: line.lineId,
      quantityKg: Number(draft.lines[line.lineId]?.quantityKg),
      costPerKg: Number(draft.lines[line.lineId]?.costPerKg),
      bags: draft.lines[line.lineId]?.bags === "" ? null : Number(draft.lines[line.lineId]?.bags),
      headCount: draft.lines[line.lineId]?.headCount === "" ? null : Number(draft.lines[line.lineId]?.headCount),
    })),
  };
}

export const previewStockTripCorrection = (organizationId, tripId, changes, client) =>
  invoke({ action: "preview", organizationId, tripId, changes }, client).then((result) => result.preview);

export const applyStockTripCorrection = (organizationId, tripId, changes, password, reason, requestId, versionToken, client) =>
  invoke({ action: "apply", organizationId, tripId, changes, password, reason, requestId, versionToken }, client).then((result) => result.correction);
