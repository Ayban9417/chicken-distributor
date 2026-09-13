import { money } from "./business.js";
export const emptySalePayment = () => ({ enabled: false, amount: "", method: "Cash", reference: "", bank: "", notes: "" });
export const initialPaymentAmount = (payment) => payment.enabled ? money(Number(payment.amount ?? 0)) : 0;
export function validateSalePayment(payment, total) {
  if (!payment.enabled) return "";
  const amount = Number(payment.amount ?? 0);
  if (!Number.isFinite(amount) || amount < 0) return "Amount Paid must be a valid nonnegative amount.";
  if (amount > total) return "Payment cannot exceed Sale Total.";
  if (!amount) return "";
  if (!["Cash", "GCash", "Bank Deposit"].includes(payment.method)) return "Select a payment method.";
  if (payment.method !== "Cash" && !payment.reference.trim()) return "Reference Number is required for electronic payments.";
  return "";
}
export const paymentAtSaleStatus = (total, amount) => amount >= total && total > 0 ? "PAID" : amount > 0 ? "PARTIALLY PAID" : "UNPAID";
export function saleFinancialEvents(out, payment, paymentRef, uid) {
  const problem = validateSalePayment(payment, out.total);
  if (problem) throw new Error(problem);
  const amount = initialPaymentAmount(payment);
  const charge = { id: uid("led"), customerId: out.customerId, date: out.date, ref: out.ref, trustReceipt: out.trustReceipt,
    agentId: out.agentId, description: "Sale", charge: out.total, payment: 0, type: "OUT", outId: out.id };
  if (!amount) return { entries: [charge], collection: null, discrepancy: null };
  // Initial payment belongs to this Sale, even when the customer has older debt.
  // Later payments still use the existing FIFO allocation workflow.
  const allocations = [{ invoiceRef: out.ref, amount }];
  const collection = { id: uid("col"), ref: paymentRef, customerId: out.customerId, agentId: out.agentId, date: out.date,
    amount, method: payment.method, reference: payment.reference.trim(), bank: payment.bank.trim(), notes: payment.notes?.trim() || "", allocations,
    outId: out.id, saleRef: out.ref, source: "Payment at Sale",
    destination: payment.method === "Cash" ? "Cash held by Salesman until remittance" : payment.method === "GCash" ? "Owner GCash" : "Owner Bank Account" };
  const entry = { ...collection, id: uid("led"), type: "Payment", description: payment.method + " Payment at Sale", charge: 0, payment: amount };
  const discrepancy = payment.method === "Bank Deposit" ? { id: uid("disc-bank"), date: out.date, type: "Payment Verification", title: "Bank Verification", status: "Open",
    customerId: out.customerId, agentId: out.agentId, amount, details: paymentRef + " awaiting verification / " + out.ref } : null;
  return { entries: [charge, entry], collection, discrepancy };
}
