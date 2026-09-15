begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(36);

insert into auth.users (id, email) values
  ('d0000000-0000-4000-8000-000000000101', 'frontend-owner@test.invalid'),
  ('d0000000-0000-4000-8000-000000000102', 'frontend-warehouse@test.invalid'),
  ('d0000000-0000-4000-8000-000000000103', 'frontend-sales-one@test.invalid'),
  ('d0000000-0000-4000-8000-000000000104', 'frontend-sales-two@test.invalid');

insert into public.profiles (id, full_name, username) values
  ('d0000000-0000-4000-8000-000000000101', 'Frontend Owner', 'frontend.owner'),
  ('d0000000-0000-4000-8000-000000000102', 'Frontend Warehouse', 'frontend.warehouse'),
  ('d0000000-0000-4000-8000-000000000103', 'Frontend Sales One', 'frontend.sales1'),
  ('d0000000-0000-4000-8000-000000000104', 'Frontend Sales Two', 'frontend.sales2');

insert into public.organizations (id, name, slug) values
  ('d0000000-0000-4000-8000-000000000001', 'Frontend Role Organization', 'frontend-role-organization');

insert into public.organization_memberships (organization_id, user_id, role) values
  ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000101', 'owner_admin'),
  ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000102', 'warehouse'),
  ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000103', 'salesman'),
  ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000104', 'salesman');

insert into public.plants (id, organization_id, name, short_code) values
  ('d0000000-0000-4000-8000-000000000201', 'd0000000-0000-4000-8000-000000000001', 'Frontend Plant', 'FRONT');
insert into public.products (id, organization_id, name, category) values
  ('d0000000-0000-4000-8000-000000000301', 'd0000000-0000-4000-8000-000000000001', 'Frontend Chicken', 'whole_chicken');
insert into public.plant_products (id, plant_id, product_id) values
  ('d0000000-0000-4000-8000-000000000401', 'd0000000-0000-4000-8000-000000000201', 'd0000000-0000-4000-8000-000000000301');
insert into public.payroll_periods (id, organization_id, period_start, period_end, created_by) values
  ('d0000000-0000-4000-8000-000000000901', 'd0000000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-15', 'd0000000-0000-4000-8000-000000000101');
insert into public.payroll_entries (payroll_period_id, user_id, base_pay, gross_pay, net_pay) values
  ('d0000000-0000-4000-8000-000000000901', 'd0000000-0000-4000-8000-000000000103', 1000, 1000, 1000);

set local role anon;
select throws_ok(
  $$select public.create_stock_trip(gen_random_uuid(), gen_random_uuid(), current_date, '[]', gen_random_uuid())$$,
  '42501', null, 'anonymous users cannot call frontend Stock In RPC'
);

set local role authenticated;
set local request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000101';
select results_eq(
  $$update public.plants set accent = '#123456' where id = 'd0000000-0000-4000-8000-000000000201' returning 1$$,
  $$values (1)$$,
  'Owner can manage Plant configuration'
);
select results_eq(
  $$insert into public.customers (id, organization_id, name, payment_type) values ('d0000000-0000-4000-8000-000000000501', 'd0000000-0000-4000-8000-000000000001', 'Frontend Customer', 'cash_credit') returning 1$$,
  $$values (1)$$,
  'Owner can manage customers'
);
select lives_ok(
  $$select public.create_stock_trip(
    'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000201', '2026-09-13',
    '[{"plant_product_id":"d0000000-0000-4000-8000-000000000401","quantity_kg":100,"acquisition_type":"purchased","cost_per_kg":100}]',
    'd0000000-0000-4000-8000-000000000601', 'FRONT-STOCK-1'
  )$$,
  'Owner can Stock In through the frontend RPC'
);
select is(
  (select sum(available_quantity_kg) from public.warehouse_stock_summary where organization_id = 'd0000000-0000-4000-8000-000000000001'),
  100::numeric,
  'Owner can view Warehouse stock'
);
select lives_ok(
  $$select count(*) from public.sales_by_plant where organization_id = 'd0000000-0000-4000-8000-000000000001'$$,
  'Owner can view reporting data'
);

set local request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000102';
select is(
  (select sum(available_quantity_kg) from public.warehouse_stock_summary where organization_id = 'd0000000-0000-4000-8000-000000000001'),
  100::numeric,
  'Warehouse role can view Warehouse stock'
);
select lives_ok(
  $$select public.transfer_warehouse_to_salesman(
    'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000103', '2026-09-13',
    jsonb_build_array(jsonb_build_object('inventory_lot_id', (select id from public.inventory_lots where organization_id = 'd0000000-0000-4000-8000-000000000001'), 'quantity_kg', 70)),
    'd0000000-0000-4000-8000-000000000602', 'warehouse assignment'
  )$$,
  'Warehouse role can transfer Warehouse stock to a Salesman'
);
select is(
  (select count(*) from public.receiving_receipts where client_request_id = 'd0000000-0000-4000-8000-000000000602'),
  1::bigint,
  'Warehouse transfer creates one receipt'
);
select results_eq(
  $$update public.plants set name = 'Warehouse Unauthorized' where id = 'd0000000-0000-4000-8000-000000000201' returning 1$$,
  $$select 1 where false$$,
  'Warehouse role cannot edit Plant configuration'
);
select is((select count(*) from public.payroll_entries), 0::bigint, 'Warehouse role cannot access payroll data');
select throws_ok(
  $$select public.create_stock_trip(
    'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000201', '2026-09-13',
    '[{"plant_product_id":"d0000000-0000-4000-8000-000000000401","quantity_kg":1,"acquisition_type":"purchased","cost_per_kg":100}]',
    'd0000000-0000-4000-8000-000000000607', 'WAREHOUSE-STOCK-DENIED'
  )$$,
  '42501', null, 'Warehouse role cannot Stock In'
);
select throws_ok(
  $$select public.record_payment(
    'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000501', '2026-09-13', 1, 'cash',
    'd0000000-0000-4000-8000-000000000704', 'd0000000-0000-4000-8000-000000000103'
  )$$,
  '42501', null, 'Warehouse role cannot record customer Payments'
);

set local request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000103';
select is(
  (select sum(available_quantity_kg) from public.salesman_stock_summary where salesman_user_id = 'd0000000-0000-4000-8000-000000000103'),
  70::numeric,
  'Salesman can view own assigned inventory'
);
select is(
  (select count(*) from public.salesman_stock_summary where salesman_user_id = 'd0000000-0000-4000-8000-000000000104'),
  0::bigint,
  'Salesman cannot view another Salesman inventory'
);
select lives_ok(
  $$select public.transfer_salesman_to_salesman(
    'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000103', 'd0000000-0000-4000-8000-000000000104', '2026-09-13',
    jsonb_build_array(jsonb_build_object('inventory_lot_id', (select id from public.inventory_lots where organization_id = 'd0000000-0000-4000-8000-000000000001'), 'quantity_kg', 10)),
    'd0000000-0000-4000-8000-000000000603', 'route reassignment'
  )$$,
  'Salesman can transfer own stock to another Salesman'
);
select is(
  (select count(*) from public.salesman_stock_summary where salesman_user_id = 'd0000000-0000-4000-8000-000000000104'),
  0::bigint,
  'Salesman still cannot view the recipient inventory after transfer'
);
select lives_ok(
  $$select public.create_sale(
    'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000501', 'd0000000-0000-4000-8000-000000000103', '2026-09-13', 'FRONT-TR-1',
    jsonb_build_array(jsonb_build_object('inventory_lot_id', (select id from public.inventory_lots where organization_id = 'd0000000-0000-4000-8000-000000000001'), 'quantity_kg', 20, 'selling_price_per_kg', 150)),
    'd0000000-0000-4000-8000-000000000604'
  )$$,
  'Salesman can create a Sale from own stock'
);
select is((select status from public.sales where trust_receipt_number = 'FRONT-TR-1'), 'unpaid', 'new unpaid Sale has the expected status');
select throws_ok(
  $$select public.create_sale(
    'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000501', 'd0000000-0000-4000-8000-000000000104', '2026-09-13', 'FRONT-TR-DENIED',
    jsonb_build_array(jsonb_build_object('inventory_lot_id', (select id from public.inventory_lots where organization_id = 'd0000000-0000-4000-8000-000000000001'), 'quantity_kg', 1, 'selling_price_per_kg', 150)),
    'd0000000-0000-4000-8000-000000000605'
  )$$,
  '42501', null, 'Salesman cannot create a Sale for another Salesman'
);
select throws_ok(
  $$select public.create_sale(
    'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000501', 'd0000000-0000-4000-8000-000000000103', '2026-09-13', 'FRONT-TR-TOO-MUCH',
    jsonb_build_array(jsonb_build_object('inventory_lot_id', (select id from public.inventory_lots where organization_id = 'd0000000-0000-4000-8000-000000000001'), 'quantity_kg', 100, 'selling_price_per_kg', 150)),
    'd0000000-0000-4000-8000-000000000606'
  )$$,
  'P0001', null, 'Salesman cannot sell more than own stock'
);
select lives_ok(
  $$select public.record_payment(
    'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000501', '2026-09-13', 500, 'cash',
    'd0000000-0000-4000-8000-000000000701', 'd0000000-0000-4000-8000-000000000103', null, 'route collection'
  )$$,
  'Salesman can record own Payment'
);
select is((select notes from public.payments where client_request_id = 'd0000000-0000-4000-8000-000000000701'), 'route collection', 'Payment notes survive the frontend RPC');
select lives_ok(
  $$select public.record_payment(
    'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000501', '2026-09-13', 500, 'gcash',
    'd0000000-0000-4000-8000-000000000702', 'd0000000-0000-4000-8000-000000000103', 'GCASH-FRONT-1', 'owner GCash route'
  )$$,
  'Salesman can record an attributed GCash Payment'
);
select is(
  (select reference_number from public.payments where client_request_id = 'd0000000-0000-4000-8000-000000000702'),
  'GCASH-FRONT-1',
  'Salesman electronic Payment reference is retained'
);
select results_eq(
  $$insert into public.expenses (organization_id, salesman_user_id, expense_date, category, amount, payment_source, approval_status, created_by) values ('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000103', '2026-09-13', 'Fuel', 50, 'cash_collection', 'approved', 'd0000000-0000-4000-8000-000000000103') returning 1$$,
  $$values (1)$$,
  'Salesman can record own expense'
);
select lives_ok(
  $$select public.submit_dcr('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000103', '2026-09-13', 450, 'd0000000-0000-4000-8000-000000000801')$$,
  'Salesman can submit own DCR'
);
select is((select status from public.daily_cash_reports where client_request_id = 'd0000000-0000-4000-8000-000000000801'), 'locked', 'submitted DCR is locked');
select throws_ok(
  $$select public.submit_dcr('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000103', '2026-09-13', 450, 'd0000000-0000-4000-8000-000000000802')$$,
  '23505', null, 'a locked DCR cannot be submitted again for the same date'
);
select throws_ok(
  $$insert into public.inventory_movements (
    organization_id, inventory_lot_id, movement_type, quantity_kg, from_location_type,
    to_location_type, reference_type, reference_id, reference_line_id, effective_date, created_by
  ) values (
    'd0000000-0000-4000-8000-000000000001', (select id from public.inventory_lots where organization_id = 'd0000000-0000-4000-8000-000000000001'),
    'adjustment_in', 1, 'adjustment', 'warehouse', 'test', gen_random_uuid(), gen_random_uuid(), current_date, 'd0000000-0000-4000-8000-000000000103'
  )$$,
  '42501', null, 'Salesman cannot create arbitrary inventory movements'
);
select results_eq(
  $$update public.plants set name = 'Salesman Unauthorized' where id = 'd0000000-0000-4000-8000-000000000201' returning 1$$,
  $$select 1 where false$$,
  'Salesman cannot edit Plant configuration'
);

set local request.jwt.claim.sub = 'd0000000-0000-4000-8000-000000000101';
select throws_ok(
  $$select public.record_payment(
    'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000501', '2026-09-13', 1, 'gcash',
    'd0000000-0000-4000-8000-000000000703', 'd0000000-0000-4000-8000-000000000103', null, 'missing reference test'
  )$$,
  '22023', null, 'Owner electronic Payment requires a reference'
);
select lives_ok(
  $$select public.record_payment(
    'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000501', '2026-09-13', 2000, 'bank',
    'd0000000-0000-4000-8000-000000000705', 'd0000000-0000-4000-8000-000000000103', 'BANK-FRONT-1', 'owner bank deposit'
  )$$,
  'Owner can record a Bank Payment attributed to the responsible Salesman'
);
select is((select status from public.sales where trust_receipt_number = 'FRONT-TR-1'), 'paid', 'full Payment marks the Sale paid');
select is((select count(*) from public.collectibles), 0::bigint, 'full Payment removes the Sale from Collectibles');
select is((select notes from public.payments where client_request_id = 'd0000000-0000-4000-8000-000000000705'), 'owner bank deposit', 'Owner Payment notes are retained');

select * from finish(true);
rollback;
