const sensitiveKey = /(password|passphrase|token|secret|authorization|api.?key|credential|session)/i;

export function redactCorrectionData(value) {
  if (Array.isArray(value)) return value.map(redactCorrectionData);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      sensitiveKey.test(key) ? "[REDACTED]" : redactCorrectionData(item),
    ]));
  }
  return value;
}

// Informational contract only. A future correction RPC must recompute eligibility
// and its version token from locked database rows before changing anything.
export function buildCorrectionPreview({ originalValues = {}, proposedValues = {}, affectedRecords = [], blockedReasons = [], expectedInventoryChanges = [], expectedFinancialChanges = [], versionToken = "" } = {}) {
  const reasons = [...blockedReasons];
  if (!versionToken) reasons.push("Refresh the transaction before correcting it.");
  return {
    originalValues: redactCorrectionData(originalValues),
    proposedValues: redactCorrectionData(proposedValues),
    affectedRecords: redactCorrectionData(affectedRecords),
    expectedInventoryChanges: redactCorrectionData(expectedInventoryChanges),
    expectedFinancialChanges: redactCorrectionData(expectedFinancialChanges),
    blockedReasons: reasons,
    eligible: reasons.length === 0,
    versionToken,
  };
}
