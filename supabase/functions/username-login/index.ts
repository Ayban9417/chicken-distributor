import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "@supabase/supabase-js/cors";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const responseHeaders = { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" };
const operationalRoles = ["owner_admin", "warehouse", "salesman", "payroll_admin"];

const normalizeUsername = (value: unknown) => String(value || "").trim().toLowerCase();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: responseHeaders });
const invalidCredentials = () => json({ error: "Username or password is incorrect." }, 401);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Authentication service is unavailable." }, 503);

  let username = "";
  let password = "";
  try {
    const body = await request.json();
    username = normalizeUsername(body?.username);
    password = String(body?.password || "");
  } catch {
    return invalidCredentials();
  }
  if (!/^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/.test(username) || !password) return invalidCredentials();

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, active")
    .eq("username", username)
    .maybeSingle();
  if (profileError || !profile?.active) return invalidCredentials();

  const { data: memberships, error: membershipError } = await admin
    .from("organization_memberships")
    .select("role")
    .eq("user_id", profile.id)
    .eq("active", true);
  if (membershipError || !memberships?.some((item) => operationalRoles.includes(item.role))) return invalidCredentials();

  const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(profile.id);
  if (authUserError || !authUser.user?.email) return invalidCredentials();

  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await authClient.auth.signInWithPassword({ email: authUser.user.email, password });
  if (error || !data.session) return invalidCredentials();

  return json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in,
  });
});
