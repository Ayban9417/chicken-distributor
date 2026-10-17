-- Run against a disposable migrated Supabase database only. Never run on live DEV.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('f3000000-0000-4000-8000-000000000101', 'rr-tf-owner@test.invalid'),
  ('f3000000-0000-4000-8000-000000000102', 'rr-tf-s1@test.invalid'),
  ('f3000000-0000-4000-8000-000000000103', 'rr-tf-s2@test.invalid'),
  ('f3000000-0000-4000-8000-000000000104', 'rr-tf-s3@test.invalid');
insert into public.profiles (id, full_name, username) values
  ('f3000000-0000-4000-8000-000000000101', 'QA Owner', 'rrtf.owner'),
  ('f3000000-0000-4000-8000-000000000102', 'QA Sender', 'rrtf.sender'),
  ('f3000000-0000-4000-8000-000000000103', 'QA Recipient', 'rrtf.recipient'),
  ('f3000000-0000-4000-8000-000000000104', 'QA Third', 'rrtf.third');
insert into public.organizations (id, name, slug) values
  ('f3000000-0000-4000-8000-000000000001', 'Transfer Correction QA', 'transfer-correction-qa');
insert into public.organization_memberships (organization_id, user_id, role)
select 'f3000000-0000-4000-8000-000000000001', id,
  case when id = 'f3000000-0000-4000-8000-000000000101' then 'owner_admin' else 'salesman' end
from public.profiles where id::text like 'f3000000-%';
insert into public.plants (id, organization_id, name, short_code) values
  ('f3000000-0000-4000-8000-000000000011', 'f3000000-0000-4000-8000-000000000001', 'QA Plant', 'QAT');
insert into public.products (id, organization_id, name, category) values
  ('f3000000-0000-4000-8000-000000000012', 'f3000000-0000-4000-8000-000000000001', 'QA Chicken', 'whole_chicken');
insert into public.plant_products (id, plant_id, product_id) values
  ('f3000000-0000-4000-8000-000000000013', 'f3000000-0000-4000-8000-000000000011', 'f3000000-0000-4000-8000-000000000012');
insert into public.stock_trips (id, organization_id, plant_id, trip_number, trip_date, status, client_request_id, created_by)
select id, 'f3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000011',
  'ST-QA-' || right(id::text, 3), '2026-01-01', 'received',
  ('f3000000-0000-4000-8000-0000000001' || right(id::text, 2))::uuid,
  'f3000000-0000-4000-8000-000000000101'
from (values ('f3000000-0000-4000-8000-000000000021'::uuid),
             ('f3000000-0000-4000-8000-000000000022'::uuid),
             ('f3000000-0000-4000-8000-000000000023'::uuid)) v(id);
insert into public.stock_trip_lines (id, stock_trip_id, plant_product_id, quantity_kg, acquisition_type, cost_per_kg)
values
  ('f3000000-0000-4000-8000-000000000031', 'f3000000-0000-4000-8000-000000000021', 'f3000000-0000-4000-8000-000000000013', 100, 'purchased', 140),
  ('f3000000-0000-4000-8000-000000000032', 'f3000000-0000-4000-8000-000000000022', 'f3000000-0000-4000-8000-000000000013', 100, 'purchased', 140),
  ('f3000000-0000-4000-8000-000000000033', 'f3000000-0000-4000-8000-000000000023', 'f3000000-0000-4000-8000-000000000013', 100, 'purchased', 140);
insert into public.inventory_lots (id, organization_id, stock_trip_line_id, plant_id, product_id, cost_per_kg, original_quantity_kg)
select ('f3000000-0000-4000-8000-00000000004' || right(id::text, 1))::uuid,
  'f3000000-0000-4000-8000-000000000001', id,
  'f3000000-0000-4000-8000-000000000011', 'f3000000-0000-4000-8000-000000000012', 140, 100
from public.stock_trip_lines where id::text like 'f3000000-%';
insert into public.inventory_movements (organization_id, inventory_lot_id, movement_type,
  quantity_kg, from_location_type, to_location_type, reference_type, reference_id,
  reference_line_id, effective_date, created_by, created_at)
select 'f3000000-0000-4000-8000-000000000001', l.id, 'stock_in', 100, 'plant', 'warehouse',
  'stock_trip', sl.stock_trip_id, sl.id, '2026-01-01',
  'f3000000-0000-4000-8000-000000000101', '2026-01-01T00:00:00Z'
from public.inventory_lots l join public.stock_trip_lines sl on sl.id = l.stock_trip_line_id
where l.id::text like 'f3000000-%';

insert into public.receiving_receipts (id, organization_id, receipt_number, salesman_user_id,
  client_request_id, created_by, notes) values
  ('f3000000-0000-4000-8000-000000000061', 'f3000000-0000-4000-8000-000000000001', 'RR-QA-1', 'f3000000-0000-4000-8000-000000000102', 'f3000000-0000-4000-8000-000000000161', 'f3000000-0000-4000-8000-000000000101', 'Original RR'),
  ('f3000000-0000-4000-8000-000000000064', 'f3000000-0000-4000-8000-000000000001', 'RR-QA-2', 'f3000000-0000-4000-8000-000000000103', 'f3000000-0000-4000-8000-000000000164', 'f3000000-0000-4000-8000-000000000101', 'Original RR 2');
insert into public.receiving_receipt_lines (id, receipt_id, inventory_lot_id, quantity_kg) values
  ('f3000000-0000-4000-8000-000000000062', 'f3000000-0000-4000-8000-000000000061', 'f3000000-0000-4000-8000-000000000041', 20),
  ('f3000000-0000-4000-8000-000000000065', 'f3000000-0000-4000-8000-000000000064', 'f3000000-0000-4000-8000-000000000042', 30);
insert into public.inventory_movements (id, organization_id, inventory_lot_id, movement_type,
  quantity_kg, from_location_type, to_location_type, to_salesman_user_id,
  reference_type, reference_id, reference_line_id, effective_date, created_by, created_at) values
  ('f3000000-0000-4000-8000-000000000063', 'f3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000041', 'warehouse_to_salesman', 20, 'warehouse', 'salesman', 'f3000000-0000-4000-8000-000000000102', 'receiving_receipt', 'f3000000-0000-4000-8000-000000000061', 'f3000000-0000-4000-8000-000000000062', '2026-01-02', 'f3000000-0000-4000-8000-000000000101', '2026-01-02T00:00:00Z'),
  ('f3000000-0000-4000-8000-000000000066', 'f3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000042', 'warehouse_to_salesman', 30, 'warehouse', 'salesman', 'f3000000-0000-4000-8000-000000000103', 'receiving_receipt', 'f3000000-0000-4000-8000-000000000064', 'f3000000-0000-4000-8000-000000000065', '2026-01-02', 'f3000000-0000-4000-8000-000000000101', '2026-01-02T00:00:00Z');

create temp table qa_rr as select
  '{"effectiveDate":"2026-01-03","toSalesmanId":"f3000000-0000-4000-8000-000000000104","lotId":"f3000000-0000-4000-8000-000000000043","quantityKg":25,"notes":"Corrected RR"}'::jsonb changes;
alter table qa_rr add column preview jsonb;
grant select on qa_rr to authenticated, service_role;
update qa_rr set preview = private.inspect_transfer_correction(
  'f3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000061', 'warehouse_transfer', changes);
select is((select preview->>'eligible' from qa_rr), 'true', 'RR recipient, source lot, date and quantity can be corrected before downstream use');
select is((select count(*) from public.inventory_movements where reference_id = 'f3000000-0000-4000-8000-000000000061'), 1::bigint, 'preview writes no movement');

set local role authenticated;
set local request.jwt.claim.sub = 'f3000000-0000-4000-8000-000000000102';
select throws_ok($$select public.preview_receiving_receipt_correction(
  'f3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000061',
  (select changes from qa_rr))$$, '42501', null, 'Salesman cannot preview RR correction');
set local request.jwt.claim.sub = 'f3000000-0000-4000-8000-000000000101';
select is((public.preview_receiving_receipt_correction(
  'f3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000061',
  (select changes from qa_rr))->>'eligible'), 'true', 'Owner can preview RR correction');
reset role;

set local role service_role;
select throws_ok($$select public.apply_receiving_receipt_correction(
  'f3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000061',
  'f3000000-0000-4000-8000-000000000102', 'Correct receiving details',
  'f3000000-0000-4000-8000-000000000201', (select preview->>'versionToken' from qa_rr),
  (select changes from qa_rr))$$, '42501', null, 'Salesman cannot apply RR correction');
select lives_ok($$select public.apply_receiving_receipt_correction(
  'f3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000061',
  'f3000000-0000-4000-8000-000000000101', 'Correct receiving details',
  'f3000000-0000-4000-8000-000000000201', (select preview->>'versionToken' from qa_rr),
  (select changes from qa_rr))$$, 'eligible RR correction commits atomically');
reset role;
select is((select receipt_number from public.receiving_receipts where id = 'f3000000-0000-4000-8000-000000000061'), 'RR-QA-1', 'RR identity is preserved');
select is(private.custody_balance('f3000000-0000-4000-8000-000000000041', 'warehouse', null), 100::numeric, 'old lot returns to Warehouse');
select is(private.custody_balance('f3000000-0000-4000-8000-000000000043', 'salesman', 'f3000000-0000-4000-8000-000000000104'), 25::numeric, 'corrected RR custody belongs to new recipient and lot');
select is((select count(*) from public.inventory_movements where reference_type = 'transaction_correction' and inventory_lot_id in ('f3000000-0000-4000-8000-000000000041', 'f3000000-0000-4000-8000-000000000043')), 2::bigint, 'original movement remains with reversal and replacement');
select is((select count(*) from public.transaction_corrections where module = 'warehouse_transfer' and transaction_id = 'f3000000-0000-4000-8000-000000000061'), 1::bigint, 'RR correction appears in edit history');
select is((select count(*) from public.audit_events where entity_id = 'f3000000-0000-4000-8000-000000000061' and action = 'CORRECT_TRANSFER_RECEIPT'), 1::bigint, 'RR audit event is written');
set local role service_role;
select throws_ok($$select public.apply_receiving_receipt_correction(
  'f3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000061',
  'f3000000-0000-4000-8000-000000000101', 'Correct receiving details',
  'f3000000-0000-4000-8000-000000000299', (select preview->>'versionToken' from qa_rr),
  (select changes from qa_rr))$$, '55000', null, 'stale concurrent preview is rejected');
select is((select count(*) from public.transaction_corrections where module = 'warehouse_transfer'), 1::bigint,
  'failed stale request leaves the correction ledger unchanged');
reset role;
update qa_rr set changes = jsonb_set(changes, '{notes}', '"Notes reviewed again"'::jsonb);
update qa_rr set preview = private.inspect_transfer_correction(
  'f3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000061', 'warehouse_transfer', changes);
select is((select preview->>'eligible' from qa_rr), 'true', 'notes may be updated after an audited custody correction');
set local role service_role;
select lives_ok($$select public.apply_receiving_receipt_correction(
  'f3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000061',
  'f3000000-0000-4000-8000-000000000101', 'Clarify receiving notes',
  'f3000000-0000-4000-8000-000000000203', (select preview->>'versionToken' from qa_rr),
  (select changes from qa_rr))$$, 'metadata-only correction preserves custody');
reset role;
select is((select count(*) from public.inventory_movements where reference_type = 'transaction_correction'
  and inventory_lot_id in ('f3000000-0000-4000-8000-000000000041', 'f3000000-0000-4000-8000-000000000043')), 2::bigint,
  'metadata-only correction adds no movement');
update qa_rr set changes = jsonb_set(changes, '{notes}', '"Final notes"'::jsonb);
update qa_rr set preview = private.inspect_transfer_correction(
  'f3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000061', 'warehouse_transfer', changes);
set local role service_role;
select throws_ok($$select public.apply_receiving_receipt_correction(
  'f3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000061',
  'f3000000-0000-4000-8000-000000000101', 'Clarify receiving notes',
  'f3000000-0000-4000-8000-000000000203', (select preview->>'versionToken' from qa_rr),
  (select changes from qa_rr))$$, '23505', null, 'replayed request ID is rejected even with a fresh preview');
reset role;

insert into public.transfer_receipts (id, organization_id, receipt_number, from_salesman_user_id,
  to_salesman_user_id, client_request_id, created_by, notes) values
  ('f3000000-0000-4000-8000-000000000071', 'f3000000-0000-4000-8000-000000000001', 'TF-QA-1',
   'f3000000-0000-4000-8000-000000000103', 'f3000000-0000-4000-8000-000000000102',
   'f3000000-0000-4000-8000-000000000171', 'f3000000-0000-4000-8000-000000000101', 'Original TF');
insert into public.transfer_receipt_lines (id, receipt_id, inventory_lot_id, quantity_kg) values
  ('f3000000-0000-4000-8000-000000000072', 'f3000000-0000-4000-8000-000000000071', 'f3000000-0000-4000-8000-000000000042', 10);
insert into public.inventory_movements (id, organization_id, inventory_lot_id, movement_type, quantity_kg,
  from_location_type, from_salesman_user_id, to_location_type, to_salesman_user_id,
  reference_type, reference_id, reference_line_id, effective_date, created_by, created_at) values
  ('f3000000-0000-4000-8000-000000000073', 'f3000000-0000-4000-8000-000000000001',
   'f3000000-0000-4000-8000-000000000042', 'salesman_to_salesman', 10, 'salesman',
   'f3000000-0000-4000-8000-000000000103', 'salesman', 'f3000000-0000-4000-8000-000000000102',
   'transfer_receipt', 'f3000000-0000-4000-8000-000000000071', 'f3000000-0000-4000-8000-000000000072',
   '2026-01-03', 'f3000000-0000-4000-8000-000000000101', '2026-01-03T00:00:00Z');
create temp table qa_tf as select
  '{"effectiveDate":"2026-01-04","fromSalesmanId":"f3000000-0000-4000-8000-000000000103","toSalesmanId":"f3000000-0000-4000-8000-000000000104","lotId":"f3000000-0000-4000-8000-000000000042","quantityKg":12,"notes":"Corrected TF"}'::jsonb changes;
alter table qa_tf add column preview jsonb;
grant select on qa_tf to service_role;
update qa_tf set preview = private.inspect_transfer_correction(
  'f3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000071', 'salesman_transfer', changes);
select is((select preview->>'eligible' from qa_tf), 'true', 'TF recipient, date and quantity are eligible without downstream use');
select is((private.inspect_transfer_correction(
  'f3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000071', 'salesman_transfer',
  jsonb_set((select changes from qa_tf), '{fromSalesmanId}', '"f3000000-0000-4000-8000-000000000102"'))->>'eligible'), 'false', 'sender without source stock is blocked');
set local role service_role;
select lives_ok($$select public.apply_transfer_receipt_correction(
  'f3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000071',
  'f3000000-0000-4000-8000-000000000101', 'Correct transfer custody',
  'f3000000-0000-4000-8000-000000000202', (select preview->>'versionToken' from qa_tf),
  (select changes from qa_tf))$$, 'eligible TF correction commits atomically');
reset role;
select is((select receipt_number from public.transfer_receipts where id = 'f3000000-0000-4000-8000-000000000071'), 'TF-QA-1', 'TF identity is preserved');
select is(private.custody_balance('f3000000-0000-4000-8000-000000000042', 'salesman', 'f3000000-0000-4000-8000-000000000103'), 18::numeric, 'sender retains reconciled stock');
select is(private.custody_balance('f3000000-0000-4000-8000-000000000042', 'salesman', 'f3000000-0000-4000-8000-000000000104'), 12::numeric, 'new recipient receives corrected quantity');
select is((select count(*) from public.transaction_corrections where module = 'salesman_transfer' and transaction_id = 'f3000000-0000-4000-8000-000000000071'), 1::bigint, 'TF correction appears in history');
reset role;
insert into public.inventory_movements (organization_id, inventory_lot_id, movement_type,
  quantity_kg, from_location_type, from_salesman_user_id, to_location_type, to_salesman_user_id,
  reference_type, reference_id, reference_line_id, effective_date, created_by) values
  ('f3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000042',
   'salesman_to_salesman', 1, 'salesman', 'f3000000-0000-4000-8000-000000000104',
   'salesman', 'f3000000-0000-4000-8000-000000000102', 'transfer_receipt',
   'f3000000-0000-4000-8000-000000000081', 'f3000000-0000-4000-8000-000000000082',
   '2026-01-05', 'f3000000-0000-4000-8000-000000000101');
select is((private.inspect_transfer_correction(
  'f3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000071', 'salesman_transfer',
  jsonb_set((select changes from qa_tf), '{quantityKg}', '11'::jsonb))->>'eligible'), 'false',
  'downstream custody movement blocks another TF stock correction');
select * from finish();
rollback;
