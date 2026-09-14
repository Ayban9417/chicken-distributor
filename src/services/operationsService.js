import { requireSupabase } from "../lib/supabaseClient.js";

const requestId = () => crypto.randomUUID();
const fail = (result) => { if (result.error) throw result.error; return result.data || []; };
const hasValue = (value) => value !== "" && value !== null && value !== undefined;
const optionalNumber = (key, value) => hasValue(value) ? { [key]: Number(value) } : {};

export async function loadPeople(organizationId) {
  const client = requireSupabase();
  const memberships = fail(await client.from("organization_memberships").select("user_id, role, active").eq("organization_id", organizationId));
  const ids = memberships.map((item) => item.user_id);
  if (!ids.length) return [];
  const profiles = fail(await client.from("profiles").select("id, full_name, active").in("id", ids));
  return memberships.map((membership) => {
    const profile = profiles.find((item) => item.id === membership.user_id);
    return { ...membership, ...profile, membership_active: membership.active, profile_active: profile?.active, active: membership.active && profile?.active !== false };
  }).filter((item) => item.id);
}

export async function loadStockFormData(organizationId) {
  const client = requireSupabase();
  const [plants, products, links, codes, classes] = await Promise.all([
    client.from("plants").select("*").eq("organization_id", organizationId).eq("active", true).order("name"),
    client.from("products").select("*").eq("organization_id", organizationId).eq("active", true).order("name"),
    client.from("plant_products").select("*").eq("active", true),
    client.from("plant_product_codes").select("*").eq("active", true).order("code"),
    client.from("plant_product_class_types").select("*").eq("active", true).order("class_type"),
  ]);
  [plants, products, links, codes, classes].forEach(fail);
  return {
    plants: plants.data,
    products: products.data,
    links: links.data.map((link) => ({
      ...link,
      product: products.data.find((product) => product.id === link.product_id),
      codes: codes.data.filter((code) => code.plant_product_id === link.id),
      classTypes: classes.data.filter((item) => item.plant_product_id === link.id),
    })),
  };
}

async function rpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data;
}

export const buildStockTripArgs = (organizationId, values, clientRequestId) => ({
  p_organization_id: organizationId,
  p_plant_id: values.plantId,
  p_trip_date: values.date,
  p_lines: values.lines.map((line) => ({
    plant_product_id: line.plantProductId,
    code_id: line.codeId || null,
    class_type_id: line.classTypeId || null,
    ...optionalNumber("bags", line.bags),
    ...optionalNumber("head_count", line.headCount),
    quantity_kg: Number(line.quantity),
    acquisition_type: line.acquisitionType,
    cost_per_kg: line.acquisitionType === "free_from_plant" ? 0 : Number(line.cost),
  })),
  p_client_request_id: clientRequestId,
  p_reference_number: values.reference || null,
  p_delivery_note: values.deliveryNote || null,
  p_notes: values.notes || null,
});

export const createStockTrip = (organizationId, values, clientRequestId = requestId(), client = requireSupabase()) =>
  rpc(client, "create_stock_trip", buildStockTripArgs(organizationId, values, clientRequestId));

export async function loadWarehouseStock(organizationId) {
  return fail(await requireSupabase().from("warehouse_stock_summary").select("*").eq("organization_id", organizationId).order("trip_date", { ascending: false }));
}

export async function loadSalesmanStock(organizationId, salesmanId = null) {
  let query = requireSupabase().from("salesman_stock_summary").select("*").eq("organization_id", organizationId).order("trip_date", { ascending: false });
  if (salesmanId) query = query.eq("salesman_user_id", salesmanId);
  return fail(await query);
}

export const buildWarehouseTransferArgs = (organizationId, values, clientRequestId) => ({
  p_organization_id: organizationId,
  p_salesman_user_id: values.salesmanId,
  p_effective_date: values.date,
  p_lines: values.lines.map((line) => ({ inventory_lot_id: line.lotId, quantity_kg: Number(line.quantity), ...optionalNumber("bags", line.bags), ...optionalNumber("head_count", line.headCount) })),
  p_client_request_id: clientRequestId,
  p_notes: values.notes || null,
});

export const transferWarehouseStock = (organizationId, values, clientRequestId = requestId(), client = requireSupabase()) =>
  rpc(client, "transfer_warehouse_to_salesman", buildWarehouseTransferArgs(organizationId, values, clientRequestId));

export const buildSalesmanTransferArgs = (organizationId, values, clientRequestId) => ({
  p_organization_id: organizationId,
  p_from_salesman_user_id: values.fromSalesmanId,
  p_to_salesman_user_id: values.toSalesmanId,
  p_effective_date: values.date,
  p_lines: values.lines.map((line) => ({ inventory_lot_id: line.lotId, quantity_kg: Number(line.quantity), ...optionalNumber("bags", line.bags), ...optionalNumber("head_count", line.headCount) })),
  p_client_request_id: clientRequestId,
  p_notes: values.notes || null,
});

export const transferSalesmanStock = (organizationId, values, clientRequestId = requestId(), client = requireSupabase()) =>
  rpc(client, "transfer_salesman_to_salesman", buildSalesmanTransferArgs(organizationId, values, clientRequestId));

export async function loadCustomers(organizationId) {
  return fail(await requireSupabase().from("customers").select("*").eq("organization_id", organizationId).order("name"));
}

export async function saveCustomer(organizationId, values) {
  const client = requireSupabase();
  const payload = {
    organization_id: organizationId,
    name: values.name.trim(),
    contact_person: values.contactPerson?.trim() || null,
    mobile: values.mobile?.trim() || null,
    address: values.address?.trim() || null,
    customer_type: values.customerType || "other",
    payment_type: values.paymentType || "cash",
    credit_limit: hasValue(values.creditLimit) ? Number(values.creditLimit) : null,
    payment_terms_days: hasValue(values.paymentTerms) ? Number(values.paymentTerms) : null,
    active: values.active !== false,
  };
  const query = values.id ? client.from("customers").update(payload).eq("id", values.id) : client.from("customers").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data;
}

export const buildSaleArgs = (organizationId, values, clientRequestId, paymentRequestId = requestId()) => ({
  p_organization_id: organizationId,
  p_customer_id: values.customerId,
  p_salesman_user_id: values.salesmanId,
  p_sale_date: values.date,
  p_trust_receipt_number: values.trustReceipt.trim(),
  p_lines: values.lines.map((line) => ({ inventory_lot_id: line.lotId, quantity_kg: Number(line.quantity), selling_price_per_kg: Number(line.price), price_override: false, default_price: null })),
  p_client_request_id: clientRequestId,
  p_sales_deductions: Number(values.deductions || 0),
  p_notes: values.notes || null,
  p_initial_payment: Number(values.paymentAmount || 0) > 0 ? {
    amount: Number(values.paymentAmount),
    method: values.paymentMethod,
    reference_number: values.paymentReference || null,
    notes: values.paymentNotes || null,
    client_request_id: paymentRequestId,
  } : null,
});

export const createSale = (organizationId, values, clientRequestId = requestId(), client = requireSupabase()) =>
  rpc(client, "create_sale", buildSaleArgs(organizationId, values, clientRequestId));

export const buildPaymentArgs = (organizationId, values, clientRequestId) => ({
  p_organization_id: organizationId,
  p_customer_id: values.customerId,
  p_payment_date: values.date,
  p_amount: Number(values.amount),
  p_method: values.method,
  p_client_request_id: clientRequestId,
  p_salesman_user_id: values.salesmanId || null,
  p_reference_number: values.reference || null,
  p_notes: values.notes || null,
  p_target_sale_id: values.saleId || null,
});

export const recordPayment = (organizationId, values, clientRequestId = requestId(), client = requireSupabase()) =>
  rpc(client, "record_payment", buildPaymentArgs(organizationId, values, clientRequestId));

export async function loadFinance(organizationId) {
  const client = requireSupabase();
  const [balances, ledger, collectibles, sales, payments] = await Promise.all([
    client.from("customer_balances").select("*").eq("organization_id", organizationId),
    client.from("customer_ledger_entries").select("*").eq("organization_id", organizationId).order("entry_date").order("created_at"),
    client.from("collectibles").select("*").eq("organization_id", organizationId).order("sale_date"),
    client.from("sales").select("*").eq("organization_id", organizationId).order("sale_date", { ascending: false }),
    client.from("payments").select("*").eq("organization_id", organizationId).order("payment_date", { ascending: false }),
  ]);
  [balances, ledger, collectibles, sales, payments].forEach(fail);
  return { balances: balances.data, ledger: ledger.data, collectibles: collectibles.data, sales: sales.data, payments: payments.data };
}

export async function recordExpense(organizationId, values, createdBy) {
  const { data, error } = await requireSupabase().from("expenses").insert({
    organization_id: organizationId,
    salesman_user_id: values.salesmanId || null,
    expense_date: values.date,
    category: values.category.trim(),
    amount: Number(values.amount),
    payment_source: values.source,
    description: values.description?.trim() || null,
    approval_status: values.status || "approved",
    created_by: createdBy,
  }).select("*").single();
  if (error) throw error;
  return data;
}

export const buildDcrArgs = (organizationId, values, clientRequestId) => ({
  p_organization_id: organizationId,
  p_salesman_user_id: values.salesmanId,
  p_report_date: values.date,
  p_actual_cash_remittance: Number(values.actual),
  p_client_request_id: clientRequestId,
  p_explanation: values.explanation || null,
});

export const submitDcr = (organizationId, values, clientRequestId = requestId(), client = requireSupabase()) =>
  rpc(client, "submit_dcr", buildDcrArgs(organizationId, values, clientRequestId));

export async function loadOperationsSummary(organizationId) {
  const client = requireSupabase();
  const [warehouse, salesman, trips, sales, payments, expenses, dcrs, plantSales, productSales] = await Promise.all([
    client.from("company_stock_summary").select("*").eq("organization_id", organizationId),
    client.from("salesman_stock_summary").select("available_quantity_kg").eq("organization_id", organizationId),
    client.from("stock_trips").select("id, trip_date").eq("organization_id", organizationId),
    client.from("sales").select("sale_date, net_sales, total_cogs, gross_profit").eq("organization_id", organizationId).neq("status", "voided"),
    client.from("payments").select("payment_date, amount, method, salesman_user_id").eq("organization_id", organizationId).is("voided_at", null),
    client.from("expenses").select("id, expense_date, category, amount, payment_source, description, approval_status, salesman_user_id, created_by").eq("organization_id", organizationId),
    client.from("daily_cash_reports").select("*").eq("organization_id", organizationId).order("report_date", { ascending: false }),
    client.from("sales_by_plant").select("*").eq("organization_id", organizationId),
    client.from("sales_by_product").select("*").eq("organization_id", organizationId),
  ]);
  [warehouse, salesman, trips, sales, payments, expenses, dcrs, plantSales, productSales].forEach(fail);
  return { companyStock: warehouse.data, salesmanStock: salesman.data, trips: trips.data, sales: sales.data, payments: payments.data, expenses: expenses.data, dcrs: dcrs.data, plantSales: plantSales.data, productSales: productSales.data };
}
