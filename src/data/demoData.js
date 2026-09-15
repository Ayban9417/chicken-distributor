export const demoToday = "2026-09-13";
export { initialPlantConfigs, productMaster } from "../utils/plants.js";
export const agents = [
  { id: "agent-pedro", name: "Pedro Reyes", role: "Agent" },
  { id: "agent-maria", name: "Maria Santos", role: "Agent" },
  { id: "agent-juan", name: "Juan Cruz", role: "Agent" },
];
export const users = [{ id: "owner", name: "Owner / Admin", role: "Owner / Admin" }, ...agents].map((user) => ({ ...user, active: true }));
export const truckRules = { ltoDays: 30, renewalMonths: 3, renewalSoonDays: 30, oilSoonKm: 500, oilSoonDays: 14, oilIntervalKm: 5000, oilIntervalMonths: 6 };
export function cleanOperationalData() {
  return { trips: [], movements: [], outs: [], customers: [], collections: [], ledgerEntries: [],
    expenses: [], dcrs: [], discrepancies: [], auditLog: [], attendance: [], payroll: [], trucks: [], receivingTransfers: [], salesmanTransfers: [] };
}
const fkidzProducts = [
  ["Whole Dressed Chicken", "C1", "Cat1", 539.9, 130],
  ["Whole Dressed Chicken", "H", "Happy Dog", 785.5, 152],
  ["Whole Dressed Chicken", "I", "India", 446.2, 150],
  ["Whole Dressed Chicken", "CB", "Class B", 481, 135],
  ["Head", "", "", 60, 20], ["Feet", "", "", 120, 40], ["Liver", "", "", 120, 140],
  ["Gizzard", "", "", 40, 135], ["Intestine", "", "", 60, 40],
].map(([name, sizeCode, sizeCodeLabel, originalQty, costPerKg]) => ({
  productId: name.toLowerCase().replaceAll(" ", "-"), name, category: name === "Whole Dressed Chicken" ? "Whole Chicken" : "By-products",
  codeId: sizeCode, sizeCode, sizeCodeLabel, classTypeId: "", classType: "", classTypeLabel: "", bags: null, headCount: null,
  originalQty, acquisitionType: "Purchased", costPerKg,
}));
export const initialTrips = [{ id: "trip-fkidz-0913", code: "TR-20260913-FKIDZ-1", plantId: "plant-fkidz", plant: "Fkidz", date: demoToday,
  reference: "FKIDZ-OPENING", deliveryNote: "Initial Fkidz stock", notes: "Configured opening warehouse stock", products: fkidzProducts }];
const clean = cleanOperationalData();
export const {
  movements: initialMovements, outs: initialOuts, customers: initialCustomers,
  collections: initialCollections, ledgerEntries: initialLedgerEntries, expenses: initialExpenses,
  dcrs: initialDcrs, discrepancies: initialDiscrepancies, auditLog: initialAuditLog,
  attendance: initialAttendance, payroll: initialPayroll, trucks: initialTrucks,
  receivingTransfers: initialReceivingTransfers, salesmanTransfers: initialSalesmanTransfers,
} = clean;
