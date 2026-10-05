import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const configuredOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((value) => value.trim()).filter(Boolean);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isAllowedOrigin = (origin: string) => !origin
  || configuredOrigins.includes(origin)
  || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

const responseHeaders = (request: Request) => {
  const origin = request.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    ...(origin && isAllowedOrigin(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
};

function knownDatabaseError(error: { code?: string; message?: string } | null) {
  const message = error?.message || "";
  if (error?.code === "55000" && /^This (trip|product) /.test(message)) return { error: message, status: 409 };
  if (error?.code === "P0002") return { error: "The selected record was not found or was already deleted.", status: 404 };
  if (error?.code === "42501") return { error: "Owner / Admin authorization is required.", status: 403 };
  if (error?.code === "22023" && /deletion reason/i.test(message)) return { error: "Enter a deletion reason between 3 and 200 characters.", status: 400 };
  return { error: "The deletion could not be completed.", status: 400 };
}

Deno.serve(async (request) => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: responseHeaders(request) });
  const origin = request.headers.get("Origin") || "";
  if (origin && !isAllowedOrigin(origin)) return json({ error: "Origin is not allowed." }, 403);
  if (request.method === "OPTIONS") return new Response("ok", { headers: responseHeaders(request) });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Deletion service is unavailable." }, 503);

  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Authentication is required." }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerData, error: callerError } = await userClient.auth.getUser();
  if (callerError || !callerData.user) return json({ error: "Authentication is required." }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid deletion request." }, 400);
  }

  const organizationId = String(body.organizationId || "");
  const targetId = String(body.targetId || "");
  const requestId = String(body.requestId || "");
  const action = String(body.action || "");
  const password = String(body.password || "");
  const reason = String(body.reason || "").trim();
  if (![organizationId, targetId, requestId].every((value) => uuidPattern.test(value))) return json({ error: "Invalid deletion request." }, 400);
  if (!password) return json({ error: "Enter your current password." }, 400);
  if (action === "delete_stock_trip" && (reason.length < 3 || reason.length > 200)) {
    return json({ error: "Enter a deletion reason between 3 and 200 characters." }, 400);
  }
  if (!new Set(["delete_stock_trip", "delete_plant_product"]).has(action)) return json({ error: "Unsupported deletion action." }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const [{ data: ownerMembership, error: ownerError }, { data: profile, error: profileError }] = await Promise.all([
    admin.from("organization_memberships").select("id").eq("organization_id", organizationId).eq("user_id", callerData.user.id).eq("role", "owner_admin").eq("active", true).maybeSingle(),
    admin.from("profiles").select("id").eq("id", callerData.user.id).eq("active", true).maybeSingle(),
  ]);
  if (ownerError || profileError || !ownerMembership || !profile) return json({ error: "Owner / Admin authorization is required." }, 403);

  const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(callerData.user.id);
  const internalEmail = authUser.user?.email;
  if (authUserError || !internalEmail) return json({ error: "Current password could not be verified." }, 401);

  const verifier = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: reauthenticated, error: passwordError } = await verifier.auth.signInWithPassword({ email: internalEmail, password });
  if (passwordError || reauthenticated.user?.id !== callerData.user.id) return json({ error: "Current password is incorrect." }, 401);

  const rpc = action === "delete_stock_trip" ? "delete_unused_stock_trip" : "delete_unused_plant_product";
  const targetKey = action === "delete_stock_trip" ? "p_stock_trip_id" : "p_plant_product_id";
  const result = await admin.rpc(rpc, {
    p_organization_id: organizationId,
    [targetKey]: targetId,
    p_actor_user_id: callerData.user.id,
    p_reason: reason || "Product added by mistake.",
    p_request_id: requestId,
  });
  if (result.error) {
    const safe = knownDatabaseError(result.error);
    return json({ error: safe.error }, safe.status);
  }
  return json({ deletion: result.data });
});
