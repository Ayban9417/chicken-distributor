import { requireSupabase } from "../lib/supabaseClient";

const ordered = (rows, key = "name") => [...(rows || [])].sort((a, b) => String(a[key] || "").localeCompare(String(b[key] || "")));

export async function loadPlantConfiguration(organizationId) {
  const client = requireSupabase();
  const [plantsResult, productsResult, linksResult, codesResult, classesResult] = await Promise.all([
    client.from("plants").select("*").eq("organization_id", organizationId).order("name"),
    client.from("products").select("*").eq("organization_id", organizationId).order("name"),
    client.from("plant_products").select("*").order("created_at"),
    client.from("plant_product_codes").select("*").order("code"),
    client.from("plant_product_class_types").select("*").order("class_type"),
  ]);
  const failed = [plantsResult, productsResult, linksResult, codesResult, classesResult].find((result) => result.error);
  if (failed) throw failed.error;
  const links = linksResult.data || [];
  return {
    products: ordered(productsResult.data),
    plants: (plantsResult.data || []).map((plant) => ({
      ...plant,
      products: links
        .filter((link) => link.plant_id === plant.id)
        .map((link) => ({
          ...link,
          product: productsResult.data.find((product) => product.id === link.product_id),
          codes: ordered((codesResult.data || []).filter((code) => code.plant_product_id === link.id), "code"),
          classTypes: ordered((classesResult.data || []).filter((item) => item.plant_product_id === link.id), "class_type"),
        })),
    })),
  };
}

export async function savePlant(organizationId, draft) {
  const client = requireSupabase();
  const payload = {
    organization_id: organizationId,
    name: draft.name.trim(),
    short_code: draft.short_code.trim().toUpperCase(),
    accent: draft.accent || null,
    active: Boolean(draft.active),
  };
  const query = draft.id
    ? client.from("plants").update(payload).eq("id", draft.id).eq("organization_id", organizationId)
    : client.from("plants").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data;
}

export async function savePlantProduct(plantId, draft) {
  const client = requireSupabase();
  const payload = {
    plant_id: plantId,
    product_id: draft.product_id,
    active: Boolean(draft.active),
    uses_size_codes: Boolean(draft.uses_size_codes),
    uses_class_types: Boolean(draft.uses_class_types),
    uses_bags: Boolean(draft.uses_bags),
    uses_head_count: Boolean(draft.uses_head_count),
    allows_free_from_plant: Boolean(draft.allows_free_from_plant),
  };
  const query = draft.id
    ? client.from("plant_products").update(payload).eq("id", draft.id)
    : client.from("plant_products").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data;
}

export async function saveCode(plantProductId, draft) {
  const client = requireSupabase();
  const payload = {
    plant_product_id: plantProductId,
    code: draft.code.trim().toUpperCase(),
    display_name: draft.display_name?.trim() || null,
    active: Boolean(draft.active),
  };
  const query = draft.id
    ? client.from("plant_product_codes").update(payload).eq("id", draft.id)
    : client.from("plant_product_codes").insert(payload);
  const { error } = await query;
  if (error) throw error;
}

export async function saveClassType(plantProductId, draft) {
  const client = requireSupabase();
  const payload = {
    plant_product_id: plantProductId,
    class_type: draft.class_type.trim(),
    display_name: draft.display_name?.trim() || null,
    active: Boolean(draft.active),
  };
  const query = draft.id
    ? client.from("plant_product_class_types").update(payload).eq("id", draft.id)
    : client.from("plant_product_class_types").insert(payload);
  const { error } = await query;
  if (error) throw error;
}

export async function createProduct(organizationId, values) {
  const { data, error } = await requireSupabase()
    .from("products")
    .insert({
      organization_id: organizationId,
      name: values.name.trim(),
      category: values.category,
      active: true,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
