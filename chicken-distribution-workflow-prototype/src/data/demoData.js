export const plants = ["Bounty", "Magnolia", "San Miguel / Magnolia", "Other Plant"];

export const products = [
  "Whole Dressed Chicken",
  "Liver",
  "Gizzard",
  "Feet",
  "Head",
  "Neck",
  "Intestine",
  "Other",
];

export const agents = [
  { id: "agent-pedro", name: "Pedro Reyes", role: "Agent" },
  { id: "agent-maria", name: "Maria Santos", role: "Agent" },
  { id: "agent-juan", name: "Juan Cruz", role: "Agent" },
];

export const users = [
  { id: "owner", name: "Owner / Admin", role: "Owner / Admin" },
  ...agents,
];

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

export const initialTrips = [
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

export const initialMovements = [
  { id: "mov-1", tripId: "trip-bty-0815", product: "Whole Dressed Chicken", qty: -100, type: "OUT", ref: "OUT-1058 / Customer A", actor: "Pedro Reyes", at: "2026-08-20T10:34:00" },
  { id: "mov-2", tripId: "trip-bty-0815", product: "Whole Dressed Chicken", qty: -250, type: "OUT", ref: "OUT-1060 / Customer B", actor: "Pedro Reyes", at: "2026-08-22T09:45:00" },
  { id: "mov-3", tripId: "trip-bty-0815", product: "Whole Dressed Chicken", qty: -120, type: "OUT", ref: "OUT-1062 / Customer C", actor: "Maria Santos", at: "2026-08-23T11:20:00" },
  { id: "mov-4", tripId: "trip-bty-0815", product: "Whole Dressed Chicken", qty: -650, type: "OUT", ref: "OUT-1071 / ABC Restaurant", actor: "Pedro Reyes", at: "2026-08-25T15:20:00" },
  { id: "mov-5", tripId: "trip-bty-0815", product: "Whole Dressed Chicken", qty: -5, type: "Adjustment", ref: "Admin Adjustment", actor: "Owner / Admin", at: "2026-08-26T08:10:00" },
  { id: "mov-6", tripId: "trip-mag-0818", product: "Whole Dressed Chicken", qty: -880, type: "OUT", ref: "OUT-1068 / RKM Foods", actor: "Juan Cruz", at: "2026-08-24T13:10:00" },
  { id: "mov-7", tripId: "trip-bty-0822", product: "Whole Dressed Chicken", qty: -270, type: "OUT", ref: "OUT-1074 / XYZ Chicken Haus", actor: "Pedro Reyes", at: "2026-08-28T09:10:00" },
];

export const initialOuts = [
  {
    id: "out-1048",
    ref: "OUT-1048",
    date: "2026-08-20",
    customerId: "cust-abc",
    agentId: "agent-pedro",
    total: 24000,
    groups: [
      { tripId: "trip-bty-0815", plant: "Bounty", tripDate: "2026-08-15", lines: [{ product: "Whole Dressed Chicken", qty: 130.43, price: 184, subtotal: 24000 }] },
    ],
  },
  {
    id: "out-1056",
    ref: "OUT-1056",
    date: "2026-08-22",
    customerId: "cust-abc",
    agentId: "agent-pedro",
    total: 18500,
    groups: [
      { tripId: "trip-bty-0815", plant: "Bounty", tripDate: "2026-08-15", lines: [{ product: "Whole Dressed Chicken", qty: 100.54, price: 184, subtotal: 18500 }] },
    ],
  },
  {
    id: "out-1071",
    ref: "OUT-1071",
    date: "2026-08-25",
    customerId: "cust-abc",
    agentId: "agent-pedro",
    total: 32000,
    groups: [
      { tripId: "trip-bty-0815", plant: "Bounty", tripDate: "2026-08-15", lines: [{ product: "Whole Dressed Chicken", qty: 173.91, price: 184, subtotal: 32000 }] },
    ],
  },
];

export const initialLedgerEntries = [
  { id: "led-1", customerId: "cust-abc", date: "2026-08-20", ref: "OUT-1048", description: "Chicken Order", charge: 24000, payment: 0, type: "OUT", outId: "out-1048" },
  { id: "led-2", customerId: "cust-abc", date: "2026-08-22", ref: "OUT-1056", description: "Chicken Order", charge: 18500, payment: 0, type: "OUT", outId: "out-1056" },
  { id: "led-3", customerId: "cust-abc", date: "2026-08-23", ref: "PAY-0201", description: "Cash Payment", charge: 0, payment: 15000, type: "Payment", allocations: [{ invoiceRef: "OUT-1048", amount: 15000 }], agentId: "agent-pedro", method: "Cash" },
  { id: "led-4", customerId: "cust-abc", date: "2026-08-25", ref: "OUT-1071", description: "Chicken Order", charge: 32000, payment: 0, type: "OUT", outId: "out-1071" },
  { id: "led-5", customerId: "cust-xyz", date: "2026-08-28", ref: "OUT-1074", description: "Chicken Order", charge: 38500, payment: 0, type: "OUT" },
  { id: "led-6", customerId: "cust-rkm", date: "2026-08-24", ref: "OUT-1068", description: "Chicken Order", charge: 76000, payment: 45000, type: "Payment", allocations: [{ invoiceRef: "OUT-1068", amount: 45000 }], agentId: "agent-juan", method: "Bank Deposit" },
];

export const initialCollections = [
  { id: "col-1", ref: "PAY-0301", date: "2026-08-30", customerId: "cust-xyz", agentId: "agent-pedro", amount: 20000, method: "Cash", destination: "Cash held by agent until remittance", allocations: [{ invoiceRef: "OUT-1074", amount: 20000 }] },
  { id: "col-2", ref: "PAY-0302", date: "2026-08-30", customerId: "cust-jj", agentId: "agent-pedro", amount: 15000, method: "GCash", destination: "Owner GCash", reference: "GC-883910" },
  { id: "col-3", ref: "PAY-0303", date: "2026-08-30", customerId: "cust-rkm", agentId: "agent-pedro", amount: 30000, method: "Bank Deposit", destination: "Owner Bank Account", bank: "BDO", reference: "BDO-91234" },
  { id: "col-4", ref: "PAY-0304", date: "2026-08-30", customerId: "cust-rkm", agentId: "agent-pedro", amount: 12500, method: "Cash", destination: "Cash held by agent until remittance" },
  { id: "col-5", ref: "PAY-0305", date: "2026-08-30", customerId: "cust-liza", agentId: "agent-pedro", amount: 8000, method: "Cash", destination: "Cash held by agent until remittance" },
  { id: "col-6", ref: "PAY-0306", date: "2026-08-30", customerId: "cust-liza", agentId: "agent-pedro", amount: 5000, method: "GCash", destination: "Owner GCash", reference: "GC-554201" },
];

export const initialExpenses = [
  { id: "exp-1", date: "2026-08-30", agentId: "agent-pedro", category: "Parking", amount: 150, source: "Cash Collection", description: "Market parking" },
  { id: "exp-2", date: "2026-08-30", agentId: "agent-pedro", category: "Toll", amount: 350, source: "Cash Collection", description: "Delivery route toll" },
];

export const initialDiscrepancies = [
  { id: "disc-1", type: "Cash", title: "Cash Shortage", status: "Open", agentId: "agent-pedro", expected: 37500, actual: 36500, difference: -1000, details: "Pedro Reyes DCR short remittance" },
  { id: "disc-2", type: "Payment Verification", title: "Bank Verification", status: "Open", customerId: "cust-rkm", agentId: "agent-pedro", amount: 30000, details: "Bank payment awaiting verification" },
  { id: "disc-3", type: "Inventory", title: "Inventory Difference", status: "Open", plant: "Bounty", tripDate: "2026-08-15", product: "Whole Dressed Chicken", expected: 625, actual: 610, difference: -15 },
  { id: "disc-4", type: "Price", title: "Manual Price Override", status: "Open", customerId: "cust-abc", product: "Whole Dressed Chicken", normalPrice: 184, agentPrice: 180, difference: -4 },
];

export const initialAuditLog = [
  { id: "audit-1", at: "2026-08-30T10:32:00", actor: "Pedro Reyes", action: "Created OUT-1058" },
  { id: "audit-2", at: "2026-08-30T10:34:00", actor: "System", action: "Deducted 100 kg from Bounty / Aug 15" },
  { id: "audit-3", at: "2026-08-30T11:12:00", actor: "Pedro Reyes", action: "Recorded ₱20,000 cash collection" },
  { id: "audit-4", at: "2026-08-30T12:05:00", actor: "Pedro Reyes", action: "Recorded ₱2,500 fuel expense" },
  { id: "audit-5", at: "2026-08-30T15:20:00", actor: "Pedro Reyes", action: "Changed Whole Chicken price ₱184 -> ₱180" },
  { id: "audit-6", at: "2026-08-30T18:45:00", actor: "Pedro Reyes", action: "Submitted DCR" },
];

export const weeklyBusinessData = {
  thisWeek: {
    label: "This Week",
    start: "2026-08-24",
    end: "2026-08-30",
    days: [
      { date: "2026-08-24", day: "Monday", sales: 215000, collections: 190000 },
      { date: "2026-08-25", day: "Tuesday", sales: 248000, collections: 225000 },
      { date: "2026-08-26", day: "Wednesday", sales: 190000, collections: 175000 },
      { date: "2026-08-27", day: "Thursday", sales: 275000, collections: 205000 },
      { date: "2026-08-28", day: "Friday", sales: 295000, collections: 245000 },
      { date: "2026-08-29", day: "Saturday", sales: 334750, collections: 324800 },
      { date: "2026-08-30", day: "Sunday", sales: 284750, collections: 155500 },
    ],
    products: [
      { product: "Whole Dressed Chicken", kg: 8420 },
      { product: "Liver", kg: 420 },
      { product: "Gizzard", kg: 315 },
      { product: "Feet", kg: 350 },
      { product: "Head", kg: 200 },
      { product: "Other By-products", kg: 0 },
    ],
    plants: [
      { plant: "Bounty", sales: 985400, kg: 5120 },
      { plant: "Magnolia", sales: 742100, kg: 4180 },
      { plant: "Other", sales: 115000, kg: 405 },
    ],
    customers: [
      { customerId: "cust-abc", sales: 285400, collections: 230000, outstanding: 42800 },
      { customerId: "cust-xyz", sales: 242800, collections: 210000, outstanding: 18500 },
      { customerId: "cust-rkm", sales: 198500, collections: 176000, outstanding: 31000 },
      { customerId: "cust-jj", sales: 175200, collections: 145300, outstanding: 22800 },
      { customerId: "cust-liza", sales: 128750, collections: 94000, outstanding: 12500 },
    ],
    expenses: [
      { category: "Fuel", amount: 50000 },
      { category: "Parking", amount: 5850 },
      { category: "Toll", amount: 12000 },
      { category: "Other", amount: 7000 },
    ],
    receivables: {
      opening: 378000,
      newCreditSales: 322200,
      collectionsApplied: 271700,
    },
    agents: [
      { agentId: "agent-pedro", outHandled: 742500, collections: 640300, cash: 230500, gcash: 185000, bank: 224800, expenses: 31850, expectedRemittance: 198650, actualRemittance: 197650, discrepancies: "Cash shortage - ₱1,000" },
      { agentId: "agent-maria", outHandled: 568000, collections: 482000, cash: 166000, gcash: 134000, bank: 182000, expenses: 21800, expectedRemittance: 144200, actualRemittance: 144200, discrepancies: "DCR pending for Sunday" },
      { agentId: "agent-juan", outHandled: 532000, collections: 398000, cash: 112500, gcash: 83000, bank: 202500, expenses: 21200, expectedRemittance: 91300, actualRemittance: 91300, discrepancies: "Bank verification pending" },
    ],
    comparison: {
      sales: 1699700,
      collections: 1470000,
      expenses: 81200,
      wholeChickenKg: 7950,
    },
    today: {
      outToday: 284750,
      collectionsToday: 156500,
      cashPendingRemittance: 37500,
      tripsReceived: 1,
      dcrStatus: "2 / 3 submitted",
      openDiscrepancies: 3,
    },
  },
  lastWeek: {
    label: "Last Week",
    start: "2026-08-17",
    end: "2026-08-23",
    days: [
      { date: "2026-08-17", day: "Monday", sales: 198000, collections: 178000 },
      { date: "2026-08-18", day: "Tuesday", sales: 232500, collections: 219000 },
      { date: "2026-08-19", day: "Wednesday", sales: 175000, collections: 168000 },
      { date: "2026-08-20", day: "Thursday", sales: 260000, collections: 205000 },
      { date: "2026-08-21", day: "Friday", sales: 276500, collections: 236000 },
      { date: "2026-08-22", day: "Saturday", sales: 302700, collections: 304000 },
      { date: "2026-08-23", day: "Sunday", sales: 255000, collections: 160000 },
    ],
    products: [
      { product: "Whole Dressed Chicken", kg: 7950 },
      { product: "Liver", kg: 390 },
      { product: "Gizzard", kg: 285 },
      { product: "Feet", kg: 318 },
      { product: "Head", kg: 180 },
      { product: "Other By-products", kg: 35 },
    ],
    plants: [
      { plant: "Bounty", sales: 905000, kg: 4780 },
      { plant: "Magnolia", sales: 674700, kg: 3760 },
      { plant: "Other", sales: 120000, kg: 618 },
    ],
    customers: [
      { customerId: "cust-abc", sales: 264000, collections: 218000, outstanding: 52000 },
      { customerId: "cust-xyz", sales: 228500, collections: 202000, outstanding: 26500 },
      { customerId: "cust-rkm", sales: 188000, collections: 174000, outstanding: 43500 },
      { customerId: "cust-jj", sales: 161200, collections: 142000, outstanding: 26000 },
      { customerId: "cust-liza", sales: 118900, collections: 96000, outstanding: 17200 },
    ],
    expenses: [
      { category: "Fuel", amount: 54500 },
      { category: "Parking", amount: 6200 },
      { category: "Toll", amount: 13200 },
      { category: "Other", amount: 7300 },
    ],
    receivables: {
      opening: 352500,
      newCreditSales: 308200,
      collectionsApplied: 282700,
    },
    agents: [
      { agentId: "agent-pedro", outHandled: 695000, collections: 612000, cash: 220000, gcash: 171000, bank: 221000, expenses: 34500, expectedRemittance: 185500, actualRemittance: 185500, discrepancies: "Balanced" },
      { agentId: "agent-maria", outHandled: 514700, collections: 466000, cash: 151000, gcash: 125000, bank: 190000, expenses: 23500, expectedRemittance: 127500, actualRemittance: 127500, discrepancies: "Balanced" },
      { agentId: "agent-juan", outHandled: 490000, collections: 392000, cash: 108000, gcash: 76000, bank: 208000, expenses: 23200, expectedRemittance: 84800, actualRemittance: 84800, discrepancies: "Inventory count follow-up" },
    ],
    comparison: {
      sales: 1580000,
      collections: 1398000,
      expenses: 84800,
      wholeChickenKg: 7640,
    },
    today: {
      outToday: 255000,
      collectionsToday: 160000,
      cashPendingRemittance: 29800,
      tripsReceived: 1,
      dcrStatus: "3 / 3 submitted",
      openDiscrepancies: 2,
    },
  },
};
