const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class CorrectionAuthorizationError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "CorrectionAuthorizationError";
    this.status = status;
  }
}

async function attemptKey(organizationId, userId) {
  const bytes = new TextEncoder().encode(`admin-correction:${organizationId}:${userId}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Call for each protected correction request, immediately before its domain RPC.
// The RPC must independently check active membership and its locked row version.
export async function authorizeAdminCorrection({ authorization, organizationId, password, userClient, adminClient, verifierClient }) {
  if (!authorization?.startsWith("Bearer ")) throw new CorrectionAuthorizationError("Authentication is required.", 401);
  if (!uuidPattern.test(organizationId || "")) throw new CorrectionAuthorizationError("Invalid organization.", 400);
  if (!password) throw new CorrectionAuthorizationError("Enter your current password.", 400);

  const { data: callerData, error: callerError } = await userClient.auth.getUser(authorization.slice(7));
  const actorId = callerData?.user?.id;
  if (callerError || !actorId) throw new CorrectionAuthorizationError("Authentication is required.", 401);

  const [{ data: membership, error: membershipError }, { data: profile, error: profileError }] = await Promise.all([
    adminClient.from("organization_memberships").select("id").eq("organization_id", organizationId).eq("user_id", actorId).eq("role", "owner_admin").eq("active", true).maybeSingle(),
    adminClient.from("profiles").select("id").eq("id", actorId).eq("active", true).maybeSingle(),
  ]);
  if (membershipError || profileError || !membership || !profile) {
    throw new CorrectionAuthorizationError("Active Owner / Admin authorization is required.", 403);
  }

  const identifierHash = await attemptKey(organizationId, actorId);
  const attempt = await adminClient.rpc("consume_login_rate_limit", {
    p_identifier_hash: identifierHash,
    p_max_attempts: 5,
    p_window_seconds: 900,
  });
  if (attempt.error) throw new CorrectionAuthorizationError("Password verification is unavailable.", 503);
  if (attempt.data !== true) throw new CorrectionAuthorizationError("Too many attempts. Try again later.", 429);

  const { data: authUser, error: authUserError } = await adminClient.auth.admin.getUserById(actorId);
  const internalEmail = authUser?.user?.email;
  if (authUserError || !internalEmail) throw new CorrectionAuthorizationError("Current password could not be verified.", 401);

  const { data: verified, error: passwordError } = await verifierClient.auth.signInWithPassword({ email: internalEmail, password });
  if (passwordError || verified?.user?.id !== actorId) {
    throw new CorrectionAuthorizationError("Current password is incorrect.", 401);
  }

  const cleared = await adminClient.rpc("clear_login_rate_limit", { p_identifier_hash: identifierHash });
  if (cleared.error) throw new CorrectionAuthorizationError("Password verification is unavailable.", 503);
  return { actorUserId: actorId, organizationId };
}
