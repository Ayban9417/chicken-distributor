const messages = [
  [/duplicate key.*trust|sales_org_trust_receipt/i, "Trust Receipt Number already exists."],
  [/insufficient salesman stock/i, "There is not enough Salesman inventory for this stock."],
  [/insufficient warehouse stock/i, "There is not enough Warehouse inventory for this stock."],
  [/active customer not found/i, "This customer is inactive or unavailable."],
  [/not authorized|permission denied|row-level security/i, "You do not have permission to perform this action."],
  [/invalid login credentials/i, "Email or password is incorrect."],
];

export function readableError(error, fallback = "The request could not be completed.") {
  const detail = [error?.message, error?.details, error?.hint].filter(Boolean).join(" ");
  const match = messages.find(([pattern]) => pattern.test(detail));
  if (import.meta.env.DEV && error) console.error(error);
  return match?.[1] || detail || fallback;
}
