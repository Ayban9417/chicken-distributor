import { requireSupabase } from "../lib/supabaseClient";

export async function signIn(email, password) {
  const { data, error } = await requireSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
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
  return requireSupabase().auth.onAuthStateChange((_event, session) => callback(session)).data.subscription;
}

export async function loadAccess(userId) {
  const client = requireSupabase();
  const [{ data: profile, error: profileError }, { data: memberships, error: membershipError }] =
    await Promise.all([
      client.from("profiles").select("id, full_name, active").eq("id", userId).maybeSingle(),
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
