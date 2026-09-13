export const screenRoles = {
  dashboard: ["owner_admin", "warehouse", "salesman", "cashier"],
  plants: ["owner_admin", "warehouse", "salesman", "cashier"],
  "stock-in": ["owner_admin", "warehouse"],
  warehouse: ["owner_admin", "warehouse"],
  inventory: ["owner_admin", "salesman"],
  customers: ["owner_admin", "cashier", "salesman"],
  sales: ["owner_admin", "salesman"],
  payments: ["owner_admin", "cashier", "salesman"],
  ledger: ["owner_admin", "cashier", "salesman"],
  collectibles: ["owner_admin", "cashier", "salesman"],
  dcr: ["owner_admin", "cashier", "salesman"],
  dtr: ["owner_admin", "warehouse", "salesman", "cashier", "payroll_admin"],
  payroll: ["owner_admin", "payroll_admin"],
  reports: ["owner_admin", "cashier"],
  trucks: ["owner_admin", "warehouse"],
};

export const canAccessScreen = (role, screen) => screenRoles[screen]?.includes(role) || false;

export function initialScreenForRole(role) {
  if (role === "owner_admin") return "dashboard";
  if (role === "warehouse") return "warehouse";
  if (role === "salesman") return "inventory";
  if (role === "cashier") return "payments";
  if (role === "payroll_admin") return "dtr";
  return "dashboard";
}
