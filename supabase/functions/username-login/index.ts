import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const configuredOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((value) => value.trim()).filter(Boolean);
const operationalRoles = ["owner_admin", "warehouse", "salesman", "payroll_admin"];

const normalizeUsername = (value: unknown) => String(value || "").trim().toLowerCase();
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
const json = (request: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: responseHeaders(request) });
const invalidCredentials = (request: Request) => json(request, { error: "Username or password is incorrect." }, 401);
const sha256 = async (value: string) => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") || "";
  if (origin && !isAllowedOrigin(origin)) return json(request, { error: "Origin is not allowed." }, 403);
  if (request.method === "OPTIONS") return new Response("ok", { headers: responseHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed." }, 405);
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json(request, { error: "Authentication service is unavailable." }, 503);

  let username = "";
  let password = "";
  try {
    const body = await request.json();
    username = normalizeUsername(body?.username);
    password = String(body?.password || "");
  } catch {
    return invalidCredentials(request);
  }
  if (!/^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/.test(username) || !password) return invalidCredentials(request);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const [usernameHash, ipHash] = await Promise.all([sha256(`username:${username}`), sha256(`ip:${forwardedFor}`)]);
  const [usernameLimit, ipLimit] = await Promise.all([
    admin.rpc("consume_login_rate_limit", { p_identifier_hash: usernameHash, p_max_attempts: 8, p_window_seconds: 900 }),
    admin.rpc("consume_login_rate_limit", { p_identifier_hash: ipHash, p_max_attempts: 40, p_window_seconds: 900 }),
  ]);
  if (usernameLimit.error || ipLimit.error) return json(request, { error: "Authentication service is unavailable." }, 503);
  if (!usernameLimit.data || !ipLimit.data) return json(request, { error: "Too many attempts. Try again later." }, 429);

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, active")
    .eq("username", username)
    .maybeSingle();
  if (profileError || !profile?.active) return invalidCredentials(request);

  const { data: memberships, error: membershipError } = await admin
    .from("organization_memberships")
    .select("role")
    .eq("user_id", profile.id)
    .eq("active", true);
  if (membershipError || !memberships?.some((item) => operationalRoles.includes(item.role))) return invalidCredentials(request);

  const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(profile.id);
  if (authUserError || !authUser.user?.email) return invalidCredentials(request);

  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await authClient.auth.signInWithPassword({ email: authUser.user.email, password });
  if (error || !data.session) return invalidCredentials(request);

  await admin.rpc("clear_login_rate_limit", { p_identifier_hash: usernameHash });

  return json(request, {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in,
  });
});
