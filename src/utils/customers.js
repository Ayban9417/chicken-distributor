import { customerBalance, money } from "./business.js";

export const customerPermissions = {
  "Owner / Admin": { manage: true, quickAdd: true },
  Agent: { manage: false, quickAdd: true },
  Cashier: { manage: false, quickAdd: false },
  Warehouse: { manage: false, quickAdd: false },
};
export const emptyCustomer = () => ({ name: "", contactPerson: "", mobile: "", address: "", type: "Other", paymentType: "Cash", creditLimit: "", paymentDays: "", active: true, pricing: {}, agentId: "", creditStatus: "Good" });
export const normalizeCustomer = (customer) => ({ ...emptyCustomer(), ...customer, paymentType: customer.paymentType || (customer.type?.includes("Credit") ? "Credit" : "Cash") });
const normalizeName = (value) => String(value || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const phone = (value) => String(value || "").replace(/\D/g, "").replace(/^63(?=\d{10}$)/, "0");
export function matchesCustomer(customer, query) {
  const text = query.trim().toLowerCase();
  return !text || [customer.name, customer.contactPerson, customer.mobile].some((v) => String(v || "").toLowerCase().includes(text)) || (phone(query).length >= 3 && phone(customer.mobile).includes(phone(query)));
}
export const duplicateCustomers = (customers, draft) => customers.filter((c) => c.id !== draft.id && (normalizeName(c.name) === normalizeName(draft.name) || (phone(draft.mobile).length >= 7 && phone(c.mobile) === phone(draft.mobile))));
export const hasCustomerHistory = (customerId, state) => [state.outs, state.collections, state.ledgerEntries].some((records) => (records || []).some((r) => r.customerId === customerId));
export function validateCustomer(draft) {
  if (!draft.name.trim()) return "Customer Name is required.";
  if (draft.creditLimit !== "" && (!Number.isFinite(Number(draft.creditLimit)) || Number(draft.creditLimit) < 0)) return "Credit Limit must be a nonnegative amount.";
  if (draft.paymentDays !== "" && (!Number.isInteger(Number(draft.paymentDays)) || Number(draft.paymentDays) < 0)) return "Payment Days must be a nonnegative whole number.";
  if (Object.values(draft.pricing).some((price) => price !== "" && (!Number.isFinite(Number(price)) || Number(price) < 0))) return "Selling prices must be nonnegative amounts.";
  return "";
}
export function customerRecord(draft) {
  return { ...draft, name: draft.name.trim(), contactPerson: draft.contactPerson.trim(), mobile: draft.mobile.trim(), address: draft.address.trim(),
    creditLimit: draft.creditLimit === "" ? null : Number(draft.creditLimit), paymentDays: draft.paymentDays === "" ? null : Number(draft.paymentDays),
    pricing: Object.fromEntries(Object.entries(draft.pricing).filter(([, price]) => price !== "").map(([product, price]) => [product, Number(price)])) };
}
export const allowsCredit = (customer) => customer.paymentType !== "Cash";
export const availableCredit = (customer, ledger) => customer.creditLimit === null || customer.creditLimit === "" || customer.creditLimit === undefined ? null : money(Number(customer.creditLimit) - customerBalance(ledger, customer.id));
export const exceedsCredit = (customer, ledger, amount) => allowsCredit(customer) && availableCredit(customer, ledger) !== null && Number(amount) > availableCredit(customer, ledger);
