import { requireSupabase } from "../lib/supabaseClient.js";
import { buildMaintenancePayload, buildRenewalPayload, buildTruckPayload, hydrateTrucks } from "../utils/hostedTrucks.js";

const fail = (result) => {
  if (result.error) throw result.error;
  return result.data || [];
};

export async function loadTrucks(organizationId, client = requireSupabase()) {
  const trucks = fail(await client.from("trucks").select("*").eq("organization_id", organizationId).order("unit_name"));
  if (!trucks.length) return [];
  const truckIds = trucks.map((truck) => truck.id);
  const [renewalResult, maintenanceResult] = await Promise.all([
    client.from("truck_renewals").select("*").in("truck_id", truckIds).order("renewal_date", { ascending: false }),
    client.from("truck_maintenance").select("*").in("truck_id", truckIds).order("service_date", { ascending: false }),
  ]);
  return hydrateTrucks(trucks, fail(renewalResult), fail(maintenanceResult));
}

export async function saveTruck(organizationId, values, client = requireSupabase()) {
  const payload = buildTruckPayload(organizationId, values);
  const result = values.id
    ? await client.from("trucks").update(payload).eq("id", values.id).eq("organization_id", organizationId).select("*").single()
    : await client.from("trucks").insert(payload).select("*").single();
  return fail(result);
}

export async function setTruckActive(organizationId, truckId, active, client = requireSupabase()) {
  return fail(await client.from("trucks").update({ active }).eq("id", truckId).eq("organization_id", organizationId).select("*").single());
}

export async function recordTruckRenewal(truckId, values, createdBy, client = requireSupabase()) {
  return fail(await client.from("truck_renewals").insert(buildRenewalPayload(truckId, values, createdBy)).select("*").single());
}

export async function recordTruckMaintenance(organizationId, truckId, values, createdBy, client = requireSupabase()) {
  const maintenance = fail(await client.from("truck_maintenance").insert(buildMaintenancePayload(truckId, values, createdBy)).select("*").single());
  const truck = fail(await client.from("trucks").update({ current_mileage: Number(values.mileage) }).eq("id", truckId).eq("organization_id", organizationId).select("*").single());
  return { maintenance, truck };
}
