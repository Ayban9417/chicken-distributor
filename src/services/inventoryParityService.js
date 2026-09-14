import { requireSupabase } from "../lib/supabaseClient.js";
import { loadPeople, loadSalesmanStock, loadWarehouseStock, transferSalesmanStock, transferWarehouseStock } from "./operationsService.js";

const fail = (result) => {
  if (result.error) throw result.error;
  return result.data || [];
};
const number = (value) => Number(value || 0);

export const parityUsers = (people = []) => people.map((person) => ({
  id: person.user_id,
  name: person.full_name || "Unnamed User",
  role: ({ owner_admin: "Owner / Admin", salesman: "Agent", cashier: "Cashier", warehouse: "Warehouse", payroll_admin: "Payroll Admin" })[person.role] || person.role,
  active: person.active !== false,
}));

export async function loadHostedWarehouse(organizationId, client = requireSupabase()) {
  const [stock, salesmanStock, people, movementsResult] = await Promise.all([
    loadWarehouseStock(organizationId),
    loadSalesmanStock(organizationId),
    loadPeople(organizationId),
    client.from("inventory_movements").select("id, inventory_lot_id, quantity_kg, to_salesman_user_id, effective_date, reference_id, reference_line_id").eq("organization_id", organizationId).eq("movement_type", "warehouse_to_salesman").order("effective_date", { ascending: false }),
  ]);
  const lotIds = stock.map((row) => row.inventory_lot_id);
  const lots = lotIds.length ? fail(await client.from("inventory_lots").select("id, stock_trip_line_id").in("id", lotIds)) : [];
  const lineIds = lots.map((row) => row.stock_trip_line_id);
  const tripLines = lineIds.length ? fail(await client.from("stock_trip_lines").select("id, bags, head_count").in("id", lineIds)) : [];
  const movements = fail(movementsResult);
  const receiptIds = [...new Set(movements.map((row) => row.reference_id))];
  const receiptLineIds = [...new Set(movements.map((row) => row.reference_line_id).filter(Boolean))];
  const [receipts, receiptLines] = await Promise.all([
    receiptIds.length ? client.from("receiving_receipts").select("id, receipt_number, notes").in("id", receiptIds).then(fail) : [],
    receiptLineIds.length ? client.from("receiving_receipt_lines").select("id, bags, head_count").in("id", receiptLineIds).then(fail) : [],
  ]);
  const lotMap = new Map(lots.map((row) => [row.id, row]));
  const lineMap = new Map(tripLines.map((row) => [row.id, row]));
  const stockMap = new Map(stock.map((row) => [row.inventory_lot_id, row]));
  const receiptMap = new Map(receipts.map((row) => [row.id, row]));
  const receiptLineMap = new Map(receiptLines.map((row) => [row.id, row]));
  const rows = stock.map((row) => {
    const line = lineMap.get(lotMap.get(row.inventory_lot_id)?.stock_trip_line_id) || {};
    return {
      id: row.inventory_lot_id,
      lotId: row.inventory_lot_id,
      tripId: row.stock_trip_id,
      tripDate: row.trip_date,
      tripCode: row.trip_number,
      plant: row.plant_name,
      product: row.product_name,
      category: row.category === "whole_chicken" ? "Whole Chicken" : "By-products",
      sizeCode: row.product_code || "",
      classType: row.class_type || "",
      bags: line.bags ?? null,
      headCount: line.head_count ?? null,
      originalQty: number(row.original_quantity_kg),
      transferredQty: number(row.original_quantity_kg) - number(row.available_quantity_kg),
      warehouseAvailable: number(row.available_quantity_kg),
      remainingQty: number(row.available_quantity_kg),
      costPerKg: number(row.cost_per_kg),
      inventoryCostValue: number(row.inventory_cost_value),
      totalOut: 0,
    };
  });
  const receivingTransfers = movements.map((movement) => {
    const row = stockMap.get(movement.inventory_lot_id) || {};
    const receipt = receiptMap.get(movement.reference_id) || {};
    const receiptLine = receiptLineMap.get(movement.reference_line_id) || {};
    return {
      id: movement.id,
      receipt: receipt.receipt_number || "-",
      date: movement.effective_date,
      toSalesmanId: movement.to_salesman_user_id,
      tripId: row.stock_trip_id,
      plant: row.plant_name || "-",
      tripDate: row.trip_date,
      tripCode: row.trip_number || "-",
      product: row.product_name || "-",
      sizeCode: row.product_code || "",
      classType: row.class_type || "",
      qty: number(movement.quantity_kg),
      bags: receiptLine.bags ?? null,
      headCount: receiptLine.head_count ?? null,
      costPerKg: number(row.cost_per_kg),
      notes: receipt.notes || "",
    };
  });
  const warehouse = rows.reduce((total, row) => total + row.warehouseAvailable, 0);
  const assigned = salesmanStock.reduce((total, row) => total + number(row.available_quantity_kg), 0);
  return { rows, users: parityUsers(people), receivingTransfers, totals: { warehouse, assigned, company: warehouse + assigned } };
}

export function createHostedWarehouseTransfer(organizationId, values) {
  return transferWarehouseStock(organizationId, {
    salesmanId: values.toSalesmanId,
    date: values.date,
    notes: values.notes,
    lines: [{ lotId: values.row.id, quantity: values.qty, bags: values.bags, headCount: values.headCount }],
  });
}

export async function loadHostedSalesmanInventory(organizationId, client = requireSupabase()) {
  const [stock, people] = await Promise.all([loadSalesmanStock(organizationId), loadPeople(organizationId)]);
  const lotIds = [...new Set(stock.map((row) => row.inventory_lot_id))];
  const [lotsResult, movementsResult] = await Promise.all([
    lotIds.length ? client.from("inventory_lots").select("id, original_quantity_kg").in("id", lotIds) : Promise.resolve({ data: [], error: null }),
    lotIds.length ? client.from("inventory_movements").select("id, inventory_lot_id, movement_type, quantity_kg, from_location_type, from_salesman_user_id, to_location_type, to_salesman_user_id, effective_date, reference_id, reference_line_id").eq("organization_id", organizationId).in("inventory_lot_id", lotIds).order("effective_date", { ascending: false }) : Promise.resolve({ data: [], error: null }),
  ]);
  const lots = fail(lotsResult);
  const movements = fail(movementsResult);
  const transferMovements = movements.filter((row) => row.movement_type === "salesman_to_salesman");
  const receiptIds = [...new Set(transferMovements.map((row) => row.reference_id))];
  const receiptLineIds = [...new Set(transferMovements.map((row) => row.reference_line_id).filter(Boolean))];
  const [receipts, receiptLines] = await Promise.all([
    receiptIds.length ? client.from("transfer_receipts").select("id, receipt_number, notes").in("id", receiptIds).then(fail) : [],
    receiptLineIds.length ? client.from("transfer_receipt_lines").select("id, bags, head_count").in("id", receiptLineIds).then(fail) : [],
  ]);
  const originalMap = new Map(lots.map((row) => [row.id, number(row.original_quantity_kg)]));
  const receiptMap = new Map(receipts.map((row) => [row.id, row]));
  const receiptLineMap = new Map(receiptLines.map((row) => [row.id, row]));
  const stockMap = new Map(stock.map((row) => [`${row.inventory_lot_id}|${row.salesman_user_id}`, row]));
  const rows = stock.map((row) => {
    const relevant = movements.filter((movement) => movement.inventory_lot_id === row.inventory_lot_id);
    const assignedQty = relevant.filter((movement) => movement.to_location_type === "salesman" && movement.to_salesman_user_id === row.salesman_user_id).reduce((total, movement) => total + number(movement.quantity_kg), 0);
    const soldQty = relevant.filter((movement) => movement.movement_type === "sale" && movement.from_salesman_user_id === row.salesman_user_id).reduce((total, movement) => total + number(movement.quantity_kg), 0);
    return {
      id: row.inventory_lot_id,
      lotId: row.inventory_lot_id,
      salesmanId: row.salesman_user_id,
      tripId: row.stock_trip_id,
      tripDate: row.trip_date,
      tripCode: row.trip_number,
      plant: row.plant_name,
      product: row.product_name,
      category: row.category === "whole_chicken" ? "Whole Chicken" : "By-products",
      sizeCode: row.product_code || "",
      classType: row.class_type || "",
      bags: null,
      headCount: null,
      originalQty: originalMap.get(row.inventory_lot_id) || assignedQty,
      assignedQty,
      remainingQty: number(row.available_quantity_kg),
      totalOut: soldQty,
      costPerKg: number(row.cost_per_kg),
      inventoryCostValue: number(row.inventory_cost_value),
    };
  });
  const salesmanTransfers = transferMovements.map((movement) => {
    const row = stockMap.get(`${movement.inventory_lot_id}|${movement.from_salesman_user_id}`) || stock.find((item) => item.inventory_lot_id === movement.inventory_lot_id) || {};
    const receipt = receiptMap.get(movement.reference_id) || {};
    const receiptLine = receiptLineMap.get(movement.reference_line_id) || {};
    return {
      id: movement.id,
      receipt: receipt.receipt_number || "-",
      date: movement.effective_date,
      fromSalesmanId: movement.from_salesman_user_id,
      toSalesmanId: movement.to_salesman_user_id,
      tripId: row.stock_trip_id,
      plant: row.plant_name || "-",
      tripDate: row.trip_date,
      tripCode: row.trip_number || "-",
      product: row.product_name || "-",
      sizeCode: row.product_code || "",
      classType: row.class_type || "",
      qty: number(movement.quantity_kg),
      bags: receiptLine.bags ?? null,
      headCount: receiptLine.head_count ?? null,
      notes: receipt.notes || "",
      costPerKg: number(row.cost_per_kg),
    };
  });
  return { rows, users: parityUsers(people), salesmanTransfers };
}

export function createHostedSalesmanTransfer(organizationId, values) {
  return transferSalesmanStock(organizationId, {
    fromSalesmanId: values.fromSalesmanId,
    toSalesmanId: values.toSalesmanId,
    date: values.date,
    notes: values.notes,
    lines: [{ lotId: values.row.id, quantity: values.qty, bags: values.bags, headCount: values.headCount }],
  });
}
