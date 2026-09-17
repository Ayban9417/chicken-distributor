const messages = [
  [/duplicate key.*trust|sales_org_trust_receipt/i, "Trust Receipt Number already exists."],
  [/duplicate key.*client_request|_org_request_key/i, "This request was already processed. Refresh to see the saved result."],
  [/insufficient salesman stock/i, "There is not enough Salesman inventory for this stock."],
  [/insufficient warehouse stock/i, "There is not enough Warehouse inventory for this stock."],
  [/payment.*exceed|over.?allocat|amount exceeds/i, "The payment is greater than the outstanding balance."],
  [/reference.*required|electronic.*reference/i, "Enter the GCash or bank reference number."],
  [/daily cash report.*already|dcr.*locked|daily_cash_reports_org_salesman_date_key/i, "This DCR is already locked and cannot be changed."],
  [/already.*time.?in|open time entry/i, "Time In is already recorded for today."],
  [/time.?out.*without|no open time entry/i, "Record Time In before Time Out."],
  [/already.*time.?out|time entry.*closed/i, "Time Out is already recorded for today."],
  [/active customer not found/i, "This customer is inactive or unavailable."],
  [/jwt expired|invalid jwt|session.*expired/i, "Your session expired. Sign in again."],
  [/failed to fetch|networkerror|network request failed|load failed/i, "The service could not be reached. Check your connection and try again."],
  [/not authorized|permission denied|row-level security/i, "You do not have permission to perform this action."],
  [/inactive|no active organization membership/i, "This account is inactive. Contact the Owner / Admin."],
  [/invalid login credentials|username or password is incorrect/i, "Username or password is incorrect."],
];

export function readableError(error, fallback = "The request could not be completed.") {
  const detail = [error?.message, error?.details, error?.hint].filter(Boolean).join(" ");
  const match = messages.find(([pattern]) => pattern.test(detail));
  const isDev = import.meta.env?.DEV === true;
  if (isDev && error) console.error(error);
  return match?.[1] || (isDev ? detail : "") || fallback;
}
