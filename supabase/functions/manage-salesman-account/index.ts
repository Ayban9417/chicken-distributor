import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "@supabase/supabase-js/cors";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const internalAuthDomain = Deno.env.get("INTERNAL_AUTH_DOMAIN") || "accounts.chicken-distributor.internal";
const responseHeaders = { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" };

const normalizeUsername = (value: unknown) => String(value || "").trim().toLowerCase();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: responseHeaders });
const messageFor = (error: { code?: string; message?: string } | null) => {
  if (error?.code === "23505" || /duplicate key/i.test(error?.message || "")) return "Username is already in use.";
  return error?.message || "The account request could not be completed.";
};

function validateUsername(value: unknown) {
  const username = normalizeUsername(value);
  if (!/^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/.test(username)) {
    throw new Error("Use 3-64 lowercase letters, numbers, dots, underscores, or hyphens.");
  }
  return username;
}

function validatePassword(value: unknown) {
  const password = String(value || "");
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  return password;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Account service is unavailable." }, 503);

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
    return json({ error: "Invalid account request." }, 400);
  }
  const organizationId = String(body.organizationId || "");
  const action = String(body.action || "");
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: ownerMembership, error: ownerError } = await admin
    .from("organization_memberships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", callerData.user.id)
    .eq("role", "owner_admin")
    .eq("active", true)
    .maybeSingle();
  if (ownerError || !ownerMembership) return json({ error: "Owner / Admin authorization is required." }, 403);

  try {
    if (action === "create") {
      const fullName = String(body.fullName || "").trim();
      const username = validateUsername(body.username);
      const password = validatePassword(body.password);
      if (!fullName) return json({ error: "Full name is required." }, 400);

      const duplicate = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
      if (duplicate.error) return json({ error: messageFor(duplicate.error) }, 400);
      if (duplicate.data) return json({ error: "Username is already in use." }, 409);

      const internalEmail = `${username}.${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}@${internalAuthDomain}`;
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: internalEmail,
        password,
        email_confirm: true,
      });
      if (createError || !created.user) return json({ error: messageFor(createError) }, 400);

      const provisioned = await admin.rpc("provision_salesman_account", {
        p_organization_id: organizationId,
        p_user_id: created.user.id,
        p_full_name: fullName,
        p_username: username,
        p_actor_user_id: callerData.user.id,
      });
      if (provisioned.error) {
        const cleanup = await admin.auth.admin.deleteUser(created.user.id);
        if (cleanup.error) return json({ error: "Account setup failed and automatic cleanup could not be confirmed." }, 500);
        return json({ error: messageFor(provisioned.error) }, provisioned.error.code === "23505" ? 409 : 400);
      }
      return json({ account: provisioned.data }, 201);
    }

    const userId = String(body.userId || "");
    const { data: target, error: targetError } = await admin
      .from("organization_memberships")
      .select("user_id, role, active, profiles!inner(full_name, username, active, must_change_password)")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .eq("role", "salesman")
      .maybeSingle();
    if (targetError || !target) return json({ error: "Salesman account not found." }, 404);

    if (action === "update" || action === "set_active") {
      const profile = Array.isArray(target.profiles) ? target.profiles[0] : target.profiles;
      const fullName = action === "update" ? String(body.fullName || "").trim() : String(profile.full_name);
      const username = action === "update" ? validateUsername(body.username) : String(profile.username);
      const active = action === "set_active" ? Boolean(body.active) : Boolean(target.active && profile.active);
      if (!fullName) return json({ error: "Full name is required." }, 400);
      const result = await admin.rpc("update_salesman_account", {
        p_organization_id: organizationId,
        p_user_id: userId,
        p_full_name: fullName,
        p_username: username,
        p_active: active,
        p_actor_user_id: callerData.user.id,
      });
      if (result.error) return json({ error: messageFor(result.error) }, result.error.code === "23505" ? 409 : 400);
      return json({ account: result.data });
    }

    if (action === "reset_password") {
      const password = validatePassword(body.password);
      const reset = await admin.auth.admin.updateUserById(userId, { password });
      if (reset.error) return json({ error: messageFor(reset.error) }, 400);
      const marked = await admin.rpc("mark_salesman_password_reset", {
        p_organization_id: organizationId,
        p_user_id: userId,
        p_actor_user_id: callerData.user.id,
      });
      if (marked.error) return json({ error: "Password was reset, but the required-change flag could not be saved. Ask the Salesman to change it immediately." }, 500);
      return json({ account: { id: userId, must_change_password: true } });
    }

    return json({ error: "Unsupported account action." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "The account request could not be completed." }, 400);
  }
});
