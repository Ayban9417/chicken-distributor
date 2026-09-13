import { money, stockKey } from "./business.js";

const sameStock = (item, tripId, product, sizeCode = "", classType = "") =>
  stockKey(item.tripId, item.product, item.sizeCode, item.classType) === stockKey(tripId, product, sizeCode, classType);

export function warehouseTransferredQty(receivingTransfers, tripId, product, sizeCode = "", classType = "") {
  return money(receivingTransfers.filter((item) => sameStock(item, tripId, product, sizeCode, classType)).reduce((total, item) => total + Number(item.qty || 0), 0));
}

export function getWarehouseAvailableQty(trips, movements, receivingTransfers, tripId, product, sizeCode = "", classType = "") {
  const trip = trips.find((item) => item.id === tripId);
  const line = trip?.products?.find((item) => item.name === product && (item.sizeCode || "") === (sizeCode || "") && (item.classType || "") === (classType || ""));
  const adjustments = movements.filter((item) => item.type === "Adjustment" && sameStock(item, tripId, product, sizeCode, classType)).reduce((total, item) => total + Number(item.qty || 0), 0);
  return money(Number(line?.originalQty || 0) + adjustments - warehouseTransferredQty(receivingTransfers, tripId, product, sizeCode, classType));
}

export function getSalesmanAvailableQty(receivingTransfers, salesmanTransfers, movements, salesmanId, tripId, product, sizeCode = "", classType = "") {
  const received = receivingTransfers.filter((item) => item.toSalesmanId === salesmanId && sameStock(item, tripId, product, sizeCode, classType)).reduce((total, item) => total + Number(item.qty || 0), 0);
  const inbound = salesmanTransfers.filter((item) => item.toSalesmanId === salesmanId && sameStock(item, tripId, product, sizeCode, classType)).reduce((total, item) => total + Number(item.qty || 0), 0);
  const outbound = salesmanTransfers.filter((item) => item.fromSalesmanId === salesmanId && sameStock(item, tripId, product, sizeCode, classType)).reduce((total, item) => total + Number(item.qty || 0), 0);
  const sales = movements.filter((item) => item.type === "OUT" && item.agentId === salesmanId && sameStock(item, tripId, product, sizeCode, classType)).reduce((total, item) => total + Number(item.qty || 0), 0);
  return money(received + inbound - outbound + sales);
}

export function warehouseRows(inventoryRows, receivingTransfers) {
  return inventoryRows.map((row) => {
    const transferredQty = warehouseTransferredQty(receivingTransfers, row.tripId, row.product, row.sizeCode, row.classType);
    const warehouseAvailable = money(row.originalQty + row.adjustments - transferredQty);
    return { ...row, transferredQty, warehouseAvailable, inventoryCostValue: money(warehouseAvailable * row.costPerKg) };
  });
}

export function salesmanInventoryRows(inventoryRows, receivingTransfers, salesmanTransfers, movements, salesmanId) {
  return inventoryRows.map((row) => {
    const warehouseAssigned = receivingTransfers.filter((item) => item.toSalesmanId === salesmanId && sameStock(item, row.tripId, row.product, row.sizeCode, row.classType)).reduce((total, item) => total + Number(item.qty || 0), 0);
    const transferredIn = salesmanTransfers.filter((item) => item.toSalesmanId === salesmanId && sameStock(item, row.tripId, row.product, row.sizeCode, row.classType)).reduce((total, item) => total + Number(item.qty || 0), 0);
    const sold = movements.filter((item) => item.type === "OUT" && item.agentId === salesmanId && sameStock(item, row.tripId, row.product, row.sizeCode, row.classType)).reduce((total, item) => total - Number(item.qty || 0), 0);
    const remainingQty = getSalesmanAvailableQty(receivingTransfers, salesmanTransfers, movements, salesmanId, row.tripId, row.product, row.sizeCode, row.classType);
    return { ...row, assignedQty: money(warehouseAssigned + transferredIn), remainingQty, totalOut: money(sold), inventoryCostValue: money(remainingQty * row.costPerKg) };
  }).filter((row) => row.assignedQty > 0 || row.remainingQty !== 0 || salesmanTransfers.some((item) => (item.fromSalesmanId === salesmanId || item.toSalesmanId === salesmanId) && sameStock(item, row.tripId, row.product, row.sizeCode, row.classType)));
}

export const nextReceipt = (prefix, records) => `${prefix}-${String(records.reduce((max, item) => Math.max(max, Number(String(item.receipt || "").split("-").pop()) || 0), 0) + 1).padStart(6, "0")}`;

export function companyStockTotals(inventoryRows, receivingTransfers, salesmanTransfers, movements, salesmanIds) {
  const warehouse = warehouseRows(inventoryRows, receivingTransfers).reduce((total, row) => total + row.warehouseAvailable, 0);
  const assigned = salesmanIds.reduce((total, id) => total + salesmanInventoryRows(inventoryRows, receivingTransfers, salesmanTransfers, movements, id).reduce((sum, row) => sum + row.remainingQty, 0), 0);
  return { warehouse: money(warehouse), assigned: money(assigned), company: money(warehouse + assigned) };
}
