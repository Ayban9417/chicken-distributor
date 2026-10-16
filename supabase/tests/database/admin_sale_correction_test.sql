-- Run only on a disposable migrated Supabase database. Never run on live DEV.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email) values
  ('f4000000-0000-4000-8000-000000000101', 'sale-owner@test.invalid'),
  ('f4000000-0000-4000-8000-000000000102', 'sale-agent@test.invalid');
insert into public.profiles (id, full_name, username) values
  ('f4000000-0000-4000-8000-000000000101', 'QA Owner', 'sale.qa.owner'),
  ('f4000000-0000-4000-8000-000000000102', 'QA Agent', 'sale.qa.agent');
insert into public.organizations (id, name, slug) values
  ('f4000000-0000-4000-8000-000000000001', 'Sale Correction QA', 'sale-correction-qa');
insert into public.organization_memberships (organization_id, user_id, role) values
  ('f4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000101', 'owner_admin'),
  ('f4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000102', 'salesman');
insert into public.customers (id, organization_id, name) values
  ('f4000000-0000-4000-8000-000000000011', 'f4000000-0000-4000-8000-000000000001', 'QA First Customer'),
  ('f4000000-0000-4000-8000-000000000012', 'f4000000-0000-4000-8000-000000000001', 'QA Second Customer');
insert into public.plants (id, organization_id, name, short_code) values
  ('f4000000-0000-4000-8000-000000000021', 'f4000000-0000-4000-8000-000000000001', 'QA Plant', 'QAS');
insert into public.products (id, organization_id, name, category) values
  ('f4000000-0000-4000-8000-000000000022', 'f4000000-0000-4000-8000-000000000001', 'QA Chicken', 'whole_chicken'),
  ('f4000000-0000-4000-8000-000000000024', 'f4000000-0000-4000-8000-000000000001', 'QA Liver', 'by_product');
insert into public.plant_products (id, plant_id, product_id) values
  ('f4000000-0000-4000-8000-000000000023', 'f4000000-0000-4000-8000-000000000021', 'f4000000-0000-4000-8000-000000000022'),
  ('f4000000-0000-4000-8000-000000000025', 'f4000000-0000-4000-8000-000000000021', 'f4000000-0000-4000-8000-000000000024');
insert into public.stock_trips (id, organization_id, plant_id, trip_number, trip_date,
  client_request_id, created_by) values
  ('f4000000-0000-4000-8000-000000000031', 'f4000000-0000-4000-8000-000000000001',
   'f4000000-0000-4000-8000-000000000021', 'ST-QA-SALE', '2026-01-01',
   'f4000000-0000-4000-8000-000000000131', 'f4000000-0000-4000-8000-000000000101');
insert into public.stock_trip_lines (id, stock_trip_id, plant_product_id, quantity_kg,
  acquisition_type, cost_per_kg) values
  ('f4000000-0000-4000-8000-000000000032', 'f4000000-0000-4000-8000-000000000031',
   'f4000000-0000-4000-8000-000000000023', 100, 'purchased', 140),
  ('f4000000-0000-4000-8000-000000000034', 'f4000000-0000-4000-8000-000000000031',
   'f4000000-0000-4000-8000-000000000025', 20, 'purchased', 90);
insert into public.inventory_lots (id, organization_id, stock_trip_line_id, plant_id,
  product_id, cost_per_kg, original_quantity_kg) values
  ('f4000000-0000-4000-8000-000000000041', 'f4000000-0000-4000-8000-000000000001',
   'f4000000-0000-4000-8000-000000000032', 'f4000000-0000-4000-8000-000000000021',
   'f4000000-0000-4000-8000-000000000022', 140, 100),
  ('f4000000-0000-4000-8000-000000000043', 'f4000000-0000-4000-8000-000000000001',
   'f4000000-0000-4000-8000-000000000034', 'f4000000-0000-4000-8000-000000000021',
   'f4000000-0000-4000-8000-000000000024', 90, 20);
insert into public.inventory_movements (id, organization_id, inventory_lot_id, movement_type,
  quantity_kg, from_location_type, to_location_type, reference_type, reference_id,
  reference_line_id, effective_date, created_by, created_at) values
  ('f4000000-0000-4000-8000-000000000042', 'f4000000-0000-4000-8000-000000000001',
   'f4000000-0000-4000-8000-000000000041', 'stock_in', 100, 'plant', 'warehouse',
   'stock_trip', 'f4000000-0000-4000-8000-000000000031', 'f4000000-0000-4000-8000-000000000032',
   '2026-01-01', 'f4000000-0000-4000-8000-000000000101', '2026-01-01T00:00:00Z');
insert into public.inventory_movements (id, organization_id, inventory_lot_id, movement_type,
  quantity_kg, from_location_type, to_location_type, reference_type, reference_id,
  reference_line_id, effective_date, created_by, created_at) values
  ('f4000000-0000-4000-8000-000000000044', 'f4000000-0000-4000-8000-000000000001',
   'f4000000-0000-4000-8000-000000000043', 'stock_in', 20, 'plant', 'warehouse',
   'stock_trip', 'f4000000-0000-4000-8000-000000000031', 'f4000000-0000-4000-8000-000000000034',
   '2026-01-01', 'f4000000-0000-4000-8000-000000000101', '2026-01-01T00:00:00Z');
insert into public.receiving_receipts (id, organization_id, receipt_number, salesman_user_id,
  client_request_id, created_by) values
  ('f4000000-0000-4000-8000-000000000051', 'f4000000-0000-4000-8000-000000000001',
   'RR-QA-SALE', 'f4000000-0000-4000-8000-000000000102',
   'f4000000-0000-4000-8000-000000000151', 'f4000000-0000-4000-8000-000000000101');
insert into public.receiving_receipt_lines (id, receipt_id, inventory_lot_id, quantity_kg) values
  ('f4000000-0000-4000-8000-000000000052', 'f4000000-0000-4000-8000-000000000051',
   'f4000000-0000-4000-8000-000000000041', 30),
  ('f4000000-0000-4000-8000-000000000054', 'f4000000-0000-4000-8000-000000000051',
   'f4000000-0000-4000-8000-000000000043', 15);
insert into public.inventory_movements (id, organization_id, inventory_lot_id, movement_type,
  quantity_kg, from_location_type, to_location_type, to_salesman_user_id,
  reference_type, reference_id, reference_line_id, effective_date, created_by, created_at) values
  ('f4000000-0000-4000-8000-000000000053', 'f4000000-0000-4000-8000-000000000001',
   'f4000000-0000-4000-8000-000000000041', 'warehouse_to_salesman', 30,
   'warehouse', 'salesman', 'f4000000-0000-4000-8000-000000000102',
   'receiving_receipt', 'f4000000-0000-4000-8000-000000000051',
   'f4000000-0000-4000-8000-000000000052', '2026-01-02',
   'f4000000-0000-4000-8000-000000000101', '2026-01-02T00:00:00Z');
insert into public.inventory_movements (id, organization_id, inventory_lot_id, movement_type,
  quantity_kg, from_location_type, to_location_type, to_salesman_user_id,
  reference_type, reference_id, reference_line_id, effective_date, created_by, created_at) values
  ('f4000000-0000-4000-8000-000000000055', 'f4000000-0000-4000-8000-000000000001',
   'f4000000-0000-4000-8000-000000000043', 'warehouse_to_salesman', 15,
   'warehouse', 'salesman', 'f4000000-0000-4000-8000-000000000102',
   'receiving_receipt', 'f4000000-0000-4000-8000-000000000051',
   'f4000000-0000-4000-8000-000000000054', '2026-01-02',
   'f4000000-0000-4000-8000-000000000101', '2026-01-02T00:00:00Z');
insert into public.sales (id, organization_id, trust_receipt_number, customer_id,
  salesman_user_id, sale_date, subtotal, gross_sales, net_sales, total_cogs,
  client_request_id, created_by) values
  ('f4000000-0000-4000-8000-000000000061', 'f4000000-0000-4000-8000-000000000001',
   'TR-QA-1', 'f4000000-0000-4000-8000-000000000011',
   'f4000000-0000-4000-8000-000000000102', '2026-01-03', 1500, 1500, 1500, 1400,
   'f4000000-0000-4000-8000-000000000161', 'f4000000-0000-4000-8000-000000000101');
insert into public.sale_lines (id, sale_id, inventory_lot_id, product_id,
  quantity_kg, selling_price_per_kg, acquisition_cost_per_kg, line_sales, line_cogs) values
  ('f4000000-0000-4000-8000-000000000062', 'f4000000-0000-4000-8000-000000000061',
   'f4000000-0000-4000-8000-000000000041', 'f4000000-0000-4000-8000-000000000022',
   10, 150, 140, 1500, 1400);
insert into public.inventory_movements (id, organization_id, inventory_lot_id, movement_type,
  quantity_kg, from_location_type, from_salesman_user_id, to_location_type,
  reference_type, reference_id, reference_line_id, effective_date, created_by, created_at) values
  ('f4000000-0000-4000-8000-000000000063', 'f4000000-0000-4000-8000-000000000001',
   'f4000000-0000-4000-8000-000000000041', 'sale', 10, 'salesman',
   'f4000000-0000-4000-8000-000000000102', 'customer', 'sale',
   'f4000000-0000-4000-8000-000000000061', 'f4000000-0000-4000-8000-000000000062',
   '2026-01-03', 'f4000000-0000-4000-8000-000000000101', '2026-01-03T00:00:00Z');

create temp table qa_sale as select
  '{"saleDate":"2026-01-03","customerId":"f4000000-0000-4000-8000-000000000012",
    "trustReceiptNumber":"TR-QA-CORRECTED","salesDeductions":100,"notes":"Corrected QA Sale",
    "lines":[{"id":"f4000000-0000-4000-8000-000000000062",
      "lotId":"f4000000-0000-4000-8000-000000000041","quantityKg":12,"pricePerKg":160}]}'::jsonb changes;
alter table qa_sale add column preview jsonb;
grant select on qa_sale to authenticated, service_role;
update qa_sale set preview = private.inspect_sale_correction(
  'f4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000061', changes);
select is((select preview->>'eligible' from qa_sale), 'true', 'unpaid Sale is eligible before downstream use');
select is((select (preview->'proposedValues'->>'netSales')::numeric from qa_sale), 1820::numeric,
  'preview applies quantity, price and deductions');
select is((select (preview->'proposedValues'->>'totalCogs')::numeric from qa_sale), 1680::numeric,
  'COGS uses exact lot acquisition cost');
select is((private.inspect_sale_correction(
  'f4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000061',
  jsonb_set((select changes from qa_sale), '{lines,0,quantityKg}', '8'::jsonb)))->>'eligible'),
  'true', 'quantity decrease is eligible before downstream use');
select is((private.inspect_sale_correction(
  'f4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000061',
  jsonb_set(jsonb_set((select changes from qa_sale), '{lines,0,lotId}',
    '"f4000000-0000-4000-8000-000000000043"'::jsonb), '{lines,0,quantityKg}', '8'::jsonb)
  )->'proposedValues'->>'totalCogs'), '720', 'different product and source lot use exact COGS');

set local role authenticated;
set local request.jwt.claim.sub = 'f4000000-0000-4000-8000-000000000102';
select throws_ok($$select public.preview_sale_correction(
  'f4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000061',
  (select changes from qa_sale))$$, '42501', null, 'Salesman cannot preview Admin Sale correction');
set local request.jwt.claim.sub = 'f4000000-0000-4000-8000-000000000101';
select is((public.preview_sale_correction(
  'f4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000061',
  (select changes from qa_sale)))->>'eligible'), 'true', 'Owner can preview Sale correction');
reset role;

set local role service_role;
select throws_ok($$select public.apply_sale_correction(
  'f4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000061',
  'f4000000-0000-4000-8000-000000000102', 'Correct test Sale details',
  'f4000000-0000-4000-8000-000000000201', (select preview->>'versionToken' from qa_sale),
  (select changes from qa_sale))$$, '42501', null, 'Salesman cannot apply Sale correction');
select lives_ok($$select public.apply_sale_correction(
  'f4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000061',
  'f4000000-0000-4000-8000-000000000101', 'Correct test Sale details',
  'f4000000-0000-4000-8000-000000000201', (select preview->>'versionToken' from qa_sale),
  (select changes from qa_sale))$$, 'eligible correction commits');
select is((select trust_receipt_number from public.sales where id = 'f4000000-0000-4000-8000-000000000061'),
  'TR-QA-CORRECTED', 'Sale ID is preserved while TR changes');
select is((select net_sales from public.sales where id = 'f4000000-0000-4000-8000-000000000061'),
  1820::numeric, 'net Sale total reconciles');
select is((select outstanding_balance from public.customer_balances where customer_id = 'f4000000-0000-4000-8000-000000000012'),
  1820::numeric, 'new Customer receivable reconciles');
select is(private.custody_balance('f4000000-0000-4000-8000-000000000041', 'salesman',
  'f4000000-0000-4000-8000-000000000102'), 18::numeric, 'Salesman stock reconciles after quantity increase');
select is((select count(*) from public.inventory_movements where reference_type = 'transaction_correction'),
  2::bigint, 'original Sale movement is retained with reversal and replacement');
select is((select count(*) from public.transaction_corrections where module = 'sale'
  and transaction_id = 'f4000000-0000-4000-8000-000000000061'), 1::bigint,
  'correction appears in immutable edit history');
select is((select count(*) from public.audit_events where entity_id = 'f4000000-0000-4000-8000-000000000061'
  and action = 'CORRECT_SALE'), 1::bigint, 'audit event is written');
select throws_ok($$select public.apply_sale_correction(
  'f4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000061',
  'f4000000-0000-4000-8000-000000000101', 'Correct test Sale details',
  'f4000000-0000-4000-8000-000000000201', (select preview->>'versionToken' from qa_sale),
  (select changes from qa_sale))$$, '40001', null, 'stale version is rejected');
select throws_ok($$select public.apply_sale_correction(
  'f4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000061',
  'f4000000-0000-4000-8000-000000000101', 'Correct test Sale details',
  'f4000000-0000-4000-8000-000000000201',
  (select private.inspect_sale_correction('f4000000-0000-4000-8000-000000000001',
    'f4000000-0000-4000-8000-000000000061', changes)->>'versionToken' from qa_sale),
  (select changes from qa_sale))$$, '23505', null, 'request ID replay is rejected');
select throws_ok($$update public.transaction_corrections set reason = 'Tampered reason'
  where transaction_id = 'f4000000-0000-4000-8000-000000000061'$$,
  '55000', null, 'correction history is immutable');
reset role;

update qa_sale set changes = jsonb_set(changes, '{lines,0,quantityKg}', '1000'::jsonb);
select is((private.inspect_sale_correction(
  'f4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000061',
  (select changes from qa_sale)))->>'eligible'), 'false', 'insufficient stock is blocked');
set local role service_role;
select throws_ok($$select public.apply_sale_correction(
  'f4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000061',
  'f4000000-0000-4000-8000-000000000101', 'Increase beyond source stock',
  'f4000000-0000-4000-8000-000000000202',
  (select private.inspect_sale_correction('f4000000-0000-4000-8000-000000000001',
    'f4000000-0000-4000-8000-000000000061', changes)->>'versionToken' from qa_sale),
  (select changes from qa_sale))$$, '55000', null, 'ineligible correction rolls back atomically');
select is((select count(*) from public.transaction_corrections where module = 'sale'), 1::bigint,
  'failed correction adds no audit entry');
reset role;
insert into public.sales (id, organization_id, trust_receipt_number, customer_id,
  salesman_user_id, sale_date, subtotal, gross_sales, net_sales, total_cogs,
  client_request_id, created_by) values
  ('f4000000-0000-4000-8000-000000000071', 'f4000000-0000-4000-8000-000000000001',
   'TR-QA-OTHER', 'f4000000-0000-4000-8000-000000000011',
   'f4000000-0000-4000-8000-000000000102', '2026-01-03', 0, 0, 0, 0,
   'f4000000-0000-4000-8000-000000000171', 'f4000000-0000-4000-8000-000000000101');
update qa_sale set changes = jsonb_set(jsonb_set(changes, '{lines,0,quantityKg}', '12'::jsonb),
  '{trustReceiptNumber}', '"TR-QA-OTHER"'::jsonb);
select is((private.inspect_sale_correction(
  'f4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000061',
  (select changes from qa_sale)))->>'eligible'), 'false', 'duplicate Trust Receipt is blocked');
select like((private.inspect_sale_correction(
  'f4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000061',
  (select changes from qa_sale)))->>'blockedReasons', '%Trust Receipt number is already used%',
  'duplicate Trust Receipt blocker is explicit');

insert into public.payments (id, organization_id, payment_number, customer_id,
  salesman_user_id, payment_date, amount, method, verification_status,
  client_request_id, created_by) values
  ('f4000000-0000-4000-8000-000000000081', 'f4000000-0000-4000-8000-000000000001',
   'PAY-QA-1', 'f4000000-0000-4000-8000-000000000012',
   'f4000000-0000-4000-8000-000000000102', '2026-01-03', 100, 'cash', 'not_required',
   'f4000000-0000-4000-8000-000000000181', 'f4000000-0000-4000-8000-000000000101');
insert into public.payment_allocations (payment_id, sale_id, amount) values
  ('f4000000-0000-4000-8000-000000000081', 'f4000000-0000-4000-8000-000000000061', 100);
select like((private.inspect_sale_correction(
  'f4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000061',
  (select changes from qa_sale)))->>'blockedReasons', '%Payment allocations%',
  'allocated Payment blocks direct correction');
update public.payments set method = 'gcash', reference_number = 'QA-GCASH-REF', verification_status = 'verified'
  where id = 'f4000000-0000-4000-8000-000000000081';
select like((private.inspect_sale_correction(
  'f4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000061',
  (select changes from qa_sale)))->>'blockedReasons', '%Payment allocations%',
  'verified GCash collection blocks direct correction');
update public.payments set method = 'bank', reference_number = 'QA-BANK-REF'
  where id = 'f4000000-0000-4000-8000-000000000081';
select like((private.inspect_sale_correction(
  'f4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000061',
  (select changes from qa_sale)))->>'blockedReasons', '%Payment allocations%',
  'verified Bank collection blocks direct correction');
insert into public.daily_cash_reports (organization_id, salesman_user_id, report_date,
  cash_collected, gcash_collected, bank_collected, cash_paid_expenses,
  expected_cash_remittance, actual_cash_remittance, difference, source_snapshot,
  client_request_id, created_by) values
  ('f4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000102',
   '2026-01-03', 0, 0, 0, 0, 0, 0, 0, '{}'::jsonb,
   'f4000000-0000-4000-8000-000000000191', 'f4000000-0000-4000-8000-000000000101');
select like((private.inspect_sale_correction(
  'f4000000-0000-4000-8000-000000000001', 'f4000000-0000-4000-8000-000000000061',
  (select changes from qa_sale)))->>'blockedReasons', '%submitted DCR%',
  'submitted DCR blocks direct correction');
select * from finish();
rollback;
