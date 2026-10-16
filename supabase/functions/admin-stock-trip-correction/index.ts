import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { authorizeAdminCorrection, CorrectionAuthorizationError } from "../_shared/adminCorrectionAuthorization.js";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const configuredOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((value) => value.trim()).filter(Boolean);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedOrigin = (origin: string) => !origin || configuredOrigins.includes(origin)
  || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

function databaseError(error: { code?: string; message?: string } | null) {
  const message = error?.message || "";
  if (error?.code === "42501") return { status: 403, error: "Owner / Admin authorization is required." };
  if (error?.code === "P0002") return { status: 404, error: "Received Stock-In Trip was not found." };
  if (error?.code === "PGRST202") return { status: 503, error: "Stock-In correction database migration is not available yet." };
  if (error?.code === "40001") return { status: 409, error: "The Trip changed. Refresh the preview before correcting it." };
  if (error?.code === "23505") return { status: 409, error: /request/i.test(message) ? "This correction request was already used." : "The reference number is already used." };
  if (error?.code === "55000") return { status: 409, error: message.slice(0, 700) };
  if (error?.code === "22023") return { status: 400, error: "Check the correction fields and try again." };
  if (error?.code === "22008" || error?.code === "22007") return { status: 400, error: "Enter a valid Trip date." };
  return { status: 400, error: "Stock-In correction could not be completed." };
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") || "";
  const headers = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    ...(origin && allowedOrigin(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !allowedOrigin(origin)) return json({ error: "Origin is not allowed." }, 403);
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Correction service is unavailable." }, 503);
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Authentication is required." }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid correction request." }, 400);
  }
  const organizationId = String(body.organizationId || "");
  const tripId = String(body.tripId || "");
  const action = String(body.action || "");
  if (!uuidPattern.test(organizationId) || !uuidPattern.test(tripId)
      || (action !== "preview" && action !== "apply")
      || !body.changes || typeof body.changes !== "object" || Array.isArray(body.changes)) {
    return json({ error: "Invalid correction request." }, 400);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (action === "preview") {
    const { data, error } = await userClient.rpc("preview_stock_trip_correction", {
      p_organization_id: organizationId, p_stock_trip_id: tripId, p_changes: body.changes,
    });
    if (error) {
      const safe = databaseError(error);
      return json({ error: safe.error }, safe.status);
    }
    return json({ preview: data });
  }

  const requestId = String(body.requestId || "");
  const versionToken = String(body.versionToken || "");
  const reason = String(body.reason || "").trim();
  const password = String(body.password || "");
  if (!uuidPattern.test(requestId) || !/^[a-f0-9]{32}$/.test(versionToken)
      || reason.length < 10 || reason.length > 500 || !password) {
    return json({ error: "A fresh preview, correction reason, and current password are required." }, 400);
  }
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const verifierClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let actorUserId: string;
  try {
    ({ actorUserId } = await authorizeAdminCorrection({
      authorization, organizationId, password, userClient, adminClient, verifierClient,
    }));
  } catch (error) {
    if (error instanceof CorrectionAuthorizationError) return json({ error: error.message }, error.status);
    return json({ error: "Password verification is unavailable." }, 503);
  }
  const { data, error } = await adminClient.rpc("apply_stock_trip_correction", {
    p_organization_id: organizationId,
    p_stock_trip_id: tripId,
    p_actor_user_id: actorUserId,
    p_reason: reason,
    p_request_id: requestId,
    p_expected_version: versionToken,
    p_changes: body.changes,
  });
  if (error) {
    const safe = databaseError(error);
    return json({ error: safe.error }, safe.status);
  }
  return json({ correction: data });
});
