import { requireSupabase } from "../lib/supabaseClient.js";
import { normalizeUsername } from "../utils/accounts.js";

export async function signIn(username, password, client = requireSupabase()) {
  const { data, error } = await client.functions.invoke("username-login", {
    body: { username: normalizeUsername(username), password },
  });
  if (error || !data?.access_token || !data?.refresh_token) throw new Error("Username or password is incorrect.");
  const session = await client.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
  if (session.error) throw session.error;
  return session.data;
}

export async function signOut() {
  const { error } = await requireSupabase().auth.signOut();
  if (error) throw error;
}

export async function restoreSession() {
  const { data, error } = await requireSupabase().auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthChange(callback) {
  return requireSupabase().auth.onAuthStateChange((event, session) => callback(session, event)).data.subscription;
}

export async function loadAccess(userId) {
  const client = requireSupabase();
  const [{ data: profile, error: profileError }, { data: memberships, error: membershipError }] =
    await Promise.all([
      client.from("profiles").select("id, full_name, username, active, must_change_password").eq("id", userId).maybeSingle(),
      client
        .from("organization_memberships")
        .select("id, organization_id, role, active")
        .eq("user_id", userId)
        .eq("active", true),
    ]);
  if (profileError) throw profileError;
  if (membershipError) throw membershipError;
  const membership = memberships?.[0] || null;
  if (!profile?.active || !membership) return { profile, membership: null, organization: null };
  const { data: organization, error } = await client
    .from("organizations")
    .select("id, name, slug")
    .eq("id", membership.organization_id)
    .maybeSingle();
  if (error) throw error;
  return { profile, membership, organization };
}

export async function changeOwnPassword({ currentPassword, newPassword }, client = requireSupabase()) {
  const { error } = await client.auth.updateUser({ password: newPassword, current_password: currentPassword });
  if (error) {
    if (/current password|invalid login credentials/i.test(error.message || "")) throw new Error("Current password is incorrect.");
    throw error;
  }
  const completed = await client.rpc("complete_own_password_change");
  if (completed.error) throw new Error("Password changed, but account status could not be updated. Sign in again and retry.");
  return true;
}
