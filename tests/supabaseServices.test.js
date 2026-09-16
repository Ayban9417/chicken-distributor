import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDcrArgs,
  buildPaymentArgs,
  buildSaleArgs,
  buildSalesmanTransferArgs,
  buildStockTripArgs,
  buildWarehouseTransferArgs,
  createSale,
  createStockTrip,
  recordPayment,
  submitDcr,
  transferSalesmanStock,
  transferWarehouseStock,
} from "../src/services/operationsService.js";
import { canAccessScreen, initialScreenForRole, isOperationalRole, screenRoles } from "../src/lib/roleAccess.js";

const ids = {
  organization: "10000000-0000-4000-8000-000000000001",
  plant: "10000000-0000-4000-8000-000000000002",
  plantProduct: "10000000-0000-4000-8000-000000000003",
  code: "10000000-0000-4000-8000-000000000004",
  lot: "10000000-0000-4000-8000-000000000005",
  customer: "10000000-0000-4000-8000-000000000006",
  salesOne: "10000000-0000-4000-8000-000000000007",
  salesTwo: "10000000-0000-4000-8000-000000000008",
  request: "10000000-0000-4000-8000-000000000009",
  paymentRequest: "10000000-0000-4000-8000-000000000010",
};

function rpcClient(data = { ok: true }, error = null) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      return { data, error };
    },
  };
}

test("Stock In service maps exact code and omits absent optional quantities", async () => {
  const values = {
    plantId: ids.plant,
    date: "2026-09-13",
    reference: "STOCK-REF",
    deliveryNote: "DN-1",
    notes: "received cold",
    lines: [{
      plantProductId: ids.plantProduct,
      codeId: ids.code,
      classTypeId: "",
      bags: undefined,
      headCount: null,
      quantity: "100.5",
      acquisitionType: "purchased",
      cost: "142.25",
    }],
  };
  const expected = buildStockTripArgs(ids.organization, values, ids.request);
  assert.deepEqual(expected.p_lines, [{
    plant_product_id: ids.plantProduct,
    code_id: ids.code,
    class_type_id: null,
    quantity_kg: 100.5,
    acquisition_type: "purchased",
    cost_per_kg: 142.25,
  }]);

  const client = rpcClient({ trip_number: "ST-TEST" });
  assert.deepEqual(await createStockTrip(ids.organization, values, ids.request, client), { trip_number: "ST-TEST" });
  assert.deepEqual(client.calls, [{ name: "create_stock_trip", args: expected }]);
});

test("free Stock In keeps zero cost while preserving explicit bags and head count", () => {
  const args = buildStockTripArgs(ids.organization, {
    plantId: ids.plant,
    date: "2026-09-13",
    lines: [{ plantProductId: ids.plantProduct, quantity: 10, bags: "0", headCount: "25", acquisitionType: "free_from_plant", cost: 999 }],
  }, ids.request);
  assert.equal(args.p_lines[0].cost_per_kg, 0);
  assert.equal(args.p_lines[0].bags, 0);
  assert.equal(args.p_lines[0].head_count, 25);
});

test("warehouse and Salesman transfers preserve the exact lot and request key", async () => {
  const warehouseValues = { salesmanId: ids.salesOne, date: "2026-09-13", notes: "route load", lines: [{ lotId: ids.lot, quantity: "40", bags: "2", headCount: "" }] };
  const salesmanValues = { fromSalesmanId: ids.salesOne, toSalesmanId: ids.salesTwo, date: "2026-09-13", notes: "reassigned", lines: [{ lotId: ids.lot, quantity: "5", bags: "", headCount: null }] };
  const client = rpcClient();

  await transferWarehouseStock(ids.organization, warehouseValues, ids.request, client);
  await transferSalesmanStock(ids.organization, salesmanValues, ids.request, client);

  assert.deepEqual(client.calls, [
    { name: "transfer_warehouse_to_salesman", args: buildWarehouseTransferArgs(ids.organization, warehouseValues, ids.request) },
    { name: "transfer_salesman_to_salesman", args: buildSalesmanTransferArgs(ids.organization, salesmanValues, ids.request) },
  ]);
  assert.deepEqual(client.calls[1].args.p_lines, [{ inventory_lot_id: ids.lot, quantity_kg: 5 }]);
});

test("Sale payload keeps exact lots, partial payment, reference, and notes separate", () => {
  const args = buildSaleArgs(ids.organization, {
    customerId: ids.customer,
    salesmanId: ids.salesOne,
    date: "2026-09-13",
    trustReceipt: "  TR-100  ",
    lines: [{ lotId: ids.lot, quantity: "10", price: "200" }],
    deductions: "50",
    notes: "sale note",
    paymentAmount: "500",
    paymentMethod: "gcash",
    paymentReference: "GC-100",
    paymentNotes: "initial partial",
  }, ids.request, ids.paymentRequest);

  assert.equal(args.p_trust_receipt_number, "TR-100");
  assert.deepEqual(args.p_lines, [{ inventory_lot_id: ids.lot, quantity_kg: 10, selling_price_per_kg: 200, price_override: false, default_price: null }]);
  assert.deepEqual(args.p_initial_payment, {
    amount: 500,
    method: "gcash",
    reference_number: "GC-100",
    notes: "initial partial",
    client_request_id: ids.paymentRequest,
  });
});

test("Sale payload supports full payment, no payment, and stable idempotency keys", async () => {
  const base = {
    customerId: ids.customer,
    salesmanId: ids.salesOne,
    date: "2026-09-13",
    trustReceipt: "TR-101",
    lines: [{ lotId: ids.lot, quantity: 5, price: 200 }],
    paymentMethod: "cash",
  };
  const full = buildSaleArgs(ids.organization, { ...base, paymentAmount: 1000 }, ids.request, ids.paymentRequest);
  const none = buildSaleArgs(ids.organization, { ...base, paymentAmount: "" }, ids.request, ids.paymentRequest);
  assert.equal(full.p_initial_payment.amount, 1000);
  assert.equal(none.p_initial_payment, null);

  const client = rpcClient({ id: "sale-1" });
  await createSale(ids.organization, { ...base, paymentAmount: "" }, ids.request, client);
  await createSale(ids.organization, { ...base, paymentAmount: "" }, ids.request, client);
  assert.equal(client.calls.length, 2);
  assert.equal(client.calls[0].args.p_client_request_id, ids.request);
  assert.equal(client.calls[1].args.p_client_request_id, ids.request);
});

test("Payment service carries electronic reference, notes, target Sale, and Salesman", async () => {
  const values = { customerId: ids.customer, salesmanId: ids.salesOne, saleId: "sale-1", date: "2026-09-13", amount: "750", method: "bank", reference: "BANK-100", notes: "verified deposit" };
  const expected = buildPaymentArgs(ids.organization, values, ids.request);
  const client = rpcClient({ payment_number: "PAY-1" });
  await recordPayment(ids.organization, values, ids.request, client);
  assert.deepEqual(client.calls, [{ name: "record_payment", args: expected }]);
  assert.equal(expected.p_reference_number, "BANK-100");
  assert.equal(expected.p_notes, "verified deposit");
});

test("DCR service maps the lock snapshot and explanation", async () => {
  const values = { salesmanId: ids.salesOne, date: "2026-09-13", actual: "1250.50", explanation: "cash verified" };
  const expected = buildDcrArgs(ids.organization, values, ids.request);
  const client = rpcClient({ status: "locked" });
  await submitDcr(ids.organization, values, ids.request, client);
  assert.deepEqual(client.calls, [{ name: "submit_dcr", args: expected }]);
  assert.equal(expected.p_actual_cash_remittance, 1250.5);
});

test("RPC failures remain recoverable service errors", async () => {
  const error = Object.assign(new Error("insufficient salesman stock"), { code: "P0001" });
  const client = rpcClient(null, error);
  await assert.rejects(
    recordPayment(ids.organization, { customerId: ids.customer, date: "2026-09-13", amount: 1, method: "cash" }, ids.request, client),
    (reason) => reason === error,
  );
});

test("hosted navigation matches the final client role model", () => {
  assert.equal(initialScreenForRole("owner_admin"), "dashboard");
  assert.equal(initialScreenForRole("warehouse"), "warehouse");
  assert.equal(initialScreenForRole("salesman"), "dashboard");
  assert.equal(canAccessScreen("salesman", "transfers"), true);
  assert.equal(canAccessScreen("salesman", "expenses"), true);
  assert.equal(initialScreenForRole("payroll_admin"), "dtr");
  assert.equal(isOperationalRole("cashier"), false);
  assert.equal(isOperationalRole("salesman"), true);

  for (const screen of ["plants", "stock-in", "warehouse", "customers", "reports", "trucks"]) assert.equal(canAccessScreen("owner_admin", screen), true);
  assert.equal(canAccessScreen("warehouse", "warehouse"), true);
  assert.equal(canAccessScreen("warehouse", "trucks"), true);
  for (const screen of ["dashboard", "plants", "stock-in", "sales", "payments", "dcr", "discrepancies", "reports"]) assert.equal(canAccessScreen("warehouse", screen), false);
  for (const screen of ["inventory", "sales", "payments", "dcr"]) assert.equal(canAccessScreen("salesman", screen), true);
  assert.equal(canAccessScreen("salesman", "warehouse"), false);
  for (const screen of Object.keys(screenRoles)) assert.equal(canAccessScreen("cashier", screen), false);
  for (const role of ["owner_admin", "warehouse", "salesman", "payroll_admin"]) assert.equal(canAccessScreen(role, "dtr"), true);
  assert.equal(canAccessScreen("owner_admin", "payroll"), true);
  assert.equal(canAccessScreen("payroll_admin", "payroll"), true);
  for (const screen of ["dashboard", "trips", "warehouse", "inventory", "out", "collections", "customers", "collectibles", "dcr", "discrepancies", "reports", "dtr", "payroll", "trucks", "admin"]) {
    assert.equal(canAccessScreen("owner_admin", screen), true, `owner can access ${screen}`);
  }
  for (const role of ["warehouse", "salesman", "cashier"]) assert.equal(canAccessScreen(role, "payroll"), false);
});
