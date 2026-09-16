export const screenRoles = {
  dashboard: ["owner_admin", "salesman"],
  trips: ["owner_admin"],
  plants: ["owner_admin"],
  "stock-in": ["owner_admin"],
  warehouse: ["owner_admin", "warehouse"],
  inventory: ["owner_admin", "salesman"],
  "salesman-inventory": ["owner_admin"],
  out: ["owner_admin", "salesman"],
  customers: ["owner_admin", "salesman"],
  sales: ["owner_admin", "salesman"],
  payments: ["owner_admin", "salesman"],
  collections: ["owner_admin", "salesman"],
  ledger: ["owner_admin", "salesman"],
  collectibles: ["owner_admin", "salesman"],
  dcr: ["owner_admin", "salesman"],
  dtr: ["owner_admin", "warehouse", "salesman", "payroll_admin"],
  payroll: ["owner_admin", "payroll_admin"],
  reports: ["owner_admin"],
  discrepancies: ["owner_admin"],
  trucks: ["owner_admin", "warehouse"],
  admin: ["owner_admin"],
};

export const operationalRoles = ["owner_admin", "warehouse", "salesman", "payroll_admin"];
export const isOperationalRole = (role) => operationalRoles.includes(role);

export const canAccessScreen = (role, screen) => screenRoles[screen]?.includes(role) || false;

export function initialScreenForRole(role) {
  if (role === "owner_admin") return "dashboard";
  if (role === "warehouse") return "warehouse";
  if (role === "salesman") return "inventory";
  if (role === "payroll_admin") return "dtr";
  return "dashboard";
}
