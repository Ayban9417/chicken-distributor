import { emptySalePayment } from "./salePayment.js";

export const freshSaleTransaction = (date, salesmanId) => ({
  customerId: "",
  trustReceipt: "",
  saleDate: date,
  saleAgent: salesmanId,
  salePayment: emptySalePayment(),
});

export const freshPaymentTransaction = (agentId, date, customerId = "") => ({
  agentId,
  customerId,
  amount: "",
  method: "Cash",
  date,
  reference: "",
  bank: "",
  notes: "",
  manual: false,
  allocations: [],
});
