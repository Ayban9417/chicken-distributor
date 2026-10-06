import { isByProduct, money } from "./business.js";

export function groupTripProducts(products = []) {
  const lines = Array.isArray(products) ? products : [];
  const summarize = (rows) => ({
    rows,
    kilos: money(rows.reduce((total, row) => total + Number(row.originalQty || 0), 0)),
    cost: money(rows.reduce((total, row) => total + money(Number(row.originalQty || 0) * (row.acquisitionType === "Free from Plant" ? 0 : Number(row.costPerKg || 0))), 0)),
  });
  return {
    main: summarize(lines.filter((row) => !isByProduct(row))),
    byproducts: summarize(lines.filter(isByProduct)),
  };
}
