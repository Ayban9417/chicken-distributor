export const normalizeUsername = (value) => String(value || "").trim().toLowerCase();

export function usernameError(value) {
  const username = normalizeUsername(value);
  if (!username) return "Enter a username.";
  if (!/^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/.test(username)) {
    return "Use 3-64 lowercase letters, numbers, dots, underscores, or hyphens.";
  }
  return "";
}

export function passwordError(value) {
  return String(value || "").length < 8 ? "Password must be at least 8 characters." : "";
}

export function confirmedPasswordError(password, confirmation) {
  return password !== confirmation ? "Passwords do not match." : "";
}
