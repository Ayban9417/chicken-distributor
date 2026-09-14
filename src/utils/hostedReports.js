const number = (value) => Number(value || 0);

export const sumBy = (rows, key) => rows.reduce((total, row) => total + number(row[key]), 0);

export function tripBagSummary(products = []) {
  const recorded = products.filter((product) => product.bags !== null && product.bags !== undefined);
  if (!recorded.length) return "Not recorded";
  const total = recorded.reduce((sum, product) => sum + number(product.bags), 0);
  return recorded.length === products.length ? total : `${total} recorded`;
}

export function financialSummary(sales = [], expenses = []) {
  const grossSales = sumBy(sales, "gross_sales");
  const salesDeductions = sumBy(sales, "sales_deductions");
  const netSales = sumBy(sales, "net_sales");
  const cogs = sumBy(sales, "total_cogs");
  const approvedExpenses = expenses.filter((row) => row.approval_status === "approved");
  const expenseTotal = sumBy(approvedExpenses, "amount");
  return {
    grossSales,
    salesDeductions,
    netSales,
    cogs,
    expenses: expenseTotal,
    profitEstimate: netSales - cogs - expenseTotal,
  };
}

function groupRows(rows, keyFor, seedFor, addRow) {
  const grouped = new Map();
  for (const row of rows) {
    const key = keyFor(row);
    const current = grouped.get(key) || seedFor(row);
    addRow(current, row);
    grouped.set(key, current);
  }
  return [...grouped.values()];
}

export function salesByPlant(rows = []) {
  return groupRows(
    rows,
    (row) => row.plant_id || row.plant_name,
    (row) => ({ plantId: row.plant_id, plantName: row.plant_name || "Unspecified Plant", saleCount: 0, quantityKg: 0, sales: 0, cogs: 0, grossProfit: 0 }),
    (total, row) => {
      total.saleCount += number(row.sale_count);
      total.quantityKg += number(row.quantity_kg);
      total.sales += number(row.gross_sales);
      total.cogs += number(row.cogs);
      total.grossProfit += number(row.gross_profit);
    },
  ).sort((a, b) => b.sales - a.sales || a.plantName.localeCompare(b.plantName));
}

export function salesByProduct(lines = []) {
  return groupRows(
    lines,
    (row) => [row.product_id, row.code_id || "", row.class_type_id || ""].join("|"),
    (row) => ({
      productId: row.product_id,
      productName: row.product_name || "Unknown Product",
      category: row.category || "-",
      code: row.product_code || "-",
      classType: row.class_type || "-",
      quantityKg: 0,
      sales: 0,
      cogs: 0,
      grossProfit: 0,
      margin: 0,
    }),
    (total, row) => {
      total.quantityKg += number(row.quantity_kg);
      total.sales += number(row.line_sales);
      total.cogs += number(row.line_cogs);
      total.grossProfit += number(row.line_gross_profit);
      total.margin = total.sales ? (total.grossProfit / total.sales) * 100 : 0;
    },
  ).sort((a, b) => b.sales - a.sales || a.productName.localeCompare(b.productName));
}

export function collectibleSummary(rows = [], payments = []) {
  const lastPaymentByCustomer = new Map();
  for (const payment of payments) {
    if (payment.voided_at) continue;
    const current = lastPaymentByCustomer.get(payment.customer_id);
    if (!current || payment.payment_date > current.payment_date) lastPaymentByCustomer.set(payment.customer_id, payment);
  }
  return groupRows(
    rows,
    (row) => row.customer_id,
    (row) => ({ customerId: row.customer_id, customerName: row.customer_name || "Unknown Customer", outstanding: 0, oldestUnpaid: row.sale_date || null, openSales: 0, lastPayment: lastPaymentByCustomer.get(row.customer_id) || null }),
    (total, row) => {
      total.outstanding += number(row.outstanding_balance);
      total.openSales += 1;
      if (row.sale_date && (!total.oldestUnpaid || row.sale_date < total.oldestUnpaid)) total.oldestUnpaid = row.sale_date;
    },
  ).sort((a, b) => b.outstanding - a.outstanding || a.customerName.localeCompare(b.customerName));
}

export function dcrSummary(rows = []) {
  return {
    reportCount: rows.length,
    cash: sumBy(rows, "cash_collected"),
    gcash: sumBy(rows, "gcash_collected"),
    bank: sumBy(rows, "bank_collected"),
    expenses: sumBy(rows, "cash_paid_expenses"),
    expected: sumBy(rows, "expected_cash_remittance"),
    actual: sumBy(rows, "actual_cash_remittance"),
    difference: sumBy(rows, "difference"),
  };
}

export function inDateRange(date, range) {
  return Boolean(date && range?.start && range?.end && date >= range.start && date <= range.end);
}
