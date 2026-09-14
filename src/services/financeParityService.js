import { requireSupabase } from "../lib/supabaseClient.js";
import {
  loadCustomers,
  loadFinance,
  loadOperationsSummary,
  loadPeople,
  recordExpense,
  recordPayment,
  saveCustomer,
  submitDcr,
} from "./operationsService.js";
import { parityUsers } from "./inventoryParityService.js";
import { buildDcr } from "../utils/business.js";

const number = (value) => Number(value || 0);
const title = (value) => String(value || "").split("_").map((word) => word ? word[0].toUpperCase() + word.slice(1) : "").join(" ");
const paymentMethod = (value) => ({ cash: "Cash", gcash: "GCash", bank: "Bank Deposit" })[value] || title(value);
const paymentType = (value) => ({ cash: "Cash", credit: "Credit", cash_credit: "Cash / Credit" })[value] || title(value);
const paymentSource = (value) => ({ cash_collection: "Cash Collection", personal_cash: "Personal Cash", other: "Other" })[value] || title(value);

function fail(result) {
  if (result.error) throw result.error;
  return result.data || [];
}

const mapBy = (rows, key = "id") => new Map(rows.map((row) => [row[key], row]));
const ids = (rows, key) => [...new Set(rows.map((row) => row[key]).filter(Boolean))];

async function selectIn(client, table, columns, key, values) {
  if (!values.length) return [];
  return fail(await client.from(table).select(columns).in(key, values));
}

export function normalizeHostedCustomers(rows, prices = [], products = []) {
  const productMap = mapBy(products);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    contactPerson: row.contact_person || "",
    mobile: row.mobile || "",
    address: row.address || "",
    type: title(row.customer_type) || "Other",
    paymentType: paymentType(row.payment_type),
    creditLimit: row.credit_limit,
    paymentDays: row.payment_terms_days,
    creditStatus: "Good",
    active: row.active,
    pricing: Object.fromEntries(prices
      .filter((price) => price.customer_id === row.id)
      .map((price) => [productMap.get(price.product_id)?.name, number(price.selling_price_per_kg)])
      .filter(([name]) => name)),
  }));
}

function normalizeDcr(row) {
  const totals = {
    Cash: number(row.cash_collected),
    GCash: number(row.gcash_collected),
    "Bank Deposit": number(row.bank_collected),
  };
  totals.total = totals.Cash + totals.GCash + totals["Bank Deposit"];
  return {
    id: row.id,
    agentId: row.salesman_user_id,
    date: row.report_date,
    actual: number(row.actual_cash_remittance),
    diff: number(row.difference),
    status: row.status === "locked" ? "LOCKED" : title(row.status).toUpperCase(),
    explanation: row.explanation || "",
    snapshot: {
      collections: [],
      expenses: [],
      rows: [],
      totals,
      expenseTotals: {
        byCategory: {},
        total: number(row.cash_paid_expenses),
        cashPaid: number(row.cash_paid_expenses),
      },
      expectedCashRemittance: number(row.expected_cash_remittance),
    },
  };
}

export function normalizeHostedDcr(row, { collections = [], expenses = [], customers = [] } = {}) {
  const normalized = normalizeDcr(row);
  const liveSnapshot = buildDcr({
    collections,
    expenses,
    customers,
    agentId: normalized.agentId,
    date: normalized.date,
  });
  normalized.snapshot = {
    ...liveSnapshot,
    totals: normalized.snapshot.totals,
    expenseTotals: {
      ...liveSnapshot.expenseTotals,
      cashPaid: normalized.snapshot.expenseTotals.cashPaid,
    },
    expectedCashRemittance: normalized.snapshot.expectedCashRemittance,
  };
  return normalized;
}

export function normalizeHostedDiscrepancies(rows) {
  return rows.map((row) => ({
    id: row.id,
    date: row.created_at?.slice(0, 10) || "",
    createdAt: row.created_at,
    type: ({
      cash_shortage: "Cash",
      cash_overage: "Cash",
      inventory_difference: "Inventory",
      payment_verification: "Payment Verification",
      price_override: "Price",
      post_dcr_adjustment: "Post-DCR",
    })[row.type] || title(row.type),
    backendType: row.type,
    title: title(row.type),
    status: ({ open: "Open", investigating: "Reviewed", resolved: "Resolved", dismissed: "Dismissed" })[row.status] || title(row.status),
    severity: title(row.severity),
    agentId: row.salesman_user_id,
    relatedEntityType: row.related_entity_type,
    relatedEntityId: row.related_entity_id,
    amount: row.amount_difference === null ? undefined : Math.abs(number(row.amount_difference)),
    difference: row.amount_difference === null ? (row.quantity_difference === null ? undefined : number(row.quantity_difference)) : number(row.amount_difference),
    details: row.description,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
  }));
}

function allocationsForPayments(sales, allocations) {
  const saleMap = mapBy(sales);
  const result = new Map();
  allocations.forEach((row) => {
    const current = result.get(row.payment_id) || [];
    current.push({ saleId: row.sale_id, invoiceRef: saleMap.get(row.sale_id)?.trust_receipt_number || "-", amount: number(row.amount) });
    result.set(row.payment_id, current);
  });
  return result;
}

export function normalizeHostedCollections(payments, sales, allocations) {
  const allocationMap = allocationsForPayments(sales, allocations);
  return payments.map((row) => ({
    id: row.id,
    ref: row.payment_number,
    date: row.payment_date,
    customerId: row.customer_id,
    agentId: row.salesman_user_id,
    amount: number(row.amount),
    method: paymentMethod(row.method),
    reference: row.reference_number || "",
    notes: row.notes || "",
    verificationStatus: row.verification_status,
    allocations: allocationMap.get(row.id) || [],
  }));
}

export function normalizeHostedLedgerEntries(rows, sales, payments, allocations) {
  const saleMap = mapBy(sales);
  const paymentMap = mapBy(payments);
  const allocationMap = allocationsForPayments(sales, allocations);
  return rows.map((row) => {
    const sale = row.entry_type === "sale" ? saleMap.get(row.entry_id) : null;
    const payment = row.entry_type === "payment" ? paymentMap.get(row.entry_id) : null;
    return {
      id: row.entry_id,
      customerId: row.customer_id,
      date: row.entry_date,
      ref: row.reference_number,
      trustReceipt: sale?.trust_receipt_number || "",
      description: row.entry_type === "sale" ? "Sale" : `${paymentMethod(payment?.method)} Payment`,
      notes: payment?.notes || sale?.notes || "",
      charge: number(row.debit),
      payment: number(row.credit),
      type: row.entry_type === "sale" ? "OUT" : "Payment",
      allocations: allocationMap.get(row.entry_id) || [],
      reference: payment?.reference_number || "",
      agentId: sale?.salesman_user_id || payment?.salesman_user_id || "",
      method: paymentMethod(payment?.method),
    };
  });
}

export async function loadHostedFinanceParity(organizationId, client = requireSupabase()) {
  const [customerRows, finance, people, operations, pricesResult, productsResult, discrepanciesResult, auditResult] = await Promise.all([
    loadCustomers(organizationId),
    loadFinance(organizationId),
    loadPeople(organizationId),
    loadOperationsSummary(organizationId),
    client.from("customer_prices").select("*").eq("active", true),
    client.from("products").select("id, name, category").eq("organization_id", organizationId),
    client.from("discrepancies").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }),
    client.from("audit_events").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(100),
  ]);
  const prices = fail(pricesResult);
  const products = fail(productsResult);
  const discrepancyRows = fail(discrepanciesResult);
  const auditRows = fail(auditResult);
  const customers = normalizeHostedCustomers(customerRows, prices, products);
  const users = parityUsers(people);
  const profileMap = new Map(users.map((user) => [user.id, user]));
  const sales = finance.sales || [];
  const payments = finance.payments || [];
  const [saleLines, allocations] = await Promise.all([
    selectIn(client, "sale_lines", "*", "sale_id", ids(sales, "id")),
    selectIn(client, "payment_allocations", "*", "payment_id", ids(payments, "id")),
  ]);
  const lots = await selectIn(client, "inventory_lots", "*", "id", ids(saleLines, "inventory_lot_id"));
  const tripLines = await selectIn(client, "stock_trip_lines", "id, stock_trip_id", "id", ids(lots, "stock_trip_line_id"));
  const trips = await selectIn(client, "stock_trips", "id, trip_number, trip_date, plant_id", "id", ids(tripLines, "stock_trip_id"));
  const plants = await selectIn(client, "plants", "id, name", "id", ids(trips, "plant_id"));
  const codes = await selectIn(client, "plant_product_codes", "id, code, display_name", "id", ids(saleLines, "code_id"));
  const classes = await selectIn(client, "plant_product_class_types", "id, class_type, display_name", "id", ids(saleLines, "class_type_id"));
  const productMap = mapBy(products);
  const lotMap = mapBy(lots);
  const tripLineMap = mapBy(tripLines);
  const tripMap = mapBy(trips);
  const plantMap = mapBy(plants);
  const codeMap = mapBy(codes);
  const classMap = mapBy(classes);
  const groupsBySale = new Map();
  saleLines.forEach((line) => {
    const lot = lotMap.get(line.inventory_lot_id) || {};
    const trip = tripMap.get(tripLineMap.get(lot.stock_trip_line_id)?.stock_trip_id) || {};
    const plant = plantMap.get(trip.plant_id)?.name || "-";
    const groups = groupsBySale.get(line.sale_id) || [];
    let group = groups.find((item) => item.tripId === trip.id);
    if (!group) {
      group = { tripId: trip.id, plant, tripDate: trip.trip_date, lines: [] };
      groups.push(group);
    }
    const code = codeMap.get(line.code_id);
    const classType = classMap.get(line.class_type_id);
    group.lines.push({
      product: productMap.get(line.product_id)?.name || "Product",
      sizeCode: code?.code || "",
      sizeCodeLabel: code?.display_name || "",
      classType: classType?.class_type || "",
      classTypeLabel: classType?.display_name || "",
      qty: number(line.quantity_kg),
      price: number(line.selling_price_per_kg),
      subtotal: number(line.line_sales),
      costPerKg: number(line.acquisition_cost_per_kg),
    });
    groupsBySale.set(line.sale_id, groups);
  });
  const outs = sales.map((row) => ({
    id: row.id,
    ref: row.trust_receipt_number,
    trustReceipt: row.trust_receipt_number,
    date: row.sale_date,
    customerId: row.customer_id,
    agentId: row.salesman_user_id,
    total: number(row.net_sales),
    status: row.status,
    groups: groupsBySale.get(row.id) || [],
  }));
  const collections = normalizeHostedCollections(payments, sales, allocations);
  const ledgerEntries = normalizeHostedLedgerEntries(finance.ledger || [], sales, payments, allocations);
  const expenses = (operations.expenses || []).map((row) => ({
    id: row.id,
    agentId: row.salesman_user_id,
    date: row.expense_date,
    category: row.category,
    amount: number(row.amount),
    source: paymentSource(row.payment_source),
    description: row.description || "",
    status: title(row.approval_status),
  }));
  const dcrs = (operations.dcrs || []).map((row) => normalizeHostedDcr(row, { collections, expenses, customers }));
  const discrepancies = normalizeHostedDiscrepancies(discrepancyRows);
  const auditLog = auditRows.map((row) => ({
    id: row.id,
    at: row.created_at,
    userId: row.actor_user_id,
    actor: profileMap.get(row.actor_user_id)?.name || "System",
    action: `${title(row.entity_type)}: ${title(row.action)}`,
  }));
  return { customers, users, outs, collections, ledgerEntries, expenses, dcrs, discrepancies, auditLog, productNames: products.map((product) => product.name) };
}

export async function saveHostedCustomer(organizationId, record, client = requireSupabase()) {
  const customer = await saveCustomer(organizationId, {
    id: record.id,
    name: record.name,
    contactPerson: record.contactPerson,
    mobile: record.mobile,
    address: record.address,
    customerType: String(record.type || "other").toLowerCase().replaceAll(" ", "_"),
    paymentType: ({ Cash: "cash", Credit: "credit", "Cash / Credit": "cash_credit" })[record.paymentType] || "cash",
    creditLimit: record.creditLimit,
    paymentTerms: record.paymentDays,
    active: record.active !== false,
  });
  const products = fail(await client.from("products").select("id, name").eq("organization_id", organizationId));
  for (const product of products) {
    const value = record.pricing?.[product.name];
    const existing = fail(await client.from("customer_prices").select("id").eq("customer_id", customer.id).eq("product_id", product.id).is("code_id", null).is("class_type_id", null).eq("active", true));
    if (value === "" || value === null || value === undefined) {
      if (existing[0]) fail(await client.from("customer_prices").update({ active: false }).eq("id", existing[0].id).select("id"));
      continue;
    }
    const payload = { customer_id: customer.id, product_id: product.id, code_id: null, class_type_id: null, selling_price_per_kg: Number(value), active: true };
    if (existing[0]) fail(await client.from("customer_prices").update(payload).eq("id", existing[0].id).select("id"));
    else fail(await client.from("customer_prices").insert(payload).select("id"));
  }
  return customer;
}

export const hostedPaymentValues = (values) => ({
    customerId: values.customerId,
    salesmanId: values.agentId || null,
    date: values.date,
    amount: values.amount,
    method: ({ Cash: "cash", GCash: "gcash", "Bank Deposit": "bank" })[values.method] || "cash",
    reference: values.reference,
    notes: values.notes,
    saleId: null,
});

export function recordHostedPayment(organizationId, values) {
  return recordPayment(organizationId, hostedPaymentValues(values));
}

export const hostedExpenseValues = (values) => ({
    salesmanId: values.agentId || null,
    date: values.date,
    category: values.category,
    amount: values.amount,
    source: ({ "Cash Collection": "cash_collection", "Personal Cash": "personal_cash", Other: "other" })[values.source] || "other",
    description: values.description,
    status: String(values.status || "Approved").toLowerCase(),
});

export function recordHostedExpense(organizationId, values, createdBy) {
  return recordExpense(organizationId, hostedExpenseValues(values), createdBy);
}

export const hostedDcrValues = (values) => ({
    salesmanId: values.agentId,
    date: values.date,
    actual: values.actual,
    explanation: values.explanation,
});

export function submitHostedDcr(organizationId, values) {
  return submitDcr(organizationId, hostedDcrValues(values));
}
