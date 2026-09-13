import { isWholeChicken } from "./business.js";
import { productMaster } from "./plants.js";

const text = (value) => String(value ?? "");
const productRank = (name) => {
  const index = productMaster.findIndex((product) => product.productName === name);
  return index < 0 ? productMaster.length : index;
};

export function compareInventoryProducts(a, b) {
  const categoryOrder = Number(isWholeChicken(b)) - Number(isWholeChicken(a));
  if (categoryOrder) return categoryOrder;
  if (a.product === b.product) return text(a.sizeCode).localeCompare(text(b.sizeCode), undefined, { numeric: true });
  // Preserve familiar product ordering; custom and historical products need no live configuration.
  return productRank(a.product) - productRank(b.product) || text(a.product).localeCompare(text(b.product));
}

export function compareInventoryTrips(a, b) {
  return text(a.tripDate).localeCompare(text(b.tripDate)) || text(a.tripCode).localeCompare(text(b.tripCode)) || text(a.tripId).localeCompare(text(b.tripId));
}
