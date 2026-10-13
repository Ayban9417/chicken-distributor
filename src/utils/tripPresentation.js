import { isByProduct, isWholeChicken, money } from "./business.js";

export const tripKilograms = (value) =>
  `${Number(value || 0).toLocaleString("en-PH", { maximumFractionDigits: 3 })} kg`;

export const wholeChickenLineLabel = (item) =>
  String(item?.sizeCode || "").trim() || String(item?.classType || "").trim() || item?.name || item?.product || "Unknown Product";

export function groupTripProducts(products = []) {
  const lines = Array.isArray(products) ? products : [];
  const summarize = (rows) => ({
    rows,
    kilos: Math.round(rows.reduce((total, row) => total + Number(row.originalQty || 0), 0) * 1000) / 1000,
    cost: money(rows.reduce((total, row) => total + money(Number(row.originalQty || 0) * (row.acquisitionType === "Free from Plant" ? 0 : Number(row.costPerKg || 0))), 0)),
  });
  return {
    whole: summarize(lines.filter(isWholeChicken)),
    byproducts: summarize(lines.filter(isByProduct)),
    other: summarize(lines.filter((row) => !isWholeChicken(row) && !isByProduct(row))),
    grand: summarize(lines),
  };
}
