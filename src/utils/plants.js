export const productMaster = ["Whole Dressed Chicken", "Liver", "Gizzard", "Feet", "Head", "Neck", "Intestine", "Small Intestine", "Large Intestine", "Other"].map((name) => ({
  productId: name.toLowerCase().replaceAll(" ", "-"), productName: name,
  category: name === "Whole Dressed Chicken" ? "Whole Chicken" : "By-products",
}));
export const configureProduct = (product) => ({ ...product, active: true, usesSizeCodes: false, sizeCodes: [], usesClassTypes: false, classTypes: [], usesBags: product?.category === "Whole Chicken" || product?.productName === "Head", usesHeadCount: product?.productName === "Head", allowsFreeFromPlant: true, defaultUnit: "kg", notes: "" });
const seed = (id, name, shortCode, accent, names, coded = false) => ({
  id, name, originalName: name, shortCode, active: true, accent,
  products: productMaster.filter((p) => names.includes(p.productName)).map((p) => ({ ...configureProduct(p),
    usesSizeCodes: coded && p.category === "Whole Chicken",
    sizeCodes: coded && p.category === "Whole Chicken" ? ["P1", "P2", "G"].map((code) => ({ id: code, displayName: code, active: true })) : [],
  })),
});
export const initialPlantConfigs = [
  seed("plant-bounty", "Bounty", "BTY", "#15803d", ["Whole Dressed Chicken", "Liver", "Gizzard", "Feet", "Head"], true),
  seed("plant-magnolia", "Magnolia", "MAG", "#be185d", ["Whole Dressed Chicken", "Liver", "Gizzard", "Feet"]),
  seed("plant-san-miguel", "San Miguel / Magnolia", "SMG", "#0e7490", ["Whole Dressed Chicken", "Liver"]),
  seed("plant-other", "Other Plant", "OTH", "#6d28d9", ["Whole Dressed Chicken"]),
  {
    ...seed("plant-fkidz", "Fkidz", "FKIDZ", "#c2410c", ["Whole Dressed Chicken", "Head", "Feet", "Liver", "Gizzard", "Intestine"]),
    products: productMaster.filter((product) => ["Whole Dressed Chicken", "Head", "Feet", "Liver", "Gizzard", "Intestine"].includes(product.productName)).map((product) => ({
      ...configureProduct(product),
      usesSizeCodes: product.productName === "Whole Dressed Chicken",
      sizeCodes: product.productName === "Whole Dressed Chicken" ? [
        { id: "C1", displayName: "Cat1", active: true },
        { id: "H", displayName: "Happy Dog", active: true },
        { id: "I", displayName: "India", active: true },
        { id: "CB", displayName: "Class B", active: true },
      ] : [],
    })),
  },
];
export const activeProducts = (plant) => (plant?.products || []).filter((p) => p.active);
export const activeCodes = (product) => (product?.sizeCodes || []).filter((c) => c.active);
export const activeClassTypes = (product) => (product?.classTypes || []).filter((c) => c.active);
export const optionLabel = (option) => !option ? "" : option.displayName && option.displayName !== option.id ? `${option.id} — ${option.displayName}` : option.id;
export const stockLine = (product) => ({ productId: product?.productId || "", name: product?.productName || "", sizeCode: "", classType: "", bags: "", headCount: "", qty: 0, costPerKg: "", acquisitionType: "Purchased" });
export const belongsToPlant = (trip, plant) => trip.plantId ? trip.plantId === plant.id : trip.plant === plant.originalName;
export function isReferenced(trips, plant, product, code) {
  return trips.some((trip) => belongsToPlant(trip, plant) && (!product || trip.products.some((p) =>
    (p.productId ? p.productId === product.productId : p.name === (productMaster.find((m) => m.productId === product.productId)?.productName || product.productName)) &&
    (!code || (p.codeId ? p.codeId === code.id : p.sizeCode === code.id)))));
}
export function isClassReferenced(trips, plant, product, classType) {
  return trips.some((trip) => belongsToPlant(trip, plant) && trip.products.some((p) =>
    (p.productId ? p.productId === product.productId : p.name === product.productName) &&
    (p.classTypeId ? p.classTypeId === classType.id : p.classType === classType.id)));
}
export function validatePlant(plant, plants, trips = []) {
  if (!plant.name.trim() || !plant.shortCode.trim()) return "Enter a plant name and short code.";
  if (plants.some((p) => p.id !== plant.id && (p.name.toLowerCase() === plant.name.trim().toLowerCase() || p.originalName.toLowerCase() === plant.name.trim().toLowerCase() || p.shortCode.toLowerCase() === plant.shortCode.trim().toLowerCase()))) return "Plant names and short codes must be unique.";
  if (trips.some((trip) => !belongsToPlant(trip, plant) && trip.plant.toLowerCase() === plant.name.trim().toLowerCase())) return "This plant name is reserved by historical Trips.";
  const names = new Set();
  for (const p of plant.products) {
    const name = p.productName.trim().toLowerCase();
    if (!name || names.has(name)) return "Product names must be nonempty and unique within a plant.";
    names.add(name);
    const codes = (p.sizeCodes || []).map((c) => c.id.trim().toLowerCase());
    if (codes.some((c) => !c) || new Set(codes).size !== codes.length) return "Codes must be nonempty and unique within a product.";
    const classes = (p.classTypes || []).map((c) => c.id.trim().toLowerCase());
    if (classes.some((c) => !c) || new Set(classes).size !== classes.length) return "Class Types must be nonempty and unique within a product.";
    if (p.active && p.usesSizeCodes && !activeCodes(p).length) return "A coded active product needs at least one active code.";
    if (p.active && p.usesClassTypes && !activeClassTypes(p).length) return "A classed active product needs at least one active Class Type.";
  }
  return "";
}
export function validatePlantStock(form, plant) {
  if (!plant?.active || plant.id !== form.plantId) return "Select an active plant.";
  for (const line of form.products) {
    const p = activeProducts(plant).find((p) => p.productId === line.productId);
    if (!p || p.productName !== line.name) return "Select an active product configured for this plant.";
    if (p.usesSizeCodes ? !activeCodes(p).some((c) => c.id === line.sizeCode) : Boolean(line.sizeCode)) return "Select a configured active Size/Code for every coded product.";
    if (p.usesClassTypes ? !activeClassTypes(p).some((c) => c.id === line.classType) : Boolean(line.classType)) return "Select a configured active Class Type for every classed product.";
    if (line.acquisitionType === "Free from Plant" && !p.allowsFreeFromPlant) return "Free from Plant is not allowed for this product.";
    if (!["Purchased", "Free from Plant"].includes(line.acquisitionType)) return "Select a valid acquisition type.";
  }
  return "";
}
// Labels and category are receipt snapshots. Configuration edits never rewrite stock keys or historical costs.
export function stockSnapshot(line, plant) {
  const p = plant.products.find((p) => p.productId === line.productId);
  const code = p.usesSizeCodes ? p.sizeCodes.find((c) => c.id === line.sizeCode) : null;
  const classType = p.usesClassTypes ? p.classTypes.find((c) => c.id === line.classType) : null;
  return { productId: p.productId, name: p.productName, category: p.category, codeId: code?.id || "", sizeCode: code?.id || "", sizeCodeLabel: code?.displayName?.trim() || "",
    classTypeId: classType?.id || "", classType: classType?.id || "", classTypeLabel: classType?.displayName?.trim() || "",
    defaultUnit: p.defaultUnit, bags: p.usesBags && line.bags !== "" ? Number(line.bags) : null, headCount: p.usesHeadCount && line.headCount !== "" ? Number(line.headCount) : null, originalQty: Number(line.qty), acquisitionType: line.acquisitionType,
    costPerKg: line.acquisitionType === "Free from Plant" ? 0 : Number(line.costPerKg) };
}
