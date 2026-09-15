import { requireSupabase } from "../lib/supabaseClient.js";
import { confirmedPasswordError, normalizeUsername, passwordError, usernameError } from "../utils/accounts.js";

async function functionError(error, fallback) {
  try {
    const body = await error?.context?.clone?.().json();
    return body?.error || fallback;
  } catch {
    return fallback;
  }
}

async function invokeAccount(body, client = requireSupabase()) {
  const { data, error } = await client.functions.invoke("manage-salesman-account", { body });
  if (error) throw new Error(await functionError(error, "The account request could not be completed."));
  if (data?.error) throw new Error(data.error);
  return data?.account || data;
}

export async function createSalesmanAccount(organizationId, values, client = requireSupabase()) {
  const validation = usernameError(values.username) || passwordError(values.password) || confirmedPasswordError(values.password, values.confirmPassword);
  if (validation) throw new Error(validation);
  if (!String(values.fullName || "").trim()) throw new Error("Enter the Salesman's full name.");
  return invokeAccount({
    action: "create",
    organizationId,
    fullName: String(values.fullName).trim(),
    username: normalizeUsername(values.username),
    password: values.password,
  }, client);
}

export async function updateSalesmanAccount(organizationId, user, client = requireSupabase()) {
  const validation = usernameError(user.username);
  if (validation) throw new Error(validation);
  if (!String(user.name || "").trim()) throw new Error("Enter the Salesman's full name.");
  return invokeAccount({
    action: "update",
    organizationId,
    userId: user.id,
    fullName: String(user.name).trim(),
    username: normalizeUsername(user.username),
  }, client);
}

export const setSalesmanAccountActive = (organizationId, userId, active, client = requireSupabase()) =>
  invokeAccount({ action: "set_active", organizationId, userId, active }, client);

export async function resetSalesmanPassword(organizationId, userId, values, client = requireSupabase()) {
  const validation = passwordError(values.password) || confirmedPasswordError(values.password, values.confirmPassword);
  if (validation) throw new Error(validation);
  return invokeAccount({ action: "reset_password", organizationId, userId, password: values.password }, client);
}
