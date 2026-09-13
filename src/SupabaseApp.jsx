import { useEffect, useState } from "react";
import { Banknote, BarChart3, Building2, Clock3, FileClock, Home, LogOut, Menu, PackageCheck, ShoppingCart, Truck, Users, WalletCards, X } from "lucide-react";
import { AppProvider, useAppContext } from "./context/AppContext";
import { AuthScreen } from "./components/AuthScreen";
import { LivePlantManagement } from "./components/LivePlantManagement";
import { CustomersScreen, DcrScreen, FinanceScreen, LiveDashboard, SalesmanInventoryScreen, SalesScreen, StockInScreen, WarehouseScreen } from "./components/CoreOperations";
import { HostedReports } from "./components/HostedReports";
import { HostedTrucks } from "./components/HostedTrucks";
import { HostedDtr } from "./components/HostedDtr";
import { Button, SectionHeader } from "./components/ui";
import { supabaseConfigurationError } from "./lib/supabaseClient";
import { canAccessScreen, initialScreenForRole } from "./lib/roleAccess";

const roleLabels = {
  owner_admin: "Owner / Admin",
  warehouse: "Warehouse",
  salesman: "Salesman",
  cashier: "Cashier",
  payroll_admin: "Payroll Admin",
};

export default function SupabaseApp() {
  if (supabaseConfigurationError) return <AuthScreen onSignIn={() => {}} configurationError={supabaseConfigurationError} />;
  return <AppProvider><ProtectedApplication /></AppProvider>;
}

function ProtectedApplication() {
  const context = useAppContext();
  if (context.loading) return <CenteredState title="Loading workspace" detail="Restoring your secure session and organization access..." />;
  if (!context.session) return <AuthScreen onSignIn={context.signIn} />;
  if (context.error) return <CenteredState title="Unable to load access" detail={context.error} action={<Button onClick={context.signOut}>Sign out</Button>} />;
  if (!context.membership || !context.organization) {
    return <CenteredState title="Access not configured" detail="Your login is valid, but it has no active organization membership. Ask an Owner / Admin to provision access." action={<Button onClick={context.signOut}>Sign out</Button>} />;
  }
  return <Workspace />;
}

function Workspace() {
  const { organization, profile, role, signOut, user } = useAppContext();
  const [active, setActive] = useState(() => initialScreenForRole(role));
  const [paymentCustomerId, setPaymentCustomerId] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const changed = () => setEpoch((value) => value + 1);
  const navigate = (screen, customerId = "") => {
    setPaymentCustomerId(screen === "payments" ? customerId : "");
    setActive(screen);
  };
  useEffect(() => { window.scrollTo({ top: 0 }); setMobileOpen(false); }, [active]);
  const items = [
    { id: "dashboard", label: "Dashboard", icon: Home },
    { id: "plants", label: "Plant Configuration", icon: Building2 },
    { id: "stock-in", label: "Stock In", icon: Truck },
    { id: "warehouse", label: "Warehouse", icon: PackageCheck },
    { id: "inventory", label: "Salesman Inventory", icon: PackageCheck },
    { id: "customers", label: "Customers", icon: Users },
    { id: "sales", label: "Sales", icon: ShoppingCart },
    { id: "payments", label: "Payments", icon: WalletCards },
    { id: "ledger", label: "Ledger", icon: Users },
    { id: "collectibles", label: "Collectibles", icon: Banknote },
    { id: "dcr", label: "Daily Cash Report", icon: FileClock },
    { id: "dtr", label: "DTR", icon: Clock3 },
    { id: "reports", label: "Reports", icon: BarChart3 },
    { id: "trucks", label: "Trucks", icon: Truck },
  ].filter((item) => canAccessScreen(role, item.id));
  const screens = {
    dashboard: <LiveDashboard organizationId={organization.id} epoch={epoch} />,
    plants: <LivePlantManagement organizationId={organization.id} role={role} />,
    "stock-in": <StockInScreen organizationId={organization.id} onChanged={changed} />,
    warehouse: <WarehouseScreen organizationId={organization.id} role={role} onChanged={changed} />,
    inventory: <SalesmanInventoryScreen organizationId={organization.id} role={role} userId={user.id} onChanged={changed} />,
    customers: <CustomersScreen organizationId={organization.id} onChanged={changed} />,
    sales: <SalesScreen organizationId={organization.id} role={role} userId={user.id} onChanged={changed} />,
    payments: <FinanceScreen organizationId={organization.id} role={role} userId={user.id} view="payments" initialCustomerId={paymentCustomerId} onChanged={changed} onNavigate={navigate} />,
    ledger: <FinanceScreen organizationId={organization.id} role={role} userId={user.id} view="ledger" onChanged={changed} onNavigate={navigate} />,
    collectibles: <FinanceScreen organizationId={organization.id} role={role} userId={user.id} view="collectibles" onChanged={changed} onNavigate={navigate} />,
    dcr: <DcrScreen organizationId={organization.id} role={role} userId={user.id} onChanged={changed} />,
    dtr: <HostedDtr organizationId={organization.id} userId={user.id} role={role} />,
    reports: <HostedReports organizationId={organization.id} epoch={epoch} />,
    trucks: <HostedTrucks organizationId={organization.id} userId={user.id} />,
  };
  const content = screens[active] || screens.dashboard;

  return <div className="min-h-screen bg-slate-100 text-slate-900">
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
      <div className="flex min-h-16 items-center justify-between px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" className="lg:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={20} /></Button>
          <div><p className="font-bold">Chicken Distributor</p><p className="text-xs text-slate-500">{organization.name} / Hosted DEV</p></div>
        </div>
        <div className="flex items-center gap-3 text-right">
          <div className="hidden sm:block"><p className="text-sm font-bold">{profile?.full_name}</p><p className="text-xs text-slate-500">{roleLabels[role] || role}</p></div>
          <Button variant="secondary" onClick={signOut}><LogOut size={16} />Sign out</Button>
        </div>
      </div>
    </header>
    <div className="flex">
      {mobileOpen && <button className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 w-72 border-r border-slate-200 bg-white pt-4 transition-transform lg:sticky lg:top-16 lg:z-0 lg:h-[calc(100vh-4rem)] lg:w-64 ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="flex justify-end px-3 lg:hidden"><Button variant="ghost" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X size={20} /></Button></div>
        <nav className="space-y-1 p-3">{items.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => navigate(id)} className={`flex w-full items-center gap-3 px-3 py-3 text-left text-sm font-semibold ${active === id ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-50"}`}><Icon size={18} />{label}</button>)}</nav>
      </aside>
      <main className="min-w-0 flex-1 p-4 lg:p-6">{content}</main>
    </div>
  </div>;
}

function CenteredState({ title, detail, action }) {
  return <main className="grid min-h-screen place-items-center bg-slate-100 p-5"><section className="w-full max-w-lg border border-slate-200 bg-white p-6 shadow-sm"><h1 className="text-xl font-bold">{title}</h1><p className="mt-2 text-slate-600">{detail}</p>{action && <div className="mt-5">{action}</div>}</section></main>;
}
