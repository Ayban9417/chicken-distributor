import { requireSupabase } from "../lib/supabaseClient.js";

async function functionError(error, fallback) {
  try {
    const body = await error?.context?.clone?.().json();
    return body?.error || fallback;
  } catch {
    return fallback;
  }
}

export function protectedDeletionPayload(action, organizationId, targetId, password, reason, requestId) {
  return { action, organizationId, targetId, password, reason, requestId };
}

async function invokeProtectedDeletion(body, client = requireSupabase()) {
  const { data, error } = await client.functions.invoke("admin-destructive-action", { body });
  if (error) throw new Error(await functionError(error, "The deletion could not be completed."));
  if (data?.error) throw new Error(data.error);
  return data?.deletion || data;
}

export const deleteHostedStockTrip = (organizationId, tripId, password, reason, requestId, client) =>
  invokeProtectedDeletion(protectedDeletionPayload("delete_stock_trip", organizationId, tripId, password, reason, requestId), client);

export const deleteHostedPlantProduct = (organizationId, plantProductId, password, reason, requestId, client) =>
  invokeProtectedDeletion(protectedDeletionPayload("delete_plant_product", organizationId, plantProductId, password, reason, requestId), client);
