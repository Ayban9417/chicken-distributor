import { useEffect, useState } from "react";
import { KeyRound, LogOut, Menu, X } from "lucide-react";
import { AppProvider, useAppContext } from "./context/AppContext";
import { AuthScreen } from "./components/AuthScreen";
import { HostedDashboard } from "./components/Reporting";
import { HostedAdministration, HostedCompanyInventoryScreen, HostedFinanceScreen, HostedInventoryScreen, HostedPlantsScreen, HostedSalesScreen, HostedWarehouseScreen } from "./components/HostedParityScreens";
import { HostedReports } from "./components/HostedReports";
import { HostedTrucks } from "./components/HostedTrucks";
import { HostedDtr } from "./components/HostedDtr";
import { HostedPayroll } from "./components/HostedPayroll";
import { ChangePasswordForm } from "./components/AccountSecurity";
import { Brand, PrimaryNav, primaryNavigation } from "./components/ApplicationNavigation";
import { Button, Drawer } from "./components/ui";
import { supabaseConfigurationError } from "./lib/supabaseClient";
import { canAccessScreen, initialScreenForRole, isOperationalRole } from "./lib/roleAccess";

const roleLabels = {
  owner_admin: "Owner / Admin",
  warehouse: "Warehouse",
  salesman: "Salesman",
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
  if (!isOperationalRole(context.role)) {
    return <CenteredState title="Access not configured" detail="This membership uses a retired role. Ask an Owner / Admin to assign a current operational role." action={<Button onClick={context.signOut}>Sign out</Button>} />;
  }
  if (context.profile.must_change_password) return <RequiredPasswordChange />;
  return <Workspace />;
}

function RequiredPasswordChange() {
  const { changePassword, refreshAccess, signOut } = useAppContext();
  return <main className="grid min-h-screen place-items-center bg-slate-100 p-5"><section className="w-full max-w-lg border border-slate-200 bg-white p-6 shadow-sm"><p className="text-sm font-bold uppercase text-emerald-700">Account security</p><h1 className="mt-1 text-2xl font-bold">Change your temporary password</h1><div className="mt-5"><ChangePasswordForm forced onChangePassword={changePassword} onDone={refreshAccess} /></div><Button className="mt-3 w-full" variant="ghost" onClick={signOut}><LogOut size={16} />Sign out</Button></section></main>;
}

function Workspace() {
  const { changePassword, organization, profile, refreshAccess, role, signOut, user } = useAppContext();
  const [active, setActive] = useState(() => initialScreenForRole(role));
  const [financeCustomerId, setFinanceCustomerId] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [securityOpen, setSecurityOpen] = useState(false);
  const changed = () => setEpoch((value) => value + 1);
  const navigate = (screen, customerId = "") => {
    const target = { payments: "collections", ledger: "customers", sales: "out", plants: "trips", "stock-in": "trips" }[screen] || screen;
    setFinanceCustomerId(target === "collections" || target === "customers" ? customerId : "");
    setActive(target);
  };
  useEffect(() => { window.scrollTo({ top: 0 }); setMobileOpen(false); }, [active]);
  const items = primaryNavigation.filter((item) => canAccessScreen(role, item.id)).map((item) => role === "salesman" && item.id === "inventory" ? { ...item, label: "My Inventory" } : item);
  const screens = {
    dashboard: <HostedDashboard organizationId={organization.id} epoch={epoch} onNavigate={navigate} onPayment={(customerId) => navigate("collections", customerId)} onLedger={(customerId) => navigate("customers", customerId)} />,
    trips: <HostedPlantsScreen organizationId={organization.id} role={role} onChanged={changed} />,
    warehouse: <HostedWarehouseScreen organizationId={organization.id} onChanged={changed} />,
    inventory: role === "owner_admin"
      ? <HostedCompanyInventoryScreen organizationId={organization.id} role={role} onStockIn={() => navigate("trips")} />
      : <HostedInventoryScreen organizationId={organization.id} role={role} userId={user.id} onChanged={changed} onWarehouse={() => navigate("warehouse")} />,
    "salesman-inventory": <HostedInventoryScreen organizationId={organization.id} role={role} userId={user.id} onChanged={changed} onWarehouse={() => navigate("warehouse")} />,
    out: <HostedSalesScreen organizationId={organization.id} role={role} userId={user.id} onChanged={changed} onStockIn={() => navigate("trips")} />,
    collections: <HostedFinanceScreen organizationId={organization.id} role={role} userId={user.id} view="payments" initialCustomerId={financeCustomerId} onChanged={changed} onNavigate={navigate} />,
    customers: <HostedFinanceScreen organizationId={organization.id} role={role} userId={user.id} view="ledger" initialCustomerId={financeCustomerId} onChanged={changed} onNavigate={navigate} />,
    collectibles: <HostedFinanceScreen organizationId={organization.id} role={role} userId={user.id} view="collectibles" onChanged={changed} onNavigate={navigate} />,
    dcr: <HostedFinanceScreen organizationId={organization.id} role={role} userId={user.id} view="dcr" onChanged={changed} onNavigate={navigate} />,
    dtr: <HostedDtr organizationId={organization.id} userId={user.id} role={role} />,
    payroll: <HostedPayroll organizationId={organization.id} userId={user.id} />,
    reports: <HostedReports organizationId={organization.id} epoch={epoch} />,
    trucks: <HostedTrucks organizationId={organization.id} userId={user.id} />,
    discrepancies: <HostedFinanceScreen organizationId={organization.id} role={role} userId={user.id} view="discrepancies" onChanged={changed} onNavigate={navigate} />,
    admin: <HostedAdministration organizationId={organization.id} role={role} onChanged={changed} onNavigate={navigate} />,
  };
  const content = screens[active] || screens.dashboard;

  return <div className="min-h-screen bg-slate-100 text-slate-900">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 overflow-y-auto border-r border-slate-200 bg-white md:block"><Brand /><PrimaryNav active={active} setActive={navigate} items={items} /></aside>
    {mobileOpen && <div className="fixed inset-0 z-40 bg-slate-950/35 md:hidden"><aside className="h-full w-80 max-w-[86vw] overflow-y-auto bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-slate-200 pr-3"><Brand /><Button variant="ghost" className="h-11 w-11 px-0" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={20} /></Button></div><PrimaryNav active={active} setActive={navigate} items={items} /></aside></div>}
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:ml-64 md:px-7"><Button variant="ghost" className="h-11 w-11 px-0 md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={22} /></Button><div className="hidden text-sm font-semibold text-slate-500 xl:block">{organization.name} / Hosted DEV</div><div className="flex items-center gap-2 text-right"><div className="hidden sm:block"><p className="text-sm font-bold">{profile?.full_name}</p><p className="text-xs text-slate-500">{roleLabels[role] || role}</p></div><Button variant="secondary" className="h-11 px-3" onClick={() => setSecurityOpen(true)} aria-label="Change password"><KeyRound size={16} /><span className="hidden lg:inline">Change password</span></Button><Button variant="secondary" className="h-11 px-3" onClick={signOut}><LogOut size={16} /><span className="hidden lg:inline">Sign out</span></Button></div></header>
    <main className="pb-24 md:ml-64"><div className="mx-auto max-w-7xl px-4 py-6 md:px-7">{content}</div></main>
    <nav className="mobile-nav fixed inset-x-0 bottom-0 z-30 flex gap-2 overflow-x-auto border-t border-slate-200 bg-white p-2 md:hidden">{items.map(({ id, label, icon: Icon }) => <button key={id} className={`flex min-w-20 flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold ${active === id ? "bg-blue-50 text-[#146ef5]" : "text-slate-500"}`} onClick={() => navigate(id)}><Icon size={18} /><span>{label}</span></button>)}</nav>
    <footer className="border-t border-slate-200 bg-white px-4 py-4 text-center text-xs text-slate-500 md:ml-64">Fictional demonstration data and acquisition costs. Prototype by Noderno.</footer>
    {securityOpen && <Drawer title="Change Password" onClose={() => setSecurityOpen(false)}><ChangePasswordForm onChangePassword={changePassword} onDone={async () => { await refreshAccess(); setSecurityOpen(false); }} /></Drawer>}
  </div>;
}

function CenteredState({ title, detail, action }) {
  return <main className="grid min-h-screen place-items-center bg-slate-100 p-5"><section className="w-full max-w-lg border border-slate-200 bg-white p-6 shadow-sm"><h1 className="text-xl font-bold">{title}</h1><p className="mt-2 text-slate-600">{detail}</p>{action && <div className="mt-5">{action}</div>}</section></main>;
}
