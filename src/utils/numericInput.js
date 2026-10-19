export function numericDraft(value, { integer = false, allowNegative = false, maxDecimals } = {}) {
  const text = String(value ?? "");
  const pattern = integer
    ? (allowNegative ? /^-?\d*$/ : /^\d*$/)
    : (allowNegative ? /^-?\d*(?:\.\d*)?$/ : /^\d*(?:\.\d*)?$/);
  if (!pattern.test(text)) return null;
  const fraction = text.split(".")[1];
  return fraction && maxDecimals != null && fraction.length > maxDecimals ? null : text;
}

export function numericPlaceholder(step) {
  return step === "1" || step === 1 ? "0" : "0.00";
}

export function numericDecimals(step) {
  const fraction = String(step ?? "").split(".")[1];
  return fraction ? fraction.length : undefined;
}
