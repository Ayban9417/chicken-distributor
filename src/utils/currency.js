export function peso(value = 0) {
  const raw = String(value ?? 0).replaceAll(",", "").trim();
  const match = /^(-?)(\d+)(?:\.(\d*))?$/.exec(raw);
  if (!match) return "₱0.00";
  const fraction = (match[3] || "").padEnd(3, "0");
  let cents = BigInt(match[2]) * 100n + BigInt(fraction.slice(0, 2));
  if (fraction[2] >= "5") cents += 1n;
  const negative = match[1] === "-" && cents !== 0n;
  const whole = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}₱${whole}.${(cents % 100n).toString().padStart(2, "0")}`;
}

export function moneyInputText(value) {
  return value === "" || value === null || value === undefined ? "" : peso(value).replace(/^(-?)₱/, "$1");
}

export function editableMoneyText(value) {
  const raw = String(value).replaceAll(",", "").replace(/^₱/, "");
  if (!/^\d*(?:\.\d{0,2})?$/.test(raw)) return null;
  return raw === "." ? "0." : raw;
}
