import { requireSupabase } from "../lib/supabaseClient.js";

const fail = (result) => {
  if (result.error) throw result.error;
  return result.data || [];
};

const ids = (rows, key) => [...new Set(rows.map((row) => row[key]).filter(Boolean))];
const mapBy = (rows, key = "id") => new Map(rows.map((row) => [row[key], row]));

function period(query, column, range) {
  return query.gte(column, range.start).lte(column, range.end);
}

async function selectIn(client, table, columns, key, values) {
  if (!values.length) return [];
  return fail(await client.from(table).select(columns).in(key, values));
}

export async function loadHostedReports(organizationId, range, client = requireSupabase()) {
  const base = [
    period(client.from("sales").select("id, sale_date, gross_sales, sales_deductions, net_sales, total_cogs, gross_profit").eq("organization_id", organizationId).neq("status", "voided"), "sale_date", range).order("sale_date", { ascending: false }),
    period(client.from("expenses").select("expense_date, amount, approval_status").eq("organization_id", organizationId), "expense_date", range).order("expense_date", { ascending: false }),
    period(client.from("payments").select("id, customer_id, payment_date, amount, method, voided_at").eq("organization_id", organizationId).is("voided_at", null), "payment_date", range).order("payment_date", { ascending: false }),
    client.from("payments").select("customer_id, payment_date, amount, method, voided_at").eq("organization_id", organizationId).is("voided_at", null).order("payment_date", { ascending: false }),
    period(client.from("sales_by_plant").select("*").eq("organization_id", organizationId), "sale_date", range),
    period(client.from("daily_cash_reports").select("*").eq("organization_id", organizationId), "report_date", range).order("report_date", { ascending: false }),
    client.from("collectibles").select("*").eq("organization_id", organizationId).order("sale_date"),
    client.from("warehouse_stock_summary").select("*").eq("organization_id", organizationId).order("trip_date", { ascending: false }),
    client.from("salesman_stock_summary").select("*").eq("organization_id", organizationId).order("trip_date", { ascending: false }),
    period(client.from("inventory_movements").select("*").eq("organization_id", organizationId).in("movement_type", ["warehouse_to_salesman", "salesman_to_salesman"]), "effective_date", range).order("effective_date", { ascending: false }),
    client.from("products").select("id, name, category").eq("organization_id", organizationId),
    client.from("plants").select("id, name").eq("organization_id", organizationId),
    client.from("plant_product_codes").select("id, code"),
    client.from("plant_product_class_types").select("id, class_type"),
    client.from("profiles").select("id, full_name"),
  ];

  const [salesResult, expensesResult, paymentsResult, allPaymentsResult, plantSalesResult, dcrResult, collectiblesResult, warehouseResult, salesmanResult, movementsResult, productsResult, plantsResult, codesResult, classesResult, profilesResult] = await Promise.all(base);
  const sales = fail(salesResult);
  const expenses = fail(expensesResult);
  const payments = fail(paymentsResult);
  const allPayments = fail(allPaymentsResult);
  const plantSales = fail(plantSalesResult);
  const dcrs = fail(dcrResult);
  const collectibles = fail(collectiblesResult);
  const warehouseStock = fail(warehouseResult);
  const salesmanStock = fail(salesmanResult);
  const movements = fail(movementsResult);
  const products = fail(productsResult);
  const plants = fail(plantsResult);
  const codes = fail(codesResult);
  const classes = fail(classesResult);
  const profiles = fail(profilesResult);

  const saleLines = await selectIn(client, "sale_lines", "sale_id, product_id, code_id, class_type_id, quantity_kg, line_sales, line_cogs, line_gross_profit", "sale_id", ids(sales, "id"));
  const lotRows = await selectIn(client, "inventory_lots", "id, stock_trip_line_id, plant_id, product_id, code_id, class_type_id", "id", ids(movements, "inventory_lot_id"));
  const receivingReceipts = await selectIn(client, "receiving_receipts", "id, receipt_number, salesman_user_id", "id", ids(movements.filter((row) => row.reference_type === "receiving_receipt"), "reference_id"));
  const transferReceipts = await selectIn(client, "transfer_receipts", "id, receipt_number, from_salesman_user_id, to_salesman_user_id", "id", ids(movements.filter((row) => row.reference_type === "transfer_receipt"), "reference_id"));
  const tripLines = await selectIn(client, "stock_trip_lines", "id, stock_trip_id", "id", ids(lotRows, "stock_trip_line_id"));
  const trips = await selectIn(client, "stock_trips", "id, trip_number, trip_date", "id", ids(tripLines, "stock_trip_id"));

  const productMap = mapBy(products);
  const plantMap = mapBy(plants);
  const codeMap = mapBy(codes);
  const classMap = mapBy(classes);
  const profileMap = mapBy(profiles);
  const lotMap = mapBy(lotRows);
  const tripLineMap = mapBy(tripLines);
  const tripMap = mapBy(trips);
  const receivingMap = mapBy(receivingReceipts);
  const transferMap = mapBy(transferReceipts);
  const namedDcrs = dcrs.map((row) => ({
    ...row,
    salesman_name: profileMap.get(row.salesman_user_id)?.full_name || "-",
  }));

  const productSales = saleLines.map((row) => ({
    ...row,
    product_name: productMap.get(row.product_id)?.name,
    category: productMap.get(row.product_id)?.category,
    product_code: codeMap.get(row.code_id)?.code,
    class_type: classMap.get(row.class_type_id)?.class_type,
  }));

  const transfers = movements.map((row) => {
    const lot = lotMap.get(row.inventory_lot_id) || {};
    const trip = tripMap.get(tripLineMap.get(lot.stock_trip_line_id)?.stock_trip_id) || {};
    const receipt = row.reference_type === "receiving_receipt" ? receivingMap.get(row.reference_id) : transferMap.get(row.reference_id);
    const fromName = row.from_location_type === "warehouse" ? "Warehouse" : profileMap.get(row.from_salesman_user_id)?.full_name || "Salesman";
    const toName = profileMap.get(row.to_salesman_user_id)?.full_name || (row.to_location_type === "warehouse" ? "Warehouse" : "Salesman");
    return {
      ...row,
      receipt_number: receipt?.receipt_number || "-",
      from_name: fromName,
      to_name: toName,
      plant_name: plantMap.get(lot.plant_id)?.name || "-",
      product_name: productMap.get(lot.product_id)?.name || "-",
      product_code: codeMap.get(lot.code_id)?.code || null,
      class_type: classMap.get(lot.class_type_id)?.class_type || null,
      trip_number: trip.trip_number || "-",
      trip_date: trip.trip_date || null,
    };
  });

  return { sales, expenses, payments, allPayments, plantSales, productSales, dcrs: namedDcrs, collectibles, warehouseStock, salesmanStock, transfers };
}
