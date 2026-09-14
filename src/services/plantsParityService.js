import { requireSupabase } from "../lib/supabaseClient.js";
import { normalizeHostedTrips } from "../utils/hostedDashboard.js";
import { createStockTrip } from "./operationsService.js";
import { loadPlantConfiguration } from "./plantsService.js";

const fail = (result) => {
  if (result.error) throw result.error;
  return result.data || [];
};

export function normalizePlantConfiguration(configuration) {
  return (configuration.plants || []).map((plant) => ({
    id: plant.id,
    name: plant.name,
    originalName: plant.name,
    shortCode: plant.short_code,
    accent: plant.accent,
    active: plant.active,
    products: (plant.products || []).map((link) => ({
      productId: link.id,
      masterProductId: link.product_id,
      productName: link.product?.name || "Unknown Product",
      category: link.product?.category === "whole_chicken" ? "Whole Chicken" : "By-products",
      active: link.active,
      usesSizeCodes: link.uses_size_codes,
      usesClassTypes: link.uses_class_types,
      usesBags: link.uses_bags,
      usesHeadCount: link.uses_head_count,
      allowsFreeFromPlant: link.allows_free_from_plant,
      defaultUnit: "kg",
      sizeCodes: (link.codes || []).map((row) => ({ id: row.code, backendId: row.id, displayName: row.display_name || row.code, active: row.active })),
      classTypes: (link.classTypes || []).map((row) => ({ id: row.class_type, backendId: row.id, displayName: row.display_name || row.class_type, active: row.active })),
    })),
  }));
}

export function stockInValuesFromPrototype(trip) {
  return {
    plantId: trip.plantId,
    date: trip.date,
    reference: trip.reference,
    deliveryNote: trip.deliveryNote,
    notes: trip.notes,
    lines: trip.products.map((line) => ({
      plantProductId: line.productId,
      codeId: line.codeId || null,
      classTypeId: line.classTypeId || null,
      bags: line.bags,
      headCount: line.headCount,
      quantity: line.originalQty,
      acquisitionType: line.acquisitionType === "Free from Plant" ? "free_from_plant" : "purchased",
      cost: line.costPerKg,
    })),
  };
}

export async function loadHostedPlants(organizationId, client = requireSupabase()) {
  const configuration = await loadPlantConfiguration(organizationId);
  const trips = fail(await client.from("stock_trips").select("id, plant_id, trip_number, trip_date, reference_number, delivery_note, notes").eq("organization_id", organizationId).neq("status", "cancelled").order("trip_date", { ascending: false }));
  const tripIds = trips.map((row) => row.id);
  const lines = tripIds.length ? fail(await client.from("stock_trip_lines").select("id, stock_trip_id, plant_product_id, code_id, class_type_id, bags, head_count, quantity_kg, acquisition_type, cost_per_kg").in("stock_trip_id", tripIds)) : [];
  const links = configuration.plants.flatMap((plant) => plant.products);
  return {
    plantConfigs: normalizePlantConfiguration(configuration),
    trips: normalizeHostedTrips({
      trips,
      lines,
      plantProducts: links,
      products: configuration.products,
      plants: configuration.plants,
      codes: links.flatMap((link) => link.codes || []),
      classes: links.flatMap((link) => link.classTypes || []),
    }),
  };
}

export async function createHostedStockIn(organizationId, trip) {
  return createStockTrip(organizationId, stockInValuesFromPrototype(trip));
}
