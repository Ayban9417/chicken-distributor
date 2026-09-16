import { AlertTriangle, ArrowRightLeft, Banknote, BarChart3, ClipboardCheck, FileClock, Home, PackageCheck, ReceiptText, Settings, ShoppingCart, Truck, Users, WalletCards } from "lucide-react";

export const primaryNavigation = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "trips", label: "Plants", icon: Truck },
  { id: "warehouse", label: "Warehouse", icon: PackageCheck },
  { id: "inventory", label: "Inventory", icon: PackageCheck },
  { id: "salesman-inventory", label: "Salesman Inventory", icon: PackageCheck },
  { id: "out", label: "Sales", icon: ShoppingCart },
  { id: "collections", label: "Payments", icon: WalletCards },
  { id: "customers", label: "Ledger", icon: Users },
  { id: "collectibles", label: "Collectibles", icon: Banknote },
  { id: "dcr", label: "Daily Cash Report", icon: FileClock },
  { id: "discrepancies", label: "Discrepancies", icon: AlertTriangle },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "dtr", label: "DTR", icon: FileClock },
  { id: "payroll", label: "Payroll", icon: WalletCards },
  { id: "trucks", label: "Trucks", icon: Truck },
  { id: "admin", label: "Administration", icon: Settings },
];

export const salesmanNavigation = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "inventory", label: "My Inventory", icon: PackageCheck },
  { id: "out", label: "Sales", icon: ShoppingCart },
  { id: "collections", label: "Payments", icon: WalletCards },
  { id: "collectibles", label: "Collectibles", icon: Banknote },
  { id: "customers", label: "Ledger", icon: Users },
  { id: "transfers", label: "Transfers", icon: ArrowRightLeft },
  { id: "expenses", label: "Expenses", icon: ReceiptText },
  { id: "dcr", label: "My DCR", icon: FileClock },
  { id: "dtr", label: "My DTR", icon: ClipboardCheck },
];

export function Brand() {
  return <div className="p-5"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#146ef5] text-white"><ClipboardCheck size={24} /></div><div><p className="text-base font-bold text-slate-950">Chicken Distributor</p><p className="text-xs font-semibold text-slate-500">Concept Workflow Prototype by Noderno</p></div></div></div>;
}

export function PrimaryNav({ active, setActive, items = primaryNavigation }) {
  return <nav className="space-y-1 px-3 pb-5">{items.map(({ id, label, icon: Icon }) => <button key={id} className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-base font-bold transition ${active === id ? "bg-blue-50 text-[#146ef5]" : "text-slate-600 hover:bg-slate-100"}`} onClick={() => setActive(id)}><Icon size={19} />{label}</button>)}</nav>;
}
