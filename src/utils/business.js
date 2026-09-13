export const currency = (value = 0) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

export const kg = (value = 0) =>
  `${Number(value || 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })} kg`;

export const shortDate = (date) =>
  !date || Number.isNaN(new Date(date + "T00:00:00").getTime()) ? "-" : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(`${date}T00:00:00`)
  );

export const dayKey = (date) => date;

export const generalPrice = {
  "Whole Dressed Chicken": 190,
  Liver: 130,
  Gizzard: 135,
  Feet: 98,
  Head: 75,
  Neck: 80,
  Intestine: 70,
  "Small Intestine": 70,
  "Large Intestine": 70,
  Other: 100,
};

export function getAgentName(agents, agentId) {
  return agents.find((agent) => agent.id === agentId)?.name || "Unassigned";
}

export function getCustomerName(customers, customerId) {
  return customers.find((customer) => customer.id === customerId)?.name || "Unknown Customer";
}

export function getTripById(trips, tripId) {
  return trips.find((trip) => trip.id === tripId);
}

export const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
export const stockKey = (tripId, product, sizeCode = "", classType = "") => JSON.stringify([tripId, product, sizeCode || "", classType || ""]);
export const productLabel = (product, sizeCode = "", classType = "", sizeCodeLabel = "", classTypeLabel = "") => [product,
  sizeCode && (sizeCodeLabel && sizeCodeLabel !== sizeCode ? `${sizeCode} — ${sizeCodeLabel}` : sizeCode),
  classType && (classTypeLabel && classTypeLabel !== classType ? `${classType} — ${classTypeLabel}` : classType),
].filter(Boolean).join(" / ");
export const isWholeChicken = (item) => item.category ? item.category === "Whole Chicken" : (item.name || item.product) === "Whole Dressed Chicken";

export function getAvailableQty(trips, movements, tripId, product, sizeCode = "", classType = "") {
  const trip = getTripById(trips, tripId);
  const original = trip?.products.find((item) => item.name === product && (item.sizeCode || "") === (sizeCode || "") && (item.classType || "") === (classType || ""))?.originalQty || 0;
  const movementTotal = movements
    .filter((movement) => stockKey(movement.tripId, movement.product, movement.sizeCode, movement.classType) === stockKey(tripId, product, sizeCode, classType))
    .reduce((sum, movement) => sum + Number(movement.qty || 0), 0);
  return money(original + movementTotal);
}

export function getTripProduct(trips, tripId, product, sizeCode = "", classType = "") {
  return getTripById(trips, tripId)?.products.find((item) => item.name === product && (item.sizeCode || "") === (sizeCode || "") && (item.classType || "") === (classType || ""));
}

export function getAcquisitionCost(trips, tripId, product, sizeCode = "", classType = "") {
  const item = getTripProduct(trips, tripId, product, sizeCode, classType);
  return item?.acquisitionType === "Free from Plant" ? 0 : Number(item?.costPerKg || 0);
}

export function tripAcquisitionCost(trip) {
  return (trip?.products || []).reduce(
    (sum, product) => sum + money(Number(product.originalQty || 0) * (product.acquisitionType === "Free from Plant" ? 0 : Number(product.costPerKg || 0))),
    0
  );
}

export function getInventoryRows(trips, movements) {
  return trips.flatMap((trip) =>
    trip.products.map((product) => {
      const related = movements.filter(
        (movement) => stockKey(movement.tripId, movement.product, movement.sizeCode, movement.classType) === stockKey(trip.id, product.name, product.sizeCode, product.classType)
      );
      const totalOut = related
        .filter((movement) => movement.type === "OUT")
        .reduce((sum, movement) => sum + Math.abs(Number(movement.qty || 0)), 0);
      const adjustments = related
        .filter((movement) => movement.type === "Adjustment")
        .reduce((sum, movement) => sum + Number(movement.qty || 0), 0);
      return {
        id: stockKey(trip.id, product.name, product.sizeCode, product.classType),
        sizeCode: product.sizeCode || "",
        sizeCodeLabel: product.sizeCodeLabel || "",
        classType: product.classType || "",
        classTypeLabel: product.classTypeLabel || "",
        bags: product.bags ?? null,
        headCount: product.headCount ?? null,
        acquisitionType: product.acquisitionType || "Purchased",
        tripId: trip.id,
        tripCode: trip.code,
        plant: trip.plant,
        tripDate: trip.date,
        product: product.name,
        category: product.category,
        originalQty: product.originalQty,
        costPerKg: getAcquisitionCost(trips, trip.id, product.name, product.sizeCode, product.classType),
        originalAcquisitionCost: money(Number(product.originalQty || 0) * getAcquisitionCost(trips, trip.id, product.name, product.sizeCode, product.classType)),
        totalOut,
        adjustments,
        remainingQty: money(product.originalQty - totalOut + adjustments),
        inventoryCostValue: money((product.originalQty - totalOut + adjustments) * getAcquisitionCost(trips, trip.id, product.name, product.sizeCode, product.classType)),
        history: [
          {
            id: `stock-${trip.id}-${product.name}`,
            qty: product.originalQty,
            type: "Stock In",
            ref: "Stock In",
            actor: "Owner / Admin",
            at: `${trip.date}T08:00:00`,
          },
          ...related,
        ],
      };
    })
  );
}

export function getOutLineFinancials(out, trips) {
  return (out.groups || []).flatMap((group) =>
    (group.lines || []).map((line) => {
      const qty = Number(line.qty || 0);
      const price = Number(line.price || 0);
      const costPerKg = getAcquisitionCost(trips, group.tripId, line.product, line.sizeCode, line.classType);
      const revenue = money(qty * price);
      const cogs = money(qty * costPerKg);
      const grossProfit = money(revenue - cogs);
      return {
        outId: out.id,
        ref: out.ref,
        date: out.date,
        customerId: out.customerId,
        agentId: out.agentId,
        tripId: group.tripId,
        plant: group.plant,
        tripDate: group.tripDate,
        product: line.product,
        category: getTripProduct(trips, group.tripId, line.product, line.sizeCode, line.classType)?.category,
        sizeCode: line.sizeCode || "",
        sizeCodeLabel: line.sizeCodeLabel || "",
        classType: line.classType || "",
        classTypeLabel: line.classTypeLabel || "",
        acquisitionType: getTripProduct(trips, group.tripId, line.product, line.sizeCode, line.classType)?.acquisitionType || "Purchased",
        trustReceipt: out.trustReceipt || "",
        qty,
        price,
        costPerKg,
        revenue,
        cogs,
        grossProfit,
        margin: revenue ? (grossProfit / revenue) * 100 : 0,
      };
    })
  );
}

export function periodOutFinancials(outs, trips, period) {
  const lines = outs
    .filter((out) => out.date >= period.start && out.date <= period.end)
    .flatMap((out) => getOutLineFinancials(out, trips));
  const grossSales = money(lines.reduce((sum, line) => sum + line.revenue, 0));
  const salesDeductions = 0;
  const netSales = grossSales - salesDeductions;
  const cogs = money(lines.reduce((sum, line) => sum + line.cogs, 0));
  const grossProfit = money(netSales - cogs);
  return {
    lines,
    grossSales,
    salesDeductions,
    netSales,
    cogs,
    grossProfit,
    grossMargin: netSales ? (grossProfit / netSales) * 100 : 0,
  };
}

export function customerBalance(ledgerEntries, customerId) {
  return money(ledgerEntries
    .filter((entry) => entry.customerId === customerId)
    .reduce((sum, entry) => sum + Number(entry.charge || 0) - Number(entry.payment || 0), 0));
}

export function ledgerWithRunningBalance(ledgerEntries, customerId) {
  let balance = 0;
  return ledgerEntries
    .filter((entry) => entry.customerId === customerId)
    .sort((a, b) => a.date.localeCompare(b.date) || Number(b.charge > 0) - Number(a.charge > 0) || a.ref.localeCompare(b.ref))
    .map((entry) => {
      balance = money(balance + Number(entry.charge || 0) - Number(entry.payment || 0));
      return { ...entry, balance };
    });
}

export function invoiceBalances(ledgerEntries, customerId) {
  const customerEntries = ledgerEntries.filter((entry) => entry.customerId === customerId);
  return customerEntries
    .filter((entry) => Number(entry.charge || 0) > 0)
    .map((invoice) => {
      const paid = customerEntries.reduce((sum, entry) => {
        const allocation = entry.allocations?.find((item) => item.invoiceRef === invoice.ref);
        return sum + Number(allocation?.amount || 0);
      }, 0);
      return {
        ref: invoice.ref,
        date: invoice.date,
        description: invoice.description,
        charge: invoice.charge,
        paid,
        balance: Math.max(0, money(invoice.charge - paid)),
      };
    })
    .filter((invoice) => invoice.balance > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function allocateOldestFirst(ledgerEntries, customerId, amount, date = "9999-12-31") {
  let remaining = Number(amount || 0);
  const allocations = [];
  for (const invoice of invoiceBalances(ledgerEntries, customerId).filter((invoice) => invoice.date <= date)) {
    if (remaining <= 0) break;
    const applied = Math.min(invoice.balance, remaining);
    allocations.push({ invoiceRef: invoice.ref, amount: applied });
    remaining = money(remaining - applied);
  }
  return allocations;
}

export function customerPrice(customer, product) {
  return customer?.pricing?.[product] ?? generalPrice[product] ?? 0;
}

export function buildDcr({ collections, expenses, customers, agentId, date }) {
  const dayCollections = collections.filter(
    (collection) => collection.agentId === agentId && dayKey(collection.date) === dayKey(date)
  );
  const dayExpenses = expenses.filter(
    (expense) => expense.agentId === agentId && dayKey(expense.date) === dayKey(date)
  );
  const rows = dayCollections.reduce((map, collection) => {
    const current = map.get(collection.customerId) || {
      customerId: collection.customerId,
      customer: getCustomerName(customers, collection.customerId),
      Cash: 0,
      GCash: 0,
      "Bank Deposit": 0,
      total: 0,
    };
    current[collection.method] += Number(collection.amount || 0);
    current.total += Number(collection.amount || 0);
    map.set(collection.customerId, current);
    return map;
  }, new Map());

  const totals = dayCollections.reduce(
    (sum, collection) => {
      sum[collection.method] += Number(collection.amount || 0);
      sum.total += Number(collection.amount || 0);
      return sum;
    },
    { Cash: 0, GCash: 0, "Bank Deposit": 0, total: 0 }
  );

  const expenseTotals = dayExpenses.reduce(
    (sum, expense) => {
      sum.total += Number(expense.amount || 0);
      if (expense.source === "Cash Collection" && expense.status === "Approved") sum.cashPaid += Number(expense.amount || 0);
      sum.byCategory[expense.category] = (sum.byCategory[expense.category] || 0) + Number(expense.amount || 0);
      return sum;
    },
    { total: 0, cashPaid: 0, byCategory: {} }
  );

  return {
    rows: [...rows.values()],
    collections: dayCollections,
    expenses: dayExpenses,
    totals,
    expenseTotals,
    expectedCashRemittance: money(totals.Cash - expenseTotals.cashPaid),
  };
}
