begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(27);

-- Isolated Auth and tenancy fixtures. The transaction is rolled back at the end.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000101', 'authenticated', 'authenticated', 'owner@test.invalid', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000102', 'authenticated', 'authenticated', 'sales1@test.invalid', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000103', 'authenticated', 'authenticated', 'sales2@test.invalid', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000104', 'authenticated', 'authenticated', 'outsider@test.invalid', '', now(), '{}', '{}', now(), now(), '', '', '', '');

insert into public.profiles (id, full_name) values
  ('a0000000-0000-4000-8000-000000000101', 'Test Owner'),
  ('a0000000-0000-4000-8000-000000000102', 'Test Sales One'),
  ('a0000000-0000-4000-8000-000000000103', 'Test Sales Two'),
  ('a0000000-0000-4000-8000-000000000104', 'Test Outsider');
insert into public.organizations (id, name, slug) values
  ('a0000000-0000-4000-8000-000000000001', 'Test Organization A', 'test-organization-a'),
  ('a0000000-0000-4000-8000-000000000002', 'Test Organization B', 'test-organization-b');
insert into public.organization_memberships (organization_id, user_id, role) values
  ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000101', 'owner_admin'),
  ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000102', 'salesman'),
  ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000103', 'salesman'),
  ('a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000104', 'owner_admin');
insert into public.plants (id, organization_id, name, short_code) values
  ('a0000000-0000-4000-8000-000000000201', 'a0000000-0000-4000-8000-000000000001', 'Test Plant', 'TST');
insert into public.products (id, organization_id, name, category) values
  ('a0000000-0000-4000-8000-000000000301', 'a0000000-0000-4000-8000-000000000001', 'Test Chicken', 'whole_chicken');
insert into public.plant_products (id, plant_id, product_id, allows_free_from_plant) values
  ('a0000000-0000-4000-8000-000000000401', 'a0000000-0000-4000-8000-000000000201', 'a0000000-0000-4000-8000-000000000301', true);
insert into public.customers (id, organization_id, name, payment_type) values
  ('a0000000-0000-4000-8000-000000000501', 'a0000000-0000-4000-8000-000000000001', 'Test Customer', 'cash_credit'),
  ('a0000000-0000-4000-8000-000000000502', 'a0000000-0000-4000-8000-000000000002', 'Other Customer', 'cash');

select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000101', true);
select api.create_stock_trip(
  'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000201', '2026-09-01',
  '[{"plant_product_id":"a0000000-0000-4000-8000-000000000401","quantity_kg":100,"acquisition_type":"purchased","cost_per_kg":100}]',
  'a0000000-0000-4000-8000-000000000601'
);
select api.transfer_warehouse_to_salesman(
  'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000102', '2026-09-01',
  jsonb_build_array(jsonb_build_object('inventory_lot_id', (select id from public.inventory_lots where organization_id = 'a0000000-0000-4000-8000-000000000001' limit 1), 'quantity_kg', 100)),
  'a0000000-0000-4000-8000-000000000602'
);

select throws_ok(
  $$select api.transfer_warehouse_to_salesman(
    'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000102', '2026-09-01',
    jsonb_build_array(jsonb_build_object('inventory_lot_id', (select id from public.inventory_lots where organization_id = 'a0000000-0000-4000-8000-000000000001' limit 1), 'quantity_kg', 1)),
    'a0000000-0000-4000-8000-000000000603')$$,
  'P0001', null, 'warehouse transfer rejects insufficient stock'
);
select is((select sum(available_quantity_kg) from public.company_stock_summary where organization_id = 'a0000000-0000-4000-8000-000000000001'), 100::numeric, 'warehouse transfer preserves total company stock');

select api.transfer_salesman_to_salesman(
  'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000102', 'a0000000-0000-4000-8000-000000000103', '2026-09-01',
  jsonb_build_array(jsonb_build_object('inventory_lot_id', (select id from public.inventory_lots where organization_id = 'a0000000-0000-4000-8000-000000000001' limit 1), 'quantity_kg', 10)),
  'a0000000-0000-4000-8000-000000000604'
);
select is((select sum(available_quantity_kg) from public.company_stock_summary where organization_id = 'a0000000-0000-4000-8000-000000000001'), 100::numeric, 'Salesman transfer preserves total company stock');
select throws_ok(
  $$select api.transfer_salesman_to_salesman(
    'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000102', 'a0000000-0000-4000-8000-000000000103', '2026-09-01',
    jsonb_build_array(jsonb_build_object('inventory_lot_id', (select id from public.inventory_lots where organization_id = 'a0000000-0000-4000-8000-000000000001' limit 1), 'quantity_kg', 100)),
    'a0000000-0000-4000-8000-000000000605')$$,
  'P0001', null, 'Salesman cannot transfer more than assigned'
);
select throws_ok(
  $$select api.create_sale(
    'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000501', 'a0000000-0000-4000-8000-000000000102', '2026-09-02', 'TR-TOO-MUCH',
    jsonb_build_array(jsonb_build_object('inventory_lot_id', (select id from public.inventory_lots where organization_id = 'a0000000-0000-4000-8000-000000000001' limit 1), 'quantity_kg', 100, 'selling_price_per_kg', 150)),
    'a0000000-0000-4000-8000-000000000606')$$,
  'P0001', null, 'Sale rejects insufficient Salesman inventory'
);

select api.create_sale(
  'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000501', 'a0000000-0000-4000-8000-000000000102', '2026-09-02', 'TR-001',
  jsonb_build_array(jsonb_build_object('inventory_lot_id', (select id from public.inventory_lots where organization_id = 'a0000000-0000-4000-8000-000000000001' limit 1), 'quantity_kg', 20, 'selling_price_per_kg', 150)),
  'a0000000-0000-4000-8000-000000000701'
);
select throws_ok(
  $$select api.create_sale(
    'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000501', 'a0000000-0000-4000-8000-000000000102', '2026-09-02', 'tr-001',
    jsonb_build_array(jsonb_build_object('inventory_lot_id', (select id from public.inventory_lots where organization_id = 'a0000000-0000-4000-8000-000000000001' limit 1), 'quantity_kg', 1, 'selling_price_per_kg', 150)),
    'a0000000-0000-4000-8000-000000000702')$$,
  '23505', null, 'Trust Receipt is unique case-insensitively within organization'
);
select is(private.custody_balance((select id from public.inventory_lots where organization_id = 'a0000000-0000-4000-8000-000000000001' limit 1), 'salesman', 'a0000000-0000-4000-8000-000000000102'), 70::numeric, 'Sale atomically deducts exact Salesman stock');
select api.create_sale(
  'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000501', 'a0000000-0000-4000-8000-000000000102', '2026-09-02', 'TR-001',
  jsonb_build_array(jsonb_build_object('inventory_lot_id', (select id from public.inventory_lots where organization_id = 'a0000000-0000-4000-8000-000000000001' limit 1), 'quantity_kg', 20, 'selling_price_per_kg', 150)),
  'a0000000-0000-4000-8000-000000000701'
);
select is((select count(*) from public.inventory_movements m join public.sales s on s.id = m.reference_id where s.client_request_id = 'a0000000-0000-4000-8000-000000000701'), 1::bigint, 'duplicate Sale request does not double-deduct');

select api.create_sale(
  'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000501', 'a0000000-0000-4000-8000-000000000102', '2026-09-03', 'TR-002',
  jsonb_build_array(jsonb_build_object('inventory_lot_id', (select id from public.inventory_lots where organization_id = 'a0000000-0000-4000-8000-000000000001' limit 1), 'quantity_kg', 20, 'selling_price_per_kg', 150)),
  'a0000000-0000-4000-8000-000000000703'
);
select throws_ok(
  $$select api.record_payment('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000501', '2026-09-05', 7000, 'cash', 'a0000000-0000-4000-8000-000000000801', 'a0000000-0000-4000-8000-000000000102')$$,
  '22023', null, 'Payment cannot exceed open receivables'
);
select api.record_payment('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000501', '2026-09-05', 4500, 'cash', 'a0000000-0000-4000-8000-000000000802', 'a0000000-0000-4000-8000-000000000102');
select is((select coalesce(sum(pa.amount), 0) from public.payment_allocations pa join public.sales s on s.id = pa.sale_id where s.trust_receipt_number = 'TR-001'), 3000::numeric, 'FIFO pays the oldest Sale first');
select is((select status from public.sales where trust_receipt_number = 'TR-002'), 'partially_paid', 'partial Payment leaves Sale partially paid');
select throws_ok(
  $$select api.record_payment('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000501', '2026-09-05', 1, 'gcash', 'a0000000-0000-4000-8000-000000000803', 'a0000000-0000-4000-8000-000000000102')$$,
  '22023', null, 'GCash without reference is rejected'
);
select throws_ok(
  $$select api.record_payment('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000501', '2026-09-05', 1, 'bank', 'a0000000-0000-4000-8000-000000000804', 'a0000000-0000-4000-8000-000000000102')$$,
  '22023', null, 'Bank without reference is rejected'
);

select api.record_payment('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000501', '2026-09-06', 400, 'cash', 'a0000000-0000-4000-8000-000000000805', 'a0000000-0000-4000-8000-000000000102');
select api.record_payment('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000501', '2026-09-06', 100, 'gcash', 'a0000000-0000-4000-8000-000000000806', 'a0000000-0000-4000-8000-000000000102', 'GC-TEST');
select api.record_payment('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000501', '2026-09-06', 100, 'bank', 'a0000000-0000-4000-8000-000000000807', 'a0000000-0000-4000-8000-000000000102', 'BNK-TEST');
insert into public.expenses (organization_id, salesman_user_id, expense_date, category, amount, payment_source, approval_status, created_by)
values ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000102', '2026-09-06', 'Fuel', 150, 'cash_collection', 'approved', 'a0000000-0000-4000-8000-000000000101');
select api.submit_dcr('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000102', '2026-09-06', 250, 'a0000000-0000-4000-8000-000000000901');
select is((select cash_collected from public.daily_cash_reports where client_request_id = 'a0000000-0000-4000-8000-000000000901'), 400::numeric, 'DCR cash excludes GCash and Bank Payments');
select is((select expected_cash_remittance from public.daily_cash_reports where client_request_id = 'a0000000-0000-4000-8000-000000000901'), 250::numeric, 'approved cash-paid expense reduces expected remittance');
select throws_ok(
  $$select api.submit_dcr('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000102', '2026-09-06', 250, 'a0000000-0000-4000-8000-000000000902')$$,
  '23505', null, 'DCR is unique by organization, Salesman, and date'
);
select api.record_payment('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000501', '2026-09-06', 100, 'cash', 'a0000000-0000-4000-8000-000000000808', 'a0000000-0000-4000-8000-000000000102');
select is((select expected_cash_remittance from public.daily_cash_reports where client_request_id = 'a0000000-0000-4000-8000-000000000901'), 250::numeric, 'locked DCR snapshot remains unchanged after a dated Payment');
select is((select count(*) from public.discrepancies where type = 'post_dcr_adjustment' and related_entity_type = 'payments'), 1::bigint, 'post-lock Payment creates a DCR adjustment discrepancy');
select is(
  (select bool_and(allocated <= amount) from (
    select p.id, p.amount, coalesce(sum(pa.amount), 0) as allocated
    from public.payments p
    left join public.payment_allocations pa on pa.payment_id = p.id
    where p.organization_id = 'a0000000-0000-4000-8000-000000000001'
    group by p.id
  ) payment_totals),
  true,
  'Payment allocation total never exceeds Payment amount'
);
select is(
  (select bool_and(allocated <= net_sales) from (
    select s.id, s.net_sales, coalesce(sum(pa.amount), 0) as allocated
    from public.sales s
    left join public.payment_allocations pa on pa.sale_id = s.id
    where s.organization_id = 'a0000000-0000-4000-8000-000000000001'
    group by s.id
  ) sale_totals),
  true,
  'allocated Payments never exceed a Sale open amount'
);
select is((select count(*) from public.sales where organization_id = 'a0000000-0000-4000-8000-000000000001'), 2::bigint, 'Payments do not create additional Sales');

select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000104', true);
set local role authenticated;
select is((select count(*) from public.organizations where id = 'a0000000-0000-4000-8000-000000000001'), 0::bigint, 'RLS isolates organizations');
select throws_ok(
  $$update public.inventory_movements set quantity_kg = quantity_kg + 1 where from_salesman_user_id = 'a0000000-0000-4000-8000-000000000102'$$,
  '42501', null, 'Salesman cannot directly mutate inventory movements'
);
reset role;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000101', true);

update public.plants set active = false where id = 'a0000000-0000-4000-8000-000000000201';
select is((select count(*) from public.stock_trips where plant_id = 'a0000000-0000-4000-8000-000000000201'), 1::bigint, 'inactive Plant keeps historical Trip readable');
update public.plants set active = true where id = 'a0000000-0000-4000-8000-000000000201';

select api.create_stock_trip(
  'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000201', '2026-09-04',
  '[{"plant_product_id":"a0000000-0000-4000-8000-000000000401","quantity_kg":10,"acquisition_type":"free_from_plant","cost_per_kg":0}]',
  'a0000000-0000-4000-8000-000000000607'
);
select api.transfer_warehouse_to_salesman(
  'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000103', '2026-09-04',
  jsonb_build_array(jsonb_build_object('inventory_lot_id', (select l.id from public.inventory_lots l where l.cost_per_kg = 0 and l.organization_id = 'a0000000-0000-4000-8000-000000000001'), 'quantity_kg', 10)),
  'a0000000-0000-4000-8000-000000000608'
);
select api.create_sale(
  'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000501', 'a0000000-0000-4000-8000-000000000103', '2026-09-05', 'TR-FREE',
  jsonb_build_array(jsonb_build_object('inventory_lot_id', (select l.id from public.inventory_lots l where l.cost_per_kg = 0 and l.organization_id = 'a0000000-0000-4000-8000-000000000001'), 'quantity_kg', 5, 'selling_price_per_kg', 20)),
  'a0000000-0000-4000-8000-000000000704'
);
select is((select total_cogs from public.sales where trust_receipt_number = 'TR-FREE'), 0::numeric, 'free-from-Plant product has zero COGS');

select api.create_sale(
  'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000501', 'a0000000-0000-4000-8000-000000000103', '2026-09-05', 'TR-COST',
  jsonb_build_array(jsonb_build_object('inventory_lot_id', (select l.id from public.inventory_lots l where l.cost_per_kg = 100 and l.organization_id = 'a0000000-0000-4000-8000-000000000001'), 'quantity_kg', 5, 'selling_price_per_kg', 150)),
  'a0000000-0000-4000-8000-000000000705'
);
select is((select acquisition_cost_per_kg from public.sale_lines sl join public.sales s on s.id = sl.sale_id where s.trust_receipt_number = 'TR-COST'), 100::numeric, 'transfer preserves exact lot cost basis');
select is(
  (select sum(available_quantity_kg) from public.company_stock_summary where organization_id = 'a0000000-0000-4000-8000-000000000001'),
  (select coalesce(sum(available_quantity_kg), 0) from public.warehouse_stock_summary where organization_id = 'a0000000-0000-4000-8000-000000000001')
    + (select coalesce(sum(available_quantity_kg), 0) from public.salesman_stock_summary where organization_id = 'a0000000-0000-4000-8000-000000000001'),
  'company stock reconciles to Warehouse plus all Salesmen'
);

select * from finish();
rollback;
