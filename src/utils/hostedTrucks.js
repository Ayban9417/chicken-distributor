const number = (value) => Number(value || 0);

export const truckRules = {
  ltoSoonDays: 30,
  renewalSoonDays: 30,
  oilSoonDays: 14,
  oilSoonKm: 500,
  oilIntervalMonths: 6,
  oilIntervalKm: 5000,
};

export function addMonths(date, months) {
  if (!date) return "";
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, lastDay))).toISOString().slice(0, 10);
}

const daysUntil = (due, today) => due ? Math.ceil((new Date(`${due}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000) : Infinity;

function dueState(days, soonDays, mileageRemaining = Infinity, soonKm = 0) {
  if (days < 0 || mileageRemaining < 0) return "Overdue";
  if (days === 0 || mileageRemaining === 0) return "Due";
  if (days <= soonDays || mileageRemaining <= soonKm) return "Due Soon";
  return "Current";
}

export function hydrateTrucks(trucks = [], renewals = [], maintenance = []) {
  return trucks.map((truck) => {
    const truckRenewals = renewals.filter((row) => row.truck_id === truck.id).sort((a, b) => b.renewal_date.localeCompare(a.renewal_date));
    const truckMaintenance = maintenance.filter((row) => row.truck_id === truck.id).sort((a, b) => b.service_date.localeCompare(a.service_date));
    return { ...truck, renewals: truckRenewals, maintenance: truckMaintenance, latestRenewal: truckRenewals[0] || null, latestOilChange: truckMaintenance.find((row) => row.maintenance_type.toLowerCase() === "oil change") || null };
  });
}

export function truckAlerts(truck, today, rules = truckRules) {
  const alerts = [];
  if (truck.lto_registration_expiry) {
    const state = dueState(daysUntil(truck.lto_registration_expiry, today), rules.ltoSoonDays);
    if (state !== "Current") alerts.push({ label: `LTO ${state}`, state });
  }
  const renewalDate = truck.latestRenewal?.next_renewal_date;
  if (renewalDate) {
    const state = dueState(daysUntil(renewalDate, today), rules.renewalSoonDays);
    if (state !== "Current") alerts.push({ label: `Truck Renewal ${state}`, state });
  }
  const oil = truck.latestOilChange;
  if (oil?.next_due_date || oil?.next_due_mileage != null) {
    const state = dueState(daysUntil(oil.next_due_date, today), rules.oilSoonDays, oil.next_due_mileage == null ? Infinity : number(oil.next_due_mileage) - number(truck.current_mileage), rules.oilSoonKm);
    if (state !== "Current") alerts.push({ label: `Oil Change ${state}`, state });
  }
  const latestByType = new Map();
  for (const row of truck.maintenance || []) {
    const type = row.maintenance_type.trim();
    if (type.toLowerCase() === "oil change" || latestByType.has(type.toLowerCase())) continue;
    latestByType.set(type.toLowerCase(), row);
    if (!row.next_due_date && row.next_due_mileage == null) continue;
    const state = dueState(daysUntil(row.next_due_date, today), rules.oilSoonDays, row.next_due_mileage == null ? Infinity : number(row.next_due_mileage) - number(truck.current_mileage), rules.oilSoonKm);
    if (state !== "Current") alerts.push({ label: `${type} ${state}`, state });
  }
  return alerts;
}

export const buildTruckPayload = (organizationId, values) => ({
  organization_id: organizationId,
  unit_name: values.unitName.trim(),
  plate_number: values.plateNumber.trim().toUpperCase(),
  make_model: values.makeModel.trim(),
  current_mileage: number(values.mileage),
  lto_registration_expiry: values.ltoExpiry || null,
  active: values.active !== false,
});

export const buildRenewalPayload = (truckId, values, createdBy) => ({
  truck_id: truckId,
  renewal_date: values.date,
  next_renewal_date: addMonths(values.date, 3),
  notes: values.notes?.trim() || null,
  created_by: createdBy,
});

export const buildMaintenancePayload = (truckId, values, createdBy) => ({
  truck_id: truckId,
  maintenance_type: values.type.trim(),
  service_date: values.date,
  mileage: number(values.mileage),
  next_due_date: values.nextDueDate || null,
  next_due_mileage: values.nextDueMileage === "" || values.nextDueMileage == null ? null : number(values.nextDueMileage),
  notes: values.notes?.trim() || null,
  created_by: createdBy,
});
