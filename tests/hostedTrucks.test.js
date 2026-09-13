import test from "node:test";
import assert from "node:assert/strict";
import { addMonths, buildMaintenancePayload, buildRenewalPayload, buildTruckPayload, hydrateTrucks, truckAlerts } from "../src/utils/hostedTrucks.js";

test("hosted truck payload keeps normalized fleet fields", () => {
  assert.deepEqual(buildTruckPayload("org-1", { unitName: " Truck 01 ", plateNumber: " abc 1234 ", makeModel: " Isuzu NKR ", mileage: "82450.5", ltoExpiry: "2026-10-05", active: true }), {
    organization_id: "org-1", unit_name: "Truck 01", plate_number: "ABC 1234", make_model: "Isuzu NKR", current_mileage: 82450.5, lto_registration_expiry: "2026-10-05", active: true,
  });
});

test("renewal payload always advances exactly three calendar months", () => {
  assert.equal(addMonths("2026-01-31", 3), "2026-04-30");
  assert.deepEqual(buildRenewalPayload("truck-1", { date: "2026-09-14", notes: " renewed " }, "owner-1"), {
    truck_id: "truck-1", renewal_date: "2026-09-14", next_renewal_date: "2026-12-14", notes: "renewed", created_by: "owner-1",
  });
});

test("maintenance payload preserves oil date, mileage, next service and notes", () => {
  assert.deepEqual(buildMaintenancePayload("truck-1", { type: "Oil Change", date: "2026-09-14", mileage: "82500", nextDueDate: "2027-03-14", nextDueMileage: "87500", notes: " 5W-30 " }, "owner-1"), {
    truck_id: "truck-1", maintenance_type: "Oil Change", service_date: "2026-09-14", mileage: 82500, next_due_date: "2027-03-14", next_due_mileage: 87500, notes: "5W-30", created_by: "owner-1",
  });
});

test("hydrated hosted trucks retain complete renewal and maintenance history", () => {
  const [truck] = hydrateTrucks([{ id: "t1", current_mileage: 10000 }], [
    { truck_id: "t1", renewal_date: "2026-06-01", next_renewal_date: "2026-09-01" },
    { truck_id: "t1", renewal_date: "2026-09-01", next_renewal_date: "2026-12-01" },
  ], [
    { truck_id: "t1", maintenance_type: "Oil Change", service_date: "2026-08-01", mileage: 9500 },
    { truck_id: "t1", maintenance_type: "Brake Service", service_date: "2026-09-01", mileage: 10000 },
  ]);
  assert.equal(truck.renewals.length, 2);
  assert.equal(truck.latestRenewal.renewal_date, "2026-09-01");
  assert.equal(truck.latestOilChange.service_date, "2026-08-01");
});

test("hosted truck alerts distinguish Due Soon, Due, and Overdue", () => {
  const base = { current_mileage: 10000, lto_registration_expiry: null, maintenance: [] };
  assert.deepEqual(truckAlerts({ ...base, latestRenewal: { next_renewal_date: "2026-09-20" } }, "2026-09-14").map((row) => row.state), ["Due Soon"]);
  assert.deepEqual(truckAlerts({ ...base, latestRenewal: { next_renewal_date: "2026-09-14" } }, "2026-09-14").map((row) => row.state), ["Due"]);
  assert.deepEqual(truckAlerts({ ...base, latestRenewal: { next_renewal_date: "2026-09-13" }, latestOilChange: { next_due_mileage: 9999 } }, "2026-09-14").map((row) => row.state), ["Overdue", "Overdue"]);
});
