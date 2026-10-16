import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { applyFinanceCorrection, dcrAmendmentChanges, expenseCorrectionChanges,
  previewFinanceCorrection } from "../src/services/financeCorrectionService.js";
import { applyHostedDcrAmendment, normalizeHostedDcr } from "../src/services/financeParityService.js";

const organizationId = "f6000000-0000-4000-8000-000000000001";
const transactionId = "f6000000-0000-4000-8000-000000000061";

test("Expense and DCR drafts keep money separate from original identity", () => {
  assert.deepEqual(expenseCorrectionChanges({ expenseDate: "2026-01-04", salesmanUserId: "salesman",
    category: " Fuel ", amount: "25.50", description: " Corrected ", approvalStatus: "approved" }), {
    expenseDate: "2026-01-04", salesmanUserId: "salesman", category: "Fuel", amount: 25.5,
    description: "Corrected", approvalStatus: "approved",
  });
  assert.deepEqual(dcrAmendmentChanges({ actualCashRemittance: "75.50", explanation: " Short ",
    reconciliationNotes: " Receipt checked " }), {
    actualCashRemittance: 75.5, explanation: "Short", reconciliationNotes: "Receipt checked",
  });
});

test("preview carries no password and apply uses only the dedicated finance function", async () => {
  const calls = [];
  const client = { functions: { async invoke(name, options) {
    calls.push({ name, body: options.body });
    return { data: options.body.action === "preview" ? { preview: { eligible: true } }
      : { correction: { correctionId: "qa" } }, error: null };
  } } };
  const changes = { actualCashRemittance: 80, explanation: "", reconciliationNotes: "Checked" };
  await previewFinanceCorrection("dcr", organizationId, transactionId, changes, client);
  await applyFinanceCorrection("dcr", organizationId, transactionId, changes, "not-a-real-password",
    "Correct QA DCR", "qa-request", "qa-version", client);
  assert.equal(calls[0].name, "admin-finance-correction");
  assert.equal(calls[0].body.password, undefined);
  assert.deepEqual(calls[1].body, { action: "apply", module: "dcr", organizationId,
    transactionId, changes, password: "not-a-real-password", reason: "Correct QA DCR",
    requestId: "qa-request", versionToken: "qa-version" });
});

test("amended DCR view keeps the original locked totals untouched", () => {
  const original = normalizeHostedDcr({ id: transactionId, salesman_user_id: "agent",
    report_date: "2026-01-04", status: "locked", cash_collected: 100,
    gcash_collected: 0, bank_collected: 0, cash_paid_expenses: 20,
    expected_cash_remittance: 80, actual_cash_remittance: 80, difference: 0 });
  const amended = applyHostedDcrAmendment(original, { proposed_values: {
    cashCollected: 100, gcashCollected: 0, bankCollected: 0, cashPaidExpenses: 25,
    expectedCashRemittance: 75, actualCashRemittance: 80, difference: 5,
    explanation: "Expense corrected", reconciliationNotes: "Fuel receipt reviewed",
  } });
  assert.equal(amended.snapshot.expectedCashRemittance, 80);
  assert.equal(amended.actual, 80);
  assert.equal(amended.diff, 0);
  assert.equal(amended.currentSnapshot.expectedCashRemittance, 75);
  assert.equal(amended.currentSnapshot.expenseTotals.cashPaid, 25);
  assert.equal(amended.currentDiff, 5);
  assert.equal(amended.currentNotes, "Fuel receipt reviewed");
});

test("migration protects locked DCRs, idempotency, history, and append-only amendments", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261016180902_admin_expense_dcr_corrections.sql", import.meta.url), "utf8");
  for (const name of ["public.preview_expense_correction", "public.apply_expense_correction",
    "public.preview_dcr_amendment", "public.apply_dcr_amendment"])
    assert.ok(sql.includes(`create function ${name}(`));
  for (const guard of ["private.assert_correction_request", "for update", "DCR source totals changed",
    "Moving an Expense into or out", "Finalized DCR discrepancy", "dcr_amendments_immutable",
    "private.reconcile_dcr_discrepancy", "transaction_corrections", "audit_events"])
    assert.ok(sql.includes(guard), `${guard} is present`);
  assert.match(sql, /grant execute on function public\.apply_expense_correction[^;]+to service_role/i);
  assert.match(sql, /grant execute on function public\.apply_dcr_amendment[^;]+to service_role/i);
  assert.doesNotMatch(sql, /update public\.daily_cash_reports set/i);
  assert.doesNotMatch(sql, /grant (update|delete) on public\.daily_cash_reports/i);
});

test("Owner-only actions and local disabled state are wired on both finance screens", async () => {
  const [edge, hosted, app, dialog] = await Promise.all([
    readFile(new URL("../supabase/functions/admin-finance-correction/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/HostedParityScreens.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/FinanceCorrectionDialog.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(edge, /authorizeAdminCorrection\(/);
  assert.match(edge, /preview_expense_correction/);
  assert.match(edge, /apply_dcr_amendment/);
  assert.doesNotMatch(edge, /console\.(log|error)|localStorage|sessionStorage/);
  assert.match(hosted, /onEditExpense=\{role === "owner_admin"/);
  assert.match(hosted, /onAmendDcr=\{role === "owner_admin"/);
  assert.match(app, /onEditExpense && <section/);
  assert.match(app, /onAmendDcr && <Button/);
  assert.match(dialog, /Secure correction services are unavailable in local demo mode/);
  assert.match(dialog, /reviewRequired=\{dirty \|\| !preview \|\| !baselineVersion \|\| Boolean\(error\)\}/);
  assert.match(dialog, /sm:grid-cols-2/);
});
