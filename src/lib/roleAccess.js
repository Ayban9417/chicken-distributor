export const screenRoles = {
  dashboard: ["owner_admin", "warehouse", "salesman", "cashier"],
  trips: ["owner_admin", "warehouse"],
  plants: ["owner_admin", "warehouse", "salesman", "cashier"],
  "stock-in": ["owner_admin", "warehouse"],
  warehouse: ["owner_admin", "warehouse"],
  inventory: ["owner_admin", "salesman"],
  out: ["owner_admin", "salesman"],
  customers: ["owner_admin", "cashier", "salesman"],
  sales: ["owner_admin", "salesman"],
  payments: ["owner_admin", "cashier", "salesman"],
  collections: ["owner_admin", "cashier", "salesman"],
  ledger: ["owner_admin", "cashier", "salesman"],
  collectibles: ["owner_admin", "cashier", "salesman"],
  dcr: ["owner_admin", "cashier", "salesman"],
  dtr: ["owner_admin", "warehouse", "salesman", "cashier", "payroll_admin"],
  payroll: ["owner_admin", "payroll_admin"],
  reports: ["owner_admin", "cashier"],
  discrepancies: ["owner_admin", "cashier", "warehouse"],
  trucks: ["owner_admin", "warehouse"],
  admin: ["owner_admin"],
};

export const canAccessScreen = (role, screen) => screenRoles[screen]?.includes(role) || false;

export function initialScreenForRole(role) {
  if (role === "owner_admin") return "dashboard";
  if (role === "warehouse") return "warehouse";
  if (role === "salesman") return "inventory";
  if (role === "cashier") return "collections";
  if (role === "payroll_admin") return "dtr";
  return "dashboard";
}
