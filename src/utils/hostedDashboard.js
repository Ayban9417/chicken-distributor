import { addDays } from "./operations.js";

const number = (value) => Number(value || 0);

export function activityDays(range, sales = [], payments = []) {
  const days = [];
  if (!range?.start || !range?.end || range.start > range.end) return days;
  for (let date = range.start; date <= range.end; date = addDays(date, 1)) {
    days.push({
      date,
      sales: sales.filter((row) => row.sale_date === date).reduce((total, row) => total + number(row.net_sales), 0),
      payments: payments.filter((row) => row.payment_date === date).reduce((total, row) => total + number(row.amount), 0),
    });
  }
  return days;
}

export function normalizeHostedTrips({ trips = [], lines = [], plantProducts = [], products = [], plants = [], codes = [], classes = [], warehouseStock = [], salesmanStock = [] }) {
  const lineByTrip = new Map();
  for (const line of lines) {
    const rows = lineByTrip.get(line.stock_trip_id) || [];
    rows.push(line);
    lineByTrip.set(line.stock_trip_id, rows);
  }
  const plantProductMap = new Map(plantProducts.map((row) => [row.id, row]));
  const productMap = new Map(products.map((row) => [row.id, row]));
  const plantMap = new Map(plants.map((row) => [row.id, row]));
  const codeMap = new Map(codes.map((row) => [row.id, row]));
  const classMap = new Map(classes.map((row) => [row.id, row]));
  const remainingByTrip = new Map();
  for (const row of [...warehouseStock, ...salesmanStock]) {
    remainingByTrip.set(row.stock_trip_id, (remainingByTrip.get(row.stock_trip_id) || 0) + number(row.available_quantity_kg));
  }

  return trips.map((trip) => ({
    id: trip.id,
    date: trip.trip_date,
    code: trip.trip_number,
    plant: plantMap.get(trip.plant_id)?.name || "Unknown Plant",
    remainingQty: remainingByTrip.get(trip.id) || 0,
    products: (lineByTrip.get(trip.id) || []).map((line) => {
      const product = productMap.get(plantProductMap.get(line.plant_product_id)?.product_id) || {};
      const code = codeMap.get(line.code_id);
      const classType = classMap.get(line.class_type_id);
      return {
        productId: line.plant_product_id,
        name: product.name || "Unknown Product",
        category: product.category === "whole_chicken" ? "Whole Chicken" : "By-product",
        codeId: line.code_id || "",
        sizeCode: code?.code || "",
        sizeCodeLabel: code?.display_name || "",
        classTypeId: line.class_type_id || "",
        classType: classType?.class_type || "",
        classTypeLabel: classType?.display_name || "",
        originalQty: number(line.quantity_kg),
        bags: line.bags ?? null,
        headCount: line.head_count ?? null,
        acquisitionType: line.acquisition_type === "free_from_plant" ? "Free from Plant" : "Purchased",
        costPerKg: number(line.cost_per_kg),
      };
    }),
  }));
}

export function customerSales(sales = [], customers = []) {
  const names = new Map(customers.map((row) => [row.id, row.name]));
  const grouped = new Map();
  for (const sale of sales) {
    const key = sale.customer_id || "unknown";
    const current = grouped.get(key) || { key: names.get(key) || "Unknown Customer", revenue: 0, cogs: 0, profit: 0 };
    current.revenue += number(sale.net_sales);
    current.cogs += number(sale.total_cogs);
    current.profit += number(sale.gross_profit);
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((a, b) => b.revenue - a.revenue || a.key.localeCompare(b.key));
}
