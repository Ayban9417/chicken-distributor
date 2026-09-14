import { requireSupabase } from "../lib/supabaseClient.js";
import { inDateRange } from "../utils/hostedReports.js";
import { previousPeriod } from "../utils/operations.js";
import { normalizeHostedTrips } from "../utils/hostedDashboard.js";
import { loadHostedReports } from "./reportingService.js";

const fail = (result) => {
  if (result.error) throw result.error;
  return result.data || [];
};

function tripQuery(client, organizationId, range) {
  return client.from("stock_trips")
    .select("id, plant_id, trip_number, trip_date")
    .eq("organization_id", organizationId)
    .neq("status", "cancelled")
    .gte("trip_date", range.start)
    .lte("trip_date", range.end)
    .order("trip_date", { ascending: true });
}

async function selectIn(client, table, columns, key, values) {
  if (!values.length) return [];
  return fail(await client.from(table).select(columns).in(key, values));
}

export async function loadHostedDashboard(organizationId, range, currentDate, client = requireSupabase()) {
  const priorRange = previousPeriod(range);
  const todayRange = { start: currentDate, end: currentDate };
  const [reports, tripsResult, previousTripsResult, todayTripsResult, customersResult, discrepanciesResult, trucksResult] = await Promise.all([
    loadHostedReports(organizationId, range, client),
    tripQuery(client, organizationId, range),
    tripQuery(client, organizationId, priorRange),
    tripQuery(client, organizationId, todayRange),
    client.from("customers").select("id, name").eq("organization_id", organizationId),
    client.from("discrepancies").select("id, type, status, severity, description, created_at").eq("organization_id", organizationId).neq("status", "resolved").order("created_at", { ascending: false }),
    client.from("trucks").select("id, unit_name, plate_number, lto_registration_expiry, active").eq("organization_id", organizationId).eq("active", true),
  ]);

  const trips = fail(tripsResult);
  const previousTrips = fail(previousTripsResult);
  const todayTrips = fail(todayTripsResult);
  const customers = fail(customersResult);
  const discrepancies = fail(discrepanciesResult);
  const trucks = fail(trucksResult);
  const tripIds = trips.map((row) => row.id);
  const lines = await selectIn(client, "stock_trip_lines", "id, stock_trip_id, plant_product_id, code_id, class_type_id, bags, head_count, quantity_kg, acquisition_type, cost_per_kg", "stock_trip_id", tripIds);
  const plantProducts = await selectIn(client, "plant_products", "id, product_id", "id", [...new Set(lines.map((row) => row.plant_product_id))]);
  const [productsResult, plantsResult] = await Promise.all([
    client.from("products").select("id, name, category").eq("organization_id", organizationId),
    client.from("plants").select("id, name").eq("organization_id", organizationId),
  ]);
  const normalizedTrips = normalizeHostedTrips({
    trips,
    lines,
    plantProducts,
    products: fail(productsResult),
    plants: fail(plantsResult),
    warehouseStock: reports.warehouseStock,
    salesmanStock: reports.salesmanStock,
  });
  const todayReports = inDateRange(currentDate, range) ? reports : await loadHostedReports(organizationId, todayRange, client);

  return {
    reports,
    todayReports,
    trips: normalizedTrips,
    previousTrips,
    todayTrips,
    customers,
    discrepancies,
    trucks,
  };
}
