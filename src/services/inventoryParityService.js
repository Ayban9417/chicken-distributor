import { requireSupabase } from "../lib/supabaseClient.js";
import { loadPeople, loadSalesmanStock, loadWarehouseStock, transferSalesmanStock, transferWarehouseStock } from "./operationsService.js";
import { loadSalesmanWorkspaceData } from "./salesmanDataService.js";
import { money } from "../utils/business.js";

const fail = (result) => {
  if (result.error) throw result.error;
  return result.data || [];
};
const number = (value) => Number(value || 0);

export const parityUsers = (people = []) => people.map((person) => ({
  id: person.user_id,
  name: person.full_name || "Unnamed User",
  username: person.username || "",
  role: ({ owner_admin: "Owner / Admin", salesman: "Agent", cashier: "Legacy / Deprecated", warehouse: "Warehouse", payroll_admin: "Payroll Admin" })[person.role] || person.role,
  active: person.active !== false,
  mustChangePassword: person.must_change_password === true,
}));

export async function loadHostedWarehouse(organizationId, client = requireSupabase()) {
  const [stock, salesmanStock, people, movementsResult] = await Promise.all([
    loadWarehouseStock(organizationId, client),
    loadSalesmanStock(organizationId, null, client),
    loadPeople(organizationId, client),
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

export async function loadHostedSalesmanInventory(organizationId, client = requireSupabase(), salesmanUserId = null) {
  const snapshot = salesmanUserId ? await loadSalesmanWorkspaceData(organizationId, client) : null;
  const [stock, people] = snapshot
    ? [snapshot.stock, snapshot.people]
    : await Promise.all([loadSalesmanStock(organizationId, null, client), loadPeople(organizationId, client)]);
  const lotIds = [...new Set(stock.map((row) => row.inventory_lot_id))];
  const [lots, movements] = snapshot
    ? [snapshot.lots, snapshot.movements]
    : await Promise.all([
      lotIds.length ? client.from("inventory_lots").select("id, original_quantity_kg").in("id", lotIds).then(fail) : [],
      lotIds.length ? client.from("inventory_movements").select("id, inventory_lot_id, movement_type, quantity_kg, from_location_type, from_salesman_user_id, to_location_type, to_salesman_user_id, effective_date, reference_id, reference_line_id").eq("organization_id", organizationId).in("inventory_lot_id", lotIds).order("effective_date", { ascending: false }).then(fail) : [],
    ]);
  const transferMovements = movements.filter((row) => row.movement_type === "salesman_to_salesman");
  const receiptIds = [...new Set(transferMovements.map((row) => row.reference_id))];
  const receiptLineIds = [...new Set(transferMovements.map((row) => row.reference_line_id).filter(Boolean))];
  const [receipts, receiptLines] = snapshot
    ? [snapshot.transferReceipts, snapshot.transferReceiptLines]
    : await Promise.all([
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

const rowsById = (rows = []) => new Map(rows.map((row) => [row.id, row]));
const selectIds = async (client, table, columns, ids) => ids.length ? fail(await client.from(table).select(columns).in("id", [...new Set(ids)])) : [];

const movementTitle = (movement, people) => {
  const name = (id) => people.find((person) => person.user_id === id)?.full_name || "Salesman";
  if (movement.movement_type === "stock_in") return "Stock In";
  if (movement.movement_type === "warehouse_to_salesman") return `Warehouse to ${name(movement.to_salesman_user_id)}`;
  if (movement.movement_type === "salesman_to_salesman") return `${name(movement.from_salesman_user_id)} to ${name(movement.to_salesman_user_id)}`;
  if (movement.movement_type === "sale") return `Sale by ${name(movement.from_salesman_user_id)}`;
  if (movement.movement_type === "adjustment_in") return "Adjustment In";
  if (movement.movement_type === "adjustment_out") return "Adjustment Out";
  if (movement.movement_type === "void_reversal") return "Sale Reversal";
  return movement.movement_type;
};

export function buildHostedInventoryOverviewRows({ warehouseStock = [], salesmanStock = [], movements = [], tripLines = [], codes = [], classes = [], people = [], receivingReceipts = [], transferReceipts = [], sales = [] }) {
  const lineMap = rowsById(tripLines);
  const codeMap = rowsById(codes);
  const classMap = rowsById(classes);
  const receivingMap = rowsById(receivingReceipts);
  const transferMap = rowsById(transferReceipts);
  const saleMap = rowsById(sales);
  const salesmanByLot = salesmanStock.reduce((map, row) => map.set(row.inventory_lot_id, number(map.get(row.inventory_lot_id)) + number(row.available_quantity_kg)), new Map());

  return warehouseStock.map((row) => {
    const line = lineMap.get(row.stock_trip_line_id) || {};
    const relevant = movements.filter((movement) => movement.inventory_lot_id === row.inventory_lot_id);
    const soldQty = relevant.reduce((total, movement) => total + (movement.movement_type === "sale" ? number(movement.quantity_kg) : movement.movement_type === "void_reversal" ? -number(movement.quantity_kg) : 0), 0);
    const adjustments = relevant.reduce((total, movement) => total + (movement.movement_type === "adjustment_in" ? number(movement.quantity_kg) : movement.movement_type === "adjustment_out" ? -number(movement.quantity_kg) : 0), 0);
    const warehouseQty = number(row.available_quantity_kg);
    const salesmanQty = number(salesmanByLot.get(row.inventory_lot_id));
    const remainingQty = money(warehouseQty + salesmanQty);
    const expectedQty = money(number(row.original_quantity_kg) + adjustments);
    const history = relevant.map((movement) => {
      const reference = movement.reference_type === "receiving_receipt" ? receivingMap.get(movement.reference_id)?.receipt_number
        : movement.reference_type === "transfer_receipt" ? transferMap.get(movement.reference_id)?.receipt_number
          : movement.reference_type === "sale" ? saleMap.get(movement.reference_id)?.trust_receipt_number
            : row.trip_number;
      return {
        id: movement.id,
        type: movementTitle(movement, people),
        ref: reference || movement.reference_type,
        qty: number(movement.quantity_kg),
        direction: ["sale", "adjustment_out"].includes(movement.movement_type) ? "out" : ["warehouse_to_salesman", "salesman_to_salesman"].includes(movement.movement_type) ? "neutral" : "in",
        at: movement.effective_date,
        notes: movement.notes || "",
      };
    }).sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
    const code = codeMap.get(row.code_id);
    const classType = classMap.get(row.class_type_id);
    return {
      id: row.inventory_lot_id,
      lotId: row.inventory_lot_id,
      tripId: row.stock_trip_id,
      tripDate: row.trip_date,
      tripCode: row.trip_number,
      plant: row.plant_name,
      product: row.product_name,
      category: row.category === "whole_chicken" ? "Whole Chicken" : "By-products",
      sizeCode: row.product_code || code?.code || "",
      sizeCodeLabel: code?.display_name || "",
      classType: row.class_type || classType?.class_type || "",
      classTypeLabel: classType?.display_name || "",
      bags: line.bags ?? null,
      headCount: line.head_count ?? null,
      acquisitionType: line.acquisition_type === "free_from_plant" ? "Free from Plant" : "Purchased",
      originalQty: number(row.original_quantity_kg),
      adjustments: money(adjustments),
      warehouseQty: money(warehouseQty),
      salesmanQty: money(salesmanQty),
      soldQty: money(soldQty),
      totalOut: money(soldQty),
      remainingQty,
      costPerKg: number(row.cost_per_kg),
      inventoryCostValue: money(remainingQty * number(row.cost_per_kg)),
      originalAcquisitionCost: money(number(row.original_quantity_kg) * number(row.cost_per_kg)),
      reconciliationDelta: money(expectedQty - remainingQty - soldQty),
      history,
    };
  });
}

export async function loadHostedInventoryOverview(organizationId, client = requireSupabase()) {
  const [warehouseStock, salesmanStock, people, movements] = await Promise.all([
    loadWarehouseStock(organizationId, client),
    loadSalesmanStock(organizationId, null, client),
    loadPeople(organizationId, client),
    client.from("inventory_movements").select("id, inventory_lot_id, movement_type, quantity_kg, from_location_type, from_salesman_user_id, to_location_type, to_salesman_user_id, reference_type, reference_id, reference_line_id, effective_date, notes, created_by").eq("organization_id", organizationId).order("effective_date", { ascending: true }).then(fail),
  ]);
  const lotIds = warehouseStock.map((row) => row.inventory_lot_id);
  const lots = await selectIds(client, "inventory_lots", "id, stock_trip_line_id", lotIds);
  const lotMap = rowsById(lots);
  const tripLines = await selectIds(client, "stock_trip_lines", "id, bags, head_count, acquisition_type", lots.map((row) => row.stock_trip_line_id));
  const codeIds = warehouseStock.map((row) => row.code_id).filter(Boolean);
  const classIds = warehouseStock.map((row) => row.class_type_id).filter(Boolean);
  const receiptIds = movements.filter((row) => row.reference_type === "receiving_receipt").map((row) => row.reference_id);
  const transferIds = movements.filter((row) => row.reference_type === "transfer_receipt").map((row) => row.reference_id);
  const saleIds = movements.filter((row) => row.reference_type === "sale").map((row) => row.reference_id);
  const [codes, classes, receivingReceipts, transferReceipts, sales] = await Promise.all([
    selectIds(client, "plant_product_codes", "id, code, display_name", codeIds),
    selectIds(client, "plant_product_class_types", "id, class_type, display_name", classIds),
    selectIds(client, "receiving_receipts", "id, receipt_number, salesman_user_id, notes", receiptIds),
    selectIds(client, "transfer_receipts", "id, receipt_number, from_salesman_user_id, to_salesman_user_id, notes", transferIds),
    selectIds(client, "sales", "id, trust_receipt_number, salesman_user_id", saleIds),
  ]);
  return buildHostedInventoryOverviewRows({
    warehouseStock: warehouseStock.map((row) => ({ ...row, stock_trip_line_id: lotMap.get(row.inventory_lot_id)?.stock_trip_line_id })),
    salesmanStock,
    movements,
    tripLines,
    codes,
    classes,
    people,
    receivingReceipts,
    transferReceipts,
    sales,
  });
}
