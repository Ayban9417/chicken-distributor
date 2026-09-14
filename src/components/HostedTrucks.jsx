import { useMemo, useState } from "react";
import { CalendarCheck, Gauge, Pencil, Plus, RefreshCw, Save, Truck, Wrench } from "lucide-react";
import { Badge, Button, Field, inputClass, ResponsiveTable, SectionHeader, StatCard, StatMini } from "./ui";
import { useRemote } from "../hooks/useRemote";
import { readableError } from "../services/errors";
import { loadTrucks, recordTruckMaintenance, recordTruckRenewal, saveTruck, setTruckActive } from "../services/truckService";
import { addMonths, truckAlerts, truckRules } from "../utils/hostedTrucks";
import { shortDate } from "../utils/business";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
const freshTruck = () => ({ unitName: "", plateNumber: "", makeModel: "", mileage: "0", ltoExpiry: "", active: true });
const badgeTone = (state) => state === "Overdue" ? "red" : state === "Due" ? "amber" : "amber";

function Editor({ title, children, onCancel, onSave, busy, saveLabel = "Save" }) {
  return <section className="report-section"><h2 className="mb-4 text-lg font-bold">{title}</h2>{children}<div className="mt-4 flex flex-wrap gap-2"><Button onClick={onSave} disabled={busy}><Save size={17} />{busy ? "Saving..." : saveLabel}</Button><Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button></div></section>;
}

export function HostedTrucks({ organizationId, userId }) {
  const [epoch, setEpoch] = useState(0);
  const remote = useRemote(() => loadTrucks(organizationId), `${organizationId}-${epoch}`);
  const [editing, setEditing] = useState(null);
  const [renewal, setRenewal] = useState(null);
  const [maintenance, setMaintenance] = useState(null);
  const [status, setStatus] = useState({ busy: false, error: "", notice: "" });
  const trucks = remote.data || [];
  const alerts = useMemo(() => trucks.flatMap((truck) => truckAlerts(truck, today()).map((alert) => ({ ...alert, truck }))), [trucks]);

  const refresh = (notice = "") => { setEpoch((value) => value + 1); setStatus({ busy: false, error: "", notice }); };
  const fail = (reason) => setStatus({ busy: false, error: readableError(reason), notice: "" });

  async function submitTruck() {
    setStatus({ busy: true, error: "", notice: "" });
    if (!editing.unitName.trim() || !editing.plateNumber.trim() || !editing.makeModel.trim()) return setStatus({ busy: false, error: "Enter unit name, plate number, and make/model.", notice: "" });
    if (!Number.isFinite(Number(editing.mileage)) || Number(editing.mileage) < Number(editing.originalMileage || 0)) return setStatus({ busy: false, error: "Mileage must be nonnegative and cannot move backwards.", notice: "" });
    try { await saveTruck(organizationId, editing); setEditing(null); refresh("Truck saved."); } catch (reason) { fail(reason); }
  }

  async function submitRenewal() {
    if (!renewal.date || renewal.date > today()) return setStatus({ busy: false, error: "Enter a renewal date on or before today.", notice: "" });
    setStatus({ busy: true, error: "", notice: "" });
    try { await recordTruckRenewal(renewal.truckId, renewal, userId); setRenewal(null); refresh("Three-month renewal recorded."); } catch (reason) { fail(reason); }
  }

  async function submitMaintenance() {
    const truck = trucks.find((item) => item.id === maintenance.truckId);
    if (!maintenance.type.trim() || !maintenance.date || maintenance.date > today()) return setStatus({ busy: false, error: "Enter a maintenance type and valid service date.", notice: "" });
    if (!Number.isFinite(Number(maintenance.mileage)) || Number(maintenance.mileage) < Number(truck?.current_mileage || 0)) return setStatus({ busy: false, error: "Service mileage cannot be less than current mileage.", notice: "" });
    if (maintenance.nextDueMileage !== "" && Number(maintenance.nextDueMileage) < Number(maintenance.mileage)) return setStatus({ busy: false, error: "Next due mileage cannot be less than service mileage.", notice: "" });
    setStatus({ busy: true, error: "", notice: "" });
    try { await recordTruckMaintenance(organizationId, maintenance.truckId, maintenance, userId); setMaintenance(null); refresh("Maintenance recorded."); } catch (reason) { fail(reason); }
  }

  async function toggleActive(truck) {
    setStatus({ busy: true, error: "", notice: "" });
    try { await setTruckActive(organizationId, truck.id, !truck.active); refresh(truck.active ? "Truck deactivated." : "Truck reactivated."); } catch (reason) { fail(reason); }
  }

  const startMaintenance = (truck, type = "Oil Change") => setMaintenance({ truckId: truck.id, type, date: today(), mileage: String(truck.current_mileage), nextDueDate: type === "Oil Change" ? addMonths(today(), truckRules.oilIntervalMonths) : "", nextDueMileage: type === "Oil Change" ? String(Number(truck.current_mileage) + truckRules.oilIntervalKm) : "", notes: "" });

  return <div>
    <SectionHeader title="Trucks" eyebrow="Fleet records" action={<div className="flex flex-wrap gap-2"><Button variant="secondary" aria-label="Refresh trucks" title="Refresh trucks" onClick={remote.refresh}><RefreshCw size={17} /></Button><Button onClick={() => { setEditing(freshTruck()); setRenewal(null); setMaintenance(null); setStatus({ busy: false, error: "", notice: "" }); }}><Plus size={17} />Add Truck</Button></div>} />
    {status.error && <p role="alert" className="mb-4 border border-rose-200 bg-rose-50 p-3 font-semibold text-rose-800">{status.error}</p>}
    {status.notice && <p className="mb-4 border border-emerald-200 bg-emerald-50 p-3 font-semibold text-emerald-800">{status.notice}</p>}
    <div className="grid gap-3 sm:grid-cols-3"><StatCard label="Active Trucks" value={trucks.filter((truck) => truck.active).length} icon={Truck} /><StatCard label="Fleet Mileage" value={`${trucks.reduce((sum, truck) => sum + Number(truck.current_mileage || 0), 0).toLocaleString("en-PH")} km`} icon={Gauge} tone="green" /><StatCard label="Items Requiring Attention" value={alerts.length} icon={Wrench} tone={alerts.length ? "red" : "green"} /></div>
    {editing && <Editor title={editing.id ? "Edit Truck" : "Add Truck"} busy={status.busy} onCancel={() => setEditing(null)} onSave={submitTruck}><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Field label="Unit Name"><input className={inputClass()} value={editing.unitName} onChange={(event) => setEditing({ ...editing, unitName: event.target.value })} /></Field><Field label="Plate Number"><input className={inputClass()} value={editing.plateNumber} onChange={(event) => setEditing({ ...editing, plateNumber: event.target.value })} /></Field><Field label="Make / Model"><input className={inputClass()} value={editing.makeModel} onChange={(event) => setEditing({ ...editing, makeModel: event.target.value })} /></Field><Field label="Current Mileage"><input type="number" min={editing.originalMileage || 0} step="0.1" className={inputClass()} value={editing.mileage} onChange={(event) => setEditing({ ...editing, mileage: event.target.value })} /></Field><Field label="LTO Registration Expiry"><input type="date" className={inputClass()} value={editing.ltoExpiry} onInput={(event) => setEditing({ ...editing, ltoExpiry: event.target.value })} /></Field></div></Editor>}
    {renewal && <Editor title="Record Truck Renewal" busy={status.busy} onCancel={() => setRenewal(null)} onSave={submitRenewal} saveLabel="Record Renewal"><div className="grid gap-3 sm:grid-cols-3"><Field label="Renewal Date"><input type="date" max={today()} className={inputClass()} value={renewal.date} onInput={(event) => setRenewal({ ...renewal, date: event.target.value })} /></Field><Field label="Next Renewal (+3 Months)"><input type="date" disabled className={inputClass()} value={addMonths(renewal.date, 3)} /></Field><Field label="Notes"><input className={inputClass()} value={renewal.notes} onChange={(event) => setRenewal({ ...renewal, notes: event.target.value })} /></Field></div></Editor>}
    {maintenance && <Editor title="Record Maintenance" busy={status.busy} onCancel={() => setMaintenance(null)} onSave={submitMaintenance} saveLabel="Record Maintenance"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Field label="Maintenance Type"><input className={inputClass()} value={maintenance.type} onChange={(event) => setMaintenance({ ...maintenance, type: event.target.value })} /></Field><Field label="Service Date"><input type="date" max={today()} className={inputClass()} value={maintenance.date} onInput={(event) => setMaintenance({ ...maintenance, date: event.target.value })} /></Field><Field label="Mileage"><input type="number" min="0" step="0.1" className={inputClass()} value={maintenance.mileage} onChange={(event) => setMaintenance({ ...maintenance, mileage: event.target.value })} /></Field><Field label="Next Due Date"><input type="date" className={inputClass()} value={maintenance.nextDueDate} onInput={(event) => setMaintenance({ ...maintenance, nextDueDate: event.target.value })} /></Field><Field label="Next Due Mileage"><input type="number" min={maintenance.mileage || 0} step="0.1" className={inputClass()} value={maintenance.nextDueMileage} onChange={(event) => setMaintenance({ ...maintenance, nextDueMileage: event.target.value })} /></Field><Field label="Notes"><input className={inputClass()} value={maintenance.notes} onChange={(event) => setMaintenance({ ...maintenance, notes: event.target.value })} /></Field></div></Editor>}
    {remote.loading && !remote.data ? <p className="py-12 text-center text-slate-500">Loading hosted truck records...</p> : !trucks.length ? <p className="report-section text-center text-slate-500">No trucks configured.</p> : <div className="mt-5 grid gap-4 xl:grid-cols-2">{trucks.map((truck) => <article key={truck.id} className={`rounded-lg border bg-white p-4 ${truck.active ? "border-slate-200" : "border-slate-200 opacity-70"}`}><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-xl font-bold">{truck.unit_name}</h2><p className="text-slate-500">{truck.plate_number} / {truck.make_model}</p></div><Badge tone={truck.active ? "green" : "slate"}>{truck.active ? "Active" : "Inactive"}</Badge></div><div className="my-3 flex flex-wrap gap-2">{truckAlerts(truck, today()).map((alert) => <Badge key={alert.label} tone={badgeTone(alert.state)}>{alert.label}</Badge>)}</div><div className="grid grid-cols-2 gap-3"><StatMini label="Mileage" value={`${Number(truck.current_mileage).toLocaleString("en-PH")} km`} /><StatMini label="LTO Expiry" value={shortDate(truck.lto_registration_expiry)} /><StatMini label="Last Renewal" value={shortDate(truck.latestRenewal?.renewal_date)} /><StatMini label="Next Renewal" value={shortDate(truck.latestRenewal?.next_renewal_date)} /><StatMini label="Last Oil Change" value={truck.latestOilChange ? `${shortDate(truck.latestOilChange.service_date)} / ${Number(truck.latestOilChange.mileage).toLocaleString("en-PH")} km` : "-"} /><StatMini label="Next Oil Change" value={truck.latestOilChange ? `${shortDate(truck.latestOilChange.next_due_date)} / ${truck.latestOilChange.next_due_mileage == null ? "-" : `${Number(truck.latestOilChange.next_due_mileage).toLocaleString("en-PH")} km`}` : "-"} /></div><div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { setEditing({ id: truck.id, unitName: truck.unit_name, plateNumber: truck.plate_number, makeModel: truck.make_model, mileage: String(truck.current_mileage), originalMileage: truck.current_mileage, ltoExpiry: truck.lto_registration_expiry || "", active: truck.active }); setRenewal(null); setMaintenance(null); }}><Pencil size={16} />Edit</Button><Button variant="secondary" onClick={() => { setRenewal({ truckId: truck.id, date: today(), notes: "" }); setEditing(null); setMaintenance(null); }}><CalendarCheck size={16} />Renewal</Button><Button onClick={() => { startMaintenance(truck); setEditing(null); setRenewal(null); }}><Wrench size={16} />Oil Change</Button><Button variant="ghost" onClick={() => { startMaintenance(truck, "General Maintenance"); setEditing(null); setRenewal(null); }}>Maintenance</Button><Button variant="ghost" disabled={status.busy} onClick={() => toggleActive(truck)}>{truck.active ? "Deactivate" : "Reactivate"}</Button></div></article>)}</div>}
    {!!trucks.length && <><section className="report-section"><h2 className="mb-4 text-lg font-bold">Renewal History</h2><ResponsiveTable columns={["Truck", "Renewal Date", "Next Renewal", "Notes"]} rows={trucks.flatMap((truck) => truck.renewals.map((row) => [truck.unit_name, shortDate(row.renewal_date), shortDate(row.next_renewal_date), row.notes || "-"]))} /></section><section className="report-section"><h2 className="mb-4 text-lg font-bold">Maintenance History</h2><ResponsiveTable columns={["Truck", "Type", "Service Date", "Mileage", "Next Due", "Notes"]} rows={trucks.flatMap((truck) => truck.maintenance.map((row) => [truck.unit_name, row.maintenance_type, shortDate(row.service_date), `${Number(row.mileage).toLocaleString("en-PH")} km`, [shortDate(row.next_due_date), row.next_due_mileage == null ? "" : `${Number(row.next_due_mileage).toLocaleString("en-PH")} km`].filter((value) => value && value !== "-").join(" / ") || "-", row.notes || "-"]))} /></section></>}
  </div>;
}
