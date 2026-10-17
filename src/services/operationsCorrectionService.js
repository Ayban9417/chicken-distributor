import { requireSupabase } from "../lib/supabaseClient.js";

async function invoke(body, client = requireSupabase()) {
  const { data, error } = await client.functions.invoke("admin-operations-correction", { body });
  if (error) {
    let message = "Secure correction services are not configured.";
    try { message = (await error.context?.clone?.().json())?.error || message; } catch { /* Recoverable fallback. */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export const previewOperationsCorrection = (module, kind, organizationId, transactionId, changes, client) =>
  invoke({ action: "preview", module, kind, organizationId, transactionId, changes }, client)
    .then((result) => result.preview);

export const applyOperationsCorrection = (module, kind, organizationId, transactionId,
  changes, password, reason, requestId, versionToken, client) =>
  invoke({ action: "apply", module, kind, organizationId, transactionId, changes,
    password, reason, requestId, versionToken }, client).then((result) => result.correction);
