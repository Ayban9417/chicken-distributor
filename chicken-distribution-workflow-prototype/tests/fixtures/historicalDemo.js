// Historical regression fixtures only. Never imported by the running application.
import { allocateOldestFirst, buildDcr, money } from "../../src/utils/business.js";

export const demoToday = "2026-09-06";

export { initialPlantConfigs, productMaster } from "../../src/utils/plants.js";

export const agents = [
  { id: "agent-pedro", name: "Pedro Reyes", role: "Agent" },
  { id: "agent-maria", name: "Maria Santos", role: "Agent" },
  { id: "agent-juan", name: "Juan Cruz", role: "Agent" },
];

export const users = [
  { id: "owner", name: "Owner / Admin", role: "Owner / Admin" },
  ...agents,
  { id: "cashier", name: "Ana Dela Cruz", role: "Cashier" },
].map((user) => ({ ...user, active: true }));

export const initialCustomers = [
  {
    id: "cust-abc",
    name: "ABC Restaurant",
    type: "Wholesale Credit",
    agentId: "agent-pedro",
    creditLimit: 150000,
    creditStatus: "Watch",
    pricing: {
      "Whole Dressed Chicken": 184,
      Liver: 125,
      Gizzard: 130,
      Feet: 95,
      Head: 70,
    },
  },
  {
    id: "cust-xyz",
    name: "XYZ Chicken Haus",
    type: "Wholesale Cash",
    agentId: "agent-pedro",
    creditLimit: 80000,
    creditStatus: "Good",
    pricing: { "Whole Dressed Chicken": 188, Feet: 92 },
  },
  {
    id: "cust-jj",
    name: "J&J Store",
    type: "Retail Credit",
    agentId: "agent-maria",
    creditLimit: 45000,
    creditStatus: "Good",
    pricing: {},
  },
  {
    id: "cust-rkm",
    name: "RKM Foods",
    type: "Wholesale Credit",
    agentId: "agent-juan",
    creditLimit: 120000,
    creditStatus: "Good",
    pricing: { "Whole Dressed Chicken": 186 },
  },
  {
    id: "cust-liza",
    name: "Liza's Eatery",
    type: "Retail Cash",
    agentId: "agent-maria",
    creditLimit: 25000,
    creditStatus: "Good",
    pricing: {},
  },
];

const legacyTrips = [
  {
    id: "trip-bty-0824",
    code: "TR-2026-0824-BTY",
    plant: "Bounty",
    date: "2026-08-24",
    reference: "DN-BTY-0824",
    notes: "Weekly stock-in for management report",
    products: [
      { name: "Whole Dressed Chicken", originalQty: 1850, costPerKg: 145 },
      { name: "Liver", originalQty: 82, costPerKg: 89 },
      { name: "Gizzard", originalQty: 64, costPerKg: 113 },
      { name: "Feet", originalQty: 105, costPerKg: 63 },
      { name: "Head", originalQty: 78, costPerKg: 43 },
    ],
  },
  {
    id: "trip-mag-0827",
    code: "TR-2026-0827-MAG",
    plant: "Magnolia",
    date: "2026-08-27",
    reference: "DN-MAG-0827",
    notes: "Weekly stock-in for management report",
    products: [
      { name: "Whole Dressed Chicken", originalQty: 2100, costPerKg: 147 },
      { name: "Liver", originalQty: 95, costPerKg: 91 },
      { name: "Gizzard", originalQty: 71, costPerKg: 116 },
      { name: "Feet", originalQty: 118, costPerKg: 65 },
      { name: "Head", originalQty: 83, costPerKg: 44 },
    ],
  },
  {
    id: "trip-bty-0830",
    code: "TR-2026-0830-BTY",
    plant: "Bounty",
    date: "2026-08-30",
    reference: "DN-BTY-0830",
    notes: "Current-week stock-in",
    products: [
      { name: "Whole Dressed Chicken", originalQty: 1500, costPerKg: 145 },
      { name: "Liver", originalQty: 70, costPerKg: 90 },
      { name: "Gizzard", originalQty: 55, costPerKg: 115 },
      { name: "Feet", originalQty: 80, costPerKg: 65 },
      { name: "Head", originalQty: 45, costPerKg: 44 },
      { name: "Neck", originalQty: 30, costPerKg: 52 },
    ],
  },
  {
    id: "trip-bty-0815",
    code: "TR-2026-0815-BTY",
    plant: "Bounty",
    date: "2026-08-15",
    reference: "DN-BTY-0815",
    notes: "Morning delivery",
    products: [
      { name: "Whole Dressed Chicken", originalQty: 1850, costPerKg: 142 },
      { name: "Liver", originalQty: 82, costPerKg: 88 },
      { name: "Gizzard", originalQty: 64, costPerKg: 112 },
      { name: "Feet", originalQty: 105, costPerKg: 62 },
      { name: "Head", originalQty: 78, costPerKg: 42 },
    ],
  },
  {
    id: "trip-mag-0818",
    code: "TR-2026-0818-MAG",
    plant: "Magnolia",
    date: "2026-08-18",
    reference: "DN-MAG-0818",
    notes: "Evening delivery",
    products: [
      { name: "Whole Dressed Chicken", originalQty: 2100, costPerKg: 146 },
      { name: "Liver", originalQty: 95, costPerKg: 91 },
      { name: "Gizzard", originalQty: 71, costPerKg: 116 },
      { name: "Feet", originalQty: 118, costPerKg: 65 },
      { name: "Head", originalQty: 83, costPerKg: 44 },
    ],
  },
  {
    id: "trip-bty-0822",
    code: "TR-2026-0822-BTY",
    plant: "Bounty",
    date: "2026-08-22",
    reference: "DN-BTY-0822",
    notes: "Weekly restock",
    products: [
      { name: "Whole Dressed Chicken", originalQty: 1600, costPerKg: 144 },
      { name: "Liver", originalQty: 76, costPerKg: 89 },
      { name: "Gizzard", originalQty: 58, costPerKg: 114 },
      { name: "Feet", originalQty: 92, costPerKg: 63 },
      { name: "Head", originalQty: 70, costPerKg: 43 },
    ],
  },
];


const stock = (name, sizeCode, bags, originalQty, costPerKg, acquisitionType = "Purchased") =>
  ({ name, sizeCode, bags, originalQty, costPerKg, acquisitionType });

export const initialTrips = [
  {
    id: "trip-bty-0831", code: "TR-2026-0831-BTY", plant: "Bounty", date: "2026-08-31",
    reference: "DN-BTY-0831", notes: "Fictional demo acquisition costs",
    products: [
      stock("Whole Dressed Chicken", "P1", 20, 600, 142),
      stock("Whole Dressed Chicken", "P2", 18, 540, 146),
      stock("Whole Dressed Chicken", "G", 12, 360, 150),
      stock("Liver", "", 5, 82, 88), stock("Gizzard", "", 4, 64, 112),
      stock("Feet", "", 6, 105, 0, "Free from Plant"),
      stock("Head", "", 4, 78, 0, "Free from Plant"),
    ],
  },
  {
    id: "trip-mag-0902", code: "TR-2026-0902-MAG", plant: "Magnolia", date: "2026-09-02",
    reference: "DN-MAG-0902", notes: "Fictional demo acquisition costs",
    products: [
      stock("Whole Dressed Chicken", "P1", 22, 660, 145),
      stock("Whole Dressed Chicken", "P2", 20, 600, 149),
      stock("Whole Dressed Chicken", "G", 14, 420, 153),
      stock("Liver", "", 6, 95, 91), stock("Gizzard", "", 5, 71, 116),
      stock("Feet", "", 7, 118, 65), stock("Head", "", 5, 83, 0, "Free from Plant"),
    ],
  },
  {
    id: "trip-bty-0906", code: "TR-2026-0906-BTY", plant: "Bounty", date: demoToday,
    reference: "DN-BTY-0906", notes: "Fictional demo acquisition costs",
    products: [
      stock("Whole Dressed Chicken", "P1", 10, 300, 144),
      stock("Whole Dressed Chicken", "P2", 10, 280, 148),
      stock("Whole Dressed Chicken", "G", 6, 180, 152),
      stock("Liver", "", 3, 45, 90), stock("Feet", "", 4, 60, 0, "Free from Plant"),
    ],
  },
  ...legacyTrips.map((trip) => ({ ...trip, products: trip.products.map((item) => ({
    ...item, sizeCode: "", bags: null, acquisitionType: "Purchased",
  })) })),
];

function sale(number, date, customerId, tripId, specs, extra = []) {
  const customer = initialCustomers.find((item) => item.id === customerId);
  const group = (id, lines) => {
    const trip = initialTrips.find((item) => item.id === id);
    return { tripId: id, plant: trip.plant, tripDate: trip.date,
      lines: lines.map(([product, sizeCode, qty, price]) => ({ product, sizeCode, qty, price, subtotal: money(qty * price) })) };
  };
  const groups = [group(tripId, specs), ...extra.map(([id, lines]) => group(id, lines))];
  return { id: "out-" + number, ref: "SALE-" + number, trustReceipt: "TR-00" + number,
    date, customerId, agentId: customer.agentId, groups,
    total: money(groups.flatMap((item) => item.lines).reduce((sum, line) => sum + line.subtotal, 0)) };
}

export const initialOuts = [
  sale(1048, "2026-08-20", "cust-abc", "trip-bty-0815", [["Whole Dressed Chicken", "", 130, 184]]),
  sale(1056, "2026-08-22", "cust-abc", "trip-bty-0815", [["Whole Dressed Chicken", "", 100, 184]]),
  sale(1068, "2026-08-24", "cust-rkm", "trip-mag-0818", [["Whole Dressed Chicken", "", 400, 186]]),
  sale(1071, "2026-08-25", "cust-abc", "trip-bty-0824", [["Whole Dressed Chicken", "", 174, 184], ["Liver", "", 10, 125]]),
  sale(1074, "2026-08-28", "cust-xyz", "trip-bty-0822", [["Whole Dressed Chicken", "", 200, 188]]),
  sale(1284, "2026-08-31", "cust-abc", "trip-bty-0831", [["Whole Dressed Chicken", "P1", 100, 184], ["Feet", "", 10, 95]]),
  sale(1285, "2026-09-01", "cust-xyz", "trip-bty-0831", [["Whole Dressed Chicken", "P1", 500, 188]]),
  sale(1286, "2026-09-02", "cust-jj", "trip-mag-0902", [["Whole Dressed Chicken", "P1", 120, 190], ["Head", "", 20, 75]]),
  sale(1287, "2026-09-03", "cust-rkm", "trip-bty-0831", [["Whole Dressed Chicken", "P2", 100, 186]], [
    ["trip-mag-0902", [["Whole Dressed Chicken", "G", 80, 192], ["Feet", "", 10, 98]]],
  ]),
  sale(1288, "2026-09-04", "cust-liza", "trip-mag-0902", [["Liver", "", 20, 130], ["Gizzard", "", 15, 135]]),
  sale(1289, "2026-09-05", "cust-abc", "trip-mag-0902", [["Whole Dressed Chicken", "P2", 100, 184]]),
  sale(1290, demoToday, "cust-abc", "trip-bty-0906", [["Whole Dressed Chicken", "P1", 100, 184], ["Liver", "", 10, 125]]),
  sale(1291, demoToday, "cust-jj", "trip-bty-0831", [["Whole Dressed Chicken", "G", 60, 190], ["Feet", "", 15, 98]]),
];

const paymentSpecs = [
  ["2026-08-23", "cust-abc", 15000, "Cash"],
  ["2026-08-26", "cust-rkm", 45000, "Bank Deposit"],
  ["2026-08-28", "cust-xyz", 37600, "Cash"],
  ["2026-09-01", "cust-abc", 20000, "Cash"],
  ["2026-09-01", "cust-xyz", 94000, "Bank Deposit"],
  ["2026-09-03", "cust-abc", 15000, "GCash"],
  ["2026-09-03", "cust-jj", 10000, "GCash"],
  ["2026-09-04", "cust-liza", 4625, "Cash"],
  [demoToday, "cust-abc", 20000, "Cash"],
  [demoToday, "cust-abc", 15000, "GCash"],
  [demoToday, "cust-rkm", 20000, "Bank Deposit"],
  [demoToday, "cust-jj", 5000, "Cash"],
];

export const initialLedgerEntries = initialOuts.map((out) => ({
  id: "ledger-" + out.id, customerId: out.customerId, date: out.date, ref: out.ref,
  trustReceipt: out.trustReceipt, description: "Sale", charge: out.total, payment: 0,
  type: "OUT", outId: out.id, agentId: out.agentId,
}));

export const initialCollections = paymentSpecs.map(([date, customerId, amount, method], index) => {
  const customer = initialCustomers.find((item) => item.id === customerId);
  const ref = "PAY-" + (3001 + index);
  const allocations = allocateOldestFirst(initialLedgerEntries, customerId, amount, date);
  const item = { id: "col-" + index, ref, date, customerId, agentId: customer.agentId, amount, method, allocations,
    reference: method === "Cash" ? "" : method === "GCash" ? "123456789" + index : "BDO-8291" + index,
    destination: method === "Cash" ? "Cash held by agent until remittance" : method === "GCash" ? "Owner GCash" : "Owner Bank Account",
  };
  initialLedgerEntries.push({ ...item, id: "ledger-" + item.id, type: "Payment",
    description: method + " Payment", charge: 0, payment: amount });
  return item;
});

export const initialMovements = [
  ...initialOuts.flatMap((out) => out.groups.flatMap((group, groupIndex) => group.lines.map((line, index) => ({
    id: "mov-" + out.id + "-" + groupIndex + "-" + index, tripId: group.tripId,
    product: line.product, sizeCode: line.sizeCode, qty: -line.qty, type: "OUT", outId: out.id,
    ref: out.ref + " / " + initialCustomers.find((item) => item.id === out.customerId).name,
    actor: agents.find((item) => item.id === out.agentId).name, at: out.date + "T10:00:00",
  })))),
  { id: "adjust-1", tripId: "trip-bty-0815", product: "Whole Dressed Chicken", sizeCode: "", qty: -5,
    type: "Adjustment", ref: "Admin Adjustment", actor: "Owner / Admin", at: "2026-08-26T08:10:00" },
];

export const initialExpenses = [
  { id: "exp-1", date: "2026-08-28", agentId: "agent-pedro", category: "Fuel", amount: 2500, source: "Cash Collection", status: "Approved", description: "Delivery fuel" },
  { id: "exp-2", date: "2026-09-01", agentId: "agent-pedro", category: "Toll", amount: 350, source: "Cash Collection", status: "Approved", description: "Route toll" },
  { id: "exp-3", date: demoToday, agentId: "agent-pedro", category: "Fuel", amount: 2500, source: "Cash Collection", status: "Approved", description: "Delivery fuel" },
  { id: "exp-4", date: demoToday, agentId: "agent-maria", category: "Parking", amount: 150, source: "Cash Collection", status: "Approved", description: "Market parking" },
  { id: "exp-5", date: demoToday, agentId: "agent-juan", category: "Repairs", amount: 900, source: "Personal Cash", status: "Approved", description: "Tire repair" },
];

export const initialDcrs = ["agent-pedro", "agent-juan"].map((agentId) => {
  const snapshot = buildDcr({ collections: initialCollections, expenses: initialExpenses, customers: initialCustomers, agentId, date: demoToday });
  const diff = agentId === "agent-pedro" ? -1000 : 0;
  return { id: "dcr-" + agentId, agentId, date: demoToday, actual: snapshot.expectedCashRemittance + diff,
    diff, snapshot, status: "LOCKED", explanation: diff ? "Cash remitted short by PHP 1,000" : "" };
});

export const initialDiscrepancies = [
  { id: "disc-1", date: demoToday, type: "Cash", title: "Cash Shortage", status: "Open", agentId: "agent-pedro",
    expected: initialDcrs[0].snapshot.expectedCashRemittance, actual: initialDcrs[0].actual, difference: -1000, details: "Pedro Reyes DCR short remittance" },
  { id: "disc-2", date: demoToday, type: "Payment Verification", title: "Bank Verification", status: "Open", customerId: "cust-rkm", agentId: "agent-juan", amount: 20000, details: "Bank payment awaiting verification" },
];

export const initialAuditLog = [
  ...initialOuts.map((out) => ({ id: "audit-" + out.id, at: out.date + "T10:00:00",
    actor: agents.find((agent) => agent.id === out.agentId).name, userId: out.agentId, action: "Created " + out.ref })),
  ...initialDcrs.map((dcr) => ({ id: "audit-" + dcr.id, at: demoToday + "T18:00:00",
    actor: agents.find((agent) => agent.id === dcr.agentId).name, userId: dcr.agentId, action: "Submitted DCR" })),
];

export const initialAttendance = agents.flatMap((agent, i) => ["2026-09-01", "2026-09-02", demoToday].map((date) => ({
  id: "dtr-" + agent.id + date, employeeId: agent.id, date, timeIn: i ? "08:00" : "08:03",
  timeOut: "17:12", breakMinutes: 60,
})));

export const initialPayroll = agents.map((agent) => ({
  id: "payroll-" + agent.id, employeeId: agent.id, start: "2026-08-31", end: demoToday,
  rate: 85, allowances: 500, deductions: 100, overtimeHours: 0, overtimeRate: 110, status: "Draft",
}));

export const truckRules = { ltoDays: 30, oilSoonKm: 500, oilSoonDays: 14, oilIntervalKm: 5000, oilIntervalMonths: 6 };
export const initialTrucks = [
  { id: "truck-1", unit: "Truck 01", plate: "ABC 1234", model: "Isuzu NKR", mileage: 82450,
    ltoExpiry: "2026-10-05", lastOilDate: "2026-04-05", lastOilMileage: 77500,
    nextOilDate: "2026-10-05", nextOilMileage: 82500, status: "Active", notes: "Main delivery route" },
  { id: "truck-2", unit: "Truck 02", plate: "NDE 5678", model: "Mitsubishi Canter", mileage: 106000,
    ltoExpiry: "2026-09-01", lastOilDate: "2026-02-01", lastOilMileage: 100000,
    nextOilDate: "2026-08-01", nextOilMileage: 105000, status: "Maintenance", notes: "Renew registration before dispatch" },
];
