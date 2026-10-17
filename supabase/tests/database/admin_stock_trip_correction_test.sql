begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('f2000000-0000-4000-8000-000000000101', 'stock-correction-owner@test.invalid'),
  ('f2000000-0000-4000-8000-000000000102', 'stock-correction-salesman@test.invalid');
insert into public.profiles (id, full_name, username) values
  ('f2000000-0000-4000-8000-000000000101', 'Correction Owner', 'stock.correct.owner'),
  ('f2000000-0000-4000-8000-000000000102', 'Correction Salesman', 'stock.correct.salesman');
insert into public.organizations (id, name, slug) values
  ('f2000000-0000-4000-8000-000000000001', 'Stock Correction QA', 'stock-correction-qa');
insert into public.organization_memberships (organization_id, user_id, role) values
  ('f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000101', 'owner_admin'),
  ('f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000102', 'salesman');
insert into public.plants (id, organization_id, name, short_code) values
  ('f2000000-0000-4000-8000-000000000011', 'f2000000-0000-4000-8000-000000000001', 'QA Plant', 'QA');
insert into public.products (id, organization_id, name, category) values
  ('f2000000-0000-4000-8000-000000000012', 'f2000000-0000-4000-8000-000000000001', 'QA Whole Chicken', 'whole_chicken');
insert into public.plant_products (id, plant_id, product_id, uses_bags, uses_head_count) values
  ('f2000000-0000-4000-8000-000000000013', 'f2000000-0000-4000-8000-000000000011', 'f2000000-0000-4000-8000-000000000012', true, true);
insert into public.stock_trips (id, organization_id, plant_id, trip_number, trip_date, reference_number,
  status, client_request_id, created_by) values
  ('f2000000-0000-4000-8000-000000000021', 'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000011', 'ST-QA-001', '2026-01-01', 'REF-QA-001', 'received', 'f2000000-0000-4000-8000-000000000121', 'f2000000-0000-4000-8000-000000000101'),
  ('f2000000-0000-4000-8000-000000000022', 'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000011', 'ST-QA-002', '2026-01-01', 'REF-QA-002', 'received', 'f2000000-0000-4000-8000-000000000122', 'f2000000-0000-4000-8000-000000000101');
insert into public.stock_trip_lines (id, stock_trip_id, plant_product_id, quantity_kg,
  acquisition_type, cost_per_kg, bags, head_count) values
  ('f2000000-0000-4000-8000-000000000031', 'f2000000-0000-4000-8000-000000000021', 'f2000000-0000-4000-8000-000000000013', 100, 'purchased', 142, 10, 100);
insert into public.inventory_lots (id, organization_id, stock_trip_line_id, plant_id,
  product_id, cost_per_kg, original_quantity_kg) values
  ('f2000000-0000-4000-8000-000000000041', 'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000031',
   'f2000000-0000-4000-8000-000000000011', 'f2000000-0000-4000-8000-000000000012', 142, 100);
insert into public.inventory_movements (id, organization_id, inventory_lot_id, movement_type,
  quantity_kg, from_location_type, to_location_type, reference_type, reference_id,
  reference_line_id, effective_date, created_by) values
  ('f2000000-0000-4000-8000-000000000051', 'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000041',
   'stock_in', 100, 'plant', 'warehouse', 'stock_trip', 'f2000000-0000-4000-8000-000000000021',
   'f2000000-0000-4000-8000-000000000031', '2026-01-01', 'f2000000-0000-4000-8000-000000000101');

create temp table qa_correction as select
  '{"tripDate":"2026-01-02","reference":"REF-QA-001-A","notes":"Corrected QA Trip","lines":[{"id":"f2000000-0000-4000-8000-000000000031","quantityKg":120,"costPerKg":145,"bags":12,"headCount":120}]}'::jsonb as changes;
alter table qa_correction add column preview jsonb;
alter table qa_correction add column fresh_preview jsonb;
grant select on qa_correction to authenticated, service_role;
update qa_correction set preview = private.inspect_stock_trip_correction(
  'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000021', changes);

select is((select preview->>'eligible' from qa_correction), 'true', 'untouched stock is eligible for quantity, cost, heads, bags and metadata');
select is((select (preview->'expectedInventoryChanges'->0->>'warehouseDeltaKg')::numeric from qa_correction), 20::numeric, 'preview computes warehouse increase');
select is((select (preview->'expectedFinancialChanges'->0->>'acquisitionValueDelta')::numeric from qa_correction), 3200::numeric, 'preview computes acquisition value change');
select is((private.inspect_stock_trip_correction(
  'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000021',
  jsonb_set((select changes from qa_correction), '{reference}', '"REF-QA-002"'))->>'eligible'), 'false', 'duplicate manual reference is blocked');
select is((private.inspect_stock_trip_correction(
  'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000021',
  jsonb_set((select changes from qa_correction), '{tripDate}', '"2099-01-01"'))->>'eligible'), 'false', 'future Trip date is blocked');

set local role authenticated;
set local request.jwt.claim.sub = 'f2000000-0000-4000-8000-000000000102';
select throws_ok($$select public.preview_stock_trip_correction(
  'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000021',
  (select changes from qa_correction))$$, '42501', null, 'Salesman cannot preview a protected correction');
set local request.jwt.claim.sub = 'f2000000-0000-4000-8000-000000000101';
select is((public.preview_stock_trip_correction(
  'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000021',
  (select changes from qa_correction))->>'eligible'), 'true', 'Owner can preview the correction');
reset role;

set local role service_role;
select throws_ok($$select public.apply_stock_trip_correction(
  'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000021',
  'f2000000-0000-4000-8000-000000000102', 'Correct Trip stock and cost',
  'f2000000-0000-4000-8000-000000000201', (select preview->>'versionToken' from qa_correction),
  (select changes from qa_correction))$$, '42501', null, 'Salesman cannot apply correction');
select throws_ok($$select public.apply_stock_trip_correction(
  'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000021',
  'f2000000-0000-4000-8000-000000000101', 'short',
  'f2000000-0000-4000-8000-000000000201', (select preview->>'versionToken' from qa_correction),
  (select changes from qa_correction))$$, '22023', null, 'missing meaningful reason is rejected');
select lives_ok($$select public.apply_stock_trip_correction(
  'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000021',
  'f2000000-0000-4000-8000-000000000101', 'Correct Trip stock and cost',
  'f2000000-0000-4000-8000-000000000201', (select preview->>'versionToken' from qa_correction),
  (select changes from qa_correction))$$, 'atomic correction succeeds for untouched lot');
reset role;

select is((select quantity_kg from public.stock_trip_lines where id = 'f2000000-0000-4000-8000-000000000031'), 120::numeric, 'Trip line quantity updated');
select is((select cost_per_kg from public.inventory_lots where id = 'f2000000-0000-4000-8000-000000000041'), 145::numeric, 'lot valuation updated');
select is(private.custody_balance('f2000000-0000-4000-8000-000000000041', 'warehouse', null), 120::numeric, 'warehouse stock reconciles');
select is((select count(*) from public.inventory_movements where inventory_lot_id = 'f2000000-0000-4000-8000-000000000041' and movement_type = 'stock_in'), 1::bigint, 'original Stock-In movement preserved');
select is((select count(*) from public.inventory_movements where inventory_lot_id = 'f2000000-0000-4000-8000-000000000041' and movement_type = 'adjustment_in'), 1::bigint, 'quantity increase uses an adjustment');
select is((select count(*) from public.transaction_corrections where transaction_id = 'f2000000-0000-4000-8000-000000000021'), 1::bigint, 'one immutable correction entry written');
select ok((select affected_record_ids::text like '%inventory_movement%' from public.transaction_corrections
  where transaction_id = 'f2000000-0000-4000-8000-000000000021'), 'adjustment movement ID appears in the correction ledger');
select is((select count(*) from public.audit_events where entity_id = 'f2000000-0000-4000-8000-000000000021' and action = 'CORRECT_STOCK_TRIP'), 1::bigint, 'existing audit stream receives event');
update qa_correction set fresh_preview = private.inspect_stock_trip_correction(
  'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000021', changes);

set local role service_role;
select throws_ok($$select public.apply_stock_trip_correction(
  'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000021',
  'f2000000-0000-4000-8000-000000000101', 'Correct Trip stock and cost',
  'f2000000-0000-4000-8000-000000000202', (select preview->>'versionToken' from qa_correction),
  (select changes from qa_correction))$$, '55000', null, 'stale concurrent preview is rejected');
select throws_ok($$select public.apply_stock_trip_correction(
  'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000021',
  'f2000000-0000-4000-8000-000000000101', 'Correct Trip stock and cost',
  'f2000000-0000-4000-8000-000000000201',
  (select fresh_preview->>'versionToken' from qa_correction),
  (select changes from qa_correction))$$, '23505', null, 'used request ID cannot be replayed');
reset role;

update qa_correction set changes = jsonb_set(
  jsonb_set(jsonb_set(jsonb_set(changes, '{lines,0,quantityKg}', '110'),
    '{lines,0,costPerKg}', '150'), '{lines,0,bags}', '11'), '{lines,0,headCount}', '110');
update qa_correction set fresh_preview = private.inspect_stock_trip_correction(
  'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000021', changes);
select is((select fresh_preview->>'eligible' from qa_correction), 'true', 'a second untouched correction can decrease quantity and change cost');
set local role service_role;
select lives_ok($$select public.apply_stock_trip_correction(
  'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000021',
  'f2000000-0000-4000-8000-000000000101', 'Correct lower stock count',
  'f2000000-0000-4000-8000-000000000203', (select fresh_preview->>'versionToken' from qa_correction),
  (select changes from qa_correction))$$, 'quantity decrease and cost-only valuation reconcile atomically');
reset role;
select is(private.custody_balance('f2000000-0000-4000-8000-000000000041', 'warehouse', null), 110::numeric, 'warehouse balance reflects a quantity decrease');
select is((select count(*) from public.inventory_movements where inventory_lot_id = 'f2000000-0000-4000-8000-000000000041' and movement_type = 'adjustment_out'), 1::bigint, 'quantity decrease uses an adjustment');
select is((select cost_per_kg from public.inventory_lots where id = 'f2000000-0000-4000-8000-000000000041'), 150::numeric, 'cost correction updates inventory valuation');
select is((select bags from public.stock_trip_lines where id = 'f2000000-0000-4000-8000-000000000031'), 11, 'bags correction persists');
select is((select head_count from public.stock_trip_lines where id = 'f2000000-0000-4000-8000-000000000031'), 110, 'heads correction persists');

insert into public.inventory_movements (organization_id, inventory_lot_id, movement_type,
  quantity_kg, from_location_type, to_location_type, to_salesman_user_id,
  reference_type, reference_id, reference_line_id, effective_date, created_by) values
  ('f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000041',
   'warehouse_to_salesman', 10, 'warehouse', 'salesman', 'f2000000-0000-4000-8000-000000000102',
   'receiving_receipt', 'f2000000-0000-4000-8000-000000000061',
   'f2000000-0000-4000-8000-000000000062', '2026-01-03', 'f2000000-0000-4000-8000-000000000101');
select is((private.inspect_stock_trip_correction(
  'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000021',
  jsonb_set((select changes from qa_correction), '{lines,0,quantityKg}', '111'))->>'eligible'), 'false', 'downstream Warehouse transfer blocks quantity edit');
select is((private.inspect_stock_trip_correction(
  'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000021',
  jsonb_set((select changes from qa_correction), '{lines,0,costPerKg}', '151'))->>'eligible'), 'false', 'downstream transfer blocks cost edit');
select is((private.inspect_stock_trip_correction(
  'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000021',
  (select changes from qa_correction))->>'eligible'), 'false', 'unchanged proposal is rejected');
insert into public.customers (id, organization_id, name) values
  ('f2000000-0000-4000-8000-000000000071', 'f2000000-0000-4000-8000-000000000001', 'QA Customer');
insert into public.sales (id, organization_id, trust_receipt_number, customer_id, salesman_user_id,
  sale_date, subtotal, gross_sales, net_sales, total_cogs, client_request_id, created_by) values
  ('f2000000-0000-4000-8000-000000000072', 'f2000000-0000-4000-8000-000000000001', 'TR-QA-001',
   'f2000000-0000-4000-8000-000000000071', 'f2000000-0000-4000-8000-000000000102',
   '2026-01-03', 1000, 1000, 1000, 750, 'f2000000-0000-4000-8000-000000000123', 'f2000000-0000-4000-8000-000000000101');
insert into public.sale_lines (id, sale_id, inventory_lot_id, product_id, quantity_kg,
  selling_price_per_kg, acquisition_cost_per_kg, line_sales, line_cogs) values
  ('f2000000-0000-4000-8000-000000000073', 'f2000000-0000-4000-8000-000000000072',
   'f2000000-0000-4000-8000-000000000041', 'f2000000-0000-4000-8000-000000000012', 5, 200, 150, 1000, 750);
insert into public.inventory_movements (organization_id, inventory_lot_id, movement_type,
  quantity_kg, from_location_type, from_salesman_user_id, to_location_type,
  reference_type, reference_id, reference_line_id, effective_date, created_by) values
  ('f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000041',
   'sale', 5, 'salesman', 'f2000000-0000-4000-8000-000000000102', 'customer',
   'sale', 'f2000000-0000-4000-8000-000000000072', 'f2000000-0000-4000-8000-000000000073',
   '2026-01-03', 'f2000000-0000-4000-8000-000000000101');
select ok((private.inspect_stock_trip_correction(
  'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000021',
  jsonb_set((select changes from qa_correction), '{lines,0,costPerKg}', '151'))->'blockedReasons')::text like '%Sale%',
  'a downstream Sale is named in the blocked reason');
select is((private.inspect_stock_trip_correction(
  'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000021',
  jsonb_set((select changes from qa_correction), '{tripDate}', '"2026-01-04"'))->>'eligible'),
  'false', 'Trip date cannot move after downstream activity');

update qa_correction set fresh_preview = private.inspect_stock_trip_correction(
  'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000021', changes);
set local role service_role;
select throws_ok($$select public.apply_stock_trip_correction(
  'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000021',
  'f2000000-0000-4000-8000-000000000101', 'Attempt duplicate reference',
  'f2000000-0000-4000-8000-000000000204', (select fresh_preview->>'versionToken' from qa_correction),
  jsonb_set((select changes from qa_correction), '{reference}', '"REF-QA-002"'))$$,
  '55000', null, 'blocked reference correction rolls back atomically');
reset role;
select is((select reference_number from public.stock_trips where id = 'f2000000-0000-4000-8000-000000000021'), 'REF-QA-001-A', 'reference remains unchanged after rollback');
select is((select count(*) from public.transaction_corrections where transaction_id = 'f2000000-0000-4000-8000-000000000021'), 2::bigint, 'rollback wrote no partial audit record');

update qa_correction set changes = jsonb_set(changes, '{notes}', '"Metadata corrected after Sale"');
update qa_correction set fresh_preview = private.inspect_stock_trip_correction(
  'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000021', changes);
select is((select fresh_preview->>'eligible' from qa_correction), 'true', 'notes-only correction remains eligible after a Sale');
set local role service_role;
select lives_ok($$select public.apply_stock_trip_correction(
  'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000021',
  'f2000000-0000-4000-8000-000000000101', 'Clarify original Stock-In notes',
  'f2000000-0000-4000-8000-000000000205', (select fresh_preview->>'versionToken' from qa_correction),
  (select changes from qa_correction))$$, 'safe metadata correction succeeds with downstream Sale');
reset role;
select is((select line_cogs from public.sale_lines where id = 'f2000000-0000-4000-8000-000000000073'), 750::numeric, 'posted Sale COGS stays untouched');
select throws_ok($$update public.transaction_corrections set reason = 'Changed later' where transaction_id = 'f2000000-0000-4000-8000-000000000021'$$,
  '55000', null, 'correction audit remains append-only');

select * from finish();
rollback;
