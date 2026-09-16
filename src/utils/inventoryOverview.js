import { money, stockKey } from "./business.js";
import { getSalesmanAvailableQty, warehouseRows } from "./inventoryFlow.js";
import { compareInventoryProducts, compareInventoryTrips } from "./inventory.js";

const number = (value) => Number(value || 0);
const sameRow = (item, row) => stockKey(item.tripId, item.product, item.sizeCode, item.classType) === stockKey(row.tripId, row.product, row.sizeCode, row.classType);
const personName = (users, id) => users.find((user) => user.id === id)?.name || "Salesman";

function localHistory(row, receivingTransfers, salesmanTransfers, users) {
  const transfers = [
    ...receivingTransfers.filter((item) => sameRow(item, row)).map((item) => ({
      id: item.id || item.receipt,
      type: `Warehouse to ${personName(users, item.toSalesmanId)}`,
      ref: item.receipt || "Receiving Receipt",
      qty: number(item.qty),
      direction: "neutral",
      at: item.at || item.date,
      notes: item.notes || "",
    })),
    ...salesmanTransfers.filter((item) => sameRow(item, row)).map((item) => ({
      id: item.id || item.receipt,
      type: `${personName(users, item.fromSalesmanId)} to ${personName(users, item.toSalesmanId)}`,
      ref: item.receipt || "Transfer Receipt",
      qty: number(item.qty),
      direction: "neutral",
      at: item.at || item.date,
      notes: item.notes || "",
    })),
  ];
  const source = (row.history || []).map((movement) => ({
    ...movement,
    direction: movement.type === "OUT" || number(movement.qty) < 0 ? "out" : "in",
  }));
  return [...source, ...transfers].sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
}

export function buildLocalInventoryOverviewRows({ inventoryRows = [], receivingTransfers = [], salesmanTransfers = [], movements = [], users = [] }) {
  const warehouseById = new Map(warehouseRows(inventoryRows, receivingTransfers).map((row) => [row.id, row]));
  const salesmanIds = users.filter((user) => ["Agent", "salesman"].includes(user.role)).map((user) => user.id);

  return inventoryRows.map((row) => {
    const warehouseQty = number(warehouseById.get(row.id)?.warehouseAvailable);
    const salesmanQty = salesmanIds.reduce((total, salesmanId) => total + getSalesmanAvailableQty(
      receivingTransfers,
      salesmanTransfers,
      movements,
      salesmanId,
      row.tripId,
      row.product,
      row.sizeCode,
      row.classType,
    ), 0);
    const soldQty = number(row.totalOut);
    const remainingQty = money(warehouseQty + salesmanQty);
    const expectedQty = money(number(row.originalQty) + number(row.adjustments));
    const reconciledQty = money(remainingQty + soldQty);
    return {
      ...row,
      warehouseQty: money(warehouseQty),
      salesmanQty: money(salesmanQty),
      soldQty: money(soldQty),
      totalOut: money(soldQty),
      remainingQty,
      inventoryCostValue: money(remainingQty * number(row.costPerKg)),
      originalAcquisitionCost: money(number(row.originalQty) * number(row.costPerKg)),
      reconciliationDelta: money(expectedQty - reconciledQty),
      history: localHistory(row, receivingTransfers, salesmanTransfers, users),
    };
  });
}

export function summarizeInventoryRows(rows = []) {
  return rows.reduce((summary, row) => {
    const isWhole = row.category === "Whole Chicken" || row.product === "Whole Dressed Chicken";
    summary.originalQty += number(row.originalQty);
    summary.warehouseQty += number(row.warehouseQty);
    summary.salesmanQty += number(row.salesmanQty);
    summary.soldQty += number(row.soldQty);
    summary.remainingQty += number(row.remainingQty);
    summary.inventoryCostValue += number(row.inventoryCostValue);
    summary.wholeChickenQty += isWhole ? number(row.remainingQty) : 0;
    summary.byProductQty += isWhole ? 0 : number(row.remainingQty);
    return summary;
  }, { originalQty: 0, warehouseQty: 0, salesmanQty: 0, soldQty: 0, remainingQty: 0, inventoryCostValue: 0, wholeChickenQty: 0, byProductQty: 0 });
}

export function inventoryPlantSummaries(rows = [], query = "") {
  const normalizedQuery = query.trim().toLowerCase();
  return [...new Set(rows.map((row) => row.plant).filter(Boolean))]
    .filter((plant) => plant.toLowerCase().includes(normalizedQuery))
    .map((plant) => {
      const plantRows = rows.filter((row) => row.plant === plant);
      return {
        plant,
        rows: plantRows,
        trips: new Set(plantRows.map((row) => row.tripId)).size,
        soldOut: plantRows.filter((row) => number(row.remainingQty) === 0).length,
        ...summarizeInventoryRows(plantRows),
      };
    })
    .sort((a, b) => a.plant.localeCompare(b.plant));
}

export function filterInventoryRows(rows = [], { plant = "", tripId = "All", productQuery = "", productMode = "All Products" } = {}) {
  const normalizedQuery = productQuery.trim().toLowerCase();
  return rows.filter((row) => {
    const isWhole = row.category === "Whole Chicken" || row.product === "Whole Dressed Chicken";
    const searchable = [row.product, row.sizeCode, row.sizeCodeLabel, row.classType, row.classTypeLabel, row.tripCode].filter(Boolean).join(" ").toLowerCase();
    return (!plant || row.plant === plant)
      && (tripId === "All" || row.tripId === tripId)
      && (!normalizedQuery || searchable.includes(normalizedQuery))
      && (productMode === "All Products" || (productMode === "Whole Chicken" ? isWhole : !isWhole));
  });
}

export function groupInventoryByTrip(rows = []) {
  const groups = [...rows.reduce((map, row) => {
    if (!map.has(row.tripId)) map.set(row.tripId, { tripId: row.tripId, tripDate: row.tripDate, tripCode: row.tripCode, rows: [] });
    map.get(row.tripId).rows.push(row);
    return map;
  }, new Map()).values()];
  return groups.sort(compareInventoryTrips).map((group) => ({ ...group, rows: group.rows.sort(compareInventoryProducts) }));
}
