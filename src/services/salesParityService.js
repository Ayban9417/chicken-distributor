import { requireSupabase } from "../lib/supabaseClient.js";
import { createSale, loadCustomers, loadFinance, loadPeople, loadSalesmanStock } from "./operationsService.js";
import { parityUsers } from "./inventoryParityService.js";

const fail = (result) => {
  if (result.error) throw result.error;
  return result.data || [];
};
const number = (value) => Number(value || 0);
const titlePayment = (value) => value === "cash_credit" ? "Cash / Credit" : value ? value[0].toUpperCase() + value.slice(1) : "Cash";

export async function loadHostedSales(organizationId, client = requireSupabase()) {
  const [customerRows, people, stock, finance, pricesResult, productsResult] = await Promise.all([
    loadCustomers(organizationId),
    loadPeople(organizationId),
    loadSalesmanStock(organizationId),
    loadFinance(organizationId),
    client.from("customer_prices").select("customer_id, product_id, selling_price_per_kg").eq("active", true),
    client.from("products").select("id, name").eq("organization_id", organizationId),
  ]);
  const prices = fail(pricesResult);
  const products = fail(productsResult);
  const productMap = new Map(products.map((row) => [row.id, row.name]));
  const customers = customerRows.map((row) => ({
    id: row.id,
    name: row.name,
    contactPerson: row.contact_person || "",
    mobile: row.mobile || "",
    address: row.address || "",
    type: row.customer_type || "Other",
    paymentType: titlePayment(row.payment_type),
    creditLimit: row.credit_limit,
    paymentDays: row.payment_terms_days,
    creditStatus: "Good",
    active: row.active,
    pricing: Object.fromEntries(prices.filter((price) => price.customer_id === row.id).map((price) => [productMap.get(price.product_id), number(price.selling_price_per_kg)]).filter(([name]) => name)),
  }));
  const tripMap = new Map();
  for (const row of stock) {
    const trip = tripMap.get(row.stock_trip_id) || { id: row.stock_trip_id, code: row.trip_number, date: row.trip_date, plant: row.plant_name, products: [] };
    let product = trip.products.find((item) => item.lotId === row.inventory_lot_id);
    if (!product) {
      product = { lotId: row.inventory_lot_id, name: row.product_name, category: row.category === "whole_chicken" ? "Whole Chicken" : "By-products", sizeCode: row.product_code || "", classType: row.class_type || "", costPerKg: number(row.cost_per_kg), originalQty: number(row.available_quantity_kg), availableBySalesman: {} };
      trip.products.push(product);
    }
    product.availableBySalesman[row.salesman_user_id] = number(row.available_quantity_kg);
    tripMap.set(row.stock_trip_id, trip);
  }
  const outs = finance.sales.map((row) => ({ id: row.id, ref: row.trust_receipt_number, trustReceipt: row.trust_receipt_number, date: row.sale_date, customerId: row.customer_id, agentId: row.salesman_user_id, total: number(row.net_sales), status: row.status, groups: [] }));
  const ledgerEntries = finance.ledger.map((row) => ({ id: row.entry_id, customerId: row.customer_id, date: row.entry_date, ref: row.reference_number, charge: number(row.debit), payment: number(row.credit), type: row.entry_type === "sale" ? "Sale" : "Payment" }));
  return { customers, users: parityUsers(people), trips: [...tripMap.values()], outs, ledgerEntries };
}

export function hostedSaleValues(order) {
  const payment = order.salePayment?.enabled ? order.salePayment : null;
  return {
    customerId: order.customerId,
    salesmanId: order.salesmanId,
    date: order.date,
    trustReceipt: order.trustReceipt,
    deductions: 0,
    notes: "",
    lines: order.groups.flatMap((group) => group.lines.map((line) => ({ lotId: line.lotId, quantity: line.qty, price: line.price }))),
    paymentAmount: payment ? payment.amount : 0,
    paymentMethod: payment ? ({ Cash: "cash", GCash: "gcash", "Bank Deposit": "bank" }[payment.method] || "cash") : "cash",
    paymentReference: payment?.reference || "",
    paymentNotes: payment?.notes || "",
  };
}

export function createHostedSale(organizationId, order) {
  return createSale(organizationId, hostedSaleValues(order));
}
