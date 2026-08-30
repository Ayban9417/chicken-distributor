export const currency = (value = 0) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

export const kg = (value = 0) =>
  `${Number(value || 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })} kg`;

export const shortDate = (date) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
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

export function getAvailableQty(trips, movements, tripId, product) {
  const trip = getTripById(trips, tripId);
  const original = trip?.products.find((item) => item.name === product)?.originalQty || 0;
  const movementTotal = movements
    .filter((movement) => movement.tripId === tripId && movement.product === product)
    .reduce((sum, movement) => sum + Number(movement.qty || 0), 0);
  return original + movementTotal;
}

export function getTripProduct(trips, tripId, product) {
  return getTripById(trips, tripId)?.products.find((item) => item.name === product);
}

export function getAcquisitionCost(trips, tripId, product) {
  return Number(getTripProduct(trips, tripId, product)?.costPerKg || 0);
}

export function tripAcquisitionCost(trip) {
  return (trip?.products || []).reduce(
    (sum, product) => sum + Number(product.originalQty || 0) * Number(product.costPerKg || 0),
    0
  );
}

export function getInventoryRows(trips, movements) {
  return trips.flatMap((trip) =>
    trip.products.map((product) => {
      const related = movements.filter(
        (movement) => movement.tripId === trip.id && movement.product === product.name
      );
      const totalOut = related
        .filter((movement) => movement.type === "OUT")
        .reduce((sum, movement) => sum + Math.abs(Number(movement.qty || 0)), 0);
      const adjustments = related
        .filter((movement) => movement.type === "Adjustment")
        .reduce((sum, movement) => sum + Number(movement.qty || 0), 0);
      return {
        id: `${trip.id}-${product.name}`,
        tripId: trip.id,
        tripCode: trip.code,
        plant: trip.plant,
        tripDate: trip.date,
        product: product.name,
        originalQty: product.originalQty,
        costPerKg: Number(product.costPerKg || 0),
        originalAcquisitionCost: Number(product.originalQty || 0) * Number(product.costPerKg || 0),
        totalOut,
        adjustments,
        remainingQty: product.originalQty - totalOut + adjustments,
        inventoryCostValue: (product.originalQty - totalOut + adjustments) * Number(product.costPerKg || 0),
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
      const costPerKg = getAcquisitionCost(trips, group.tripId, line.product);
      const revenue = Number(line.subtotal ?? qty * price);
      const cogs = qty * costPerKg;
      const grossProfit = revenue - cogs;
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
  const grossSales = lines.reduce((sum, line) => sum + line.revenue, 0);
  const salesDeductions = 0;
  const netSales = grossSales - salesDeductions;
  const cogs = lines.reduce((sum, line) => sum + line.cogs, 0);
  const grossProfit = netSales - cogs;
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
  return ledgerEntries
    .filter((entry) => entry.customerId === customerId)
    .reduce((sum, entry) => sum + Number(entry.charge || 0) - Number(entry.payment || 0), 0);
}

export function ledgerWithRunningBalance(ledgerEntries, customerId) {
  let balance = 0;
  return ledgerEntries
    .filter((entry) => entry.customerId === customerId)
    .sort((a, b) => `${a.date}${a.ref}`.localeCompare(`${b.date}${b.ref}`))
    .map((entry) => {
      balance += Number(entry.charge || 0) - Number(entry.payment || 0);
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
        balance: Math.max(0, invoice.charge - paid),
      };
    })
    .filter((invoice) => invoice.balance > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function allocateOldestFirst(ledgerEntries, customerId, amount) {
  let remaining = Number(amount || 0);
  const allocations = [];
  for (const invoice of invoiceBalances(ledgerEntries, customerId)) {
    if (remaining <= 0) break;
    const applied = Math.min(invoice.balance, remaining);
    allocations.push({ invoiceRef: invoice.ref, amount: applied });
    remaining -= applied;
  }
  return allocations;
}

export function customerPrice(customer, product) {
  return customer?.pricing?.[product] || generalPrice[product] || 0;
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
      if (expense.source === "Cash Collection") sum.cashPaid += Number(expense.amount || 0);
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
    expectedCashRemittance: totals.Cash - expenseTotals.cashPaid,
  };
}
